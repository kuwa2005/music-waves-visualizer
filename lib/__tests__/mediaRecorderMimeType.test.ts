import { afterEach, describe, expect, it } from "vitest";
import {
  MEDIA_RECORDER_MIME_CANDIDATES,
  resolveMediaRecorderMimeType,
} from "../mediaRecorderMimeType";

describe("resolveMediaRecorderMimeType", () => {
  const originalMediaRecorder = globalThis.MediaRecorder;

  afterEach(() => {
    globalThis.MediaRecorder = originalMediaRecorder;
  });

  it("returns video/webm when MediaRecorder is unavailable", () => {
    // @ts-expect-error test stub
    globalThis.MediaRecorder = undefined;
    expect(resolveMediaRecorderMimeType()).toBe("video/webm");
  });

  it("prefers first isTypeSupported candidate", () => {
    globalThis.MediaRecorder = class {
      static isTypeSupported(mime: string): boolean {
        return mime === "video/webm;codecs=vp9,opus";
      }
    } as typeof MediaRecorder;

    expect(resolveMediaRecorderMimeType()).toBe("video/webm;codecs=vp9,opus");
  });

  it("falls through to later candidates", () => {
    globalThis.MediaRecorder = class {
      static isTypeSupported(mime: string): boolean {
        if (mime === "video/webm;codecs=vp8,opus") return false;
        if (mime === "video/webm;codecs=vp8") return true;
        return false;
      }
    } as typeof MediaRecorder;

    expect(resolveMediaRecorderMimeType()).toBe("video/webm;codecs=vp8");
  });

  it("prefers H.264 MP4 over VP9 WebM for SNS compatibility", () => {
    const h264Mp4Idx = MEDIA_RECORDER_MIME_CANDIDATES.findIndex((m) => m.includes("mp4") && m.includes("h264"));
    const vp9Idx = MEDIA_RECORDER_MIME_CANDIDATES.findIndex((m) => m.includes("vp9"));
    expect(h264Mp4Idx).toBeGreaterThanOrEqual(0);
    expect(vp9Idx).toBeGreaterThan(h264Mp4Idx);
  });
});
