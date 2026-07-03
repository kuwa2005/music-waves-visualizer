/**
 * レコードプレイヤー（ターンテーブル）エフェクトの描画ロジック。
 * 画像参照: 真上から見た長方形ベースのターンテーブル。
 */

export type RecordPlayerRpm = number;
export type DiscStyle = "full" | "groove";
export type DiscSize = "donut" | "7inch" | "10inch" | "12inch";
export type RecordPlayerColorScheme = "dark" | "light";

const rpmToDegPerSec = (rpm: number): number => (rpm * 360) / 60;

const DISC_RADIUS_BY_SIZE: Record<DiscSize, number> = {
  "donut": 0.19,
  "7inch": 0.22,
  "10inch": 0.30,
  "12inch": 0.36,
};
const DISC_HOLE_RATIO_BY_SIZE: Record<DiscSize, number> = {
  "donut": 0.35,
  "7inch": 0.20,
  "10inch": 0.02,
  "12inch": 0.02,
};
const PLATTER_RADIUS_RATIO = 1.08;
const GROOVE_INNER_RADIUS_RATIO = 0.45;

const TONEARM_LERP_SPEED = 2.5;
/** 再生開始時の初期シーク位置（groovePosition 0=外周〜1=内周）。33RPMで約30秒分 */
const INITIAL_GROOVE_OFFSET = 0.023;

interface ModuleState {
  offscreenCanvas: OffscreenCanvas | null;
  offscreenCtx: OffscreenCanvasRenderingContext2D | null;
  offscreenSize: number;
  offscreenImageKey: string;
  angle: number;
  tonearmProgress: number;
  groovePosition: number;
  armIsLowered: boolean;
  wasPlaying: boolean;
  lastTimestampMs: number;
}

const state: ModuleState = {
  offscreenCanvas: null,
  offscreenCtx: null,
  offscreenSize: 0,
  offscreenImageKey: "",
  angle: 0,
  tonearmProgress: 0,
  groovePosition: 0,
  armIsLowered: false,
  wasPlaying: false,
  lastTimestampMs: 0,
};

export function clearRecordPlayerCache(): void {
  state.offscreenCanvas = null;
  state.offscreenCtx = null;
  state.offscreenSize = 0;
  state.offscreenImageKey = "";
  state.angle = 0;
  state.tonearmProgress = 0;
  state.groovePosition = 0;
  state.armIsLowered = false;
  state.wasPlaying = false;
  state.lastTimestampMs = 0;
}

export function advanceRecordDiscRotation(
  rpm: RecordPlayerRpm,
  isPlaying: boolean,
  deltaMs: number,
  elapsedSec: number
): number {
  const degPerSec = rpmToDegPerSec(rpm);
  if (isPlaying) {
    const deltaSec = Math.max(0, Math.min(deltaMs, 100)) / 1000;
    if (deltaSec > 0) {
      state.angle = (state.angle + degPerSec * deltaSec) % 360;
    }
    return state.angle;
  }
  state.angle = (elapsedSec * degPerSec) % 360;
  return state.angle;
}

function getImageKey(image: HTMLImageElement): string {
  return `${image.src ?? ""}@${image.naturalWidth}x${image.naturalHeight}`;
}

function ensureOffscreenCircle(
  image: HTMLImageElement,
  diameter: number
): { canvas: OffscreenCanvas; ctx: OffscreenCanvasRenderingContext2D } {
  const key = getImageKey(image);
  if (state.offscreenCanvas && state.offscreenImageKey === key && state.offscreenSize === diameter) {
    return { canvas: state.offscreenCanvas, ctx: state.offscreenCtx! };
  }
  const oc = new OffscreenCanvas(diameter, diameter);
  const octx = oc.getContext("2d")!;
  if (!octx) throw new Error("OffscreenCanvas 2d context unavailable");
  const radius = diameter / 2;
  octx.clearRect(0, 0, diameter, diameter);
  octx.beginPath();
  octx.arc(radius, radius, radius, 0, Math.PI * 2);
  octx.closePath();
  octx.clip();
  octx.drawImage(image, 0, 0, diameter, diameter);
  state.offscreenCanvas = oc;
  state.offscreenCtx = octx;
  state.offscreenSize = diameter;
  state.offscreenImageKey = key;
  return { canvas: oc, ctx: octx };
}

