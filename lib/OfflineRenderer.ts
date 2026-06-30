/**
 * オフラインレンダラー
 * drawBars をリアルタイム制約なしで呼び出すためのラッパー
 * MockAnalyserNode + 合成時刻で全22モード対応
 */

import { drawBars, stopCanvas2DAnimation, resetSpectrumTimelineState, type ModeAdjustments, type SpectrumSettings } from "./Canvas";
import { computeOfflineVideoTiming } from "./offlineVideoTiming";
import { type EffectParams, type AudioReactiveData, resetEffectsTimeState } from "./Effects";
import { resetScreenEffectRuntime } from "./drawStillScreenBackground";
import { clearGalleryImageTransition } from "./galleryImageTransition";
import { clearRecordPlayerCache } from "./recordPlayer";
import {
  type SubtitleOverlaySettings,
  type TitleOverlaySettings,
} from "./subtitles";

/**
 * drawBars 用の Mock AnalyserNode
 * 事前計算済み FFT / TimeDomain データを返す
 */
export class OfflineAnalyserNode {
  readonly fftSize: number;
  readonly frequencyBinCount: number;

  private frequencyData: Uint8Array;
  private timeDomainData: Uint8Array;

  constructor(fftSize: number = 2048) {
    this.fftSize = fftSize;
    this.frequencyBinCount = fftSize / 2;
    this.frequencyData = new Uint8Array(this.frequencyBinCount);
    this.timeDomainData = new Uint8Array(this.frequencyBinCount);
  }

  /** 次のフレームで返す周波数データをセット */
  setFrequencyData(data: Uint8Array): void {
    if (data.length === this.frequencyBinCount) {
      this.frequencyData = data;
    } else {
      this.frequencyData = new Uint8Array(this.frequencyBinCount);
      const copyLen = Math.min(data.length, this.frequencyBinCount);
      for (let i = 0; i < copyLen; i++) {
        this.frequencyData[i] = data[i];
      }
    }
  }

  /** 次のフレームで返すタイムドメインデータをセット */
  setTimeDomainData(data: Uint8Array): void {
    if (data.length === this.frequencyBinCount) {
      this.timeDomainData = data;
    } else {
      this.timeDomainData = new Uint8Array(this.frequencyBinCount);
      const copyLen = Math.min(data.length, this.frequencyBinCount);
      for (let i = 0; i < copyLen; i++) {
        this.timeDomainData[i] = data[i];
      }
    }
  }

  getByteFrequencyData(array: Uint8Array): void {
    for (let i = 0; i < array.length && i < this.frequencyData.length; i++) {
      array[i] = this.frequencyData[i];
    }
  }

  getByteTimeDomainData(array: Uint8Array): void {
    for (let i = 0; i < array.length && i < this.timeDomainData.length; i++) {
      array[i] = this.timeDomainData[i];
    }
  }
}

/**
 * drawBars の全モジュール状態をリセット
 * モード15/16の trail、ピークホールド等を初期化
 */
function resetDrawBarsState(): void {
  (drawBars as any)._waveFamilyState = undefined;
  (drawBars as any)._mode15Scope = undefined;
  (drawBars as any)._mode15ScopeTrail = undefined;
  (drawBars as any)._mode16Lis = undefined;
  (drawBars as any)._mode16LisTrail = undefined;
  (drawBars as any)._glycoPeak = undefined;
  (drawBars as any)._radialState = undefined;
  (drawBars as any)._particleSpectrumState = undefined;
  (drawBars as any)._mode8Pulse = undefined;
  (drawBars as any)._mode9Vu = undefined;
  (drawBars as any)._mode10Ring = undefined;
  (drawBars as any)._mode11Orb = undefined;
  (drawBars as any)._mode12Bg = undefined;
  (drawBars as any)._mode13Level = undefined;
  (drawBars as any)._mode13Particles = undefined;
  (drawBars as any)._mode14Morph = undefined;
  (drawBars as any)._recordPlayerLastDrawMs = undefined;
  (drawBars as any)._lastTimeMode1 = undefined;
  (drawBars as any)._lastTimeMode5 = undefined;
}

/**
 * オフラインレンダリングのコンテキスト
 */
export interface OfflineRenderContext {
  canvas: HTMLCanvasElement;
  /** drawBars が自前で getContext するため未使用可 */
  ctx?: CanvasRenderingContext2D | null;
  analyser: OfflineAnalyserNode;
  /** 合成時刻（秒） */
  syntheticTimeSec: number;
  /** フレーム間隔（秒） */
  frameDurationSec: number;
  /** 総再生時間（秒） */
  totalDurationSec?: number;
}

/**
 * オフラインで1フレームを描画（同期版）
 * drawBars を直接利用し、アニメーションループに依存しない
 */
