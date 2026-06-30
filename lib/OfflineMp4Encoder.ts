/**
 * オフラインMP4エンコーダー
 * 動画編集ソフト同様、CPU/GPU性能に依存せず全フレームを順次レンダリング→エンコード
 * WebCodecs + mp4-muxer で映像・音声をMux（MediaRecorder は使用しない）
 */

import { Muxer, ArrayBufferTarget } from "mp4-muxer";
import { type ModeAdjustments, type SpectrumSettings } from "./Canvas";
import { type EffectParams } from "./Effects";
import {
  type SubtitleOverlaySettings,
  type TitleOverlaySettings,
} from "./subtitles";
import { type ScreenMotionSettings } from "./screenMotion";
import { mwvMilestone, mwvWarn } from "./mwvConsole";
import { isWebCodecsSupported } from "./WebCodecsEncoder";
import {
  OfflineAnalyserNode,
  computeFftFramesOffline,
  renderFrameOfflineFull,
  initOfflineRenderer,
} from "./OfflineRenderer";
import {
  computeOfflineVideoTiming,
  offlineVideoFrameDurationUs,
  offlineVideoFrameTimestampUs,
} from "./offlineVideoTiming";

export interface OfflineEncoderConfig {
  width: number;
  height: number;
  frameRate: number;
  videoBitrate: number;
  mode: number;
  adjustments: ModeAdjustments;
  backgroundImage: HTMLImageElement | null;
  effect?: EffectParams;
  spectrumSettings?: Partial<SpectrumSettings>;
  subtitleOverlay?: SubtitleOverlaySettings;
  titleOverlay?: TitleOverlaySettings;
  screenMotion?: ScreenMotionSettings;
  /** クリップ範囲（秒）。指定時はこの区間のみエンコード */
  clipStartSec?: number;
  clipDurationSec?: number;
  /** 音声フェード（秒） */
  audioFadeInSec?: number;
  audioFadeOutSec?: number;
}

export interface OfflineEncoderProgress {
  stage: "analyzing" | "encoding" | "muxing" | "finalizing";
  progress: number;
  message: string;
  fps?: number;
}

type FrameCallback = (progress: OfflineEncoderProgress) => void;

const OFFLINE_AUDIO_BITRATE = 192_000;
const ENCODER_QUEUE_HIGH_WATER = 8;
const AUDIO_SAMPLES_PER_CHUNK = 1024;
/** これ未満の MP4 はヘッダのみ等の異常出力 */
const MIN_VALID_MP4_BYTES = 8192;

type VideoCodecCandidate = {
  webCodecsCodec: string;
  muxerCodec: "avc" | "vp9" | "av1";
  label: string;
};

/** 1920x1920@60fps 等は Level 3.1 では不可のため高 Level / VP9 / AV1 も試す */
const OFFLINE_VIDEO_CODEC_CANDIDATES: VideoCodecCandidate[] = [
  { webCodecsCodec: "avc1.640033", muxerCodec: "avc", label: "H.264 High L5.1" },
  { webCodecsCodec: "avc1.640032", muxerCodec: "avc", label: "H.264 High L5.0" },
  { webCodecsCodec: "avc1.4d0032", muxerCodec: "avc", label: "H.264 Main L5.0" },
  { webCodecsCodec: "avc1.640028", muxerCodec: "avc", label: "H.264 High L4.0" },
  { webCodecsCodec: "avc1.4d001f", muxerCodec: "avc", label: "H.264 Main L3.1" },
  { webCodecsCodec: "avc1.42001E", muxerCodec: "avc", label: "H.264 Baseline L3.0" },
  { webCodecsCodec: "vp09.00.50.10", muxerCodec: "vp9", label: "VP9 Profile0 L5.1" },
  { webCodecsCodec: "vp09.00.10.08", muxerCodec: "vp9", label: "VP9 Profile0 L1" },
  { webCodecsCodec: "av01.0.05M.08", muxerCodec: "av1", label: "AV1 Main L5" },
];

const HARDWARE_ACCEL_MODES = ["prefer-hardware", "prefer-software", "no-preference"] as const;

/**
 * オフラインエンコーダー（WebCodecs 非リアルタイム）
 */
