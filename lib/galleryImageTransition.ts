/**
 * 複数画像ギャラリー切替時の背景トランジション（Canvas 2D / WebGL 共通でオフスクリーン合成に使用）
 */

export type GalleryTransitionUserMode =
  | "none"
  | "random"
  | "crossfade"
  | "wipeLeft"
  | "wipeRight"
  | "wipeUp"
  | "wipeDown"
  | "iris"
  | "slideLeft"
  | "slideRight"
  | "slideUp"
  | "slideDown"
  | "zoomIn"
  | "zoomOut"
  | "checker"
  | "venetian"
  | "diagonalWipe"
  | "flash";

/** 設定UIの並び（none → random → 各エフェクト） */
export const GALLERY_TRANSITION_SELECT_OPTIONS: GalleryTransitionUserMode[] = [
  "none",
  "random",
  "crossfade",
  "wipeLeft",
  "wipeRight",
  "wipeUp",
  "wipeDown",
  "iris",
  "slideLeft",
  "slideRight",
  "slideUp",
  "slideDown",
  "zoomIn",
  "zoomOut",
  "checker",
  "venetian",
  "diagonalWipe",
  "flash",
];

/** 「ランダム」時に選ばれる候補（none / random は含めない） */
export const GALLERY_TRANSITION_RANDOM_POOL: Exclude<
  GalleryTransitionUserMode,
  "none" | "random"
>[] = [
  "crossfade",
  "wipeLeft",
  "wipeRight",
  "wipeUp",
  "wipeDown",
  "iris",
  "slideLeft",
  "slideRight",
  "slideUp",
  "slideDown",
  "zoomIn",
  "zoomOut",
  "checker",
  "venetian",
  "diagonalWipe",
  "flash",
];

const VALID_MODES = new Set<string>([
  "none",
  "random",
  ...GALLERY_TRANSITION_RANDOM_POOL,
]);

export function isValidGalleryTransitionUserMode(s: string): s is GalleryTransitionUserMode {
  return VALID_MODES.has(s);
}

type ActiveTransition = {
  from: HTMLImageElement;
  to: HTMLImageElement;
  resolvedKind: Exclude<GalleryTransitionUserMode, "none" | "random">;
  start: number;
  duration: number;
};

let active: ActiveTransition | null = null;

export function startGalleryImageTransition(
  from: HTMLImageElement,
  to: HTMLImageElement,
  resolvedKind: Exclude<GalleryTransitionUserMode, "none" | "random">,
  durationMs = 520
): void {
  active = {
    from,
    to,
    resolvedKind,
    start: performance.now(),
    duration: Math.max(120, durationMs),
  };
}

export function clearGalleryImageTransition(): void {
  active = null;
}

export type GalleryTransitionDrawState = {
  from: HTMLImageElement;
  to: HTMLImageElement;
  resolvedKind: Exclude<GalleryTransitionUserMode, "none" | "random">;
  /** 0〜1（完了時は null を返し通常描画に任せる） */
  progress: number;
};

/** 進行中のトランジションを取得。progress>=1 なら内部状態をクリアして null */
export function peekGalleryImageTransitionFrame(): GalleryTransitionDrawState | null {
  if (!active) return null;
  const progress = (performance.now() - active.start) / active.duration;
  if (progress >= 1) {
    active = null;
    return null;
  }
  return {
    from: active.from,
    to: active.to,
    resolvedKind: active.resolvedKind,
    progress,
  };
}

function smoothstep(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}

/** アスペクト cover で画像のみ（背景塗りつぶしなし） */
export function drawCoverImageContent(
  ctx: CanvasRenderingContext2D,
  cw: number,
  ch: number,
  img: HTMLImageElement
): void {
  const rawW = img.naturalWidth || img.width || 1;
  const rawH = img.naturalHeight || img.height || 1;
  const scale = Math.max(cw / rawW, ch / rawH);
  const iw = Math.round(rawW * scale);
  const ih = Math.round(rawH * scale);
  const posX = (cw - iw) / 2;
  const posY = (ch - ih) / 2;
  ctx.drawImage(img, 0, 0, rawW, rawH, posX, posY, iw, ih);
}

/**
 * 背景（グレー＋cover）をトランジション付きで ctx に描画。
 * transition が null のときは image のみ通常描画（image null ならグレーのみ）。
 */
