export type SubtitleCue = {
  startSec: number;
  endSec: number;
  text: string;
  /** parse 時に付与（レイヤーキー用・内部） */
  layerKeyStem?: string;
  /** parse 時に付与（行分割済み・内部） */
  lines?: string[];
};

export type SubtitleDisplayType = "plain" | "outline" | "boxed";
export type SubtitleAnimationType = "none" | "fade" | "slideUp" | "pop";
export type SubtitleAlign = "left" | "center" | "right";

export type SubtitleStyle = {
  positionYPercent: number;
  align: SubtitleAlign;
  displayType: SubtitleDisplayType;
  color: string;
  fontSize: number;
  fontFamily: string;
  bold: boolean;
  italic: boolean;
  strokeColor: string;
  strokeWidth: number;
  shadowBlur: number;
  shadowColor: string;
  boxColor: string;
  boxPadding: number;
  animationType: SubtitleAnimationType;
  animationDurationSec: number;
};

export const DEFAULT_SUBTITLE_STYLE: SubtitleStyle = {
  positionYPercent: 86,
  align: "center",
  displayType: "outline",
  color: "#FFFFFF",
  fontSize: 42,
  fontFamily: "sans-serif",
  bold: true,
  italic: false,
  strokeColor: "#000000",
  strokeWidth: 4,
  shadowBlur: 10,
  shadowColor: "rgba(0,0,0,0.55)",
  boxColor: "rgba(0,0,0,0.55)",
  boxPadding: 12,
  animationType: "fade",
  animationDurationSec: 0.2,
};

export type SubtitleOverlaySettings = {
  enabled: boolean;
  /** 指定時は enabled の代わりに毎フレーム呼ぶ（React effect deps から enabled を外す用） */
  getEnabled?: () => boolean;
  cues: SubtitleCue[];
  /** 指定時は cues の代わりに毎フレーム呼ぶ（React effect deps から cues を外す用） */
  getCues?: () => SubtitleCue[];
  getCurrentTimeSec: () => number;
  style: SubtitleStyle;
  /** 表示のみのタイミング補正（秒）。負で早く、正で遅く。SRT データは変更しない */
  displayTimingOffsetSec?: number;
};

export const EMPTY_SUBTITLE_CUES: SubtitleCue[] = [];

function parseSrtTime(time: string): number {
  const m = time.trim().match(/^(\d{2}):(\d{2}):(\d{2})[,.](\d{3})$/);
  if (!m) return NaN;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  const ss = Number(m[3]);
  const ms = Number(m[4]);
  return hh * 3600 + mm * 60 + ss + ms / 1000;
}

const PARSE_SRT_YIELD_EVERY = 32;
const PARSE_SRT_STREAMING_MIN_CHARS = 8000;

