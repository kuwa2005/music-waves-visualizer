/** MediaRecorder で優先試行する MIME 候補 */
const MEDIA_RECORDER_MIME_CANDIDATES = [
  "video/mp4;codecs=h264,aac",
  "video/mp4;codecs=avc1,aac",
  "video/mp4",
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp9",
  "video/webm;codecs=vp8,opus",
  "video/webm;codecs=vp8",
  "video/webm",
] as const;

/**
 * ブラウザが実際にエンコードできる MIME を選ぶ。
 * H.264 MP4 が使える場合はそれを優先（SNS 互換性が高い）。
 * そうでなければ VP9/VP8 WebM にフォールバック。
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
