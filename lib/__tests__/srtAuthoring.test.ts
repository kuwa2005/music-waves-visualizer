import { describe, it, expect } from "vitest";
import {
  stripSunoControlTags,
  parseLyricsLinesFromSuno,
  getPlaybackWindowBounds,
  evenSplitCuesInWindow,
  formatSrtFromCues,
  shiftCuesBySeconds,
} from "../srtAuthoring";

describe("stripSunoControlTags", () => {
  it("removes [tag] from line", () => {
    expect(stripSunoControlTags("[Verse] Hello world")).toBe("Hello world");
  });

  it("removes nested [[tags]] via repeated passes", () => {
    expect(stripSunoControlTags("[[Intro]] Hello")).toBe("] Hello");
  });

  it("trims whitespace", () => {
    expect(stripSunoControlTags("  Hello  ")).toBe("Hello");
  });

  it("returns empty string when only tags", () => {
    expect(stripSunoControlTags("[Verse][Chorus]")).toBe("");
  });

  it("returns plain text unchanged", () => {
    expect(stripSunoControlTags("Just text")).toBe("Just text");
  });
});

describe("parseLyricsLinesFromSuno", () => {
  it("splits by newline and strips tags", () => {
    const input = "[Verse] Line 1\n[Chorus] Line 2\nLine 3";
    expect(parseLyricsLinesFromSuno(input)).toEqual(["Line 1", "Line 2", "Line 3"]);
  });

  it("skips empty lines after tag removal", () => {
    const input = "Line 1\n[Verse]\nLine 2";
    expect(parseLyricsLinesFromSuno(input)).toEqual(["Line 1", "Line 2"]);
  });

  it("handles \\r\\n line endings", () => {
    const input = "Line 1\r\nLine 2";
    expect(parseLyricsLinesFromSuno(input)).toEqual(["Line 1", "Line 2"]);
  });
});

describe("getPlaybackWindowBounds", () => {
  it("returns full duration for clip.full", () => {
    expect(getPlaybackWindowBounds({ full: true }, 120)).toEqual({
      startSec: 0,
      endSec: 120,
    });
  });

  it("clips to media duration", () => {
    expect(
      getPlaybackWindowBounds({ full: false, start: 10, duration: 200 }, 50)
    ).toEqual({ startSec: 10, endSec: 50 });
  });

  it("returns zero for zero media duration", () => {
    expect(getPlaybackWindowBounds({ full: true }, 0)).toEqual({
      startSec: 0,
      endSec: 0,
    });
  });

  it("clamps start to non-negative", () => {
    expect(
      getPlaybackWindowBounds({ full: false, start: -5, duration: 10 }, 30)
    ).toEqual({ startSec: 0, endSec: 5 });
  });
});

describe("evenSplitCuesInWindow", () => {
  it("returns empty for empty lines", () => {
    expect(evenSplitCuesInWindow([], { startSec: 0, endSec: 10 })).toEqual([]);
  });

  it("distributes lines evenly across window", () => {
    const cues = evenSplitCuesInWindow(["A", "B"], {
      startSec: 0,
      endSec: 10,
    });
    expect(cues).toHaveLength(2);
    expect(cues[0].startSec).toBe(0);
    expect(cues[0].endSec).toBe(5);
    expect(cues[1].startSec).toBe(5);
    expect(cues[1].endSec).toBe(10);
  });

  it("uses fixed duration for zero-span window", () => {
    const cues = evenSplitCuesInWindow(["A"], { startSec: 5, endSec: 5 });
    expect(cues).toHaveLength(1);
    expect(cues[0].startSec).toBe(5);
    expect(cues[0].endSec).toBe(Math.min(5, 5 + 0.5));
  });
});

describe("formatSrtFromCues", () => {
  it("formats single cue", () => {
    const srt = formatSrtFromCues([
      { startSec: 0, endSec: 2.5, text: "Hello" },
    ]);
    expect(srt).toContain("1\n00:00:00,000 --> 00:00:02,500\nHello");
  });

  it("sorts cues by startSec", () => {
    const srt = formatSrtFromCues([
      { startSec: 5, endSec: 7, text: "Second" },
      { startSec: 1, endSec: 3, text: "First" },
    ]);
    expect(srt).toContain("First");
    expect(srt).toContain("Second");
    expect(srt.indexOf("First")).toBeLessThan(srt.indexOf("Second"));
  });

  it("skips cues with empty text", () => {
    const srt = formatSrtFromCues([
      { startSec: 0, endSec: 2, text: "" },
      { startSec: 3, endSec: 5, text: "Visible" },
    ]);
    expect(srt).not.toContain("00:00:00");
    expect(srt).toContain("Visible");
  });

  it("skips cues with zero/negative duration", () => {
    const srt = formatSrtFromCues([
      { startSec: 5, endSec: 5, text: "Zero" },
      { startSec: 10, endSec: 8, text: "Negative" },
    ]);
    expect(srt).toBe("");
  });
});

describe("shiftCuesBySeconds", () => {
  it("shifts all cues by delta", () => {
    const cues = shiftCuesBySeconds(
      [
        { startSec: 5, endSec: 10, text: "A" },
        { startSec: 15, endSec: 20, text: "B" },
      ],
      -5
    );
    expect(cues[0].startSec).toBe(0);
    expect(cues[0].endSec).toBe(5);
    expect(cues[1].startSec).toBe(10);
    expect(cues[1].endSec).toBe(15);
  });

  it("clamps to non-negative", () => {
    const cues = shiftCuesBySeconds(
      [{ startSec: 2, endSec: 5, text: "A" }],
      -10
    );
    expect(cues[0].startSec).toBe(0);
    expect(cues[0].endSec).toBe(0);
  });
});