function yieldToMain(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function enrichParsedCue(cue: SubtitleCue): SubtitleCue {
  const lines = cue.text.split("\n").filter(Boolean);
  return {
    ...cue,
    lines,
    layerKeyStem: `${cue.startSec}\0${cue.endSec}\0${cue.text}`,
  };
}

function parseSrtBlock(block: string): SubtitleCue | null {
  const lines = block.split("\n").map((l) => l.trimEnd());
  if (lines.length < 2) return null;
  const timeLineIdx = /^\d+$/.test(lines[0].trim()) ? 1 : 0;
  if (timeLineIdx >= lines.length) return null;
  const tm = lines[timeLineIdx].match(
    /(\d{2}:\d{2}:\d{2}[,.]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[,.]\d{3})/
  );
  if (!tm) return null;
  const startSec = parseSrtTime(tm[1]);
  const endSec = parseSrtTime(tm[2]);
  if (!Number.isFinite(startSec) || !Number.isFinite(endSec) || endSec <= startSec) return null;
  const body = lines
    .slice(timeLineIdx + 1)
    .join("\n")
    .replace(/\{\\.*?\}/g, "")
    .replace(/<[^>]*>/g, "")
    .trim();
  if (!body) return null;
  return enrichParsedCue({ startSec, endSec, text: body });
}

function flushSrtBlockLines(blockLines: string[], cues: SubtitleCue[]): boolean {
  if (blockLines.length === 0) return false;
  const block = blockLines.join("\n").trim();
  blockLines.length = 0;
  if (!block) return false;
  const cue = parseSrtBlock(block);
  if (cue) cues.push(cue);
  return true;
}

async function parseSrtStreaming(srtText: string): Promise<SubtitleCue[]> {
  const cues: SubtitleCue[] = [];
  const len = srtText.length;
  let lineStart = 0;
  const blockLines: string[] = [];
  let blocksParsed = 0;

  const finishLine = (lineEnd: number): void => {
    let line = srtText.slice(lineStart, lineEnd);
    if (line.endsWith("\r")) line = line.slice(0, -1);
    if (line.trim() === "") {
      if (flushSrtBlockLines(blockLines, cues)) {
        blocksParsed++;
      }
    } else {
      blockLines.push(line);
    }
  };

  for (let i = 0; i < len; i++) {
    const ch = srtText[i];
    if (ch === "\n") {
      finishLine(i);
      lineStart = i + 1;
      if (blocksParsed > 0 && blocksParsed % PARSE_SRT_YIELD_EVERY === 0) {
        await yieldToMain();
      }
    } else if (ch === "\r") {
      if (i + 1 < len && srtText[i + 1] === "\n") {
        finishLine(i);
        i++;
        lineStart = i + 1;
        if (blocksParsed > 0 && blocksParsed % PARSE_SRT_YIELD_EVERY === 0) {
          await yieldToMain();
        }
      } else {
        finishLine(i);
        lineStart = i + 1;
      }
    }
  }

  if (lineStart < len) {
    let tail = srtText.slice(lineStart);
    if (tail.endsWith("\r")) tail = tail.slice(0, -1);
    if (tail.trim() === "") {
      flushSrtBlockLines(blockLines, cues);
    } else {
      blockLines.push(tail);
      flushSrtBlockLines(blockLines, cues);
    }
  } else {
    flushSrtBlockLines(blockLines, cues);
  }

  if (cues.length > 1) {
    await yieldToMain();
    cues.sort((a, b) => a.startSec - b.startSec);
  }
  return cues;
}

export function parseSrt(srtText: string): SubtitleCue[] {
  const text = srtText.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const blocks = text.split(/\n{2,}/g).map((b) => b.trim()).filter(Boolean);
  const cues: SubtitleCue[] = [];
  for (const block of blocks) {
    const cue = parseSrtBlock(block);
    if (cue) cues.push(cue);
  }
  cues.sort((a, b) => a.startSec - b.startSec);
  return cues;
}

/** 大きな SRT はメインスレッドをブロックしないよう行走査＋定期 yield で解析する */
export async function parseSrtAsync(srtText: string): Promise<SubtitleCue[]> {
  await yieldToMain();
  if (srtText.length < PARSE_SRT_STREAMING_MIN_CHARS) {
    return parseSrt(srtText);
  }
  return parseSrtStreaming(srtText);
}

let lastCueSearchHint = 0;

function getActiveCue(cues: SubtitleCue[], t: number, displayTimingOffsetSec = 0): SubtitleCue | null {
  const tLookup = t - displayTimingOffsetSec;
  if (!(tLookup >= 0) || cues.length === 0) return null;

  const hintedIdx = lastCueSearchHint;
  if (hintedIdx >= 0 && hintedIdx < cues.length) {
    const hinted = cues[hintedIdx];
    if (tLookup >= hinted.startSec && tLookup <= hinted.endSec) {
      return hinted;
    }
  }

  let lo = 0;
  let hi = cues.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (cues[mid].startSec <= tLookup) lo = mid + 1;
    else hi = mid - 1;
  }
  const idx = hi;
  if (idx >= 0) {
    const c = cues[idx];
    if (tLookup <= c.endSec) {
      lastCueSearchHint = idx;
      return c;
    }
  }
  lastCueSearchHint = Math.min(lo, cues.length - 1);
  return null;
}

