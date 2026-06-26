/**
 * レコードプレイヤー（ターンテーブル）エフェクトの描画ロジック。
 */

export type RecordPlayerRpm = number;
export type DiscStyle = "full" | "groove";
export type DiscSize = "compact" | "edge";

const rpmToDegPerSec = (rpm: number): number => (rpm * 360) / 60;

const DISC_RADIUS_BY_SIZE: Record<DiscSize, number> = {
  compact: 0.35,
  edge: 0.48,
};
const BASE_RADIUS_BY_SIZE: Record<DiscSize, number> = {
  compact: 0.48,
  edge: 0.56,
};
const PLATTER_RADIUS_RATIO = 1.08;

const TONEARM_REF_RADIUS_RATIO = 0.35;

// ピボット: ターンテーブル本体の右上（レコードの外）
/** ピボット: compact基準で固定（edgeでも同じ位置） */
const ARM_PIVOT_X = 0.90;
const ARM_PIVOT_Y = -0.88;
// カウンターウェイト（ピボットの後方）
const ARM_COUNTERWEIGHT_X = -0.18;
const ARM_COUNTERWEIGHT_Y = -0.12;

const TONEARM_LERP_SPEED = 2.5;
/** 針が降りるまでの時間（秒） */
const ARM_LOWER_DELAY_SEC = 1.5;
/** 曲終了後に針が戻る時間（秒） */
const ARM_RETURN_DELAY_SEC = 3.0;

interface ModuleState {
  offscreenCanvas: OffscreenCanvas | null;
  offscreenCtx: OffscreenCanvasRenderingContext2D | null;
  offscreenSize: number;
  offscreenImageKey: string;
  angle: number;
  /** 針の降下進行度（0=待機、1=レコード上） */
  tonearmProgress: number;
  /** グルーブ上の位置（0=外周、1=中心） */
  groovePosition: number;
  /** 再生開始時刻（針が下りきってからの再生開始遅延用） */
  armLowerStartTimeMs: number;
  /** 針が降りきったか */
  armIsLowered: boolean;
  /** 前フレームの再生状態 */
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
  armLowerStartTimeMs: 0,
  armIsLowered: false,
  wasPlaying: false,
  lastTimestampMs: 0,
};

