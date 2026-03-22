import { createFFmpeg } from "@ffmpeg/ffmpeg";
import getConfig from "next/config";

function getFfmpegCoreJsUrl(): string {
  const { publicRuntimeConfig } = getConfig();
  const base = publicRuntimeConfig?.assetBasePath ?? "";
  const rel = `${base}/ffmpeg-core/ffmpeg-core.js`.replace(/\/{2,}/g, "/");
  if (typeof window !== "undefined") {
    return new URL(rel, window.location.origin).href;
  }
  return rel;
}

export type EncodeProgressCallbacks = {
  onLoadStart?: () => void;
  onLoadComplete?: () => void;
  onProgress?: (ratio: number) => void;
};

export async function generateMp4Video(
  binaryData: Uint8Array,
  webmName: string,
  mp4Name: string,
  callbacks?: EncodeProgressCallbacks,
  targetLufs?: number | null
) {
  const { onLoadStart, onLoadComplete, onProgress } = callbacks || {};
  const ffmpeg = createFFmpeg({
    corePath: getFfmpegCoreJsUrl(),
    log: process.env.NODE_ENV === "development",
    progress: onProgress
      ? ({ ratio }) => {
          onProgress(Math.min(1, ratio));
        }
      : undefined,
  });
  onLoadStart?.();
  await ffmpeg.load();
  onLoadComplete?.();
  ffmpeg.FS("writeFile", webmName, binaryData);

  const lufs = targetLufs != null && targetLufs > -60 && targetLufs < 0 ? targetLufs : null;
  if (lufs != null) {
    try {
      await ffmpeg.run(
        "-i", webmName,
        "-vcodec", "copy",
        "-af", `loudnorm=I=${lufs}:LRA=11:TP=-1.5`,
        "-c:a", "aac",
        "-b:a", "192k",
        mp4Name
      );
    } catch (e) {
      await ffmpeg.run("-i", webmName, "-vcodec", "copy", mp4Name);
    }
  } else {
    await ffmpeg.run("-i", webmName, "-vcodec", "copy", mp4Name);
  }
  const videoUint8Array = ffmpeg.FS("readFile", mp4Name);
  try {
    ffmpeg.exit();
  } catch (error) {}
  return videoUint8Array;
}
