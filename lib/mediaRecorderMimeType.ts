/** MediaRecorder で優先試行する MIME 候補（VP9/VP8 を H.264 WebM より先に） */
const MEDIA_RECORDER_MIME_CANDIDATES = [
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp9",
  "video/webm;codecs=vp8,opus",
  "video/webm;codecs=vp8",
  "video/webm;codecs=h264,opus",
  "video/webm;codecs=h264",
  "video/webm",
] as const;

/**
 * ブラウザが実際にエンコードできる WebM MIME を選ぶ。
 * H.264 WebM は isTypeSupported=true でも空 WebM になる報告があるため VP9/VP8 を優先。
 */
export function resolveMediaRecorderMimeType(): string {
  if (
    typeof MediaRecorder === "undefined" ||
    typeof MediaRecorder.isTypeSupported !== "function"
  ) {
    return "video/webm";
  }
  for (const mime of MEDIA_RECORDER_MIME_CANDIDATES) {
    if (MediaRecorder.isTypeSupported(mime)) {
      return mime;
    }
  }
  return "video/webm";
}

export { MEDIA_RECORDER_MIME_CANDIDATES };
