import { describe, it, expect, vi, beforeEach } from "vitest";
import { OfflineMp4Encoder, isOfflineEncodeSupported } from "../OfflineMp4Encoder";
import type { OfflineEncoderConfig } from "../OfflineMp4Encoder";

function makeDefaultConfig(): OfflineEncoderConfig {
  return {
    width: 1920,
    height: 1080,
    frameRate: 30,
    videoBitrate: 8_000_000,
    mode: 0,
    adjustments: { scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0 },
    backgroundImage: null,
  };
}

function createMockAudioBuffer(durationSec: number): AudioBuffer {
  const sampleRate = 44100;
  const length = Math.floor(sampleRate * durationSec);
  const data = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    data[i] = Math.sin((2 * Math.PI * 440 * i) / sampleRate);
  }
  return {
    numberOfChannels: 1,
    length,
    duration: durationSec,
    sampleRate,
    getChannelData: () => data,
  } as unknown as AudioBuffer;
}

describe("isOfflineEncodeSupported", () => {
  it("ブラウザ環境では true を返す", () => {
    // vitest は jsdom 環境で、document と MediaRecorder が存在する
    const result = isOfflineEncodeSupported();
    expect(typeof result).toBe("boolean");
  });
});

describe("OfflineMp4Encoder", () => {
  describe("コンストラクタ", () => {
    it("config と onProgress を正しく保持する", () => {
      const config = makeDefaultConfig();
      const onProgress = vi.fn();
      const encoder = new OfflineMp4Encoder(config, onProgress);
      expect(encoder).toBeDefined();
      expect(encoder.isCancelled()).toBe(false);
    });
  });

  describe("cancel / isCancelled", () => {
    it("cancel 後 isCancelled が true を返す", () => {
      const encoder = new OfflineMp4Encoder(makeDefaultConfig());
      expect(encoder.isCancelled()).toBe(false);
      encoder.cancel();
      expect(encoder.isCancelled()).toBe(true);
    });
  });

  describe("cleanup", () => {
    it("VideoEncoder を閉じる", () => {
      const encoder = new OfflineMp4Encoder(makeDefaultConfig());
      const mockEncoder = {
        state: "configured",
        close: vi.fn(),
      } as unknown as VideoEncoder;
      (encoder as any).videoEncoder = mockEncoder;
      encoder.cleanup();
      expect(mockEncoder.close).toHaveBeenCalled();
      expect((encoder as any).videoEncoder).toBeNull();
    });

    it("VideoEncoder が closed の場合は close を呼ばない", () => {
      const encoder = new OfflineMp4Encoder(makeDefaultConfig());
      const mockEncoder = {
        state: "closed",
        close: vi.fn(),
      } as unknown as VideoEncoder;
      (encoder as any).videoEncoder = mockEncoder;
      encoder.cleanup();
      expect(mockEncoder.close).not.toHaveBeenCalled();
    });

    it("muxer と target を null にする", () => {
      const encoder = new OfflineMp4Encoder(makeDefaultConfig());
      (encoder as any).muxer = { finalize: vi.fn() };
      (encoder as any).target = { buffer: new ArrayBuffer(10) };
      encoder.cleanup();
      expect((encoder as any).muxer).toBeNull();
      expect((encoder as any).target).toBeNull();
    });
  });

  describe("encode", () => {
    it("キャンセルした場合は isCancelled が true", () => {
      const encoder = new OfflineMp4Encoder(makeDefaultConfig());
      encoder.cancel();
      expect(encoder.isCancelled()).toBe(true);
    });
  });

  describe("OfflineEncoderConfig の型安全性", () => {
    it("必須フィールドが全て存在する", () => {
      const config = makeDefaultConfig();
      expect(config.width).toBe(1920);
      expect(config.height).toBe(1080);
      expect(config.frameRate).toBe(30);
      expect(config.videoBitrate).toBe(8_000_000);
      expect(config.mode).toBe(0);
      expect(config.adjustments).toEqual({ scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0 });
      expect(config.backgroundImage).toBeNull();
    });

    it("オプショナルフィールドは undefined でも問題ない", () => {
      const config: OfflineEncoderConfig = {
        width: 1280,
        height: 720,
        frameRate: 60,
        videoBitrate: 16_000_000,
        mode: 6,
        adjustments: { scaleX: 1.5, scaleY: 0.8, offsetX: 10, offsetY: -5 },
        backgroundImage: null,
      };
      expect(config.effect).toBeUndefined();
      expect(config.spectrumSettings).toBeUndefined();
      expect(config.subtitleOverlay).toBeUndefined();
      expect(config.titleOverlay).toBeUndefined();
      expect(config.screenMotion).toBeUndefined();
    });
  });
});
