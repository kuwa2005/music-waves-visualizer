import { createFFmpeg } from "@ffmpeg/ffmpeg";
import getConfig from "next/config";
import { mwvError, mwvLog, mwvMilestone, mwvVerbose, mwvWarn } from "./mwvConsole";

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
  /** 0〜1。映像コピー等で FFmpeg 本体が frame 進捗を出さない場合でも、経過時間ベースの目安を混ぜる */
  onProgress?: (ratio: number) => void;
};

/** wasm 上の処理をざっくり想定した秒数（下限・上限でクリップ） */
function estimateRunSeconds(inputBytes: number): number {
  if (!Number.isFinite(inputBytes) || inputBytes <= 0) return 60;
  const bytesPerSec = 320 * 1024;
  return Math.max(30, Math.min(900, inputBytes / bytesPerSec));
}

/** バー用。本体推定より短めにすると前半の伸びが改善する */
function displayEstimateSeconds(estimateSec: number): number {
  return Math.max(72, estimateSec * 0.38);
}

/** FFmpeg が出す ratio は「完了サマリ」で一気に 1 になりがちなので、合成には上限をかける */
function capFfmpegRatioForMerge(r: number): number {
  if (!Number.isFinite(r) || r <= 0) return 0;
  return Math.min(0.86, r);
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
  mwvLog("ffmpeg: encode detail", { webmName, corePath: getFfmpegCoreJsUrl() });

  const inputBytes = binaryData.byteLength;
  const estimateSec = estimateRunSeconds(inputBytes);
  const displayEstSec = displayEstimateSeconds(estimateSec);
  let ratioFromFfmpeg = 0;
  let runStartedAtMs = 0;
  /** 画面上の滑らかな進捗（0〜1）。急な target 跳びを EMA で吸収 */
  let smoothedDisplay = 0;
  /** ブラウザの setInterval ID（Node の Timer 型と混ざらないよう number） */
  let progressTick: number | null = null;

  const emitMergedProgress = () => {
    if (!onProgress || runStartedAtMs <= 0) return;
    const elapsedSec = (performance.now() - runStartedAtMs) / 1000;
    const t = Math.min(1, elapsedSec / displayEstSec);
    // 線形より早めに伸び、長時間ジョブでも「数％のまま」になりにくい
    const timeRatio = Math.min(0.88, 0.9 * Math.pow(t, 0.48));
    const target = Math.max(ratioFromFfmpeg, timeRatio);
    const blend = target - smoothedDisplay > 0.22 ? 0.2 : 0.14;
    smoothedDisplay += (target - smoothedDisplay) * blend;
    smoothedDisplay = Math.max(0, Math.min(0.9, smoothedDisplay));
    onProgress(smoothedDisplay);
  };

  const ffmpeg = createFFmpeg({
    corePath: getFfmpegCoreJsUrl(),
    log: mwvVerbose(),
    progress: onProgress
      ? (p: { ratio?: number }) => {
          if (typeof p.ratio === "number" && Number.isFinite(p.ratio)) {
            const capped = capFfmpegRatioForMerge(p.ratio);
            ratioFromFfmpeg = Math.max(ratioFromFfmpeg, capped);
          }
          emitMergedProgress();
        }
      : undefined,
  });

  try {
    onLoadStart?.();
    mwvMilestone("ffmpeg: wasm loading…");
    mwvLog("ffmpeg: load() …");
    await ffmpeg.load();
    mwvMilestone("ffmpeg: wasm loaded");
    mwvLog("ffmpeg: load() done");
    onLoadComplete?.();
    ffmpeg.FS("writeFile", webmName, binaryData);

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
      mwvLog("ffmpeg: run with loudnorm", { lufs, ab, estimateSec, displayEstSec });
      try {
        await ffmpeg.run(
          "-i", webmName,
          "-vcodec", "copy",
          "-af", `loudnorm=I=${lufs}:LRA=11:TP=-1.5`,
          "-c:a", "aac",
          "-b:a", ab,
          mp4Name
        );
      } catch (e) {
        mwvWarn("ffmpeg: loudnorm failed, remux copy only", e);
        await ffmpeg.run("-i", webmName, "-vcodec", "copy", mp4Name);
      }
    } else {
      mwvLog("ffmpeg: run remux (no loudnorm)", { estimateSec, displayEstSec });
      await ffmpeg.run("-i", webmName, "-vcodec", "copy", mp4Name);
    }

    if (progressTick != null) {
      window.clearInterval(progressTick);
      progressTick = null;
    }
    runStartedAtMs = 0;
    onProgress?.(0.99);

    const videoUint8Array = ffmpeg.FS("readFile", mp4Name);
    onProgress?.(1);
    mwvMilestone("ffmpeg: mp4 ready", { mp4Bytes: videoUint8Array.length });
    mwvLog("ffmpeg: encode done");
    try {
      ffmpeg.exit();
    } catch (error) {
      mwvWarn("ffmpeg: exit()", error);
    }
    return videoUint8Array;
  } catch (e) {
    if (progressTick != null) {
      window.clearInterval(progressTick);
      progressTick = null;
    }
    runStartedAtMs = 0;
    mwvError("ffmpeg: encode failed", e);
    try {
      ffmpeg.exit();
    } catch {
      /* ignore */
    }
    throw e;
  }
}