function drawGroovePattern(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  innerRatio: number,
  outerRatio: number
): void {
  ctx.save();
  const grooveCount = Math.floor(radius * 0.4);
  const innerR = radius * innerRatio;
  const outerR = radius * outerRatio;
  for (let i = 0; i < grooveCount; i++) {
    const t = i / grooveCount;
    const r = innerR + (outerR - innerR) * t;
    const alpha = 0.12 + 0.08 * Math.sin(t * Math.PI);
    ctx.strokeStyle = `rgba(80, 80, 80, ${alpha})`;
    ctx.lineWidth = 0.3;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawVinylSheen(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number
): void {
  ctx.save();
  const sheenGrad = ctx.createLinearGradient(
    cx - radius * 0.7, cy - radius * 0.5,
    cx + radius * 0.5, cy + radius * 0.3
  );
  sheenGrad.addColorStop(0, "rgba(255, 255, 255, 0)");
  sheenGrad.addColorStop(0.3, "rgba(255, 255, 255, 0.04)");
  sheenGrad.addColorStop(0.45, "rgba(255, 255, 255, 0.10)");
  sheenGrad.addColorStop(0.6, "rgba(255, 255, 255, 0.04)");
  sheenGrad.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fillStyle = sheenGrad;
  ctx.fill();
  ctx.restore();
}

function drawStyledDiscBackground(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  cx: number,
  cy: number,
  radius: number,
  style: DiscStyle,
  discSize: DiscSize
): void {
  const holeRatio = DISC_HOLE_RATIO_BY_SIZE[discSize];
  ctx.save();
  if (style === "full") {
    const { canvas } = ensureOffscreenCircle(image, radius * 2);
    ctx.drawImage(canvas, cx - radius, cy - radius, radius * 2, radius * 2);
    const holeRadius = radius * holeRatio;
    if (holeRadius > 1) {
      ctx.save();
      ctx.globalCompositeOperation = "destination-out";
      ctx.beginPath();
      ctx.arc(cx, cy, holeRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      // プラスチック製キャップ風の穴（光沢・立体感）
      const capGrad = ctx.createRadialGradient(
        cx - holeRadius * 0.25, cy - holeRadius * 0.25, holeRadius * 0.1,
        cx, cy, holeRadius
      );
      capGrad.addColorStop(0, "#e8e4dc");
      capGrad.addColorStop(0.3, "#d8d4cc");
      capGrad.addColorStop(0.6, "#c0bbb0");
      capGrad.addColorStop(0.85, "#a8a498");
      capGrad.addColorStop(1, "#8a8680");
      ctx.beginPath();
      ctx.arc(cx, cy, holeRadius, 0, Math.PI * 2);
      ctx.fillStyle = capGrad;
      ctx.fill();
      // キャップ縁のハイライト
      ctx.beginPath();
      ctx.arc(cx, cy, holeRadius, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(180, 175, 165, 0.5)";
      ctx.lineWidth = 0.6;
      ctx.stroke();
      // 内側の縁影
      ctx.beginPath();
      ctx.arc(cx, cy, holeRadius - 0.8, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(80, 75, 70, 0.3)";
      ctx.lineWidth = 0.4;
      ctx.stroke();
      // 中心の小さな穴（ピン用）
      const pinHoleR = holeRadius * 0.15;
      ctx.beginPath();
      ctx.arc(cx, cy, pinHoleR, 0, Math.PI * 2);
      ctx.fillStyle = "#555550";
      ctx.fill();
    }
    drawGroovePattern(ctx, cx, cy, radius, holeRatio + 0.05, 0.94);
    drawVinylSheen(ctx, cx, cy, radius);
  } else if (style === "groove") {
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fillStyle = "#0a0a0a";
    ctx.fill();
    const innerRadius = radius * holeRatio;
    const outerRadius = radius * 0.88;
    const imgDiameter = outerRadius * 2;
    const { canvas } = ensureOffscreenCircle(image, imgDiameter);
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, outerRadius, 0, Math.PI * 2);
    ctx.arc(cx, cy, innerRadius, 0, Math.PI * 2, true);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(canvas, cx - outerRadius, cy - outerRadius, imgDiameter, imgDiameter);
    ctx.restore();
    const labelRadius = innerRadius;
    if (labelRadius > 2) {
      const labelGrad = ctx.createRadialGradient(cx - labelRadius * 0.2, cy - labelRadius * 0.2, 0, cx, cy, labelRadius);
      labelGrad.addColorStop(0, "#4a4a5a");
      labelGrad.addColorStop(0.5, "#3a3a4a");
      labelGrad.addColorStop(1, "#2a2a3a");
      ctx.beginPath();
      ctx.arc(cx, cy, labelRadius, 0, Math.PI * 2);
      ctx.fillStyle = labelGrad;
      ctx.fill();
    }
    drawGroovePattern(ctx, cx, cy, radius, holeRatio + 0.02, 0.94);
    drawVinylSheen(ctx, cx, cy, radius);
  }
  ctx.restore();
}

function drawStrobeDots(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  platterRadius: number,
  angle: number
): void {
  ctx.save();
  const dotRadius = Math.max(1.2, platterRadius * 0.010);
  const ringRadius = platterRadius * 0.97;
  const dotCount = 72;
  for (let i = 0; i < dotCount; i++) {
    const a = ((i / dotCount) * Math.PI * 2) + (angle * Math.PI / 180);
    const dx = cx + Math.cos(a) * ringRadius;
    const dy = cy + Math.sin(a) * ringRadius;
    ctx.beginPath();
    ctx.arc(dx, dy, dotRadius, 0, Math.PI * 2);
    ctx.fillStyle = i % 3 === 0 ? "rgba(220, 220, 220, 0.65)" : "rgba(160, 160, 160, 0.35)";
    ctx.fill();
  }
  ctx.restore();
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawTurntableBase(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  angle: number,
  colorScheme: RecordPlayerColorScheme = "dark"
): void {
  const W = canvasWidth;
  const H = canvasHeight;
  const minDim = Math.min(W, H);

  const baseW = W * 0.96;
  const baseH = H * 0.92;
  const baseX = (W - baseW) / 2;
  const baseY = (H - baseH) / 2;
  const cornerR = minDim * 0.025;

  const platterR = minDim * DISC_RADIUS_BY_SIZE["12inch"] * PLATTER_RADIUS_RATIO;
  const platterCx = W * 0.42;
  const platterCy = H * 0.46;

  const isLight = colorScheme === "light";

  ctx.save();
  ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
  ctx.shadowBlur = minDim * 0.04;
  ctx.shadowOffsetX = minDim * 0.008;
  ctx.shadowOffsetY = minDim * 0.008;

  const frameGrad = ctx.createLinearGradient(baseX, baseY, baseX, baseY + baseH);
  if (isLight) {
    frameGrad.addColorStop(0, "#d4c8b8");
    frameGrad.addColorStop(0.15, "#c8bca8");
    frameGrad.addColorStop(0.5, "#b8a898");
    frameGrad.addColorStop(0.85, "#c0b4a4");
    frameGrad.addColorStop(1, "#a89888");
  } else {
    frameGrad.addColorStop(0, "#5a4a3a");
    frameGrad.addColorStop(0.15, "#4a3a2a");
    frameGrad.addColorStop(0.5, "#3d2e20");
    frameGrad.addColorStop(0.85, "#4a3a2a");
    frameGrad.addColorStop(1, "#3a2a1a");
  }
  drawRoundedRect(ctx, baseX, baseY, baseW, baseH, cornerR);
  ctx.fillStyle = frameGrad;
  ctx.fill();
  ctx.shadowColor = "transparent";

  const inset = minDim * 0.018;
  const panelGrad = ctx.createLinearGradient(
    baseX + inset, baseY + inset,
    baseX + inset, baseY + baseH - inset
  );
  if (isLight) {
    panelGrad.addColorStop(0, "#f0ece4");
    panelGrad.addColorStop(0.3, "#e8e4dc");
    panelGrad.addColorStop(0.7, "#e0dcd4");
    panelGrad.addColorStop(1, "#d8d4cc");
  } else {
    panelGrad.addColorStop(0, "#2a2a2a");
    panelGrad.addColorStop(0.3, "#252525");
    panelGrad.addColorStop(0.7, "#202020");
    panelGrad.addColorStop(1, "#1c1c1c");
  }
  drawRoundedRect(ctx, baseX + inset, baseY + inset, baseW - inset * 2, baseH - inset * 2, cornerR - inset * 0.5);
  ctx.fillStyle = panelGrad;
  ctx.fill();

  const feltGrad = ctx.createRadialGradient(platterCx, platterCy, 0, platterCx, platterCy, platterR);
  if (isLight) {
    feltGrad.addColorStop(0, "#e8e4dc");
    feltGrad.addColorStop(0.6, "#ddd8d0");
    feltGrad.addColorStop(1, "#d0ccc4");
  } else {
    feltGrad.addColorStop(0, "#2a2a2a");
    feltGrad.addColorStop(0.6, "#222222");
    feltGrad.addColorStop(1, "#1a1a1a");
  }
  ctx.beginPath();
  ctx.arc(platterCx, platterCy, platterR, 0, Math.PI * 2);
  ctx.fillStyle = feltGrad;
  ctx.fill();

  drawStrobeDots(ctx, platterCx, platterCy, platterR, angle);

  ctx.beginPath();
  ctx.arc(platterCx, platterCy, platterR, 0, Math.PI * 2);
  ctx.strokeStyle = isLight ? "#999999" : "#555555";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(platterCx, platterCy, platterR + 1, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(0, 0, 0, 0.25)";
  ctx.lineWidth = 1;
  ctx.stroke();

  const startX = baseX + baseW * 0.10;
  const startY = baseY + baseH * 0.82;
  const btnR = minDim * 0.018;
  ctx.beginPath();
  ctx.arc(startX, startY, btnR, 0, Math.PI * 2);
  const startGrad = ctx.createRadialGradient(startX - 1, startY - 1, 0, startX, startY, btnR);
  if (isLight) {
    startGrad.addColorStop(0, "#cccccc");
    startGrad.addColorStop(0.5, "#b0b0b0");
    startGrad.addColorStop(1, "#999999");
  } else {
    startGrad.addColorStop(0, "#3a3a3a");
    startGrad.addColorStop(0.5, "#2a2a2a");
    startGrad.addColorStop(1, "#1a1a1a");
  }
  ctx.fillStyle = startGrad;
  ctx.fill();
  ctx.strokeStyle = isLight ? "#888888" : "#444444";
  ctx.lineWidth = 0.8;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(startX, startY, btnR * 0.35, 0, Math.PI * 2);
  ctx.fillStyle = isLight ? "#555555" : "#666666";
  ctx.fill();

  const sp33X = startX + btnR * 3.2;
  const sp33Y = startY;
  const spBtnR = minDim * 0.012;
  ctx.beginPath();
  ctx.arc(sp33X, sp33Y, spBtnR, 0, Math.PI * 2);
  ctx.fillStyle = isLight ? "#e0e0e0" : "#1a1a1a";
  ctx.fill();
  ctx.strokeStyle = isLight ? "#888888" : "#444444";
  ctx.lineWidth = 0.6;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(sp33X, sp33Y, minDim * 0.003, 0, Math.PI * 2);
  ctx.fillStyle = "#4488ff";
  ctx.fill();

  const sp45X = sp33X + spBtnR * 3;
  ctx.beginPath();
  ctx.arc(sp45X, sp33Y, spBtnR, 0, Math.PI * 2);
  ctx.fillStyle = isLight ? "#e0e0e0" : "#1a1a1a";
  ctx.fill();
  ctx.strokeStyle = isLight ? "#888888" : "#444444";
  ctx.lineWidth = 0.6;
  ctx.stroke();

  const pitchX = baseX + baseW * 0.94;
  const pitchTopY = baseY + baseH * 0.50;
  const pitchBotY = baseY + baseH * 0.78;
  const pitchW = minDim * 0.012;
  ctx.fillStyle = isLight ? "#d0d0d0" : "#1a1a1a";
  ctx.fillRect(pitchX - pitchW / 2, pitchTopY, pitchW, pitchBotY - pitchTopY);
  ctx.strokeStyle = isLight ? "#999999" : "#3a3a3a";
  ctx.lineWidth = 0.5;
  ctx.strokeRect(pitchX - pitchW / 2, pitchTopY, pitchW, pitchBotY - pitchTopY);
  const pitchMidY = (pitchTopY + pitchBotY) / 2;
  const knobH = minDim * 0.012;
  ctx.fillStyle = isLight ? "#d0d0d0" : "#1a1a1a";
  ctx.fillRect(pitchX - pitchW * 0.8, pitchMidY - knobH / 2, pitchW * 1.6, knobH);
  const knobGrad = ctx.createLinearGradient(pitchX - pitchW, pitchMidY, pitchX + pitchW, pitchMidY);
  if (isLight) {
    knobGrad.addColorStop(0, "#aaaaaa");
    knobGrad.addColorStop(0.3, "#cccccc");
    knobGrad.addColorStop(0.5, "#dddddd");
    knobGrad.addColorStop(0.7, "#cccccc");
    knobGrad.addColorStop(1, "#aaaaaa");
  } else {
    knobGrad.addColorStop(0, "#555555");
    knobGrad.addColorStop(0.3, "#888888");
    knobGrad.addColorStop(0.5, "#999999");
    knobGrad.addColorStop(0.7, "#888888");
    knobGrad.addColorStop(1, "#555555");
  }
  ctx.fillStyle = knobGrad;
  ctx.fillRect(pitchX - pitchW * 0.7, pitchMidY - knobH * 0.4, pitchW * 1.4, knobH * 0.8);
  ctx.strokeStyle = isLight ? "#888888" : "#333333";
  ctx.lineWidth = 0.4;
  ctx.strokeRect(pitchX - pitchW * 0.7, pitchMidY - knobH * 0.4, pitchW * 1.4, knobH * 0.8);

  // アームレスト（停止時にアームを置く支架）: ピボットの右下
  const restX = baseX + baseW * 0.82;
  const restY = baseY + baseH * 0.28;
  const restW = minDim * 0.025;
  const restH = minDim * 0.018;

  ctx.fillStyle = "#1a1a1a";
  ctx.beginPath();
  ctx.roundRect(restX - restW * 0.5, restY - restH * 0.5, restW, restH, 2);
  ctx.fill();
  ctx.strokeStyle = "#444444";
  ctx.lineWidth = 0.6;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(restX, restY, minDim * 0.005, 0, Math.PI * 2);
  ctx.fillStyle = "#333333";
  ctx.fill();

  ctx.restore();
}

export function drawRecordPlayerBackground(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  canvasWidth: number,
  canvasHeight: number,
  rpm: RecordPlayerRpm,
  discStyle: DiscStyle,
  discSize: DiscSize,
  elapsedSec: number,
  isPlaying: boolean,
  deltaMs: number,
  colorScheme: RecordPlayerColorScheme = "dark"
): void {
  const minDim = Math.min(canvasWidth, canvasHeight);
  const radius = minDim * DISC_RADIUS_BY_SIZE[discSize];
  const platterCx = canvasWidth * 0.42;
  const platterCy = canvasHeight * 0.46;

  advanceRecordDiscRotation(rpm, isPlaying, deltaMs, elapsedSec);

  const isLight = colorScheme === "light";
  ctx.fillStyle = isLight ? "rgba(240, 236, 228, 1.0)" : "rgba(18, 15, 12, 1.0)";
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  const ambGrad = ctx.createRadialGradient(platterCx, platterCy, 0, platterCx, platterCy, minDim * 0.6);
  ambGrad.addColorStop(0, "rgba(40, 30, 20, 0.2)");
  ambGrad.addColorStop(0.5, "rgba(20, 15, 10, 0.1)");
  ambGrad.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = ambGrad;
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  drawTurntableBase(ctx, canvasWidth, canvasHeight, state.angle, colorScheme);

  ctx.save();
  ctx.translate(platterCx, platterCy);
  ctx.rotate((state.angle * Math.PI) / 180);
  drawStyledDiscBackground(ctx, image, 0, 0, radius, discStyle, discSize);
  ctx.restore();

  const pinSize = Math.max(2, minDim * 0.004);
  const pinGrad = ctx.createRadialGradient(platterCx - 0.5, platterCy - 0.5, 0, platterCx, platterCy, pinSize + 1.5);
  pinGrad.addColorStop(0, "#cccccc");
  pinGrad.addColorStop(0.5, "#999999");
  pinGrad.addColorStop(1, "#666666");
  ctx.beginPath();
  ctx.arc(platterCx, platterCy, pinSize + 1.5, 0, Math.PI * 2);
  ctx.fillStyle = "#333333";
  ctx.fill();
  ctx.beginPath();
  ctx.arc(platterCx, platterCy, pinSize, 0, Math.PI * 2);
  ctx.fillStyle = pinGrad;
  ctx.fill();
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * Math.min(1, Math.max(0, t));
}

/** ターンテーブル針先の disc 中心からの半径比（1 = 盤面最外周） */
export function tonearmNeedleRadiusRatio(
  progress: number,
  groovePos: number,
  discSize: DiscSize = "12inch",
  canvasSize = 1000
): number {
  const discRadius = canvasSize * DISC_RADIUS_BY_SIZE[discSize];
  const platterCx = canvasSize * 0.42;
  const platterCy = canvasSize * 0.46;

  const pivotX = canvasSize * 0.78;
  const pivotY = canvasSize * 0.18;

  const baseW = canvasSize * 0.96;
  const baseH = canvasSize * 0.92;
  const baseX = (canvasSize - baseW) / 2;
  const baseY = (canvasSize - baseH) / 2;

  const restAngle = Math.atan2(
    (baseY + baseH * 0.28) - pivotY,
    (baseX + baseW * 0.82) - pivotX
  );
  const edgeAngle = Math.atan2(platterCy - pivotY, (platterCx + discRadius) - pivotX);
  const armLength = Math.hypot((platterCx + discRadius) - pivotX, platterCy - pivotY);

  const innerR = discRadius * GROOVE_INNER_RADIUS_RATIO;
  const endAngle = Math.atan2(platterCy - pivotY, (platterCx + innerR) - pivotX);

  const loweredAngle = progress <= 0 ? restAngle : lerp(restAngle, edgeAngle, progress);
  const currentAngle = loweredAngle + groovePos * (endAngle - edgeAngle);

  const headX = pivotX + armLength * Math.cos(currentAngle);
  const headY = pivotY + armLength * Math.sin(currentAngle);
  return Math.hypot(headX - platterCx, headY - platterCy) / discRadius;
}

export function updateTonearmState(
  isPlaying: boolean,
  playbackProgress: number | null,
  deltaTimeMs: number
): boolean {
  const prevWasPlaying = state.wasPlaying;

  if (isPlaying && !prevWasPlaying) {
    state.tonearmProgress = 0;
    state.groovePosition = INITIAL_GROOVE_OFFSET;
    state.armIsLowered = false;
  }

  if (!isPlaying && prevWasPlaying) {
    state.armIsLowered = false;
  }

  state.wasPlaying = isPlaying;

  const lerpFactor = (TONEARM_LERP_SPEED * deltaTimeMs) / 1000;

  if (isPlaying) {
    state.tonearmProgress = lerp(state.tonearmProgress, 1, lerpFactor);
    state.armIsLowered = state.tonearmProgress >= 0.98;

    if (playbackProgress != null && state.armIsLowered) {
      state.groovePosition = playbackProgress;
    }
  } else {
    state.tonearmProgress = lerp(state.tonearmProgress, 0, lerpFactor * 0.6);
    state.groovePosition = lerp(state.groovePosition, 0, lerpFactor * 0.3);
    state.armIsLowered = false;
    if (state.tonearmProgress < 0.005) state.tonearmProgress = 0;
    if (state.groovePosition < 0.005) state.groovePosition = 0;
  }

  return state.armIsLowered;
}

export function isTonearmReady(): boolean {
  return state.armIsLowered;
}

export function drawRecordPlayerOverlay(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  isPlaying: boolean,
  deltaTimeMs: number,
  discSize: DiscSize = "12inch"
): void {
  const now = performance.now();
  if (state.lastTimestampMs === 0) state.lastTimestampMs = now;
  state.lastTimestampMs = now;

  const minDim = Math.min(canvasWidth, canvasHeight);
  const discRadius = minDim * DISC_RADIUS_BY_SIZE[discSize];

  drawTonearm(ctx, canvasWidth, canvasHeight, discRadius);
}

function drawTonearm(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  discRadius: number
): void {
  const minDim = Math.min(canvasWidth, canvasHeight);
  const W = canvasWidth;
  const H = canvasHeight;

  const platterCx = W * 0.42;
  const platterCy = H * 0.46;

  const pivotX = W * 0.78;
  const pivotY = H * 0.18;

  const baseW = W * 0.96;
  const baseH = H * 0.92;
  const baseX = (W - baseW) / 2;
  const baseY = (H - baseH) / 2;

  const restAngle = Math.atan2(
    (baseY + baseH * 0.28) - pivotY,
    (baseX + baseW * 0.82) - pivotX
  );
  const edgeAngle = Math.atan2(platterCy - pivotY, (platterCx + discRadius) - pivotX);
  const armLength = Math.hypot((platterCx + discRadius) - pivotX, platterCy - pivotY) * 1.375;

  const innerR = discRadius * GROOVE_INNER_RADIUS_RATIO;
  const endAngle = Math.atan2(platterCy - pivotY, (platterCx + innerR) - pivotX);

  const loweredAngle = state.tonearmProgress <= 0
    ? restAngle
    : lerp(restAngle, edgeAngle, state.tonearmProgress);
  const currentAngle = loweredAngle + state.groovePosition * (endAngle - edgeAngle);

  const headX = pivotX + armLength * Math.cos(currentAngle);
  const headY = pivotY + armLength * Math.sin(currentAngle);

  const armAngle = Math.atan2(headY - pivotY, headX - pivotX);

  // アーム先端の弯曲: 90%地点で浅い「へ」字（~20°）内側へ
  const BEND_RATIO = 0.90;
  const BEND_ANGLE = 0.35;
  const bendX = pivotX + armLength * BEND_RATIO * Math.cos(armAngle);
  const bendY = pivotY + armLength * BEND_RATIO * Math.sin(armAngle);
  const bentAngle = armAngle + BEND_ANGLE;
  const tipEndX = pivotX + armLength * Math.cos(currentAngle);
  const tipEndY = pivotY + armLength * Math.sin(currentAngle);

  ctx.save();

  // アーム本体（直線 tapered）: ピボット→弯曲点
  ctx.shadowColor = "rgba(0, 0, 0, 0.3)";
  ctx.shadowBlur = minDim * 0.012;
  ctx.shadowOffsetX = minDim * 0.003;
  ctx.shadowOffsetY = minDim * 0.003;

  const armWidthBase = minDim * 0.010;
  const armWidthBend = minDim * 0.005;
  const armWidthTip = minDim * 0.004;

  const perpBendX = Math.cos(armAngle + Math.PI / 2);
  const perpBendY = Math.sin(armAngle + Math.PI / 2);

  ctx.beginPath();
  ctx.moveTo(pivotX + perpBendX * armWidthBase, pivotY + perpBendY * armWidthBase);
  ctx.lineTo(bendX + perpBendX * armWidthBend, bendY + perpBendY * armWidthBend);
  const perpTipX = Math.cos(bentAngle + Math.PI / 2);
  const perpTipY = Math.sin(bentAngle + Math.PI / 2);
  ctx.lineTo(tipEndX + perpTipX * armWidthTip, tipEndY + perpTipY * armWidthTip);
  ctx.lineTo(tipEndX - perpTipX * armWidthTip, tipEndY - perpTipY * armWidthTip);
  ctx.lineTo(bendX - perpBendX * armWidthBend, bendY - perpBendY * armWidthBend);
  ctx.lineTo(pivotX - perpBendX * armWidthBase, pivotY - perpBendY * armWidthBase);
  ctx.closePath();

  const armGrad = ctx.createLinearGradient(
    pivotX + perpBendX * armWidthBase * 2,
    pivotY + perpBendY * armWidthBase * 2,
    pivotX - perpBendX * armWidthBase * 2,
    pivotY - perpBendY * armWidthBase * 2
  );
  armGrad.addColorStop(0, "#888888");
  armGrad.addColorStop(0.2, "#aaaaaa");
  armGrad.addColorStop(0.4, "#cccccc");
  armGrad.addColorStop(0.5, "#dddddd");
  armGrad.addColorStop(0.6, "#cccccc");
  armGrad.addColorStop(0.8, "#999999");
  armGrad.addColorStop(1, "#777777");
  ctx.fillStyle = armGrad;
  ctx.fill();
  ctx.shadowColor = "transparent";

  ctx.strokeStyle = "rgba(50, 50, 50, 0.4)";
  ctx.lineWidth = 0.5;
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(pivotX, pivotY);
  ctx.lineTo(bendX, bendY);
  ctx.lineTo(tipEndX, tipEndY);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
  ctx.lineWidth = Math.max(0.3, 0.6);
  ctx.stroke();

  // カウンターウェイト→ピボット間の接続シャフト（重りの下に描画）
  ctx.shadowColor = "rgba(0, 0, 0, 0.25)";
  ctx.shadowBlur = minDim * 0.008;
  ctx.shadowOffsetX = minDim * 0.002;
  ctx.shadowOffsetY = minDim * 0.002;

  const cwDist = armLength * 0.22;
  const cwX = pivotX - Math.cos(armAngle) * cwDist;
  const cwY = pivotY - Math.sin(armAngle) * cwDist;
  const cwRadius = minDim * 0.022;

  const shaftWidth = minDim * 0.007;
  const shaftPerpX = Math.cos(armAngle + Math.PI / 2);
  const shaftPerpY = Math.sin(armAngle + Math.PI / 2);

  ctx.beginPath();
  ctx.moveTo(cwX + shaftPerpX * shaftWidth, cwY + shaftPerpY * shaftWidth);
  ctx.lineTo(pivotX + shaftPerpX * shaftWidth, pivotY + shaftPerpY * shaftWidth);
  ctx.lineTo(pivotX - shaftPerpX * shaftWidth, pivotY - shaftPerpY * shaftWidth);
  ctx.lineTo(cwX - shaftPerpX * shaftWidth, cwY - shaftPerpY * shaftWidth);
  ctx.closePath();

  const shaftGrad = ctx.createLinearGradient(
    cwX + shaftPerpX * shaftWidth * 2, cwY + shaftPerpY * shaftWidth * 2,
    cwX - shaftPerpX * shaftWidth * 2, cwY - shaftPerpY * shaftWidth * 2
  );
  shaftGrad.addColorStop(0, "#777777");
  shaftGrad.addColorStop(0.3, "#aaaaaa");
  shaftGrad.addColorStop(0.5, "#bbbbbb");
  shaftGrad.addColorStop(0.7, "#aaaaaa");
  shaftGrad.addColorStop(1, "#777777");
  ctx.fillStyle = shaftGrad;
  ctx.fill();
  ctx.shadowColor = "transparent";

  ctx.strokeStyle = "rgba(50, 50, 50, 0.3)";
  ctx.lineWidth = 0.4;
  ctx.stroke();

  // カウンターウェイト（シャフトの上に描画）
  ctx.shadowColor = "rgba(0, 0, 0, 0.35)";
  ctx.shadowBlur = minDim * 0.015;
  ctx.shadowOffsetX = minDim * 0.004;
  ctx.shadowOffsetY = minDim * 0.004;

  ctx.beginPath();
  ctx.arc(cwX, cwY, cwRadius + 1.5, 0, Math.PI * 2);
  ctx.fillStyle = "#1a1a1a";
  ctx.fill();
  const cwGrad = ctx.createRadialGradient(
    cwX - cwRadius * 0.3, cwY - cwRadius * 0.3, 0,
    cwX, cwY, cwRadius
  );
  cwGrad.addColorStop(0, "#888888");
  cwGrad.addColorStop(0.3, "#666666");
  cwGrad.addColorStop(0.7, "#444444");
  cwGrad.addColorStop(1, "#2a2a2a");
  ctx.beginPath();
  ctx.arc(cwX, cwY, cwRadius, 0, Math.PI * 2);
  ctx.fillStyle = cwGrad;
  ctx.fill();
  ctx.strokeStyle = "#222222";
  ctx.lineWidth = 0.8;
  ctx.stroke();

  const cwRingR = cwRadius * 0.55;
  ctx.beginPath();
  ctx.arc(cwX, cwY, cwRingR, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(150, 150, 150, 0.25)";
  ctx.lineWidth = 0.6;
  ctx.stroke();

  // カートリッジ（先端の小さな黒い直方体ボックス）
  // 中央に近づくにつれ「へ」字の弯曲が減り、アーム直線上に並行になる
  const cartLen = minDim * 0.035;
  const cartH = minDim * 0.016;
  const cartAngleOuter = bentAngle + 0.15;
  const cartAngleInner = armAngle + 0.05;
  const cartAngle = lerp(cartAngleOuter, cartAngleInner, state.groovePosition);

  ctx.save();
  ctx.translate(tipEndX, tipEndY);
  ctx.rotate(cartAngle);

  ctx.shadowColor = "rgba(0, 0, 0, 0.25)";
  ctx.shadowBlur = minDim * 0.004;
  ctx.shadowOffsetX = minDim * 0.002;
  ctx.shadowOffsetY = minDim * 0.002;

  const cartGrad = ctx.createLinearGradient(0, -cartH * 0.5, 0, cartH * 0.5);
  cartGrad.addColorStop(0, "#333333");
  cartGrad.addColorStop(0.3, "#252525");
  cartGrad.addColorStop(0.7, "#1a1a1a");
  cartGrad.addColorStop(1, "#111111");
  ctx.fillStyle = cartGrad;
  ctx.beginPath();
  ctx.roundRect(-2, -cartH * 0.5, cartLen + 2, cartH, 1);
  ctx.fill();
  ctx.shadowColor = "transparent";

  ctx.strokeStyle = "#3a3a3a";
  ctx.lineWidth = 0.5;
  ctx.stroke();

  // カートリッジ表面の細部（溝模様）
  ctx.strokeStyle = "rgba(60, 60, 60, 0.3)";
  ctx.lineWidth = 0.3;
  for (let i = 1; i < 4; i++) {
    const lx = cartLen * (i / 4);
    ctx.beginPath();
    ctx.moveTo(lx, -cartH * 0.35);
    ctx.lineTo(lx, cartH * 0.35);
    ctx.stroke();
  }

  // 針（カートリッジ先端寄りから細く突き出る）
  const needleLen = minDim * 0.012;
  const needleW = minDim * 0.001;
  ctx.beginPath();
  ctx.moveTo(cartLen * 0.7, -needleW);
  ctx.lineTo(cartLen + needleLen, 0);
  ctx.lineTo(cartLen * 0.7, needleW);
  ctx.closePath();
  const needleGrad = ctx.createLinearGradient(0, -needleW, 0, needleW);
  needleGrad.addColorStop(0, "#aaaaaa");
  needleGrad.addColorStop(0.5, "#dddddd");
  needleGrad.addColorStop(1, "#888888");
  ctx.fillStyle = needleGrad;
  ctx.fill();

  ctx.restore();

  // ピボット基部（円筒形の回転軸）
  const pivotRadius = minDim * 0.024;
  ctx.beginPath();
  ctx.arc(pivotX, pivotY, pivotRadius + minDim * 0.005, 0, Math.PI * 2);
  ctx.fillStyle = "#1a1a1a";
  ctx.fill();
  const pivGrad = ctx.createRadialGradient(
    pivotX - pivotRadius * 0.3, pivotY - pivotRadius * 0.3, 0,
    pivotX, pivotY, pivotRadius
  );
  pivGrad.addColorStop(0, "#cccccc");
  pivGrad.addColorStop(0.3, "#aaaaaa");
  pivGrad.addColorStop(0.6, "#888888");
  pivGrad.addColorStop(1, "#555555");
  ctx.beginPath();
  ctx.arc(pivotX, pivotY, pivotRadius, 0, Math.PI * 2);
  ctx.fillStyle = pivGrad;
  ctx.fill();
  ctx.strokeStyle = "#444444";
  ctx.lineWidth = 0.8;
  ctx.stroke();

  const capRadius = minDim * 0.007;
  ctx.beginPath();
  ctx.arc(pivotX, pivotY, capRadius, 0, Math.PI * 2);
  const capGrad = ctx.createRadialGradient(
    pivotX - 0.5, pivotY - 0.5, 0,
    pivotX, pivotY, capRadius
  );
  capGrad.addColorStop(0, "#ffffff");
  capGrad.addColorStop(0.5, "#dddddd");
  capGrad.addColorStop(1, "#999999");
  ctx.fillStyle = capGrad;
  ctx.fill();

  ctx.restore();
}
