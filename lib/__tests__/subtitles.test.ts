import { describe, it, expect } from "vitest";
import { parseSrt } from "../subtitles";

describe("parseSrt", () => {
  it("parses a single cue", () => {
    const srt = `1
00:00:01,000 --> 00:00:03,000
Hello World`;
    const cues = parseSrt(srt);
    expect(cues).toHaveLength(1);
    expect(cues[0].startSec).toBe(1);
    expect(cues[0].endSec).toBe(3);
    expect(cues[0].text).toBe("Hello World");
  });

  it("parses multiple cues and sorts by start time", () => {
    const srt = `2
00:00:05,000 --> 00:00:07,000
Second

1
00:00:01,000 --> 00:00:03,000
First`;
    const cues = parseSrt(srt);
    expect(cues).toHaveLength(2);
    expect(cues[0].text).toBe("First");
    expect(cues[1].text).toBe("Second");
  });

  it("handles \\r\\n line endings", () => {
    const srt = "1\r\n00:00:01,000 --> 00:00:03,000\r\nHello";
    const cues = parseSrt(srt);
    expect(cues).toHaveLength(1);
    expect(cues[0].text).toBe("Hello");
  });

  it("skips invalid blocks", () => {
    const srt = `invalid block

1
00:00:01,000 --> 00:00:03,000
Valid`;
    const cues = parseSrt(srt);
    expect(cues).toHaveLength(1);
    expect(cues[0].text).toBe("Valid");
  });

  it("skips cues with empty text after tag removal", () => {
    const srt = `1
00:00:01,000 --> 00:00:03,000
{\\an8}`;
    const cues = parseSrt(srt);
    expect(cues).toHaveLength(0);
  });

  it("parses timestamps with comma separator", () => {
    const srt = `1
00:01:30,500 --> 00:02:00,000
Comma time`;
    const cues = parseSrt(srt);
    expect(cues[0].startSec).toBeCloseTo(90.5);
    expect(cues[0].endSec).toBe(120);
  });

  it("parses timestamps with dot separator", () => {
    const srt = `1
00:00:01.500 --> 00:00:03.000
Dot time`;
    const cues = parseSrt(srt);
    expect(cues[0].startSec).toBeCloseTo(1.5);
  });

  it("returns empty array for empty input", () => {
    expect(parseSrt("")).toEqual([]);
  });

  it("handles multi-line text in cue", () => {
    const srt = `1
00:00:01,000 --> 00:00:03,000
Line 1
Line 2`;
    const cues = parseSrt(srt);
    expect(cues[0].text).toBe("Line 1\nLine 2");
  });
});