export class OfflineMp4Encoder {
  private config: OfflineEncoderConfig;
  private onProgress?: FrameCallback;
  private cancelled = false;
  private videoEncoder: VideoEncoder | null = null;
  private audioEncoder: AudioEncoder | null = null;
  private muxer: Muxer<ArrayBufferTarget> | null = null;
  private target: ArrayBufferTarget | null = null;
  private videoEncoderError: Error | null = null;
  /** フレームごとの合成時刻（字幕タイミング用） */
  private currentFrameTimeSec = 0;
  /** 総再生時間（秒） */
  private currentTotalDurationSec = 0;

  constructor(config: OfflineEncoderConfig, onProgress?: FrameCallback) {
    this.config = config;
    this.onProgress = onProgress;
  }

  cancel(): void {
    this.cancelled = true;
  }

  isCancelled(): boolean {
    return this.cancelled;
  }

  /**
   * メインのエンコード処理
   */
  async encode(
    audioBuffer: AudioBuffer,
    audioContext: AudioContext
  ): Promise<{ blob: Blob; format: "mp4" | "webm" }> {
    const { width, height, frameRate, videoBitrate, mode, adjustments, backgroundImage, effect, spectrumSettings } = this.config;
    const { clipStartSec, clipDurationSec, audioFadeInSec, audioFadeOutSec } = this.config;

    const processedBuffer = this.sliceAndFadeAudio(
      audioBuffer, audioContext, clipStartSec, clipDurationSec, audioFadeInSec, audioFadeOutSec
    );

    const timing = computeOfflineVideoTiming(processedBuffer, frameRate);
    const { totalFrames, frameDuration: frameDurationSec, audioDurationSec, audioDurationUs } = {
      totalFrames: timing.totalFrames,
      frameDuration: timing.frameDurationSec,
      audioDurationSec: timing.audioDurationSec,
      audioDurationUs: timing.audioDurationUs,
    };
    const frameDuration = frameDurationSec;

    mwvMilestone("offline-encode: start", {
      duration: audioDurationSec,
      bufferDuration: processedBuffer.duration,
      totalFrames,
      width,
      height,
      frameRate,
      mode,
      useWebCodecs: isWebCodecsSupported(),
      clipStartSec,
      clipDurationSec,
      audioFadeInSec,
      audioFadeOutSec,
    });

    initOfflineRenderer();
    this.currentTotalDurationSec = audioDurationSec;

    this.onProgress?.({ stage: "analyzing", progress: 0, message: "音声データを解析中..." });

    const { frequencyFrames, timeDomainFrames } = await computeFftFramesOffline(
      processedBuffer,
      frameRate,
      2048,
      (p) => {
        this.onProgress?.({
          stage: "analyzing",
          progress: p,
          message: `音声データを解析中... (${Math.round(p)}%)`,
        });
      }
    );

    mwvMilestone("offline-encode: fft computed", {
      frames: frequencyFrames.length,
      expectedFrames: totalFrames,
    });
    if (frequencyFrames.length !== totalFrames) {
      mwvWarn("offline-encode: fft frame count mismatch", {
        expected: totalFrames,
        actual: frequencyFrames.length,
      });
    }
    this.onProgress?.({ stage: "analyzing", progress: 100, message: "音声解析完了" });
    this.onProgress?.({ stage: "encoding", progress: 0, message: "エンコーダーを初期化中..." });

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const mockAnalyser = new OfflineAnalyserNode(2048);

    const frameArgs = {
      canvas,
      mockAnalyser,
      frequencyFrames,
      timeDomainFrames,
      backgroundImage,
      mode,
      adjustments,
      effect,
      spectrumSettings,
      width,
      height,
      frameRate,
      totalFrames,
      frameDuration,
      audioBuffer: processedBuffer,
      audioContext,
    };

    if (!isWebCodecsSupported()) {
      throw new Error("WebCodecs API is required for offline encode");
    }

    try {
      return await this.encodeWithWebCodecs({
        ...frameArgs,
        videoBitrate,
        audioDurationUs,
      });
    } catch (err) {
      mwvWarn("offline-encode: webcodecs failed", err);
      throw err instanceof Error
        ? err
        : new Error(String(err));
    }
  }