export function renderFrameOffline(
  rc: OfflineRenderContext,
  imageCtx: HTMLImageElement | null,
  mode: number,
  adjustments: ModeAdjustments,
  effect?: EffectParams,
  isEffectActive?: boolean,
  spectrumSettings?: Partial<SpectrumSettings>
): void {
  const { canvas, ctx, analyser, syntheticTimeSec, frameDurationSec } = rc;

  const realNow = performance.now.bind(performance);
  const syntheticNowMs = syntheticTimeSec * 1000;
  performance.now = () => syntheticNowMs;

  const realRAF = window.requestAnimationFrame;
  window.requestAnimationFrame = () => 0 as unknown as number;

  try {
    const frameDeltaMs = frameDurationSec * 1000;
    const settings: SpectrumSettings = {
      opacity: spectrumSettings?.opacity ?? 0.9,
      sensitivity: spectrumSettings?.sensitivity ?? 1,
      lineWidthWaveform: spectrumSettings?.lineWidthWaveform ?? 3.2,
      lineWidthCircle: spectrumSettings?.lineWidthCircle ?? 3.2,
      lineWidthSymWave: spectrumSettings?.lineWidthSymWave ?? 3.6,
      ...spectrumSettings,
      isTargetFpsEnabled: () => false,
      getFrameDeltaMs: () => frameDeltaMs,
      getPlaybackTiming: () => ({
        elapsedSec: syntheticTimeSec,
        durationSec: rc.totalDurationSec ?? 0,
      }),
    };

    drawBars(
      canvas,
      imageCtx,
      mode,
      analyser as unknown as AnalyserNode,
      adjustments,
      effect,
      isEffectActive ?? true,
      settings
    );
  } finally {
    performance.now = realNow;
    window.requestAnimationFrame = realRAF;
  }
}

/**
 * オフラインで1フレームを描画（同期版、エフェクト・字幕を含む）
 * drawBars + drawEffectOverlayCanvas + 字幕オーバーレイをまとめて描画
 */
export function renderFrameOfflineFull(
  rc: OfflineRenderContext,
  imageCtx: HTMLImageElement | null,
  mode: number,
  adjustments: ModeAdjustments,
  effect?: EffectParams,
  isEffectActive?: boolean,
  spectrumSettings?: Partial<SpectrumSettings>,
  subtitleOverlay?: SubtitleOverlaySettings,
  titleOverlay?: TitleOverlaySettings
): void {
  const { canvas, ctx, analyser, syntheticTimeSec, frameDurationSec } = rc;

  // drawBars でスペクトラム+背景+エフェクト+字幕+タイトルをまとめて描画
  // drawBars 内部で既にエフェクトオーバーレイ、字幕、タイトルを描画しているため
  // renderFrameOfflineFull では drawBars のみ呼び出す
  renderFrameOffline(
    rc,
    imageCtx,
    mode,
    adjustments,
    effect,
    isEffectActive,
    spectrumSettings
  );
}

/**
 * FFT データから音源メトリクスを計算
 */
export function computeAudioReactiveFromFft(fftData: Uint8Array): AudioReactiveData {
  let bass = 0;
  let volume = 0;
  let highFreq = 0;
  const bl = fftData.length;

  for (let i = 0; i < Math.min(16, bl); i++) bass += fftData[i];
  for (let i = 0; i < bl; i++) volume += fftData[i];
  for (let i = 200; i < Math.min(256, bl); i++) highFreq += fftData[i];

  return {
    bass: bl > 0 ? Math.min(1, bass / (Math.min(16, bl) * 200)) : 0,
    volume: bl > 0 ? Math.min(1, volume / (bl * 180)) : 0,
    highFreq: bl > 200 ? Math.min(1, highFreq / (Math.min(56, bl - 200) * 150)) : 0,
  };
}

/**
 * AudioBuffer からフレームごとの FFT データを事前計算
 */