function getAnimationFactor(style: SubtitleStyle, cue: SubtitleCue, t: number): { alpha: number; dy: number; scale: number } {
  const aDur = Math.max(0, style.animationDurationSec);
  if (style.animationType === "none" || aDur <= 0) return { alpha: 1, dy: 0, scale: 1 };
  const intro = Math.min(aDur, Math.max(0.001, (cue.endSec - cue.startSec) * 0.5));
  const outro = intro;
  const inP = Math.max(0, Math.min(1, (t - cue.startSec) / intro));
  const outP = Math.max(0, Math.min(1, (cue.endSec - t) / outro));
  const fade = Math.min(inP, outP);
  if (style.animationType === "fade") return { alpha: fade, dy: 0, scale: 1 };
  if (style.animationType === "slideUp") return { alpha: fade, dy: (1 - inP) * 22, scale: 1 };
  if (style.animationType === "pop") return { alpha: fade, dy: 0, scale: 0.92 + 0.08 * inP };
  return { alpha: 1, dy: 0, scale: 1 };
}

/** タイトル用（字幕と同系の装飾 + 字間） */
export type TitleStyle = SubtitleStyle & {
  letterSpacingPx: number;
};

export const DEFAULT_TITLE_STYLE: TitleStyle = {
  ...DEFAULT_SUBTITLE_STYLE,
  positionYPercent: 12,
  fontSize: 52,
  displayType: "outline",
  animationType: "none",
  animationDurationSec: 0.35,
  letterSpacingPx: 0,
};

export type TitleOverlaySettings = {
  enabled: boolean;
  text: string;
  style: TitleStyle;
  /** プレビュー静止時は常に全体表示、再生中は冒頭アニメ */
  isPlaying: boolean;
  playbackTimeSec: number;
};

function getTitleAnimationFactor(
  style: TitleStyle,
  isPlaying: boolean,
  playbackTimeSec: number
): { alpha: number; dy: number; scale: number } {
  if (!isPlaying || style.animationType === "none") {
    return { alpha: 1, dy: 0, scale: 1 };
  }
  const dur = Math.max(0.05, style.animationDurationSec);
  const t = Math.max(0, playbackTimeSec);
  const p = Math.min(1, t / dur);
  if (style.animationType === "fade") return { alpha: p, dy: 0, scale: 1 };
  if (style.animationType === "slideUp") return { alpha: p, dy: (1 - p) * 32, scale: 1 };
  if (style.animationType === "pop") return { alpha: p, dy: 0, scale: 0.9 + 0.1 * p };
  return { alpha: 1, dy: 0, scale: 1 };
}

export type TextOverlayLayer = {
  key: string;
  canvas: HTMLCanvasElement;
  x: number;
  y: number;
  w: number;
  h: number;
  anchorX: number;
  anchorY: number;
};

export type TextOverlayDrawState = {
  layer: TextOverlayLayer;
  alpha: number;
  dy: number;
  scale: number;
};

const DEBUG_SUBTITLES = false;

export type SubtitlePerfMetrics = {
  layerBuildMs: number;
  prefetchBuildMs: number;
};

let subtitlePerfMetrics: SubtitlePerfMetrics = { layerBuildMs: 0, prefetchBuildMs: 0 };

export function getSubtitlePerfMetrics(): SubtitlePerfMetrics {
  return { ...subtitlePerfMetrics };
}

let subtitleLayerCache: TextOverlayLayer | null = null;
let titleLayerCache: TextOverlayLayer | null = null;
let subtitlePrefetchLayer: TextOverlayLayer | null = null;
let subtitlePrefetchKey: string | null = null;
let lastSubtitleStaticDraw: TextOverlayDrawState | null = null;
let lastSubtitleStaticKey: string | null = null;

let lastScheduledPrefetchCueIdx = -1;
let subtitlePrefetchIdleHandle: ReturnType<typeof setTimeout> | number | null = null;
type SubtitlePrefetchJob = {
  cues: SubtitleCue[];
  cueIdx: number;
  style: SubtitleStyle;
  canvasWidth: number;
  canvasHeight: number;
};
let pendingSubtitlePrefetchJob: SubtitlePrefetchJob | null = null;

function scheduleIdleWork(fn: () => void): ReturnType<typeof setTimeout> | number {
  if (typeof requestIdleCallback !== "undefined") {
    return requestIdleCallback(fn, { timeout: 120 });
  }
  return setTimeout(fn, 0);
}

