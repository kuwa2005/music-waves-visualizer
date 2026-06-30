import { describe, it, expect } from "vitest";
import {
  parseFfmpegDurationFromLogs,
  resolveMp4EncodeDurationSec,
  playbackSpanRecordedSec,
  estimateActualRecordedSec,
} from "../mp4EncodeDuration";
import type { RecordEncodeSnapshot } from "../mp4EncodeDuration";

describe("parseFfmpegDurationFromLogs", () => {
  it("parses standard HH:MM:SS.xx format", () => {
    expect(parseFfmpegDurationFromLogs("Duration: 01:23:45.67")).toBe(5025.67);
  });

  it("parses zero duration", () => {
    expect(parseFfmpegDurationFromLogs("Duration: 00:00:00.00")).toBeNull();
  });

  it("parses integer seconds", () => {
    expect(parseFfmpegDurationFromLogs("Duration: 00:05:30")).toBe(330);
  });

  it("returns null for missing Duration line", () => {
    expect(parseFfmpegDurationFromLogs("some random log")).toBeNull();
  });

  it("returns null for invalid numbers", () => {
    expect(parseFfmpegDurationFromLogs("Duration: ab:cd:ef")).toBeNull();
  });
});

describe("resolveMp4EncodeDurationSec", () => {
  it("returns planned when only planned is valid", () => {
    expect(resolveMp4EncodeDurationSec(60)).toBe(60);
  });

  it("returns minimum of all valid values", () => {
    expect(resolveMp4EncodeDurationSec(120, 90, 100)).toBe(90);
  });

  it("自然終了時は計画長を優先する", () => {
    expect(
      resolveMp4EncodeDurationSec(10, 10, 7, {
        stopReason: "playback_ended",
        stopAtSec: 10,
        fadeTailSec: 0,
        playbackEndSec: 10,
      })
    ).toBe(10);
  });

  it("ignores null/undefined/invalid values", () => {
    expect(resolveMp4EncodeDurationSec(60, null, undefined)).toBe(60);
  });

  it("returns 0 when all values are invalid", () => {
    expect(resolveMp4EncodeDurationSec(0, -1, NaN)).toBe(0);
  });
});

describe("playbackSpanRecordedSec", () => {
  it("returns null for null snapshot", () => {
    expect(playbackSpanRecordedSec(null, 0)).toBeNull();
  });

  it("calculates span from stopAtSec minus anchor plus fade tail", () => {
    const snapshot: RecordEncodeSnapshot = {
      stopReason: "user_early",
      stopAtSec: 30,
      fadeTailSec: 2,
      playbackEndSec: 30,
    };
    expect(playbackSpanRecordedSec(snapshot, 10)).toBe(22);
  });

  it("uses playbackEndSec when stopAtSec is undefined", () => {
    const snapshot = {
      stopReason: "user_early" as const,
      stopAtSec: undefined as unknown as number,
      fadeTailSec: 0,
      playbackEndSec: 25,
    };
    expect(playbackSpanRecordedSec(snapshot, 5)).toBe(20);
  });

  it("returns null when span is zero or negative", () => {
    const snapshot: RecordEncodeSnapshot = {
      stopReason: "user_early",
      stopAtSec: 10,
      fadeTailSec: 0,
      playbackEndSec: 10,
    };
    expect(playbackSpanRecordedSec(snapshot, 10)).toBeNull();
  });
});

describe("estimateActualRecordedSec", () => {
  it("prefers wall when both wall and atFinalize are valid", () => {
    expect(estimateActualRecordedSec(50, null, null, 45)).toBe(50);
  });

  it("falls back to atFinalize when wall is null", () => {
    expect(estimateActualRecordedSec(null, null, null, 45)).toBe(45);
  });

  it("falls back to playback span", () => {
    const snapshot: RecordEncodeSnapshot = {
      stopReason: "user_early",
      stopAtSec: 30,
      fadeTailSec: 2,
      playbackEndSec: 30,
    };
    expect(estimateActualRecordedSec(null, snapshot, 10)).toBe(22);
  });

  it("returns null when nothing is available", () => {
    expect(estimateActualRecordedSec(null, null, null)).toBeNull();
  });
});
