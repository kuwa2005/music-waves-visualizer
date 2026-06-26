import { describe, it, expect } from "vitest";
import {
  isImageFileByName,
  isAudioFileByName,
  isVideoFileByName,
  isFileGateFailure,
  gateImageFile,
  gateAudioFile,
  gateVideoAsMediaFile,
  MAX_IMAGE_BYTES,
  MAX_MEDIA_BYTES,
} from "../fileValidation";

describe("isImageFileByName", () => {
  it("returns true for image extensions", () => {
    expect(isImageFileByName("photo.jpg")).toBe(true);
    expect(isImageFileByName("image.JPEG")).toBe(true);
    expect(isImageFileByName("icon.png")).toBe(true);
    expect(isImageFileByName("anim.gif")).toBe(true);
    expect(isImageFileByName("pic.webp")).toBe(true);
    expect(isImageFileByName("pic.SVG")).toBe(true);
  });

  it("returns false for non-image extensions", () => {
    expect(isImageFileByName("song.mp3")).toBe(false);
    expect(isImageFileByName("video.mp4")).toBe(false);
    expect(isImageFileByName("doc.txt")).toBe(false);
    expect(isImageFileByName("noext")).toBe(false);
  });
});

describe("isAudioFileByName", () => {
  it("returns true for audio extensions", () => {
    expect(isAudioFileByName("song.mp3")).toBe(true);
    expect(isAudioFileByName("track.wav")).toBe(true);
    expect(isAudioFileByName("music.ogg")).toBe(true);
    expect(isAudioFileByName("audio.m4a")).toBe(true);
    expect(isAudioFileByName("audio.FLAC")).toBe(true);
  });

  it("returns false for non-audio extensions", () => {
    expect(isAudioFileByName("photo.jpg")).toBe(false);
    expect(isAudioFileByName("video.mp4")).toBe(false);
  });
});

describe("isVideoFileByName", () => {
  it("returns true for video extensions", () => {
    expect(isVideoFileByName("clip.mp4")).toBe(true);
    expect(isVideoFileByName("video.webm")).toBe(true);
    expect(isVideoFileByName("movie.mov")).toBe(true);
    expect(isVideoFileByName("video.AVI")).toBe(true);
  });

  it("returns false for non-video extensions", () => {
    expect(isVideoFileByName("song.mp3")).toBe(false);
    expect(isVideoFileByName("photo.jpg")).toBe(false);
  });
});

describe("isFileGateFailure", () => {
  it("returns true for failure gates", () => {
    expect(isFileGateFailure({ ok: false, reason: "size" })).toBe(true);
    expect(isFileGateFailure({ ok: false, reason: "mime" })).toBe(true);
    expect(isFileGateFailure({ ok: false, reason: "extension" })).toBe(true);
  });

  it("returns false for ok gates", () => {
    expect(isFileGateFailure({ ok: true })).toBe(false);
  });
});

function makeFile(name: string, type = ""): File {
  const blob = new Blob(["x"], { type });
  return new File([blob], name, { type });
}

function makeLargeFile(name: string, sizeBytes: number, type = ""): File {
  const buf = new ArrayBuffer(Math.min(sizeBytes, 1024 * 1024));
  const blob = new Blob([buf], { type });
  const f = new File([blob], name, { type });
  Object.defineProperty(f, "size", { value: sizeBytes });
  return f;
}

describe("gateImageFile", () => {
  it("rejects wrong extension", () => {
    const f = makeFile("song.mp3", "audio/mpeg");
    const gate = gateImageFile(f);
    expect(gate.ok).toBe(false);
    if (!gate.ok) expect(gate.reason).toBe("extension");
  });

  it("rejects oversized file", () => {
    const f = makeLargeFile("big.jpg", MAX_IMAGE_BYTES + 1, "image/jpeg");
    const gate = gateImageFile(f);
    expect(gate.ok).toBe(false);
    if (!gate.ok) expect(gate.reason).toBe("size");
  });

  it("accepts valid image", () => {
    const f = makeFile("photo.jpg", "image/jpeg");
    expect(gateImageFile(f)).toEqual({ ok: true });
  });
});

describe("gateAudioFile", () => {
  it("rejects wrong extension", () => {
    const f = makeFile("photo.jpg", "image/jpeg");
    const gate = gateAudioFile(f);
    expect(gate.ok).toBe(false);
    if (!gate.ok) expect(gate.reason).toBe("extension");
  });

  it("rejects oversized file", () => {
    const f = makeLargeFile("big.mp3", MAX_MEDIA_BYTES + 1, "audio/mpeg");
    const gate = gateAudioFile(f);
    expect(gate.ok).toBe(false);
    if (!gate.ok) expect(gate.reason).toBe("size");
  });

  it("accepts valid audio", () => {
    const f = makeFile("track.mp3", "audio/mpeg");
    expect(gateAudioFile(f)).toEqual({ ok: true });
  });
});

describe("gateVideoAsMediaFile", () => {
  it("rejects wrong extension", () => {
    const f = makeFile("doc.txt", "text/plain");
    const gate = gateVideoAsMediaFile(f);
    expect(gate.ok).toBe(false);
    if (!gate.ok) expect(gate.reason).toBe("extension");
  });

  it("rejects oversized file", () => {
    const f = makeLargeFile("big.mp4", MAX_MEDIA_BYTES + 1, "video/mp4");
    const gate = gateVideoAsMediaFile(f);
    expect(gate.ok).toBe(false);
    if (!gate.ok) expect(gate.reason).toBe("size");
  });

  it("accepts valid video", () => {
    const f = makeFile("clip.mp4", "video/mp4");
    expect(gateVideoAsMediaFile(f)).toEqual({ ok: true });
  });

  it("rejects audio extension (extension check is first)", () => {
    const f = makeFile("audio.mp3", "audio/mpeg");
    const gate = gateVideoAsMediaFile(f);
    expect(gate.ok).toBe(false);
    if (!gate.ok) expect(gate.reason).toBe("extension");
  });
});