export async function computeFftFramesOffline(
  audioBuffer: AudioBuffer,
  frameRate: number,
  fftSize: number = 2048,
  onProgress?: (progress: number) => void
): Promise<{ frequencyFrames: Uint8Array[]; timeDomainFrames: Uint8Array[] }> {
  const { totalFrames } = computeOfflineVideoTiming(audioBuffer, frameRate);
  const sampleRate = audioBuffer.sampleRate;
  const binCount = fftSize / 2;

  // チャンネルデータをミックス（1チャンネルの場合はコピーのみ）
  const channelData = new Float32Array(audioBuffer.length);
  const numChannels = audioBuffer.numberOfChannels;
  if (numChannels === 1) {
    channelData.set(audioBuffer.getChannelData(0));
  } else {
    const invChannels = 1 / numChannels;
    for (let ch = 0; ch < numChannels; ch++) {
      const chData = audioBuffer.getChannelData(ch);
      for (let i = 0; i < chData.length; i++) {
        channelData[i] += chData[i] * invChannels;
      }
    }
  }

  const frequencyFrames: Uint8Array[] = [];
  const timeDomainFrames: Uint8Array[] = [];
  const samplesPerFrame = Math.floor(sampleRate / frameRate);

  // Hamming 窓テーブルを事前計算（毎フレームの再計算を回避）
  const hammingWindow = new Float32Array(fftSize);
  for (let i = 0; i < fftSize; i++) {
    hammingWindow[i] = 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (fftSize - 1));
  }

  // リusable バッファ（毎フレームの再確保を回避）
  const samples = new Float32Array(fftSize);

  for (let frame = 0; frame < totalFrames; frame++) {
    const startSample = frame * samplesPerFrame;

    // フレームのサンプルを取得 + Hamming窓適用（1ループで処理）
    for (let i = 0; i < fftSize; i++) {
      const idx = startSample + i;
      samples[i] = (idx < channelData.length ? channelData[idx] : 0) * hammingWindow[i];
    }

    // FFT 計算
    frequencyFrames.push(computeSpectrumFromSamples(samples, fftSize));

    // タイムドメイン（窓適用前の生データを0-255にマッピング）
    const timeDomain = new Uint8Array(binCount);
    const limit = Math.min(binCount, channelData.length - startSample);
    for (let i = 0; i < limit; i++) {
      timeDomain[i] = Math.max(0, Math.min(255, Math.round((channelData[startSample + i] + 1) * 127.5)));
    }
    timeDomainFrames.push(timeDomain);

    if (frame % 100 === 0) {
      onProgress?.((frame / totalFrames) * 100);
      // ブロッキング回避
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  return { frequencyFrames, timeDomainFrames };
}

/**
 * サンプルからスペクトラムを計算（FFT: Cooley-Tukey アルゴリズム）
 * O(N log N) — DFT の O(N²) より約91倍高速（N=2048時）
 */
function computeSpectrumFromSamples(samples: Float32Array, fftSize: number): Uint8Array {
  const binCount = fftSize / 2;
  const result = new Uint8Array(binCount);

  // ビットリバース並べ替え
  const real = new Float32Array(fftSize);
  const imag = new Float32Array(fftSize);
  for (let i = 0; i < fftSize; i++) {
    real[i] = samples[i];
  }

  const bits = Math.log2(fftSize);
  for (let i = 0; i < fftSize; i++) {
    let j = 0;
    let x = i;
    for (let b = 0; b < bits; b++) {
      j = (j << 1) | (x & 1);
      x >>= 1;
    }
    if (j > i) {
      [real[i], real[j]] = [real[j], real[i]];
      [imag[i], imag[j]] = [imag[j], imag[i]];
    }
  }

  // バタフライ演算
  for (let size = 2; size <= fftSize; size *= 2) {
    const halfSize = size / 2;
    const angleStep = (-2 * Math.PI) / size;
    const wReal = Math.cos(angleStep);
    const wImag = Math.sin(angleStep);

    for (let start = 0; start < fftSize; start += size) {
      let curReal = 1;
      let curImag = 0;

      for (let i = 0; i < halfSize; i++) {
        const evenIdx = start + i;
        const oddIdx = start + i + halfSize;

        const tReal = curReal * real[oddIdx] - curImag * imag[oddIdx];
        const tImag = curReal * imag[oddIdx] + curImag * real[oddIdx];

        real[oddIdx] = real[evenIdx] - tReal;
        imag[oddIdx] = imag[evenIdx] - tImag;
        real[evenIdx] += tReal;
        imag[evenIdx] += tImag;

        const newCurReal = curReal * wReal - curImag * wImag;
        curImag = curReal * wImag + curImag * wReal;
        curReal = newCurReal;
      }
    }
  }

  // 振幅スペクトラムを計算
  // getByteFrequencyData の出力と同等の範囲 (0-255) になるよう正規化
  // 旧スケール (500/fftSize) では fftMax=12〜46 と小さすぎた（バー高さが数ピクセル）
  // log スケールで正規化し、getByteFrequencyData と同等の見た目にする
  for (let k = 0; k < binCount; k++) {
    const magnitude = Math.sqrt(real[k] * real[k] + imag[k] * imag[k]);
    // log スケール: magnitude=0 → 0, magnitude=1024 → 255 程度
    const db = magnitude > 0 ? 20 * Math.log10(magnitude / fftSize) : -100;
    // -100 dB → 0, -20 dB → 255 にマッピング
    const normalized = Math.max(0, Math.min(255, Math.round((db + 100) * (255 / 80))));
    result[k] = normalized;
  }

  return result;
}

/**
 * オフラインモードの初期化（drawBars 状態リセット）
 */
export function initOfflineRenderer(): void {
  stopCanvas2DAnimation();
  resetDrawBarsState();
  resetSpectrumTimelineState();
  resetEffectsTimeState();
  resetScreenEffectRuntime();
  clearGalleryImageTransition();
  clearRecordPlayerCache();
}
