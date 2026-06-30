import { describe, it, expect, beforeEach } from "vitest";
import { OfflineAnalyserNode, initOfflineRenderer } from "../OfflineRenderer";
import {
  resolveSpectrumFrameDeltaMs,
  resetSpectrumTimelineState,
  type SpectrumSettings,
} from "../Canvas";

describe("OfflineAnalyserNode", () => {
  let analyser: OfflineAnalyserNode;

  beforeEach(() => {
    analyser = new OfflineAnalyserNode(2048);
  });

  it("初期化時に正しいプロパティを持つ", () => {
    expect(analyser.fftSize).toBe(2048);
    expect(analyser.frequencyBinCount).toBe(1024);
  });

  it("周波数データを設定して取得できる", () => {
    const data = new Uint8Array([10, 20, 30, 40]);
    analyser.setFrequencyData(data);
    
    const result = new Uint8Array(4);
    analyser.getByteFrequencyData(result);
    
    expect(result[0]).toBe(10);
    expect(result[1]).toBe(20);
    expect(result[2]).toBe(30);
    expect(result[3]).toBe(40);
  });

  it("タイムドメインデータを設定して取得できる", () => {
    const data = new Uint8Array([100, 128, 200]);
    analyser.setTimeDomainData(data);
    
    const result = new Uint8Array(3);
    analyser.getByteTimeDomainData(result);
    
    expect(result[0]).toBe(100);
    expect(result[1]).toBe(128);
    expect(result[2]).toBe(200);
  });

  it("sizeが異なるデータを設定した場合、部分コピーする", () => {
    const data = new Uint8Array([10, 20, 30]);
    analyser.setFrequencyData(data);
    
    const result = new Uint8Array(1024);
    analyser.getByteFrequencyData(result);
    
    expect(result[0]).toBe(10);
    expect(result[1]).toBe(20);
    expect(result[2]).toBe(30);
    expect(result[3]).toBe(0);
  });
});

describe("resolveSpectrumFrameDeltaMs", () => {
  beforeEach(() => {
    resetSpectrumTimelineState();
  });

  it("オフラインは getFrameDeltaMs の固定間隔を使う", () => {
    const settings: SpectrumSettings = {
      opacity: 1,
      sensitivity: 1,
      lineWidthWaveform: 3,
      lineWidthCircle: 3,
      lineWidthSymWave: 3,
      getFrameDeltaMs: () => 1000 / 60,
      getPlaybackTiming: () => ({ elapsedSec: 1, durationSec: 10 }),
    };
    expect(resolveSpectrumFrameDeltaMs(settings)).toBeCloseTo(1000 / 60, 5);
    expect(resolveSpectrumFrameDeltaMs(settings)).toBeCloseTo(1000 / 60, 5);
  });

  it("プレビューは再生時刻差分でフレーム間隔を返す", () => {
    let elapsed = 0;
    const settings: SpectrumSettings = {
      opacity: 1,
      sensitivity: 1,
      lineWidthWaveform: 3,
      lineWidthCircle: 3,
      lineWidthSymWave: 3,
      getPlaybackTiming: () => ({ elapsedSec: elapsed, durationSec: 10 }),
    };
    expect(resolveSpectrumFrameDeltaMs(settings)).toBe(0);
    elapsed = 1 / 60;
    expect(resolveSpectrumFrameDeltaMs(settings)).toBeCloseTo(1000 / 60, 5);
    elapsed = 3 / 60;
    expect(resolveSpectrumFrameDeltaMs(settings)).toBeCloseTo((2 / 60) * 1000, 5);
  });

  it("initOfflineRenderer でタイムライン状態がリセットされる", () => {
    let elapsed = 0;
    const settings: SpectrumSettings = {
      opacity: 1,
      sensitivity: 1,
      lineWidthWaveform: 3,
      lineWidthCircle: 3,
      lineWidthSymWave: 3,
      getPlaybackTiming: () => ({ elapsedSec: elapsed, durationSec: 10 }),
    };
    elapsed = 2 / 60;
    resolveSpectrumFrameDeltaMs(settings);
    initOfflineRenderer();
    elapsed = 1 / 60;
    expect(resolveSpectrumFrameDeltaMs(settings)).toBe(0);
  });
});