  /**
   * WebCodecs による非リアルタイムエンコード（映像+音声 MP4）
   */
  private async encodeWithWebCodecs(args: {
    canvas: HTMLCanvasElement;
    mockAnalyser: OfflineAnalyserNode;
    frequencyFrames: Uint8Array[];
    timeDomainFrames: Uint8Array[];
    backgroundImage: HTMLImageElement | null;
    mode: number;
    adjustments: ModeAdjustments;
    effect: EffectParams | undefined;
    spectrumSettings: Partial<SpectrumSettings> | undefined;
    width: number;
    height: number;
    frameRate: number;
    videoBitrate: number;
    totalFrames: number;
    frameDuration: number;
    audioDurationUs: number;
    audioBuffer: AudioBuffer;
    audioContext: AudioContext;
  }): Promise<{ blob: Blob; format: "mp4" | "webm" }> {
    const {
      canvas, mockAnalyser, frequencyFrames, timeDomainFrames,
      backgroundImage, mode, adjustments, effect, spectrumSettings,
      width, height, frameRate, videoBitrate, totalFrames, frameDuration,
      audioDurationUs, audioBuffer, audioContext,
    } = args;

    const codecCandidates = OFFLINE_VIDEO_CODEC_CANDIDATES;

    let selectedCodec: VideoCodecCandidate | null = null;
    let configuredVideoConfig: VideoEncoderConfig | null = null;

    for (const candidate of codecCandidates) {
      const configured = await this.findSupportedVideoEncoderConfig(
        candidate.webCodecsCodec,
        width,
        height,
        videoBitrate,
        frameRate
      );
      if (configured) {
        selectedCodec = candidate;
        configuredVideoConfig = configured;
        break;
      }
    }

    if (!selectedCodec || !configuredVideoConfig) {
      mwvWarn("offline-encode: no codec supported", {
        width,
        height,
        frameRate,
        videoBitrate,
        tried: codecCandidates.map((c) => c.webCodecsCodec),
      });
      throw new Error(
        `No supported video codec for offline encode (${width}x${height}@${frameRate}fps)`
      );
    }

    mwvMilestone("offline-encode: webcodecs codec selected", {
      codec: selectedCodec.label,
      hw: configuredVideoConfig.hardwareAcceleration ?? "default",
    });

    const includeAudio = typeof AudioEncoder !== "undefined";
    this.target = new ArrayBufferTarget();
    this.muxer = new Muxer({
      target: this.target,
      video: {
        codec: selectedCodec.muxerCodec,
        width,
        height,
        frameRate,
      },
      audio: includeAudio ? {
        codec: "aac",
        numberOfChannels: audioBuffer.numberOfChannels,
        sampleRate: audioBuffer.sampleRate,
      } : undefined,
      fastStart: "in-memory",
      firstTimestampBehavior: "offset",
    });

    this.videoEncoderError = null;
    this.videoEncoder = new VideoEncoder({
      output: (chunk, metadata) => {
        this.muxer?.addVideoChunk(chunk, metadata);
      },
      error: (error) => {
        this.videoEncoderError = error instanceof Error ? error : new Error(String(error));
        mwvWarn("offline-encode: video encoder error", error);
      },
    });
    this.videoEncoder.configure(configuredVideoConfig);

    const keyFrameInterval = Math.max(1, Math.round(frameRate * 2));
    const startTime = performance.now();
    let lastProgressUpdate = 0;
    let encodedVideoFrames = 0;

    for (let frameIdx = 0; frameIdx < totalFrames; frameIdx++) {
      if (this.cancelled) break;
      if (this.videoEncoderError) {
        throw this.videoEncoderError;
      }

      const currentTime = frameIdx * frameDuration;
      mockAnalyser.setFrequencyData(frequencyFrames[frameIdx] || new Uint8Array(1024));
      mockAnalyser.setTimeDomainData(timeDomainFrames[frameIdx] || new Uint8Array(1024));

      this.renderFrameToCanvas(
        canvas, backgroundImage, mode, adjustments, effect, spectrumSettings, currentTime, mockAnalyser
      );

      await this.drainVideoEncoder();

      const timestamp = offlineVideoFrameTimestampUs(frameIdx, frameDuration);
      const durationUs = offlineVideoFrameDurationUs(
        frameIdx, totalFrames, frameDuration, audioDurationUs
      );
      const videoFrame = await this.captureVideoFrame(canvas, timestamp, durationUs);
      try {
        if (this.videoEncoderError) {
          videoFrame.close();
          throw this.videoEncoderError;
        }
        if (!this.videoEncoder || this.videoEncoder.state !== "configured") {
          videoFrame.close();
          throw new Error("VideoEncoder is not in configured state");
        }
        this.videoEncoder.encode(videoFrame, { keyFrame: frameIdx % keyFrameInterval === 0 });
        encodedVideoFrames++;
      } catch (encodeErr) {
        videoFrame.close();
        throw encodeErr;
      }
      videoFrame.close();

      if (frameIdx % 120 === 0) await new Promise((r) => setTimeout(r, 0));

      const now = performance.now();
      if (now - lastProgressUpdate > 200 || frameIdx === totalFrames - 1) {
        const progress = ((frameIdx + 1) / totalFrames) * 50;
        const fps = (frameIdx + 1) / Math.max(0.1, (now - startTime) / 1000);
        this.onProgress?.({
          stage: "encoding",
          progress,
          message: `映像フレームをエンコード中... (${frameIdx + 1}/${totalFrames})`,
          fps: Math.round(fps),
        });
        lastProgressUpdate = now;
      }
    }

    if (this.videoEncoder && this.videoEncoder.state !== "closed") {
      await this.videoEncoder.flush();
      this.videoEncoder.close();
    }
    this.videoEncoder = null;

    if (includeAudio) {
      this.onProgress?.({ stage: "encoding", progress: 55, message: "音声をエンコード中..." });
      await this.encodeAudioBuffer(audioBuffer);
    }

    this.onProgress?.({ stage: "muxing", progress: 90, message: "MP4をMux中..." });

    if (this.muxer) {
      this.muxer.finalize();
      this.muxer = null;
    }
    const buffer = this.target?.buffer;
    this.target = null;

    if (!buffer || buffer.byteLength < MIN_VALID_MP4_BYTES) {
      throw new Error(
        `MP4 output is too small (${buffer?.byteLength ?? 0} bytes). WebCodecs encode may have failed.`
      );
    }

    const mp4Blob = new Blob([buffer], { type: "video/mp4" });
    mwvMilestone("offline-encode: webcodecs done", {
      mp4Bytes: mp4Blob.size,
      elapsed: (performance.now() - startTime) / 1000,
      hasAudio: includeAudio,
      encodedVideoFrames,
      expectedVideoFrames: totalFrames,
      audioDurationUs,
    });
    this.onProgress?.({ stage: "finalizing", progress: 100, message: "完了" });

    return { blob: mp4Blob, format: "mp4" };
  }