/** 全てのトーンアーム状態をリセット */
export function clearRecordPlayerCache(): void {
  state.offscreenCanvas = null;
  state.offscreenCtx = null;
  state.offscreenSize = 0;
  state.offscreenImageKey = "";
  state.tonearmProgress = 0;
  state.groovePosition = 0;
  state.armLowerStartTimeMs = 0;
  state.armIsLowered = false;
  state.wasPlaying = false;
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
  ctx.strokeStyle = "rgba(40, 40, 40, 0.35)";
  ctx.lineWidth = 0.5;
  const grooveCount = Math.floor(radius * 0.25);
  const innerR = radius * innerRatio;
  const outerR = radius * outerRatio;
  for (let i = 0; i < grooveCount; i++) {
    const t = i / grooveCount;
    const r = innerR + (outerR - innerR) * t;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawStyledDiscBackground(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  cx: number,
  cy: number,
  radius: number,
  style: DiscStyle
): void {
  ctx.save();
  if (style === "full") {
    const { canvas } = ensureOffscreenCircle(image, radius * 2);
    ctx.drawImage(canvas, cx - radius, cy - radius, radius * 2, radius * 2);
    drawGroovePattern(ctx, cx, cy, radius, 0.12, 0.92);
  } else if (style === "groove") {
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fillStyle = "#111111";
    ctx.fill();
    const innerRadius = radius * 0.20;
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
    const labelRadius = radius * 0.18;
    ctx.beginPath();
    ctx.arc(cx, cy, labelRadius, 0, Math.PI * 2);
    ctx.fillStyle = "#2a2a3a";
    ctx.fill();
    drawGroovePattern(ctx, cx, cy, radius, 0.22, 0.92);
  }
  ctx.restore();
}

function drawTurntableBase(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  discSize: DiscSize
): void {
  const minDim = Math.min(canvasWidth, canvasHeight);
  const baseRadius = minDim * BASE_RADIUS_BY_SIZE[discSize];
  const discRadius = minDim * DISC_RADIUS_BY_SIZE[discSize];
  const cx = canvasWidth / 2;
  const cy = canvasHeight / 2;

  ctx.save();
  ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
  ctx.shadowBlur = 30;
  ctx.shadowOffsetX = 6;
  ctx.shadowOffsetY = 6;

  const baseGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, baseRadius);
  baseGrad.addColorStop(0, "#3d3530");
  baseGrad.addColorStop(0.5, "#2e2822");
  baseGrad.addColorStop(0.85, "#252018");
  baseGrad.addColorStop(1, "#1a1612");
  ctx.beginPath();
  ctx.arc(cx, cy, baseRadius, 0, Math.PI * 2);
  ctx.fillStyle = baseGrad;
  ctx.fill();
  ctx.shadowColor = "transparent";

  ctx.strokeStyle = "rgba(80, 70, 55, 0.12)";
  ctx.lineWidth = 1;
  for (let i = 0; i < 12; i++) {
    const r = baseRadius * (0.55 + i * 0.038);
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  const rimGrad = ctx.createRadialGradient(cx, cy, baseRadius - 4, cx, cy, baseRadius);
  rimGrad.addColorStop(0, "#555555");
  rimGrad.addColorStop(0.5, "#777777");
  rimGrad.addColorStop(1, "#444444");
  ctx.beginPath();
  ctx.arc(cx, cy, baseRadius, 0, Math.PI * 2);
  ctx.strokeStyle = rimGrad;
  ctx.lineWidth = 3;
  ctx.stroke();

  const platterRadius = discRadius * PLATTER_RADIUS_RATIO;
  const feltGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, platterRadius);
  feltGrad.addColorStop(0, "#2a2a2a");
  feltGrad.addColorStop(0.8, "#222222");
  feltGrad.addColorStop(1, "#1a1a1a");
  ctx.beginPath();
  ctx.arc(cx, cy, platterRadius, 0, Math.PI * 2);
  ctx.fillStyle = feltGrad;
  ctx.fill();

  ctx.beginPath();
  ctx.arc(cx, cy, platterRadius, 0, Math.PI * 2);
  ctx.strokeStyle = "#555555";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  const selectorX = cx - baseRadius * 0.45;
  const selectorY = cy + baseRadius * 0.65;
  ctx.beginPath();
  ctx.arc(selectorX, selectorY, 6, 0, Math.PI * 2);
  ctx.fillStyle = "#555555";
  ctx.fill();
  ctx.strokeStyle = "#777777";
  ctx.lineWidth = 1;
  ctx.stroke();

  const powerX = cx + baseRadius * 0.45;
  const powerY = cy + baseRadius * 0.65;
  ctx.beginPath();
  ctx.arc(powerX, powerY, 5, 0, Math.PI * 2);
  ctx.fillStyle = "#cc3333";
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
  elapsedSec: number
): void {
  const minDim = Math.min(canvasWidth, canvasHeight);
  const radius = minDim * DISC_RADIUS_BY_SIZE[discSize];
  const cx = canvasWidth / 2;
  const cy = canvasHeight / 2;

  ctx.fillStyle = "rgba(20, 18, 15, 1.0)";
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  drawTurntableBase(ctx, canvasWidth, canvasHeight, discSize);

  const degPerSec = rpmToDegPerSec(rpm);
  state.angle = (elapsedSec * degPerSec) % 360;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((state.angle * Math.PI) / 180);
  drawStyledDiscBackground(ctx, image, 0, 0, radius, discStyle);
  ctx.restore();

  ctx.save();
  const pinGrad = ctx.createRadialGradient(cx - 1, cy - 1, 0, cx, cy, 4);
  pinGrad.addColorStop(0, "#bbbbbb");
  pinGrad.addColorStop(1, "#666666");
  ctx.beginPath();
  ctx.arc(cx, cy, 4, 0, Math.PI * 2);
  ctx.fillStyle = pinGrad;
  ctx.fill();
  ctx.restore();
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * Math.min(1, Math.max(0, t));
}

/**
 * トーンアームの状態を更新し、再生可能かどうかを返す。
 * @param isPlaying 再生中か
 * @param playbackProgress  曲の進行度（0〜1）。nullなら未再生
 * @param deltaTimeMs フレーム間隔(ms)
 * @returns armReady 針がレコード上に降りきったか
 */
export function updateTonearmState(
  isPlaying: boolean,
  playbackProgress: number | null,
  deltaTimeMs: number
): boolean {
  const prevWasPlaying = state.wasPlaying;

  if (isPlaying && !prevWasPlaying) {
    // 再生開始: 針を下ろすアニメーション開始（初期位置から）
    state.tonearmProgress = 0;
    state.groovePosition = 0;
    state.armLowerStartTimeMs = performance.now();
    state.armIsLowered = false;
  }

  if (!isPlaying && prevWasPlaying) {
    // 再生終了: 針を戻すアニメーション開始（groovePositionをリセット）
    state.armIsLowered = false;
  }

  state.wasPlaying = isPlaying;

  const lerpFactor = (TONEARM_LERP_SPEED * deltaTimeMs) / 1000;

  if (isPlaying) {
    // 再生中: 針を下ろす
    state.tonearmProgress = lerp(state.tonearmProgress, 1, lerpFactor);
    state.armIsLowered = state.tonearmProgress >= 0.98;

    // グルーブ上の位置を進行に合わせて更新（外周→内周）
    if (playbackProgress != null && state.armIsLowered) {
      state.groovePosition = playbackProgress;
    }
  } else {
    // 停止中: 針を戻す
    state.tonearmProgress = lerp(state.tonearmProgress, 0, lerpFactor * 0.6);
    state.groovePosition = lerp(state.groovePosition, 0, lerpFactor * 0.3);
    state.armIsLowered = false;
    // 閾値以下になったら完全に0にスナップ
    if (state.tonearmProgress < 0.005) state.tonearmProgress = 0;
    if (state.groovePosition < 0.005) state.groovePosition = 0;
  }

  return state.armIsLowered;
}

/** 針が下りきってから再生開始するか */
export function isTonearmReady(): boolean {
  return state.armIsLowered;
}

export function drawRecordPlayerOverlay(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  isPlaying: boolean,
  deltaTimeMs: number,
  discSize: DiscSize = "compact"
): void {
  const now = performance.now();
  if (state.lastTimestampMs === 0) state.lastTimestampMs = now;
  state.lastTimestampMs = now;

  const minDim = Math.min(canvasWidth, canvasHeight);
  const radius = minDim * DISC_RADIUS_BY_SIZE[discSize];
  const cx = canvasWidth / 2;
  const cy = canvasHeight / 2;

  // ピボットはcompact基準で固定（edgeでも同じ位置）
  const refBaseRadius = minDim * BASE_RADIUS_BY_SIZE["compact"];
  const pivotScale = 1.0;

  const refRadius = minDim * TONEARM_REF_RADIUS_RATIO;
  const armScale = radius / refRadius;

  drawTonearm(
    ctx, cx, cy, refRadius, refBaseRadius, pivotScale, armScale,
    state.tonearmProgress, state.groovePosition
  );
}

function drawTonearm(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  discRefRadius: number,
  baseRefRadius: number,
  pivotScale: number,
  armScale: number,
  progress: number,
  groovePos: number
): void {
  // ピボット位置はターンテーブル本体（baseRadius）基準で計算
  const pivotX = cx + baseRefRadius * ARM_PIVOT_X * pivotScale;
  const pivotY = cy + baseRefRadius * ARM_PIVOT_Y * pivotScale;

  // レコード外周の半径（縁）
  const discRadius = discRefRadius * armScale;
  const outerRadius = discRadius;

  // レコード上の時計位置を角度に変換（12時=上、時計回り）
  const clockToAngle = (hour: number) => (hour * 30 - 90) * (Math.PI / 180);

  // 再生開始位置: 5時の方向（レコード外周の縁）
  const angle5 = clockToAngle(5);
  const tipPlayX = cx + outerRadius * Math.cos(angle5);
  const tipPlayY = cy + outerRadius * Math.sin(angle5);

  // アーム長: ピボットから再生開始位置（外周縁）まで × 3/4 × 1.1（10%延長）
  const armLength = Math.hypot(tipPlayX - pivotX, tipPlayY - pivotY) * 0.825;

  // 停止時: 垂直から反時計回りに5度（真下より少し左）
  const restAngle = Math.PI / 2 - (5 * Math.PI / 180);

  // 再生開始時のアーム角度（ピボット→外周縁）
  const playAngle = Math.atan2(tipPlayY - pivotY, tipPlayX - pivotX);

  // 再生終了位置: 6時の方向（内周付近）
  const angle6 = clockToAngle(6);
  const innerRadius = discRadius * 0.25;
  const tipEndX = cx + innerRadius * Math.cos(angle6);
  const tipEndY = cy + innerRadius * Math.sin(angle6);

  // 再生終了時のアーム角度（ピボット→内周境界）
  const endAngle = Math.atan2(tipEndY - pivotY, tipEndX - pivotX);

  // progress(0→1): 垂直(停止)→5時(レコード上)
  // groovePos(0→1): 5時→6時(内周方向)
  const loweredAngle = progress <= 0
    ? restAngle
    : lerp(restAngle, playAngle, progress);
  const currentAngle = loweredAngle + groovePos * (endAngle - playAngle);

  // ヘッド位置: 固定長のアームを回転させて計算
  const headX = pivotX + armLength * Math.cos(currentAngle);
  const headY = pivotY + armLength * Math.sin(currentAngle);

  const cwX = pivotX + baseRefRadius * ARM_COUNTERWEIGHT_X * pivotScale;
  const cwY = pivotY + baseRefRadius * ARM_COUNTERWEIGHT_Y * pivotScale;

  const armWidth = Math.max(15, 25 * armScale);
  const headLen = Math.max(40, 70 * armScale);

  ctx.save();

  // --- カウンターウェイト ---
  ctx.shadowColor = "rgba(0, 0, 0, 0.25)";
  ctx.shadowBlur = 4;
  ctx.shadowOffsetX = 1;
  ctx.shadowOffsetY = 2;
  const cwRadius = Math.max(5, 8 * armScale);
  ctx.beginPath();
  ctx.arc(cwX, cwY, cwRadius, 0, Math.PI * 2);
  const cwGrad = ctx.createRadialGradient(cwX - 2, cwY - 2, 0, cwX, cwY, cwRadius);
  cwGrad.addColorStop(0, "#888888");
  cwGrad.addColorStop(0.6, "#555555");
  cwGrad.addColorStop(1, "#333333");
  ctx.fillStyle = cwGrad;
  ctx.fill();
  ctx.strokeStyle = "#222222";
  ctx.lineWidth = 0.8;
  ctx.stroke();
  ctx.shadowColor = "transparent";

  // --- アーム本体（三角形: 根元が太く先端が細い） ---
  ctx.shadowColor = "rgba(0, 0, 0, 0.35)";
  ctx.shadowBlur = 8;
  ctx.shadowOffsetX = 3;
  ctx.shadowOffsetY = 3;

  const armAngle = Math.atan2(headY - pivotY, headX - pivotX);
  const perpX = Math.cos(armAngle + Math.PI / 2);
  const perpY = Math.sin(armAngle + Math.PI / 2);

  const baseHalf = armWidth * 0.6;
  const tipHalf = Math.max(0.5, 1.0 * armScale);

  ctx.beginPath();
  ctx.moveTo(pivotX + perpX * baseHalf, pivotY + perpY * baseHalf);
  ctx.lineTo(headX + perpX * tipHalf, headY + perpY * tipHalf);
  ctx.lineTo(headX - perpX * tipHalf, headY - perpY * tipHalf);
  ctx.lineTo(pivotX - perpX * baseHalf, pivotY - perpY * baseHalf);
  ctx.closePath();

  const armGrad = ctx.createLinearGradient(
    pivotX + perpX * armWidth, pivotY + perpY * armWidth,
    pivotX - perpX * armWidth, pivotY - perpY * armWidth
  );
  armGrad.addColorStop(0, "#999999");
  armGrad.addColorStop(0.3, "#cccccc");
  armGrad.addColorStop(0.5, "#dddddd");
  armGrad.addColorStop(0.7, "#bbbbbb");
  armGrad.addColorStop(1, "#777777");
  ctx.fillStyle = armGrad;
  ctx.fill();
  ctx.shadowColor = "transparent";

  ctx.beginPath();
  ctx.moveTo(pivotX + perpX * baseHalf * 0.15, pivotY + perpY * baseHalf * 0.15);
  ctx.lineTo(headX + perpX * tipHalf * 0.15, headY + perpY * tipHalf * 0.15);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";
  ctx.lineWidth = Math.max(0.5, 1 * armScale);
  ctx.stroke();

  // --- 先端の箱（レコード針ホルダ） ---
  const boxLen = Math.max(30, 50 * armScale);
  const boxH = Math.max(15, 25 * armScale);

  ctx.save();
  ctx.translate(headX, headY);
  ctx.rotate(armAngle);
  const boxGrad = ctx.createLinearGradient(0, -boxH * 0.5, 0, boxH * 0.5);
  boxGrad.addColorStop(0, "#aaaaaa");
  boxGrad.addColorStop(0.3, "#dddddd");
  boxGrad.addColorStop(0.7, "#bbbbbb");
  boxGrad.addColorStop(1, "#777777");
  ctx.fillStyle = boxGrad;
  ctx.fillRect(0, -boxH * 0.5, boxLen, boxH);
  ctx.strokeStyle = "#666666";
  ctx.lineWidth = 0.8;
  ctx.strokeRect(0, -boxH * 0.5, boxLen, boxH);
  ctx.restore();

  // --- ピボット（回転軸） ---
  const pivotRadius = Math.max(6, 10 * armScale);
  ctx.beginPath();
  ctx.arc(pivotX, pivotY, pivotRadius + Math.max(2, 3 * armScale), 0, Math.PI * 2);
  ctx.fillStyle = "#222222";
  ctx.fill();
  ctx.beginPath();
  ctx.arc(pivotX, pivotY, pivotRadius, 0, Math.PI * 2);
  const pivGrad = ctx.createRadialGradient(
    pivotX - pivotRadius * 0.3, pivotY - pivotRadius * 0.3, 0,
    pivotX, pivotY, pivotRadius
  );
  pivGrad.addColorStop(0, "#cccccc");
  pivGrad.addColorStop(0.4, "#aaaaaa");
  pivGrad.addColorStop(0.8, "#777777");
  pivGrad.addColorStop(1, "#444444");
  ctx.fillStyle = pivGrad;
  ctx.fill();
  ctx.strokeStyle = "#333333";
  ctx.lineWidth = 1;
  ctx.stroke();
  const capRadius = Math.max(2, 3.5 * armScale);
  ctx.beginPath();
  ctx.arc(pivotX, pivotY, capRadius, 0, Math.PI * 2);
  const capGrad = ctx.createRadialGradient(
    pivotX - 1, pivotY - 1, 0,
    pivotX, pivotY, capRadius
  );
  capGrad.addColorStop(0, "#eeeeee");
  capGrad.addColorStop(1, "#888888");
  ctx.fillStyle = capGrad;
  ctx.fill();

  ctx.restore();
}
