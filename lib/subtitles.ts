export type SubtitleCue = {
  startSec: number;
  endSec: number;
  text: string;
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
  cues: SubtitleCue[];
  getCurrentTimeSec: () => number;
  style: SubtitleStyle;
  /** 表示のみのタイミング補正（秒）。負で早く、正で遅く。SRT データは変更しない */
  displayTimingOffsetSec?: number;
};

function parseSrtTime(time: string): number {
  const m = time.trim().match(/^(\d{2}):(\d{2}):(\d{2})[,.](\d{3})$/);
  if (!m) return NaN;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  const ss = Number(m[3]);
  const ms = Number(m[4]);
  return hh * 3600 + mm * 60 + ss + ms / 1000;
}

export function parseSrt(srtText: string): SubtitleCue[] {
  const text = srtText.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const blocks = text.split(/\n{2,}/g).map((b) => b.trim()).filter(Boolean);
  const cues: SubtitleCue[] = [];
  for (const block of blocks) {
    const lines = block.split("\n").map((l) => l.trimEnd());
    if (lines.length < 2) continue;
    const timeLineIdx = /^\d+$/.test(lines[0].trim()) ? 1 : 0;
    if (timeLineIdx >= lines.length) continue;
    const tm = lines[timeLineIdx].match(
      /(\d{2}:\d{2}:\d{2}[,.]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[,.]\d{3})/
    );
    if (!tm) continue;
    const startSec = parseSrtTime(tm[1]);
    const endSec = parseSrtTime(tm[2]);
    if (!Number.isFinite(startSec) || !Number.isFinite(endSec) || endSec <= startSec) continue;
    const body = lines
      .slice(timeLineIdx + 1)
      .join("\n")
      .replace(/\{\\.*?\}/g, "")
      .replace(/<[^>]*>/g, "")
      .trim();
    if (!body) continue;
    cues.push({ startSec, endSec, text: body });
  }
  cues.sort((a, b) => a.startSec - b.startSec);
  return cues;
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

let subtitleLayerCache: TextOverlayLayer | null = null;
let titleLayerCache: TextOverlayLayer | null = null;
let lastSubtitleStaticDraw: TextOverlayDrawState | null = null;
let lastSubtitleStaticKey: string | null = null;

export function clearTextOverlayCaches(): void {
  subtitleLayerCache = null;
  titleLayerCache = null;
  lastSubtitleStaticDraw = null;
  lastSubtitleStaticKey = null;
  lastCueSearchHint = 0;
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

  const measureCanvas = document.createElement("canvas");
  const measureCtx = measureCanvas.getContext("2d");
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
  if (!overlay || !overlay.enabled || overlay.cues.length === 0) {
    lastSubtitleStaticDraw = null;
    lastSubtitleStaticKey = null;
    return null;
  }

  const t = overlay.getCurrentTimeSec();
  const offsetSec = overlay.displayTimingOffsetSec ?? 0;
  const tLookup = t - offsetSec;
  const cue = getActiveCue(overlay.cues, t, offsetSec);
  if (!cue) {
    lastSubtitleStaticDraw = null;
    lastSubtitleStaticKey = null;
    return null;
  }

  const style = overlay.style;
  const layerKey = [
    canvasWidth,
    canvasHeight,
    cue.startSec,
    cue.endSec,
    cue.text,
    styleToCacheKey(style),
  ].join("\0");

  if (style.animationType === "none") {
    if (lastSubtitleStaticKey === layerKey && lastSubtitleStaticDraw) {
      return lastSubtitleStaticDraw;
    }
    const layer = getOrBuildLayer(
      subtitleLayerCache,
      layerKey,
      cue.text.split("\n").filter(Boolean),
      style,
      canvasWidth,
      canvasHeight
    );
    if (!layer) return null;
    subtitleLayerCache = layer;
    const state: TextOverlayDrawState = { layer, alpha: 1, dy: 0, scale: 1 };
    lastSubtitleStaticKey = layerKey;
    lastSubtitleStaticDraw = state;
    return state;
  }

  const anim = getAnimationFactor(style, cue, tLookup);
  if (anim.alpha <= 0.001) return null;

  const lines = cue.text.split("\n").filter(Boolean);
  if (lines.length === 0) return null;

  const layer = getOrBuildLayer(
    subtitleLayerCache,
    layerKey,
    lines,
    style,
    canvasWidth,
    canvasHeight
  );
  if (!layer) return null;
  subtitleLayerCache = layer;
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
