import { describe, it, expect } from "vitest";
import {
  isShortOutputMaxLengthSpecified,
  getEffectiveMaxDurationSec,
  parseFadeSecStr,
  parseExplicitDurationSec,
  effectiveFadeSec,
  getAudibleSegmentSec,
  resolveAudioFadeSchedule,
  buildFfmpegAfadeFilter,
} from "../clipAudioFade";

describe("isShortOutputMaxLengthSpecified", () => {
  it("returns false for 'all'", () => {
    expect(isShortOutputMaxLengthSpecified("all", "")).toBe(false);
  });

  it("returns true for 'youtube'", () => {
    expect(isShortOutputMaxLengthSpecified("youtube", "")).toBe(true);
  });

  it("returns true for 'niconico'", () => {
    expect(isShortOutputMaxLengthSpecified("niconico", "")).toBe(true);
  });

  it("returns true for custom with valid duration", () => {
    expect(isShortOutputMaxLengthSpecified("custom", "30")).toBe(true);
  });

  it("returns false for custom with empty duration", () => {
    expect(isShortOutputMaxLengthSpecified("custom", "")).toBe(false);
  });

  it("returns false for custom with invalid duration", () => {
    expect(isShortOutputMaxLengthSpecified("custom", "abc")).toBe(false);
  });
});

describe("getEffectiveMaxDurationSec", () => {
  it("returns 0 for zero media duration", () => {
    expect(getEffectiveMaxDurationSec({ full: true }, 0, false)).toBe(0);
  });

  it("returns full media duration when no limit", () => {
    expect(getEffectiveMaxDurationSec({ full: true }, 120, false)).toBe(120);
  });

  it("returns remaining from start when no limit and clipped", () => {
    expect(getEffectiveMaxDurationSec({ full: false, start: 30, duration: 60 }, 120, false)).toBe(90);
  });

  it("returns audible segment when limit specified", () => {
    expect(
      getEffectiveMaxDurationSec({ full: false, start: 10, duration: 20 }, 120, true)
    ).toBe(20);
  });
});

describe("parseFadeSecStr", () => {
  it("parses valid number", () => {
    expect(parseFadeSecStr("1.5")).toBe(1.5);
  });

  it("handles comma as decimal", () => {
    expect(parseFadeSecStr("1,5")).toBe(1.5);
  });

  it("returns 0 for empty string", () => {
    expect(parseFadeSecStr("")).toBe(0);
  });

  it("returns 0 for negative", () => {
    expect(parseFadeSecStr("-1")).toBe(0);
  });

  it("returns 0 for non-numeric", () => {
    expect(parseFadeSecStr("abc")).toBe(0);
  });
});

describe("parseExplicitDurationSec", () => {
  it("parses valid number", () => {
    expect(parseExplicitDurationSec("30")).toBe(30);
  });

  it("returns null for empty string", () => {
    expect(parseExplicitDurationSec("")).toBeNull();
  });

  it("returns null for whitespace only", () => {
    expect(parseExplicitDurationSec("   ")).toBeNull();
  });

  it("returns null for zero", () => {
    expect(parseExplicitDurationSec("0")).toBeNull();
  });

  it("returns null for negative", () => {
    expect(parseExplicitDurationSec("-5")).toBeNull();
  });
});

describe("effectiveFadeSec", () => {
  it("returns 0 when fade is 0", () => {
    expect(effectiveFadeSec(0, 10)).toBe(0);
  });

  it("returns 0 when segment is 0", () => {
    expect(effectiveFadeSec(2, 0)).toBe(0);
  });

  it("returns fade when less than half segment", () => {
    expect(effectiveFadeSec(1, 10)).toBe(1);
  });

  it("caps at half segment", () => {
    expect(effectiveFadeSec(10, 10)).toBe(5);
  });
});

describe("getAudibleSegmentSec", () => {
  it("returns 0 for zero media duration", () => {
    expect(getAudibleSegmentSec({ full: true }, 0)).toBe(0);
  });

  it("returns full duration for full clip", () => {
    expect(getAudibleSegmentSec({ full: true }, 120)).toBe(120);
  });

  it("returns clip duration for partial clip", () => {
    expect(getAudibleSegmentSec({ full: false, start: 10, duration: 20 }, 120)).toBe(20);
  });
});

describe("resolveAudioFadeSchedule", () => {
  it("returns zero schedule for zero segment", () => {
    expect(resolveAudioFadeSchedule(0, 1, 1)).toEqual({
      fadeInSec: 0,
      fadeOutSec: 0,
      segmentSec: 0,
      applyFadeOut: false,
    });
  });

  it("applies fade in and out", () => {
    const schedule = resolveAudioFadeSchedule(10, 2, 3);
    expect(schedule.fadeInSec).toBe(2);
    expect(schedule.fadeOutSec).toBe(3);
    expect(schedule.segmentSec).toBe(10);
    expect(schedule.applyFadeOut).toBe(true);
  });
});

describe("buildFfmpegAfadeFilter", () => {
  it("returns null for very short segment", () => {
    expect(buildFfmpegAfadeFilter(0.01, 1, 1)).toBeNull();
  });

  it("builds fade in only", () => {
    const filter = buildFfmpegAfadeFilter(10, 2, 0);
    expect(filter).toBe("afade=t=in:st=0:d=2");
  });

  it("builds fade out only", () => {
    const filter = buildFfmpegAfadeFilter(10, 0, 2);
    expect(filter).toBe("afade=t=out:st=8:d=2");
  });

  it("builds both fade in and out", () => {
    const filter = buildFfmpegAfadeFilter(10, 2, 3);
    expect(filter).toContain("afade=t=in:st=0:d=2");
    expect(filter).toContain("afade=t=out:st=7:d=3");
  });

  it("returns null when no fade", () => {
    expect(buildFfmpegAfadeFilter(10, 0, 0)).toBeNull();
  });
});
