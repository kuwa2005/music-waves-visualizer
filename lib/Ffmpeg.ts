import { FFmpeg } from "@ffmpeg/ffmpeg";
import { buildFfmpegAfadeFilter } from "./clipAudioFade";
import {
  parseFfmpegDurationFromLogs,
  resolveMp4EncodeDurationSec,
  type RecordEncodeSnapshot,
  type RecordStopReason,
} from "./mp4EncodeDuration";
import { MP4_THUMB_MAX_LONG_EDGE } from "./mp4Thumbnail";
import { mwvError, mwvLog, mwvMilestone, mwvVerbose, mwvWarn } from "./mwvConsole";

/** MP4 変換時の音声フェード（可聴区間長に対する in/out） */
export type Mp4AudioFadeEncode = {
  fadeInSec: number;
  fadeOutSec: number;
  /** min(planned, actualRecorded, webmProbe) — afade の区間長 */
  outputDurationSec: number;
  plannedSec?: number;
  actualRecordedSec?: number;
  recordStopReason?: RecordStopReason;
  stopAtSec?: number;
  fadeTailSec?: number;
};

function buildMp4AudioFilterChain(
  audioFade: Mp4AudioFadeEncode | null | undefined,
  encodeLufs: number | null,
  segmentSecOverride?: number
): string | null {
  const seg = segmentSecOverride ?? audioFade?.outputDurationSec ?? 0;
  const afade =
    seg > 0 && audioFade
      ? buildFfmpegAfadeFilter(seg, audioFade.fadeInSec, audioFade.fadeOutSec)
      : null;
  const parts: string[] = [];
  if (afade) parts.push(afade);
  if (encodeLufs != null) {
    parts.push(`loudnorm=I=${encodeLufs}:LRA=11:TP=-1.5`);
  }
  return parts.length > 0 ? parts.join(",") : null;
}

function sanitizeTrimDurationSec(outputDurationSec: number): number {
  if (!Number.isFinite(outputDurationSec) || outputDurationSec <= 0) return 0;
  return outputDurationSec;
}

function mp4RemuxTailArgs(trimSec: number): string[] {
  // 明示 -t があるときは -shortest を付けない（映像トラックが短い誤検出で音声を切らない）
  return trimSec > 0 ? [] : ["-shortest"];
}

function mp4EncodeInputArgs(
  webmName: string,
  outputDurationSec: number
): string[] {
  const args = ["-i", webmName];
  const trimSec = sanitizeTrimDurationSec(outputDurationSec);
  if (trimSec > 0) {
    args.push("-t", String(trimSec));
  }
  return args;
}

function isLikelyValidMp4(bytes: Uint8Array): boolean {
  if (bytes.length < 12) return false;
  return (
    bytes[4] === 0x66 &&
    bytes[5] === 0x74 &&
    bytes[6] === 0x79 &&
    bytes[7] === 0x70
  );
}

type FfmpegCoreUrls = { coreURL: string; wasmURL: string; workerURL: string; basePath: string };

function normalizeBasePath(base: string): string {
  if (!base || base === "/") return "";
  return base.endsWith("/") ? base.slice(0, -1) : base;
}

function getFfmpegAssetBaseCandidates(): string[] {
  const envBase = normalizeBasePath(process.env.NEXT_PUBLIC_ASSET_BASE_PATH ?? "");
  let runtimeBase = "";
  if (typeof window !== "undefined") {
    try {
      const nd = (window as any).__NEXT_DATA__;
      if (nd?.assetPrefix) runtimeBase = normalizeBasePath(nd.assetPrefix);
    } catch { /* ignore */ }
  }
  const bases = [envBase, runtimeBase].filter((b) => b !== "");
  if (bases.length === 0) bases.push("");
  const candidates: string[] = [];
  for (const b of bases) {
    for (const suffix of ["/ffmpeg", "/ffmpeg-core"]) {
      const c = `${b}${suffix}`.replace(/\/{2,}/g, "/");
      if (!candidates.includes(c)) candidates.push(c);
    }
  }
  return candidates;
}

function toAbsoluteUrl(rel: string): string {
  if (typeof window !== "undefined") {
    return new URL(rel, window.location.origin).href;
  }
  return rel.replace(/\/{2,}/g, "/");
}

