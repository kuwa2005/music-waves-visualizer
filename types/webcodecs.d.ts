/**
 * WebCodecs API型定義
 * 参照: https://www.w3.org/TR/webcodecs/
 */

export {};

declare global {
  // VideoEncoder
  interface VideoEncoderConfig {
    codec: string;
    width: number;
    height: number;
    bitrate?: number;
    framerate?: number;
    hardwareAcceleration?: 'no-preference' | 'prefer-hardware' | 'prefer-software';
    alpha?: 'discard' | 'keep';
    scalabilityMode?: string;
    bitrateMode?: 'constant' | 'variable';
    latencyMode?: 'quality' | 'realtime';
  }

  interface VideoEncoderSupport {
    supported: boolean;
    config: VideoEncoderConfig;
  }

  interface EncodedVideoChunkMetadata {
    decoderConfig?: {
      codec: string;
      codedWidth?: number;
      codedHeight?: number;
      displayAspectWidth?: number;
      displayAspectHeight?: number;
      description?: BufferSource;
    };
    svc?: {
      temporalLayerId?: number;
    };
    alphaSideData?: BufferSource;
  }

  interface VideoEncoderInit {
    output: (chunk: EncodedVideoChunk, metadata?: EncodedVideoChunkMetadata) => void;
    error: (error: Error) => void;
  }

  interface VideoEncoderEncodeOptions {
    keyFrame?: boolean;
  }

  class VideoEncoder {
    constructor(init: VideoEncoderInit);
    configure(config: VideoEncoderConfig): void;
    encode(frame: VideoFrame, options?: VideoEncoderEncodeOptions): void;
    flush(): Promise<void>;
    close(): void;
    reset(): void;
    readonly state: 'unconfigured' | 'configured' | 'closed';
    readonly encodeQueueSize: number;
    static isConfigSupported(config: VideoEncoderConfig): Promise<VideoEncoderSupport>;
  }

  // VideoFrame
  interface VideoFrameInit {
    timestamp: number;
    duration?: number;
    alpha?: 'discard' | 'keep';
    visibleRect?: DOMRectInit;
    displayWidth?: number;
    displayHeight?: number;
    metadata?: any;
  }

  class VideoFrame {
    constructor(source: CanvasImageSource, init?: VideoFrameInit);
    readonly format: string | null;
    readonly codedWidth: number;
    readonly codedHeight: number;
    readonly codedRect: DOMRectReadOnly | null;
    readonly visibleRect: DOMRectReadOnly | null;
    readonly displayWidth: number;
    readonly displayHeight: number;
    readonly duration: number | null;
    readonly timestamp: number;
    readonly colorSpace: any;
    clone(): VideoFrame;
    close(): void;
  }

  // EncodedVideoChunk
  interface EncodedVideoChunkInit {
    type: 'key' | 'delta';
    timestamp: number;
    duration?: number;
    data: BufferSource;
  }

  class EncodedVideoChunk {
    constructor(init: EncodedVideoChunkInit);
    readonly type: 'key' | 'delta';
    readonly timestamp: number;
    readonly duration: number | null;
    readonly byteLength: number;
    copyTo(destination: BufferSource): void;
  }

  // VideoDecoder
  interface VideoDecoderConfig {
    codec: string;
    codedWidth?: number;
    codedHeight?: number;
    displayAspectWidth?: number;
    displayAspectHeight?: number;
    description?: BufferSource;
    hardwareAcceleration?: 'no-preference' | 'prefer-hardware' | 'prefer-software';
    optimizeForLatency?: boolean;
  }

  interface VideoDecoderInit {
    output: (frame: VideoFrame) => void;
    error: (error: Error) => void;
  }

  class VideoDecoder {
    constructor(init: VideoDecoderInit);
    configure(config: VideoDecoderConfig): void;
    decode(chunk: EncodedVideoChunk): void;
    flush(): Promise<void>;
    close(): void;
    reset(): void;
    readonly state: 'unconfigured' | 'configured' | 'closed';
    readonly decodeQueueSize: number;
    static isConfigSupported(config: VideoDecoderConfig): Promise<{ supported: boolean; config: VideoDecoderConfig }>;
  }

  // Window interface extension
  interface Window {
    VideoEncoder: typeof VideoEncoder;
    VideoDecoder: typeof VideoDecoder;
    VideoFrame: typeof VideoFrame;
    EncodedVideoChunk: typeof EncodedVideoChunk;
  }
}