  private async findSupportedVideoEncoderConfig(
    codec: string,
    width: number,
    height: number,
    bitrate: number,
    frameRate: number
  ): Promise<VideoEncoderConfig | null> {
    const bitrates = [bitrate, Math.round(bitrate * 0.75), Math.round(bitrate * 0.5)];
    const frameRates = [frameRate, 30];

    for (const hw of HARDWARE_ACCEL_MODES) {
      for (const br of bitrates) {
        for (const fps of frameRates) {
          const baseConfig: VideoEncoderConfig = {
            codec,
            width,
            height,
            bitrate: br,
            framerate: fps,
            hardwareAcceleration: hw,
          };
          try {
            const support = await VideoEncoder.isConfigSupported(baseConfig);
            if (support.supported) {
              return support.config ?? baseConfig;
            }
          } catch (e) {
            mwvWarn("offline-encode: codec config check failed", {
              codec,
              hw,
              bitrate: br,
              frameRate: fps,
              error: String(e),
            });
          }
        }
        // framerate 省略でも試す（環境によって 60fps+高解像度が拒否される）
        const noFpsConfig: VideoEncoderConfig = {
          codec,
          width,
          height,
          bitrate: br,
          hardwareAcceleration: hw,
        };
        try {
          const support = await VideoEncoder.isConfigSupported(noFpsConfig);
          if (support.supported) {
            return support.config ?? noFpsConfig;
          }
        } catch {
          /* ignore */
        }
      }
    }
    return null;
  }

