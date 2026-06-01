import type { ModeAdjustments } from "./Canvas";

/** Canvas 2D / WebGL 共通の調整変換（中心基準 translate → scale → translate） */
export function applyModeAdjustments(
  x: number,
  y: number,
  canvasWidth: number,
  canvasHeight: number,
  adj: ModeAdjustments
): [number, number] {
  const offsetXPixels = (canvasWidth * adj.offsetX) / 100;
  const offsetYPixels = (canvasHeight * adj.offsetY) / 100;
  let tx = x - canvasWidth / 2;
  let ty = y - canvasHeight / 2;
  tx *= adj.scaleX;
  ty *= adj.scaleY;
  tx += canvasWidth / 2 + offsetXPixels;
  ty += canvasHeight / 2 + offsetYPixels;
  return [tx, ty];
}

/**
 * 円形モード(2)のローカル座標 → 画面座標。
 * Canvas 2D: 外側 adj（translate→scale→translate）のあと scale(0.5)→translate(cw,ch) と等価。
 * 内側のみ: screenPre = 0.5 * (local + canvasSize)、その後 applyModeAdjustments。
 */
export function applyMode2LocalToScreen(
  localX: number,
  localY: number,
  canvasWidth: number,
  canvasHeight: number,
  adj: ModeAdjustments
): [number, number] {
  const x = (localX + canvasWidth) * 0.5;
  const y = (localY + canvasHeight) * 0.5;
  return applyModeAdjustments(x, y, canvasWidth, canvasHeight, adj);
}

/** スペクトラムの視覚中心（キャンバス座標px） */
export function getSpectrumPivotPixels(
  canvasWidth: number,
  canvasHeight: number,
  adj: ModeAdjustments,
  mode: number
): { x: number; y: number } {
  if (mode === 2) {
    const [x, y] = applyMode2LocalToScreen(0, 0, canvasWidth, canvasHeight, adj);
    return { x, y };
  }
  const [x, y] = applyModeAdjustments(
    canvasWidth / 2,
    canvasHeight / 2,
    canvasWidth,
    canvasHeight,
    adj
  );
  return { x, y };
}

/** オーバーレイ上の位置（%）から offsetX / offsetY（%）へ逆算 */
export function overlayPercentToModeOffsets(
  leftPercent: number,
  topPercent: number,
  canvasWidth: number,
  canvasHeight: number,
  adj: ModeAdjustments,
  mode: number
): Pick<ModeAdjustments, "offsetX" | "offsetY"> {
  const clampPct = (v: number) => Math.max(-150, Math.min(150, Math.round(v)));
  if (canvasWidth <= 0 || canvasHeight <= 0) {
    return { offsetX: 0, offsetY: 0 };
  }
  const base = getSpectrumPivotPixels(canvasWidth, canvasHeight, { ...adj, offsetX: 0, offsetY: 0 }, mode);
  const targetX = (leftPercent / 100) * canvasWidth;
  const targetY = (topPercent / 100) * canvasHeight;
  return {
    offsetX: clampPct(((targetX - base.x) / canvasWidth) * 100),
    offsetY: clampPct(((targetY - base.y) / canvasHeight) * 100),
  };
}

/** プレビューオーバーレイ用（キャンバス内 0..100%） */
export function getSpectrumPivotOverlayPercent(
  canvasWidth: number,
  canvasHeight: number,
  adj: ModeAdjustments,
  mode: number
): { leftPercent: number; topPercent: number } {
  if (canvasWidth <= 0 || canvasHeight <= 0) {
    return { leftPercent: 50, topPercent: 50 };
  }
  const { x, y } = getSpectrumPivotPixels(canvasWidth, canvasHeight, adj, mode);
  return {
    leftPercent: (x / canvasWidth) * 100,
    topPercent: (y / canvasHeight) * 100,
  };
}

/** 宇宙エフェクトの消失点（Effects.ts と同じクランプ） */
export function getSpaceCenterOverlayPercent(
  centerXNorm: number,
  centerYNorm: number
): { leftPercent: number; topPercent: number } {
  const x = Math.max(0.05, Math.min(0.95, centerXNorm));
  const y = Math.max(0.08, Math.min(0.92, centerYNorm));
  return { leftPercent: x * 100, topPercent: y * 100 };
}