function cancelIdleWork(handle: ReturnType<typeof setTimeout> | number | null): void {
  if (handle == null) return;
  if (typeof cancelIdleCallback !== "undefined" && typeof handle === "number") {
    cancelIdleCallback(handle);
  } else {
    clearTimeout(handle as ReturnType<typeof setTimeout>);
  }
}

function cancelSubtitlePrefetchSchedule(): void {
  cancelIdleWork(subtitlePrefetchIdleHandle);
  subtitlePrefetchIdleHandle = null;
  pendingSubtitlePrefetchJob = null;
}

const cueLinesCache = new WeakMap<SubtitleCue, string[]>();

function getCueLines(cue: SubtitleCue): string[] {
  if (cue.lines && cue.lines.length > 0) return cue.lines;
  let lines = cueLinesCache.get(cue);
  if (!lines) {
    lines = cue.text.split("\n").filter(Boolean);
    cueLinesCache.set(cue, lines);
  }
  return lines;
}

let measureCanvas: HTMLCanvasElement | null = null;
let measureCtx: CanvasRenderingContext2D | null = null;

function ensureMeasureCtx(): CanvasRenderingContext2D | null {
  if (!measureCanvas) {
    measureCanvas = document.createElement("canvas");
    measureCtx = measureCanvas.getContext("2d");
  }
  return measureCtx;
}

export function clearTextOverlayCaches(): void {
  subtitleLayerCache = null;
  titleLayerCache = null;
  subtitlePrefetchLayer = null;
  subtitlePrefetchKey = null;
  lastSubtitleStaticDraw = null;
  lastSubtitleStaticKey = null;
  lastCueSearchHint = 0;
  lastScheduledPrefetchCueIdx = -1;
  cancelSubtitlePrefetchSchedule();
}

function buildSubtitleLayerKey(
  canvasWidth: number,
  canvasHeight: number,
  cue: SubtitleCue,
  style: SubtitleStyle
): string {
  const stem = cue.layerKeyStem ?? `${cue.startSec}\0${cue.endSec}\0${cue.text}`;
  return [
    canvasWidth,
    canvasHeight,
    stem,
    styleToCacheKey(style),
  ].join("\0");
}

function resolveSubtitleLayer(
  layerKey: string,
  lines: string[],
  style: SubtitleStyle,
  canvasWidth: number,
  canvasHeight: number
): TextOverlayLayer | null {
  if (subtitleLayerCache && subtitleLayerCache.key === layerKey) {
    return subtitleLayerCache;
  }
  if (subtitlePrefetchKey === layerKey && subtitlePrefetchLayer) {
    const layer = subtitlePrefetchLayer;
    subtitlePrefetchLayer = null;
    subtitlePrefetchKey = null;
    subtitleLayerCache = layer;
    return layer;
  }
  const t0 = DEBUG_SUBTITLES ? performance.now() : 0;
  const layer = buildTextOverlayLayer(layerKey, lines, style, canvasWidth, canvasHeight);
  if (layer) {
    const ms = performance.now() - t0;
    subtitlePerfMetrics.layerBuildMs = ms;
    if (DEBUG_SUBTITLES) {
      console.log("[Subtitles] layer build ms", ms.toFixed(2));
    }
  }
  if (!layer) return null;
  subtitleLayerCache = layer;
  return layer;
}

function runSubtitlePrefetchBuild(job: SubtitlePrefetchJob): void {
  const nextIdx = job.cueIdx + 1;
  if (nextIdx >= job.cues.length) return;
  const nextCue = job.cues[nextIdx];
  const prefetchKey = buildSubtitleLayerKey(
    job.canvasWidth,
    job.canvasHeight,
    nextCue,
    job.style
  );
  if (subtitlePrefetchKey === prefetchKey && subtitlePrefetchLayer) return;
  const lines = getCueLines(nextCue);
  if (lines.length === 0) return;
  const t0 = DEBUG_SUBTITLES ? performance.now() : 0;
  subtitlePrefetchLayer = buildTextOverlayLayer(
    prefetchKey,
    lines,
    job.style,
    job.canvasWidth,
    job.canvasHeight
  );
  subtitlePrefetchKey = prefetchKey;
  const ms = performance.now() - t0;
  subtitlePerfMetrics.prefetchBuildMs = ms;
  if (DEBUG_SUBTITLES && subtitlePrefetchLayer) {
    console.log("[Subtitles] prefetch layer build ms", ms.toFixed(2));
  }
}