  private async captureVideoFrame(
    canvas: HTMLCanvasElement,
    timestamp: number,
    durationUs: number
  ): Promise<VideoFrame> {
    if (typeof createImageBitmap !== "undefined") {
      const bitmap = await createImageBitmap(canvas);
      const frame = new VideoFrame(bitmap, { timestamp, duration: durationUs });
      bitmap.close();
      return frame;
    }
    return new VideoFrame(canvas, { timestamp, duration: durationUs });
  }

  private async drainVideoEncoder(): Promise<void> {
    const enc = this.videoEncoder;
    if (!enc || enc.state !== "configured") return;
    if (this.videoEncoderError) return;
    while (enc.encodeQueueSize > ENCODER_QUEUE_HIGH_WATER) {
      if (this.videoEncoderError || enc.state !== "configured") return;
      await new Promise<void>((resolve) => {
        const pump = () => {
          if (!this.videoEncoder || this.videoEncoder.state !== "configured" || this.videoEncoderError || this.videoEncoder.encodeQueueSize <= ENCODER_QUEUE_HIGH_WATER) {
            resolve();
          } else {
            requestAnimationFrame(pump);
          }
        };
        pump();
      });
    }
  }

  private async drainAudioEncoder(): Promise<void> {
    const enc = this.audioEncoder;
    if (!enc || enc.state !== "configured") return;
    while (enc.encodeQueueSize > ENCODER_QUEUE_HIGH_WATER) {
      await new Promise<void>((resolve) => {
        const pump = () => {
          if (!this.audioEncoder || this.audioEncoder.state !== "configured" || this.audioEncoder.encodeQueueSize <= ENCODER_QUEUE_HIGH_WATER) {
            resolve();
          } else {
            requestAnimationFrame(pump);
          }
        };
        pump();
      });
    }
  }

  private async encodeAudioBuffer(audioBuffer: AudioBuffer): Promise<void> {
    if (typeof AudioEncoder === "undefined" || !this.muxer) return;

    const sampleRate = audioBuffer.sampleRate;
    const numberOfChannels = audioBuffer.numberOfChannels;
    const audioConfig: AudioEncoderConfig = {
      codec: "mp4a.40.2",
      sampleRate,
      numberOfChannels,
      bitrate: OFFLINE_AUDIO_BITRATE,
    };

    const support = await AudioEncoder.isConfigSupported(audioConfig);
    if (!support.supported) {
      mwvWarn("offline-encode: AAC encoder not supported, skipping audio track");
      return;
    }

    this.audioEncoder = new AudioEncoder({
      output: (chunk, metadata) => {
        this.muxer?.addAudioChunk(chunk, metadata);
      },
      error: (error) => {
        mwvWarn("offline-encode: audio encoder error", error);
      },
    });
    this.audioEncoder.configure(audioConfig);

    const channelData: Float32Array[] = [];
    for (let ch = 0; ch < numberOfChannels; ch++) {
      channelData.push(audioBuffer.getChannelData(ch));
    }

    const totalSamples = audioBuffer.length;
    for (let offset = 0; offset < totalSamples; offset += AUDIO_SAMPLES_PER_CHUNK) {
      if (this.cancelled) break;

      const numberOfFrames = Math.min(AUDIO_SAMPLES_PER_CHUNK, totalSamples - offset);
      const planar = new Float32Array(numberOfFrames * numberOfChannels);
      for (let ch = 0; ch < numberOfChannels; ch++) {
        planar.set(channelData[ch].subarray(offset, offset + numberOfFrames), ch * numberOfFrames);
      }

      const timestamp = Math.round((offset / sampleRate) * 1_000_000);
      const audioData = new AudioData({
        format: "f32-planar",
        sampleRate,
        numberOfFrames,
        numberOfChannels,
        timestamp,
        data: planar,
      });

      await this.drainAudioEncoder();
      this.audioEncoder.encode(audioData);
      audioData.close();

      if (offset % (AUDIO_SAMPLES_PER_CHUNK * 64) === 0) {
        await new Promise((r) => setTimeout(r, 0));
      }
    }

    if (this.audioEncoder && this.audioEncoder.state !== "closed") {
      await this.audioEncoder.flush();
      this.audioEncoder.close();
    }
    this.audioEncoder = null;
  }

