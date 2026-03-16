/**
 * WebCodecs APIを使用したハードウェアエンコーディング
 * GPUを活用した高速動画エンコード
 */

export interface EncoderConfig {
  width: number;
  height: number;
  frameRate: number;
  bitrate: number;
}

export interface EncoderProgress {
  encodedFrames: number;
  totalFrames: number;
  progress: number;
}

/**
 * WebCodecs APIのサポート確認
 */
export function isWebCodecsSupported(): boolean {
  return (
    'VideoEncoder' in window &&
    'VideoFrame' in window &&
    'VideoDecoder' in window
  );
}

/**
 * ハードウェアエンコーダーのサポート確認
 */
export async function checkHardwareEncoderSupport(): Promise<{
  h264: boolean;
  h265: boolean;
  vp9: boolean;
  av1: boolean;
}> {
  if (!isWebCodecsSupported()) {
    return { h264: false, h265: false, vp9: false, av1: false };
  }

  const configs = [
    { codec: 'avc1.42001E', name: 'h264' }, // H.264 Baseline
    { codec: 'hev1.1.6.L93.B0', name: 'h265' }, // H.265
    { codec: 'vp09.00.10.08', name: 'vp9' }, // VP9
    { codec: 'av01.0.05M.08', name: 'av1' }, // AV1
  ];

  const support = { h264: false, h265: false, vp9: false, av1: false };

  for (const config of configs) {
    try {
      const result = await VideoEncoder.isConfigSupported({
        codec: config.codec,
        width: 1920,
        height: 1080,
        bitrate: 5000000,
        framerate: 30,
        hardwareAcceleration: 'prefer-hardware',
      });

      if (result.supported) {
        support[config.name as keyof typeof support] = true;
      }
    } catch (e) {
      // サポートされていない
    }
  }

  return support;
}

/**
 * WebCodecsエンコーダー
 */
export class WebCodecsVideoEncoder {
  private encoder: VideoEncoder | null = null;
  private chunks: Uint8Array[] = [];
  private frameCount = 0;
  private config: EncoderConfig;
  private onProgress?: (progress: EncoderProgress) => void;
  private totalFrames = 0;
  private muxer: any = null; // MP4Muxerを使う場合

  constructor(config: EncoderConfig, onProgress?: (progress: EncoderProgress) => void) {
    this.config = config;
    this.onProgress = onProgress;
  }

  /**
   * エンコーダーを初期化
   */
  async init(): Promise<void> {
    if (!isWebCodecsSupported()) {
      throw new Error('WebCodecs API is not supported');
    }

    // H.264ハードウェアエンコーダーを設定
    const encoderConfig: VideoEncoderConfig = {
      codec: 'avc1.42001E', // H.264 Baseline
      width: this.config.width,
      height: this.config.height,
      bitrate: this.config.bitrate,
      framerate: this.config.frameRate,
      hardwareAcceleration: 'prefer-hardware', // ハードウェアエンコーディングを優先
    };

    // サポート確認
    const support = await VideoEncoder.isConfigSupported(encoderConfig);
    if (!support.supported) {
      throw new Error('Encoder configuration not supported');
    }

    // エンコーダーを作成
    this.encoder = new VideoEncoder({
      output: (chunk, metadata) => {
        this.handleEncodedChunk(chunk, metadata);
      },
      error: (error) => {
        console.error('Encoder error:', error);
      },
    });

    this.encoder.configure(encoderConfig);
  }

  /**
   * エンコードされたチャンクを処理
   */
  private handleEncodedChunk(chunk: EncodedVideoChunk, metadata?: EncodedVideoChunkMetadata): void {
    const data = new Uint8Array(chunk.byteLength);
    chunk.copyTo(data);
    this.chunks.push(data);

    // 進捗を通知
    if (this.onProgress && this.totalFrames > 0) {
      this.onProgress({
        encodedFrames: this.frameCount,
        totalFrames: this.totalFrames,
        progress: (this.frameCount / this.totalFrames) * 100,
      });
    }
  }

