import { createFFmpeg } from "@ffmpeg/ffmpeg";

const ffmpegCoreVersion = "0.10.0";
const corePath = `https://unpkg.com/@ffmpeg/core@${ffmpegCoreVersion}/dist/ffmpeg-core.js`;

export type EncodeProgressCallbacks = {
  onLoadStart?: () => void;
  onLoadComplete?: () => void;
  onProgress?: (ratio: number) => void;
};

export async function generateMp4Video(
  binaryData: Uint8Array,
  webmName: string,
  mp4Name: string,
  callbacks?: EncodeProgressCallbacks
) {
  const { onLoadStart, onLoadComplete, onProgress } = callbacks || {};
  const ffmpeg = createFFmpeg({
    corePath,
    log: true,
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
  await ffmpeg.run("-i", webmName, "-vcodec", "copy", mp4Name);
  const videoUint8Array = ffmpeg.FS("readFile", mp4Name);
  try {
    ffmpeg.exit();
  } catch (error) {}
  return videoUint8Array;
}