  private renderFrameToCanvas(
    canvas: HTMLCanvasElement,
    backgroundImage: HTMLImageElement | null,
    mode: number,
    adjustments: ModeAdjustments,
    effect: EffectParams | undefined,
    spectrumSettings: Partial<SpectrumSettings> | undefined,
    currentTime: number,
    analyser: OfflineAnalyserNode
  ): void {
    this.currentFrameTimeSec = currentTime;
    const frameDurationSec = 1 / this.config.frameRate;

    const adjustedSpectrumSettings = spectrumSettings ? {
      ...spectrumSettings,
      subtitleOverlay: spectrumSettings.subtitleOverlay ? {
        ...spectrumSettings.subtitleOverlay,
        getCurrentTimeSec: () => this.currentFrameTimeSec,
      } : undefined,
      titleOverlay: spectrumSettings.titleOverlay ? {
        ...spectrumSettings.titleOverlay,
        isPlaying: true,
        playbackTimeSec: this.currentFrameTimeSec,
      } : undefined,
    } : undefined;

    renderFrameOfflineFull(
      {
        canvas,
        analyser,
        syntheticTimeSec: currentTime,
        frameDurationSec,
        totalDurationSec: this.currentTotalDurationSec,
      },
      backgroundImage, mode, adjustments, effect, true, adjustedSpectrumSettings,
      this.config.subtitleOverlay, this.config.titleOverlay
    );
  }

  private sliceAndFadeAudio(
    audioBuffer: AudioBuffer,
    audioContext: AudioContext,
    clipStartSec?: number,
    clipDurationSec?: number,
    fadeInSec?: number,
    fadeOutSec?: number
  ): AudioBuffer {
    const startSec = Math.max(0, clipStartSec ?? 0);
    const durationSec = clipDurationSec ?? (audioBuffer.duration - startSec);
    const endSec = Math.min(audioBuffer.duration, startSec + durationSec);
    const actualDuration = endSec - startSec;

    if (actualDuration <= 0) return audioBuffer;

    const sampleRate = audioBuffer.sampleRate;
    const channels = audioBuffer.numberOfChannels;
    const startSample = Math.floor(startSec * sampleRate);
    const numSamples = Math.floor(actualDuration * sampleRate);

    const newBuffer = audioContext.createBuffer(channels, numSamples, sampleRate);
    for (let ch = 0; ch < channels; ch++) {
      const srcData = audioBuffer.getChannelData(ch);
      const dstData = newBuffer.getChannelData(ch);
      for (let i = 0; i < numSamples; i++) {
        dstData[i] = srcData[startSample + i] ?? 0;
      }
    }

    const effectiveFadeIn = fadeInSec ?? 0;
    const effectiveFadeOut = fadeOutSec ?? 0;

    if (effectiveFadeIn > 0 || effectiveFadeOut > 0) {
      for (let ch = 0; ch < channels; ch++) {
        const data = newBuffer.getChannelData(ch);
        for (let i = 0; i < numSamples; i++) {
          const timeSec = i / sampleRate;
          let gain = 1;
          if (effectiveFadeIn > 0 && timeSec < effectiveFadeIn) {
            gain *= timeSec / effectiveFadeIn;
          }
          if (effectiveFadeOut > 0 && timeSec > actualDuration - effectiveFadeOut) {
            gain *= (actualDuration - timeSec) / effectiveFadeOut;
          }
          data[i] *= gain;
        }
      }
    }

    return newBuffer;
  }

  cleanup(): void {
    if (this.videoEncoder && this.videoEncoder.state !== "closed") {
      this.videoEncoder.close();
    }
    this.videoEncoder = null;
    if (this.audioEncoder && this.audioEncoder.state !== "closed") {
      this.audioEncoder.close();
    }
    this.audioEncoder = null;
    this.muxer = null;
    this.target = null;
    this.videoEncoderError = null;
  }
}

/** WebCodecs が使える環境でのみオフラインエンコード可能（非リアルタイム） */
export function isOfflineEncodeSupported(): boolean {
  return typeof document !== "undefined" && isWebCodecsSupported();
}
