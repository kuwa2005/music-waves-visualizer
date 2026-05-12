import { FFmpeg } from "@ffmpeg/ffmpeg";
import getConfig from "next/config";
import { mwvError, mwvLog, mwvMilestone, mwvVerbose, mwvWarn } from "./mwvConsole";

function getFfmpegAssetUrl(name: "ffmpeg-core.js" | "ffmpeg-core.wasm" | "ffmpeg-core.worker.js"): string {
  const { publicRuntimeConfig } = getConfig();
  const base = publicRuntimeConfig?.assetBasePath ?? "";
  const rel = `${base}/ffmpeg-core/${name}`.replace(/\/{2,}/g, "/");
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

function estimateRunSeconds(inputBytes: number): number {
  if (!Number.isFinite(inputBytes) || inputBytes <= 0) return 60;
  const bytesPerSec = 320 * 1024;
  return Math.max(30, Math.min(900, inputBytes / bytesPerSec));
}

function displayEstimateSeconds(estimateSec: number): number {
  return Math.max(72, estimateSec * 0.38);
}

function capFfmpegRatioForMerge(r: number): number {
  if (!Number.isFinite(r) || r <= 0) return 0;
  return Math.min(0.86, r);
}

async function execFfmpeg(ffmpeg: FFmpeg, args: string[]): Promise<void> {
  mwvLog("ffmpeg: exec", args);
  await ffmpeg.exec(args);
}

export async function generateMp4Video(
  binaryData: Uint8Array,
  webmName: string,
  mp4Name: string,
  callbacks?: EncodeProgressCallbacks,
  targetLufs?: number | null,
  audioBitrateKbps?: number | null
) {
  const { onLoadStart, onLoadComplete, onProgress } = callbacks || {};
  mwvMilestone("ffmpeg: encode start", {
    webmBytes: binaryData.byteLength,
    mp4Name,
    targetLufs: targetLufs ?? null,
    audioBitrateKbps: audioBitrateKbps ?? null,
  });

  const ffmpeg = new FFmpeg();
  const ffmpegAny = ffmpeg as any;
  const inputBytes = binaryData.byteLength;
  const estimateSec = estimateRunSeconds(inputBytes);
  const displayEstSec = displayEstimateSeconds(estimateSec);
  let ratioFromFfmpeg = 0;
  let runStartedAtMs = 0;
  let smoothedDisplay = 0;
  let progressTick: number | null = null;

  const emitMergedProgress = () => {
    if (!onProgress || runStartedAtMs <= 0) return;
    const elapsedSec = (performance.now() - runStartedAtMs) / 1000;
    const t = Math.min(1, elapsedSec / displayEstSec);
    const timeRatio = Math.min(0.88, 0.9 * Math.pow(t, 0.48));
    const target = Math.max(ratioFromFfmpeg, timeRatio);
    const blend = target - smoothedDisplay > 0.22 ? 0.2 : 0.14;
    smoothedDisplay += (target - smoothedDisplay) * blend;
    smoothedDisplay = Math.max(0, Math.min(0.9, smoothedDisplay));
    onProgress(smoothedDisplay);
  };

  if (typeof ffmpegAny.on === "function") {
    if (mwvVerbose()) {
      ffmpegAny.on("log", ({ message }: { message?: string }) => {
        if (message) mwvLog("ffmpeg:", message);
      });
    }
    ffmpegAny.on("progress", ({ progress }: { progress?: number }) => {
      if (typeof progress === "number" && Number.isFinite(progress)) {
        ratioFromFfmpeg = Math.max(ratioFromFfmpeg, capFfmpegRatioForMerge(progress));
      }
      emitMergedProgress();
    });
  }

  try {
    onLoadStart?.();
    mwvMilestone("ffmpeg: wasm loading…");
    await ffmpeg.load({
      coreURL: getFfmpegAssetUrl("ffmpeg-core.js"),
      wasmURL: getFfmpegAssetUrl("ffmpeg-core.wasm"),
      workerURL: getFfmpegAssetUrl("ffmpeg-core.worker.js"),
    });
    mwvMilestone("ffmpeg: wasm loaded");
    onLoadComplete?.();

    await ffmpeg.writeFile(webmName, binaryData);

    ratioFromFfmpeg = 0;
    smoothedDisplay = 0;
    runStartedAtMs = performance.now();
    if (onProgress) {
      progressTick = window.setInterval(emitMergedProgress, 400);
      emitMergedProgress();
    }

    const ab =
      audioBitrateKbps != null && audioBitrateKbps >= 64 && audioBitrateKbps <= 320
        ? `${Math.round(audioBitrateKbps)}k`
        : "192k";
    const lufs = targetLufs != null && targetLufs > -60 && targetLufs < 0 ? targetLufs : null;

    if (lufs != null) {
      try {
        await execFfmpeg(ffmpeg, [
          "-i",
          webmName,
          "-vcodec",
          "copy",
          "-af",
          `loudnorm=I=${lufs}:LRA=11:TP=-1.5`,
          "-c:a",
          "aac",
          "-b:a",
          ab,
          mp4Name,
        ]);
      } catch (error) {
        mwvWarn("ffmpeg: loudnorm failed, remux copy only", error);
        await execFfmpeg(ffmpeg, ["-i", webmName, "-vcodec", "copy", mp4Name]);
      }
    } else {
      await execFfmpeg(ffmpeg, ["-i", webmName, "-vcodec", "copy", mp4Name]);
    }

    if (progressTick != null) {
      window.clearInterval(progressTick);
      progressTick = null;
    }
    runStartedAtMs = 0;
    onProgress?.(0.99);

    const fileData = await ffmpeg.readFile(mp4Name);
    const videoUint8Array =
      fileData instanceof Uint8Array
        ? fileData
        : typeof fileData === "string"
          ? new TextEncoder().encode(fileData)
          : new Uint8Array(fileData as unknown as ArrayBuffer);

    onProgress?.(1);
    mwvMilestone("ffmpeg: mp4 ready", { mp4Bytes: videoUint8Array.length });
    return videoUint8Array;
  } catch (error) {
    if (progressTick != null) {
      window.clearInterval(progressTick);
      progressTick = null;
    }
    runStartedAtMs = 0;
    mwvError("ffmpeg: encode failed", error);
    throw error;
  } finally {
    try {
      ffmpeg.terminate();
    } catch (error) {
      mwvWarn("ffmpeg: terminate()", error);
    }
  }
}
