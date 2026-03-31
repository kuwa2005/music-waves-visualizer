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

function getActiveCue(cues: SubtitleCue[], t: number): SubtitleCue | null {
  if (!(t >= 0) || cues.length === 0) return null;
  for (let i = 0; i < cues.length; i++) {
    const c = cues[i];
    if (t >= c.startSec && t <= c.endSec) return c;
  }
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
  animationType: "fade",
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

export function renderTitleOverlayCanvas(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  overlay: TitleOverlaySettings | undefined
): void {
  if (!overlay || !overlay.enabled) return;
  const raw = overlay.text.trim();
  if (!raw) return;
  const style = overlay.style;
  const anim = getTitleAnimationFactor(style, overlay.isPlaying, overlay.playbackTimeSec);
  if (anim.alpha <= 0.001) return;
  const lines = raw.split("\n").filter(Boolean);
  if (lines.length === 0) return;
  const weight = style.bold ? "700" : "400";
  const italic = style.italic ? "italic" : "normal";
  const baseFontSize = Math.max(10, style.fontSize);
  const fontSize = baseFontSize * anim.scale;
  const lineHeight = fontSize * 1.25;
  ctx.save();
  ctx.globalAlpha = anim.alpha;
  ctx.textBaseline = "alphabetic";
  try {
    (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = `${Math.max(0, style.letterSpacingPx)}px`;
  } catch {
    /* ignore */
  }
  ctx.font = `${italic} ${weight} ${fontSize}px ${style.fontFamily}`;
  ctx.shadowBlur = style.shadowBlur;
  ctx.shadowColor = style.shadowColor;
  const widths = lines.map((line) => ctx.measureText(line).width);
  const maxLineWidth = Math.max(...widths);
  const x =
    style.align === "left" ? canvasWidth * 0.08 :
    style.align === "right" ? canvasWidth * 0.92 : canvasWidth * 0.5;
  const yBase = (canvasHeight * (style.positionYPercent / 100)) + anim.dy;
  const totalHeight = lineHeight * lines.length;
  if (style.displayType === "boxed") {
    const pad = Math.max(0, style.boxPadding);
    const bx = style.align === "left" ? x - pad :
      style.align === "right" ? x - maxLineWidth - pad : x - maxLineWidth / 2 - pad;
    const by = yBase - totalHeight - pad;
    ctx.fillStyle = style.boxColor;
    ctx.fillRect(bx, by, maxLineWidth + pad * 2, totalHeight + pad * 2);
  }
  ctx.fillStyle = style.color;
  ctx.textAlign = style.align;
  let y = yBase - (lines.length - 1) * lineHeight;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (style.displayType !== "plain") {
      ctx.strokeStyle = style.strokeColor;
      ctx.lineWidth = Math.max(0.5, style.strokeWidth);
      ctx.strokeText(line, x, y);
    }
    ctx.fillText(line, x, y);
    y += lineHeight;
  }
  ctx.restore();
}

export function renderSubtitleOverlayCanvas(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  overlay: SubtitleOverlaySettings | undefined
): void {
  if (!overlay || !overlay.enabled || overlay.cues.length === 0) return;
  const t = overlay.getCurrentTimeSec();
  const cue = getActiveCue(overlay.cues, t);
  if (!cue) return;
  const style = overlay.style;
  const anim = getAnimationFactor(style, cue, t);
  if (anim.alpha <= 0.001) return;
  const lines = cue.text.split("\n").filter(Boolean);
  if (lines.length === 0) return;
  const weight = style.bold ? "700" : "400";
  const italic = style.italic ? "italic" : "normal";
  const baseFontSize = Math.max(10, style.fontSize);
  const fontSize = baseFontSize * anim.scale;
  const lineHeight = fontSize * 1.25;
  ctx.save();
  ctx.globalAlpha = anim.alpha;
  ctx.textBaseline = "alphabetic";
  ctx.font = `${italic} ${weight} ${fontSize}px ${style.fontFamily}`;
  ctx.shadowBlur = style.shadowBlur;
  ctx.shadowColor = style.shadowColor;
  const widths = lines.map((line) => ctx.measureText(line).width);
  const maxLineWidth = Math.max(...widths);
  const x =
    style.align === "left" ? canvasWidth * 0.08 :
    style.align === "right" ? canvasWidth * 0.92 : canvasWidth * 0.5;
  const yBase = (canvasHeight * (style.positionYPercent / 100)) + anim.dy;
  const totalHeight = lineHeight * lines.length;
  if (style.displayType === "boxed") {
    const pad = Math.max(0, style.boxPadding);
    const bx = style.align === "left" ? x - pad :
      style.align === "right" ? x - maxLineWidth - pad : x - maxLineWidth / 2 - pad;
    const by = yBase - totalHeight - pad;
    ctx.fillStyle = style.boxColor;
    ctx.fillRect(bx, by, maxLineWidth + pad * 2, totalHeight + pad * 2);
  }
  ctx.fillStyle = style.color;
  ctx.textAlign = style.align;
  let y = yBase - (lines.length - 1) * lineHeight;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (style.displayType !== "plain") {
      ctx.strokeStyle = style.strokeColor;
      ctx.lineWidth = Math.max(0.5, style.strokeWidth);
      ctx.strokeText(line, x, y);
    }
    ctx.fillText(line, x, y);
    y += lineHeight;
  }
  ctx.restore();
}