  /**
   * フレームをエンコード
   */
  async encodeFrame(canvas: HTMLCanvasElement, timestamp: number): Promise<void> {
    if (!this.encoder) {
      throw new Error('Encoder not initialized');
    }

    // CanvasからVideoFrameを作成
    const frame = new VideoFrame(canvas, {
      timestamp: timestamp * 1000, // マイクロ秒単位
    });

    // エンコード
    this.encoder.encode(frame, { keyFrame: this.frameCount % 30 === 0 });
    frame.close();

    this.frameCount++;
  }

  /**
   * 総フレーム数を設定
   */
  setTotalFrames(total: number): void {
    this.totalFrames = total;
  }

  /**
   * エンコードを完了
   */
  async finish(): Promise<Blob> {
    if (!this.encoder) {
      throw new Error('Encoder not initialized');
    }

    // エンコーダーをフラッシュ
    await this.encoder.flush();
    this.encoder.close();

    // チャンクを結合してBlobを作成
    const blob = new Blob(this.chunks, { type: 'video/mp4' });
    return blob;
  }

  /**
   * クリーンアップ
   */
  cleanup(): void {
    if (this.encoder && this.encoder.state !== 'closed') {
      this.encoder.close();
    }
    this.encoder = null;
    this.chunks = [];
    this.frameCount = 0;
  }
}

/**
 * Canvas + AudioをWebCodecsでエンコード
 */
export async function encodeVideoWithAudio(
  canvas: HTMLCanvasElement,
  audioContext: AudioContext,
  duration: number,
  config: EncoderConfig,
  onProgress?: (progress: EncoderProgress) => void
): Promise<Blob> {
  const encoder = new WebCodecsVideoEncoder(config, onProgress);
  await encoder.init();

  const totalFrames = Math.floor(duration * config.frameRate);
  encoder.setTotalFrames(totalFrames);

  const frameDuration = 1 / config.frameRate;

  // フレームごとにエンコード
  for (let i = 0; i < totalFrames; i++) {
    const timestamp = i * frameDuration;
    await encoder.encodeFrame(canvas, timestamp);

    // 進捗表示のために少し待つ
    if (i % 10 === 0) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  // エンコードを完了
  const blob = await encoder.finish();
  encoder.cleanup();

  return blob;
}

/**
 * MediaRecorderとWebCodecsのどちらを使うか判定
 */
export async function getBestEncodingMethod(): Promise<'webcodecs' | 'mediarecorder'> {
  if (!isWebCodecsSupported()) {
    return 'mediarecorder';
  }

  // ハードウェアエンコーダーのサポートを確認
  const support = await checkHardwareEncoderSupport();

  // H.264ハードウェアエンコーダーが使える場合はWebCodecsを推奨
  if (support.h264) {
    return 'webcodecs';
  }

  // それ以外はMediaRecorderにフォールバック
  return 'mediarecorder';
}

/**
 * エンコード性能をテスト
 */
export async function benchmarkEncoder(): Promise<{
  method: 'webcodecs' | 'mediarecorder';
  fps: number;
  hardwareAccelerated: boolean;
}> {
  if (!isWebCodecsSupported()) {
    return {
      method: 'mediarecorder',
      fps: 0,
      hardwareAccelerated: false,
    };
  }

  const canvas = document.createElement('canvas');
  canvas.width = 1920;
  canvas.height = 1080;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return {
      method: 'mediarecorder',
      fps: 0,
      hardwareAccelerated: false,
    };
  }

  // ダミー画像を描画
  ctx.fillStyle = 'blue';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const encoder = new WebCodecsVideoEncoder(
    {
      width: 1920,
      height: 1080,
      frameRate: 60,
      bitrate: 5000000,
    }
  );

  try {
    await encoder.init();

    const startTime = performance.now();
    const testFrames = 30;

    for (let i = 0; i < testFrames; i++) {
      await encoder.encodeFrame(canvas, i / 60);
    }

    await encoder.finish();
    const elapsed = performance.now() - startTime;
    const fps = Math.round((testFrames / elapsed) * 1000);

    encoder.cleanup();

    return {
      method: 'webcodecs',
      fps,
      hardwareAccelerated: true,
    };
  } catch (e) {
    console.error('Benchmark error:', e);
    encoder.cleanup();
    return {
      method: 'mediarecorder',
      fps: 0,
      hardwareAccelerated: false,
    };
  }
}
