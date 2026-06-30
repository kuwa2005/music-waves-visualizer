import { describe, it, expect } from "vitest";
import {
  computeOfflineVideoTiming,
  offlineVideoFrameDurationUs,
  offlineVideoFrameTimestampUs,
} from "../offlineVideoTiming";

function mockBuffer(length: number, sampleRate = 44100): AudioBuffer {
  return {
    length,
    sampleRate,
    duration: length / sampleRate,
    numberOfChannels: 1,
    getChannelData: () => new Float32Array(length),
  } as unknown as AudioBuffer;
}

describe("computeOfflineVideoTiming", () => {
  it("10秒音声を60fpsで600フレームにする", () => {
    const buf = mockBuffer(441000);
    const t = computeOfflineVideoTiming(buf, 60);
    expect(t.totalFrames).toBe(600);
    expect(t.audioDurationSec).toBeCloseTo(10, 5);
  });

  it("最終フレームの duration で音声終端まで伸ばす", () => {
    const buf = mockBuffer(441000);
    const { totalFrames, frameDurationSec, audioDurationUs } = computeOfflineVideoTiming(buf, 60);
    const lastIdx = totalFrames - 1;
    const ts = offlineVideoFrameTimestampUs(lastIdx, frameDurationSec);
    const dur = offlineVideoFrameDurationUs(lastIdx, totalFrames, frameDurationSec, audioDurationUs);
    expect(ts + dur).toBe(audioDurationUs);
  });
});