function scheduleSubtitlePrefetch(
  cues: SubtitleCue[],
  currentCueIdx: number,
  style: SubtitleStyle,
  canvasWidth: number,
  canvasHeight: number
): void {
  const nextIdx = currentCueIdx + 1;
  if (nextIdx >= cues.length) return;
  if (lastScheduledPrefetchCueIdx === nextIdx) return;

  const nextCue = cues[nextIdx];
  const prefetchKey = buildSubtitleLayerKey(canvasWidth, canvasHeight, nextCue, style);
  if (subtitlePrefetchKey === prefetchKey && subtitlePrefetchLayer) {
    lastScheduledPrefetchCueIdx = nextIdx;
    return;
  }

  lastScheduledPrefetchCueIdx = nextIdx;
  pendingSubtitlePrefetchJob = {
    cues,
    cueIdx: currentCueIdx,
    style,
    canvasWidth,
    canvasHeight,
  };

  if (subtitlePrefetchIdleHandle != null) return;

  subtitlePrefetchIdleHandle = scheduleIdleWork(() => {
    subtitlePrefetchIdleHandle = null;
    const job = pendingSubtitlePrefetchJob;
    pendingSubtitlePrefetchJob = null;
    if (!job) return;
    runSubtitlePrefetchBuild(job);
  });
}

/** 再生開始時に先頭付近の次キューを先行プリフェッチする */
export function primeSubtitlePrefetch(
  canvasWidth: number,
  canvasHeight: number,
  overlay: SubtitleOverlaySettings | undefined
): void {
  if (!overlay || canvasWidth <= 0 || canvasHeight <= 0) return;
  const enabled = overlay.getEnabled?.() ?? overlay.enabled;
  if (!enabled) return;
  const cues = overlay.getCues?.() ?? overlay.cues;
  if (cues.length === 0) return;

  const t = overlay.getCurrentTimeSec();
  const offsetSec = overlay.displayTimingOffsetSec ?? 0;
  const cue = getActiveCue(cues, t, offsetSec);
  const idx = cue ? lastCueSearchHint : 0;
  lastScheduledPrefetchCueIdx = -1;
  scheduleSubtitlePrefetch(cues, idx, overlay.style, canvasWidth, canvasHeight);
}

/** WebGL 側が次キューのテクスチャを先行アップロードする用 */
export function getSubtitlePrefetchLayer(): TextOverlayLayer | null {
  return subtitlePrefetchLayer;
}

function styleToCacheKey(style: SubtitleStyle, letterSpacingPx = 0): string {
  return [
    style.positionYPercent,
    style.align,
    style.displayType,
    style.color,
    style.fontSize,
    style.fontFamily,
    style.bold ? 1 : 0,
    style.italic ? 1 : 0,
    style.strokeColor,
    style.strokeWidth,
    style.shadowBlur,
    style.shadowColor,
    style.boxColor,
    style.boxPadding,
    letterSpacingPx,
  ].join("|");
}