export function drawGalleryBackground(
  ctx: CanvasRenderingContext2D,
  cw: number,
  ch: number,
  image: HTMLImageElement | null,
  transition: GalleryTransitionDrawState | null
): void {
  ctx.fillStyle = "rgba(34, 34, 34, 1.0)";
  ctx.fillRect(0, 0, cw, ch);

  if (transition) {
    const { from, to, resolvedKind, progress } = transition;
    const e = smoothstep(progress);

    const drawFrom = () => drawCoverImageContent(ctx, cw, ch, from);
    const drawTo = () => drawCoverImageContent(ctx, cw, ch, to);

    switch (resolvedKind) {
      case "crossfade": {
        drawFrom();
        ctx.save();
        ctx.globalAlpha = e;
        drawTo();
        ctx.restore();
        break;
      }
      case "wipeLeft": {
        drawFrom();
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, cw * e, ch);
        ctx.clip();
        drawTo();
        ctx.restore();
        break;
      }
      case "wipeRight": {
        drawFrom();
        ctx.save();
        ctx.beginPath();
        ctx.rect(cw * (1 - e), 0, cw * e, ch);
        ctx.clip();
        drawTo();
        ctx.restore();
        break;
      }
      case "wipeUp": {
        drawFrom();
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, ch * (1 - e), cw, ch * e);
        ctx.clip();
        drawTo();
        ctx.restore();
        break;
      }
      case "wipeDown": {
        drawFrom();
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, cw, ch * e);
        ctx.clip();
        drawTo();
        ctx.restore();
        break;
      }
      case "iris": {
        drawFrom();
        ctx.save();
        const cx = cw / 2;
        const cy = ch / 2;
        const maxR = Math.sqrt(cx * cx + cy * cy) + 2;
        ctx.beginPath();
        ctx.arc(cx, cy, maxR * e, 0, Math.PI * 2);
        ctx.clip();
        drawTo();
        ctx.restore();
        break;
      }
      case "slideLeft": {
        drawFrom();
        ctx.save();
        ctx.translate(-cw + cw * e, 0);
        drawTo();
        ctx.restore();
        break;
      }
      case "slideRight": {
        drawFrom();
        ctx.save();
        ctx.translate(cw - cw * e, 0);
        drawTo();
        ctx.restore();
        break;
      }
      case "slideUp": {
        drawFrom();
        ctx.save();
        ctx.translate(0, -ch + ch * e);
        drawTo();
        ctx.restore();
        break;
      }
      case "slideDown": {
        drawFrom();
        ctx.save();
        ctx.translate(0, ch - ch * e);
        drawTo();
        ctx.restore();
        break;
      }
      case "zoomIn": {
        drawFrom();
        ctx.save();
        const cx = cw / 2;
        const cy = ch / 2;
        const s = 0.35 + 0.65 * e;
        ctx.globalAlpha = Math.min(1, e * 1.35);
        ctx.translate(cx, cy);
        ctx.scale(s, s);
        ctx.translate(-cx, -cy);
        drawTo();
        ctx.restore();
        break;
      }
      case "zoomOut": {
        drawTo();
        ctx.save();
        const cx = cw / 2;
        const cy = ch / 2;
        const s = 1.15 - 0.15 * e;
        ctx.globalAlpha = 1 - e;
        ctx.translate(cx, cy);
        ctx.scale(s, s);
        ctx.translate(-cx, -cy);
        drawFrom();
        ctx.restore();
        break;
      }
      case "checker": {
        drawFrom();
        const cols = 10;
        const rows = Math.max(6, Math.round((ch / cw) * cols));
        const cellW = cw / cols;
        const cellH = ch / rows;
        for (let row = 0; row < rows; row++) {
          for (let col = 0; col < cols; col++) {
            const h = Math.sin(row * 7.13 + col * 11.97) * 43758.5453123;
            const th = h - Math.floor(h);
            if (th < e) {
              ctx.save();
              ctx.beginPath();
              ctx.rect(col * cellW, row * cellH, cellW + 0.5, cellH + 0.5);
              ctx.clip();
              drawTo();
              ctx.restore();
            }
          }
        }
        break;
      }
      case "venetian": {
        drawFrom();
        const bands = densityToBands(cw, ch);
        const bandH = ch / bands;
        for (let i = 0; i < bands; i++) {
          const stagger = (i % 2) * 0.08;
          const denom = 1 - stagger;
          const te = denom <= 0.01 ? e : Math.min(1, Math.max(0, (e - stagger) / denom));
          const h = bandH * te;
          if (h <= 0) continue;
          ctx.save();
          ctx.beginPath();
          ctx.rect(0, i * bandH, cw, h);
          ctx.clip();
          drawTo();
          ctx.restore();
        }
        break;
      }
      case "diagonalWipe": {
        drawFrom();
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(cw * e * 1.15, 0);
        ctx.lineTo(0, ch * e * 1.15);
        ctx.closePath();
        ctx.clip();
        drawTo();
        ctx.restore();
        break;
      }
      case "flash": {
        const flashEnd = 0.14;
        if (progress < flashEnd) {
          drawFrom();
          const fe = 1 - progress / flashEnd;
          ctx.fillStyle = `rgba(255,255,255,${0.72 * fe})`;
          ctx.fillRect(0, 0, cw, ch);
          ctx.save();
          ctx.globalAlpha = smoothstep(progress / flashEnd) * 0.95;
          drawTo();
          ctx.restore();
        } else {
          const u = smoothstep((progress - flashEnd) / (1 - flashEnd));
          drawFrom();
          ctx.save();
          ctx.globalAlpha = u;
          drawTo();
          ctx.restore();
        }
        break;
      }
      default:
        drawFrom();
        ctx.save();
        ctx.globalAlpha = e;
        drawTo();
        ctx.restore();
    }
    return;
  }

  if (image) {
    drawCoverImageContent(ctx, cw, ch, image);
  }
}

function densityToBands(cw: number, ch: number): number {
  const minDim = Math.min(cw, ch);
  return Math.max(10, Math.min(32, Math.round(minDim / 48)));
}
