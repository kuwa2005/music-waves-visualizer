/** クライアント側メディア入力の上限（DoS / メモリ枯渇の緩和） */
export const MAX_IMAGE_BYTES = 80 * 1024 * 1024;
export const MAX_MEDIA_BYTES = 400 * 1024 * 1024;
export const MAX_SETTINGS_JSON_BYTES = 2 * 1024 * 1024;

const IMAGE_EXT = [".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp", ".svg"];
const AUDIO_EXT = [".mp3", ".wav", ".ogg", ".aac", ".m4a", ".flac", ".wma"];
const VIDEO_EXT = [".mp4", ".webm", ".mov", ".avi", ".mkv"];

function acceptFromMimeAndExt(mime: string, exts: readonly string[]): string {
  return `${mime}${exts.join(",")}`;
}

/** 画像ピッカー: 静止画のみ */
export const FILE_PICKER_ACCEPT_IMAGE = acceptFromMimeAndExt("image/*", IMAGE_EXT);
/** 画像ピッカー: 背景動画用 */
export const FILE_PICKER_ACCEPT_VIDEO = acceptFromMimeAndExt("video/*", VIDEO_EXT);
/** 音楽ピッカー: 音声のみ */
export const FILE_PICKER_ACCEPT_AUDIO = acceptFromMimeAndExt("audio/*", AUDIO_EXT);

function extOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i).toLowerCase() : "";
}

export function isImageFileByName(filename: string): boolean {
  return IMAGE_EXT.includes(extOf(filename));
}

export function isAudioFileByName(filename: string): boolean {
  return AUDIO_EXT.includes(extOf(filename));
}

export function isVideoFileByName(filename: string): boolean {
  return VIDEO_EXT.includes(extOf(filename));
}

function mimeOkForImage(file: File): boolean {
  const t = file.type.toLowerCase();
  if (!t) return true;
  if (t === "application/octet-stream") return true;
  return t.startsWith("image/");
}

function mimeOkForAudio(file: File): boolean {
  const t = file.type.toLowerCase();
  if (!t) return true;
  if (t === "application/octet-stream") return true;
  return t.startsWith("audio/");
}

function mimeOkForVideoAsMedia(file: File): boolean {
  const t = file.type.toLowerCase();
  if (!t) return true;
  if (t === "application/octet-stream") return true;
  return t.startsWith("video/") || t.startsWith("audio/");
}

export type FileGate =
  | { ok: true }
  | { ok: false; reason: "size" | "mime" | "extension" };

export function isFileGateFailure(
  gate: FileGate
): gate is { ok: false; reason: "size" | "mime" | "extension" } {
  return gate.ok === false;
}

export function gateImageFile(file: File): FileGate {
  if (!isImageFileByName(file.name)) return { ok: false, reason: "extension" };
  if (file.size > MAX_IMAGE_BYTES) return { ok: false, reason: "size" };
  if (!mimeOkForImage(file)) return { ok: false, reason: "mime" };
  return { ok: true };
}

export function gateAudioFile(file: File): FileGate {
  if (!isAudioFileByName(file.name)) return { ok: false, reason: "extension" };
  if (file.size > MAX_MEDIA_BYTES) return { ok: false, reason: "size" };
  if (!mimeOkForAudio(file)) return { ok: false, reason: "mime" };
  return { ok: true };
}

export function gateVideoAsMediaFile(file: File): FileGate {
  if (!isVideoFileByName(file.name)) return { ok: false, reason: "extension" };
  if (file.size > MAX_MEDIA_BYTES) return { ok: false, reason: "size" };
  if (!mimeOkForVideoAsMedia(file)) return { ok: false, reason: "mime" };
  return { ok: true };
}