function applyLetterSpacing(ctx: CanvasRenderingContext2D, letterSpacingPx: number): void {
  if (letterSpacingPx <= 0) return;
  try {
    (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = `${letterSpacingPx}px`;
  } catch {
    /* ignore */
  }
}

function buildTextOverlayLayer(
  key: string,
  lines: string[],
  style: SubtitleStyle,
  canvasWidth: number,
  canvasHeight: number,
  letterSpacingPx = 0
): TextOverlayLayer | null {
  if (lines.length === 0 || canvasWidth <= 0 || canvasHeight <= 0) return null;

  const weight = style.bold ? "700" : "400";
  const italic = style.italic ? "italic" : "normal";
  const baseFontSize = Math.max(10, style.fontSize);
  const lineHeight = baseFontSize * 1.25;
  const font = `${italic} ${weight} ${baseFontSize}px ${style.fontFamily}`;

  const measureCtx = ensureMeasureCtx();
  if (!measureCtx) return null;
  applyLetterSpacing(measureCtx, letterSpacingPx);
  measureCtx.font = font;
  const widths = lines.map((line) => measureCtx.measureText(line).width);
  const maxLineWidth = Math.max(...widths);

  const x =
    style.align === "left" ? 0 :
    style.align === "right" ? canvasWidth : canvasWidth * 0.5;
  const yBase = canvasHeight * (style.positionYPercent / 100);
  const totalHeight = lineHeight * lines.length;
  const boxPad = style.displayType === "boxed" ? Math.max(0, style.boxPadding) : 0;
  const edgePad = Math.ceil(Math.max(style.shadowBlur, style.strokeWidth) * 2 + 2);

  let bx: number;
  if (style.align === "left") {
    bx = x - boxPad - edgePad;
  } else if (style.align === "right") {
    bx = x - maxLineWidth - boxPad - edgePad;
  } else {
    bx = x - maxLineWidth / 2 - boxPad - edgePad;
  }
  const by = yBase - totalHeight - boxPad - edgePad;
  const bw = maxLineWidth + boxPad * 2 + edgePad * 2;
  const bh = totalHeight + boxPad * 2 + edgePad * 2;

  const layerCanvas = document.createElement("canvas");
  layerCanvas.width = Math.max(1, Math.ceil(bw));
  layerCanvas.height = Math.max(1, Math.ceil(bh));
  const lctx = layerCanvas.getContext("2d", { alpha: true });
  if (!lctx) return null;

  lctx.textBaseline = "alphabetic";
  applyLetterSpacing(lctx, letterSpacingPx);
  lctx.font = font;
  lctx.shadowBlur = style.shadowBlur;
  lctx.shadowColor = style.shadowColor;

  const localX =
    style.align === "left" ? edgePad + boxPad :
    style.align === "right" ? layerCanvas.width - edgePad - boxPad :
    layerCanvas.width / 2;
  const localYBase = layerCanvas.height - edgePad - boxPad;

  if (style.displayType === "boxed") {
    const pad = Math.max(0, style.boxPadding);
    const boxX =
      style.align === "left" ? edgePad :
      style.align === "right" ? layerCanvas.width - edgePad - maxLineWidth - pad * 2 :
      localX - maxLineWidth / 2 - pad;
    const boxY = localYBase - totalHeight - pad;
    lctx.fillStyle = style.boxColor;
    lctx.fillRect(boxX, boxY, maxLineWidth + pad * 2, totalHeight + pad * 2);
  }

  lctx.fillStyle = style.color;
  lctx.textAlign = style.align;
  let y = localYBase - (lines.length - 1) * lineHeight;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (style.displayType !== "plain") {
      lctx.strokeStyle = style.strokeColor;
      lctx.lineWidth = Math.max(0.5, style.strokeWidth);
      lctx.strokeText(line, localX, y);
    }
    lctx.fillText(line, localX, y);
    y += lineHeight;
  }

  return {
    key,
    canvas: layerCanvas,
    x: bx,
    y: by,
    w: layerCanvas.width,
    h: layerCanvas.height,
    anchorX: x,
    anchorY: yBase,
  };
}

function getOrBuildLayer(
  cache: TextOverlayLayer | null,
  key: string,
  lines: string[],
  style: SubtitleStyle,
  canvasWidth: number,
  canvasHeight: number,
  letterSpacingPx = 0
): TextOverlayLayer | null {
  if (cache && cache.key === key) return cache;
  return buildTextOverlayLayer(key, lines, style, canvasWidth, canvasHeight, letterSpacingPx);
}

export function compositeTextOverlayToCanvas2D(
  ctx: CanvasRenderingContext2D,
  state: TextOverlayDrawState
): void {
  const { layer, alpha, dy, scale } = state;
  if (alpha <= 0.001) return;

  ctx.save();
  ctx.globalAlpha = alpha;
  if (scale !== 1 || dy !== 0) {
    ctx.translate(layer.anchorX, layer.anchorY + dy);
    ctx.scale(scale, scale);
    ctx.translate(-layer.anchorX, -layer.anchorY);
  }
  ctx.drawImage(layer.canvas, layer.x, layer.y, layer.w, layer.h);
  ctx.restore();
}