function getFfmpegAssetUrl(basePath: string, name: string): string {
  const rel = `${basePath}/${name}`.replace(/\/{2,}/g, "/");
  return toAbsoluteUrl(rel);
}

async function resolveFfmpegCoreUrls(): Promise<FfmpegCoreUrls> {
  const candidates = getFfmpegAssetBaseCandidates();
  mwvMilestone("ffmpeg: core url candidates", { candidates });
  for (const basePath of candidates) {
    const coreURL = getFfmpegAssetUrl(basePath, "ffmpeg-core.js");
    const wasmURL = getFfmpegAssetUrl(basePath, "ffmpeg-core.wasm");
    const workerURL = "";
    mwvMilestone("ffmpeg: core url selected", { basePath, coreURL, wasmURL });
    return { basePath, coreURL, wasmURL, workerURL };
  }
  throw new Error("FFmpeg core URL candidates exhausted");
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

/**
 * UI の「YouTube等 -14 LUFS」→ FFmpeg loudnorm の integrated target。
 * 単一パス loudnorm と YouTube 計測の差を埋める小さな加算（UI は -14 のまま）。
 *
 * 実測（Stats for nerds / 同一素材・再アップロード後）:
 * | 補正 | encode 目標 | Normalized | Content loudness |
 * |------|-------------|------------|------------------|
 * | +0   | -14.0       | ~96%       | （やや静か）     |
 * | +0.35| -13.65      | 89%        | -13.0 dB         |
 * | +0.2 | -13.8       | 90%        | -13.0 dB         |
 * | +0.1 | -13.9       | （要再計測）| 目標 -14.0      |
 * | +0.05| -13.95      | （要再計測）| 目標 -14.0      |
 */
const YOUTUBE_UI_TARGET_LUFS = -14;
/** エンコード時のみ加算（UI 表示・保存値は -14 のまま） */
const YOUTUBE_LOUDNORM_CALIBRATION_LUFS = 0.05;

function resolveLoudnormIntegratedTarget(uiLufs: number): number {
  if (uiLufs === YOUTUBE_UI_TARGET_LUFS) {
    return YOUTUBE_UI_TARGET_LUFS + YOUTUBE_LOUDNORM_CALIBRATION_LUFS;
  }
  return uiLufs;
}

async function execFfmpeg(ffmpeg: FFmpeg, args: string[]): Promise<void> {
  mwvLog("ffmpeg: exec", args);
  await ffmpeg.exec(args);
}

/** 入力コンテナの長さ（秒）。失敗時は null */
async function probeInputDurationSec(ffmpeg: FFmpeg, inputName: string): Promise<number | null> {
  const ffmpegAny = ffmpeg as { on?: (e: string, h: (p: { message?: string }) => void) => void; off?: (e: string, h: (p: { message?: string }) => void) => void };
  const lines: string[] = [];
  const onLog = ({ message }: { message?: string }) => {
    if (message) lines.push(message);
  };
  if (typeof ffmpegAny.on === "function") {
    ffmpegAny.on("log", onLog);
  }
  try {
    await ffmpeg.exec(["-hide_banner", "-i", inputName]);
  } catch {
    /* -i のみは出力なしのため非ゼロ終了が普通 */
  } finally {
    if (typeof ffmpegAny.off === "function") {
      ffmpegAny.off("log", onLog);
    }
  }
  return parseFfmpegDurationFromLogs(lines.join("\n"));
}

function readFfmpegBytes(fileData: Uint8Array | string): Uint8Array {
  if (fileData instanceof Uint8Array) return fileData;
  if (typeof fileData === "string") return new TextEncoder().encode(fileData);
  return new Uint8Array(fileData as unknown as ArrayBuffer);
}

/** 動画から 1 フレームを JPEG として抽出（長辺上限） */
async function extractVideoFrameThumbnailJpeg(
  ffmpeg: FFmpeg,
  videoName: string,
  thumbName: string
): Promise<Uint8Array | null> {
  const max = MP4_THUMB_MAX_LONG_EDGE;
  const scaleFilter = `scale='min(${max},iw)':'min(${max},ih)':force_original_aspect_ratio=decrease`;
  try {
    await execFfmpeg(ffmpeg, [
      "-i",
      videoName,
      "-frames:v",
      "1",
      "-vf",
      scaleFilter,
      "-q:v",
      "4",
      "-update",
      "1",
      thumbName,
    ]);
    const raw = await ffmpeg.readFile(thumbName);
    const bytes = readFfmpegBytes(raw as Uint8Array | string);
    return bytes.length > 0 ? bytes : null;
  } catch (error) {
    mwvWarn("ffmpeg: frame thumbnail extract failed", error);
    return null;
  }
}

/**
 * MP4 に attached_pic として JPEG を埋め込む。
 * mjpeg 非対応時は copy のみのマッピングを試す。失敗しても例外は投げない。
 */
async function attachThumbnailToMp4(
  ffmpeg: FFmpeg,
  mp4Name: string,
  thumbJpeg: Uint8Array
): Promise<boolean> {
  if (!thumbJpeg.length) return false;

  const thumbName = "thumb_embed.jpg";
  const outName = "mp4_with_thumb.mp4";
  await ffmpeg.writeFile(thumbName, thumbJpeg);

  const attempts: string[][] = [
    [
      "-i",
      mp4Name,
      "-i",
      thumbName,
      "-map",
      "0",
      "-map",
      "1",
      "-c",
      "copy",
      "-c:v:1",
      "mjpeg",
      "-disposition:v:1",
      "attached_pic",
      outName,
    ],
    [
      "-i",
      mp4Name,
      "-i",
      thumbName,
      "-map",
      "0",
      "-map",
      "1",
      "-c",
      "copy",
      "-disposition:v:1",
      "attached_pic",
      outName,
    ],
  ];

  for (const args of attempts) {
    try {
      await execFfmpeg(ffmpeg, args);
      const merged = await ffmpeg.readFile(outName);
      const mergedBytes = readFfmpegBytes(merged as Uint8Array | string);
      if (mergedBytes.length === 0) continue;
      await ffmpeg.writeFile(mp4Name, mergedBytes);
      mwvMilestone("ffmpeg: thumbnail attached", { mp4Bytes: mergedBytes.length });
      return true;
    } catch (error) {
      mwvWarn("ffmpeg: attach thumbnail attempt failed", args.join(" "), error);
    }
  }
  return false;
}

export async function generateMp4Video(
  binaryData: Uint8Array,
  webmName: string,
  mp4Name: string,
  callbacks?: EncodeProgressCallbacks,
  targetLufs?: number | null,
  audioBitrateKbps?: number | null,
  thumbnailJpeg?: Uint8Array | null,
  audioFade?: Mp4AudioFadeEncode | null
) {
  const { onLoadStart, onLoadComplete, onProgress } = callbacks || {};
  mwvMilestone("ffmpeg: encode start", {
    webmBytes: binaryData.byteLength,
    mp4Name,
    targetLufs: targetLufs ?? null,
    audioBitrateKbps: audioBitrateKbps ?? null,
    audioFade: audioFade ?? null,
    hasThumbnailInput: !!(thumbnailJpeg && thumbnailJpeg.length > 0),
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
    const selectedUrls = await resolveFfmpegCoreUrls();
    mwvMilestone("ffmpeg: wasm load start", { coreURL: selectedUrls.coreURL, wasmURL: selectedUrls.wasmURL });
    try {
      await ffmpeg.load({
        coreURL: selectedUrls.coreURL,
        wasmURL: selectedUrls.wasmURL,
        ...(selectedUrls.workerURL ? { workerURL: selectedUrls.workerURL } : {}),
      });
    } catch (loadErr) {
      const loadMsg = loadErr instanceof Error ? loadErr.message : String(loadErr);
      mwvError("ffmpeg: wasm load failed", { error: loadMsg, coreURL: selectedUrls.coreURL, wasmURL: selectedUrls.wasmURL });
      const hintError = new Error(
        "MP4変換の初期化に失敗しました。広告ブロッカーやセキュリティ拡張がFFmpegの読み込みを遮断している可能性があります。拡張機能を一時停止、シークレットウィンドウで再試行、またはlocalhost/このサイトを許可してください。"
      );
      hintError.cause = loadErr;
      throw hintError;
    }
    mwvMilestone("ffmpeg: wasm loaded");
    onLoadComplete?.();

    await ffmpeg.writeFile(webmName, binaryData);

    const plannedSec = sanitizeTrimDurationSec(audioFade?.plannedSec ?? audioFade?.outputDurationSec ?? 0);
    const webmProbeSec = await probeInputDurationSec(ffmpeg, webmName);
    const actualHint = audioFade?.actualRecordedSec ?? null;
    const encodeSnapshot: RecordEncodeSnapshot | null =
      audioFade?.recordStopReason != null && audioFade.stopAtSec != null
        ? {
            stopReason: audioFade.recordStopReason,
            stopAtSec: audioFade.stopAtSec,
            fadeTailSec: audioFade.fadeTailSec ?? 0,
            playbackEndSec: audioFade.stopAtSec,
          }
        : null;
    const trimSec = audioFade
      ? resolveMp4EncodeDurationSec(plannedSec, actualHint, webmProbeSec, encodeSnapshot)
      : 0;
    const afadeSegmentSec = trimSec > 0 ? trimSec : 0;
    const encodeAudioFade: Mp4AudioFadeEncode | null =
      audioFade && afadeSegmentSec > 0
        ? { ...audioFade, outputDurationSec: afadeSegmentSec }
        : audioFade;
    mwvMilestone("record: MP4 encode params", {
      recordStopReason: audioFade?.recordStopReason ?? null,
      plannedSec: audioFade?.plannedSec ?? plannedSec,
      actualRecordedSec: actualHint,
      actualWebmSec: webmProbeSec,
      outputDurationSec: afadeSegmentSec > 0 ? afadeSegmentSec : plannedSec,
    });

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
    const uiLufs =
      targetLufs != null && targetLufs > -60 && targetLufs < 0 ? targetLufs : null;
    const encodeLufs = uiLufs != null ? resolveLoudnormIntegratedTarget(uiLufs) : null;
    const audioFilter = buildMp4AudioFilterChain(encodeAudioFade, encodeLufs, afadeSegmentSec);

    if (audioFilter != null) {
      try {
        await execFfmpeg(ffmpeg, [
          ...mp4EncodeInputArgs(webmName, trimSec),
          "-vcodec",
          "copy",
          "-af",
          audioFilter,
          "-c:a",
          "aac",
          "-b:a",
          ab,
          ...mp4RemuxTailArgs(trimSec),
          mp4Name,
        ]);
      } catch (error) {
        mwvWarn("ffmpeg: audio filter failed, remux copy only", error);
        await execFfmpeg(ffmpeg, [
          ...mp4EncodeInputArgs(webmName, trimSec),
          "-vcodec",
          "copy",
          ...mp4RemuxTailArgs(trimSec),
          mp4Name,
        ]);
      }
    } else {
      await execFfmpeg(ffmpeg, [
        ...mp4EncodeInputArgs(webmName, trimSec),
        "-vcodec",
        "copy",
        ...mp4RemuxTailArgs(trimSec),
        mp4Name,
      ]);
    }

    let thumbBytes =
      thumbnailJpeg && thumbnailJpeg.length > 0 ? thumbnailJpeg : null;
    if (!thumbBytes) {
      thumbBytes = await extractVideoFrameThumbnailJpeg(ffmpeg, mp4Name, "thumb_from_video.jpg");
      if (thumbBytes) {
        mwvMilestone("ffmpeg: thumbnail from first video frame");
      }
    } else {
      mwvMilestone("ffmpeg: thumbnail from caller JPEG");
    }

    if (thumbBytes) {
      const attached = await attachThumbnailToMp4(ffmpeg, mp4Name, thumbBytes);
      if (!attached) {
        mwvWarn(
          "ffmpeg: could not embed thumbnail (attached_pic / mjpeg may be unavailable in wasm build); MP4 export continues without cover art"
        );
      }
    }

    if (progressTick != null) {
      window.clearInterval(progressTick);
      progressTick = null;
    }
    runStartedAtMs = 0;
    onProgress?.(0.99);

    const fileData = await ffmpeg.readFile(mp4Name);
    const videoUint8Array = readFfmpegBytes(fileData as Uint8Array | string);

    if (!isLikelyValidMp4(videoUint8Array)) {
      throw new Error("invalid_mp4_output");
    }

    onProgress?.(1);
    mwvMilestone("ffmpeg: mp4 ready", { mp4Bytes: videoUint8Array.length });
    return videoUint8Array;
  } catch (error) {
    if (progressTick != null) {
      window.clearInterval(progressTick);
      progressTick = null;
    }
    runStartedAtMs = 0;
    const message = error instanceof Error ? error.message : String(error);
    mwvError("ffmpeg: encode failed", { message, error });
    if (
      /ERR_BLOCKED_BY_CLIENT|invalid wasm|received HTML|Failed to fetch|ffmpeg-core|not a function|createFFmpegCore|SharedArrayBuffer|COOP|COEP|importScripts|failed to import/i.test(
        message
      )
    ) {
      const hintError = new Error(
        "MP4変換の初期化に失敗しました。広告ブロッカーやセキュリティ拡張がFFmpegの読み込みを遮断している可能性があります。拡張機能を一時停止、シークレットウィンドウで再試行、またはlocalhost/このサイトを許可してください。"
      );
      mwvError("ffmpeg: encode failed (blocked/asset issue)", { original: error, hint: hintError.message });
      throw hintError;
    }
    throw error;
  } finally {
    try {
      ffmpeg.terminate();
    } catch (error) {
      mwvWarn("ffmpeg: terminate()", error);
    }
  }
}

/**
 * 非 H.264 MP4 を H.264 に再エンコードする（SNS 互換性確保用）
 */
export async function reencodeMp4ToH264(
  mp4Data: Uint8Array,
  callbacks?: EncodeProgressCallbacks
): Promise<Uint8Array> {
  const { onLoadStart, onLoadComplete, onProgress } = callbacks || {};
  mwvMilestone("ffmpeg: reencode to H.264 start", { mp4Bytes: mp4Data.byteLength });

  const ffmpeg = new FFmpeg();
  const ffmpegAny = ffmpeg as any;
  const inputName = "input_reencode.mp4";
  const outputName = "output_h264.mp4";
  let ratioFromFfmpeg = 0;
  let runStartedAtMs = 0;
  let smoothedDisplay = 0;
  let progressTick: number | null = null;

  const emitMergedProgress = () => {
    if (!onProgress || runStartedAtMs <= 0) return;
    const elapsedSec = (performance.now() - runStartedAtMs) / 1000;
    const t = Math.min(1, elapsedSec / 30);
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
        if (message) mwvLog("ffmpeg reencode:", message);
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
    const selectedUrls = await resolveFfmpegCoreUrls();
    await ffmpeg.load({
      coreURL: selectedUrls.coreURL,
      wasmURL: selectedUrls.wasmURL,
      ...(selectedUrls.workerURL ? { workerURL: selectedUrls.workerURL } : {}),
    });
    onLoadComplete?.();

    await ffmpeg.writeFile(inputName, mp4Data);

    ratioFromFfmpeg = 0;
    smoothedDisplay = 0;
    runStartedAtMs = performance.now();
    if (onProgress) {
      progressTick = window.setInterval(emitMergedProgress, 400);
      emitMergedProgress();
    }

    await execFfmpeg(ffmpeg, [
      "-i", inputName,
      "-c:v", "libx264", "-preset", "ultrafast", "-tune", "zerolatency", "-crf", "23",
      "-c:a", "copy",
      "-movflags", "+faststart",
      outputName,
    ]);

    onProgress?.(0.99);
    const fileData = await ffmpeg.readFile(outputName);
    const result = readFfmpegBytes(fileData as Uint8Array | string);

    if (!isLikelyValidMp4(result)) {
      throw new Error("invalid_h264_output");
    }

    onProgress?.(1);
    mwvMilestone("ffmpeg: reencode to H.264 done", { mp4Bytes: result.length });
    return result;
  } catch (error) {
    mwvError("ffmpeg: reencode to H.264 failed", error);
    throw error;
  } finally {
    if (progressTick != null) {
      window.clearInterval(progressTick);
    }
    try { ffmpeg.terminate(); } catch { /* ignore */ }
  }
}