export function resolveSubtitleOverlayDraw(
  canvasWidth: number,
  canvasHeight: number,
  overlay: SubtitleOverlaySettings | undefined
): TextOverlayDrawState | null {
  if (!overlay) {
    lastSubtitleStaticDraw = null;
    lastSubtitleStaticKey = null;
    return null;
  }
  const enabled = overlay.getEnabled?.() ?? overlay.enabled;
  if (!enabled) {
    lastSubtitleStaticDraw = null;
    lastSubtitleStaticKey = null;
    return null;
  }

  const cues = overlay.getCues?.() ?? overlay.cues;
  if (cues.length === 0) {
    lastSubtitleStaticDraw = null;
    lastSubtitleStaticKey = null;
    return null;
  }

  const t = overlay.getCurrentTimeSec();
  const offsetSec = overlay.displayTimingOffsetSec ?? 0;
  const tLookup = t - offsetSec;
  const cue = getActiveCue(cues, t, offsetSec);
  if (!cue) {
    lastSubtitleStaticDraw = null;
    lastSubtitleStaticKey = null;
    return null;
  }

  const style = overlay.style;
  const layerKey = buildSubtitleLayerKey(canvasWidth, canvasHeight, cue, style);
  const lines = getCueLines(cue);
  if (lines.length === 0) return null;

  if (style.animationType === "none") {
    if (lastSubtitleStaticKey === layerKey && lastSubtitleStaticDraw) {
      scheduleSubtitlePrefetch(cues, lastCueSearchHint, style, canvasWidth, canvasHeight);
      return lastSubtitleStaticDraw;
    }
    const layer = resolveSubtitleLayer(layerKey, lines, style, canvasWidth, canvasHeight);
    if (!layer) return null;
    const state: TextOverlayDrawState = { layer, alpha: 1, dy: 0, scale: 1 };
    lastSubtitleStaticKey = layerKey;
    lastSubtitleStaticDraw = state;
    scheduleSubtitlePrefetch(cues, lastCueSearchHint, style, canvasWidth, canvasHeight);
    return state;
  }

  const anim = getAnimationFactor(style, cue, tLookup);
  if (anim.alpha <= 0.001) return null;

  const layer = resolveSubtitleLayer(layerKey, lines, style, canvasWidth, canvasHeight);
  if (!layer) return null;
  scheduleSubtitlePrefetch(cues, lastCueSearchHint, style, canvasWidth, canvasHeight);
  return { layer, ...anim };
}

export function resolveTitleOverlayDraw(
  canvasWidth: number,
  canvasHeight: number,
  overlay: TitleOverlaySettings | undefined
): TextOverlayDrawState | null {
  if (!overlay || !overlay.enabled) return null;

  const raw = overlay.text.trim();
  if (!raw) return null;

  const style = overlay.style;
  const anim = getTitleAnimationFactor(style, overlay.isPlaying, overlay.playbackTimeSec);
  if (anim.alpha <= 0.001) return null;

  const lines = raw.split("\n").filter(Boolean);
  if (lines.length === 0) return null;

  const key = [
    canvasWidth,
    canvasHeight,
    raw,
    styleToCacheKey(style, style.letterSpacingPx),
  ].join("\0");

  const layer = getOrBuildLayer(
    titleLayerCache,
    key,
    lines,
    style,
    canvasWidth,
    canvasHeight,
    style.letterSpacingPx
  );
  if (!layer) return null;
  titleLayerCache = layer;
  return { layer, ...anim };
}

export function renderTitleOverlayCanvas(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  overlay: TitleOverlaySettings | undefined
): void {
  const state = resolveTitleOverlayDraw(canvasWidth, canvasHeight, overlay);
  if (!state) return;
  compositeTextOverlayToCanvas2D(ctx, state);
}

export function renderSubtitleOverlayCanvas(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  overlay: SubtitleOverlaySettings | undefined
): void {
  const state = resolveSubtitleOverlayDraw(canvasWidth, canvasHeight, overlay);
  if (!state) return;
  compositeTextOverlayToCanvas2D(ctx, state);
}
