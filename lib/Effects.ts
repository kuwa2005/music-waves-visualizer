/**
 * オーバーレイエフェクト（スペクトラムとは独立してON/OFF可能）
 */

import { drawLaserCanvas } from "./laserEffect";

export type EffectType =
  | "none"
  | "space"
  | "spaceConstant"
  | "spaceAudio"
  | "filmGrain"
  | "vignette"
  | "rainbow"
  | "curtain"
  | "glitch"
  | "sparkle"
  | "dust"
  | "rain"
  | "snow"
  | "waterRipple"
  | "scanlines"
  | "mirrorBall"
  | "laser";

export type EffectDensity = 1 | 2 | 3;
export type AtmosphereVariant = "dust" | "sparks" | "fireflies";
export type SparkleVariant = "normal" | "heart" | "star";
export type WaterRippleVariant = "ripple" | "heart" | "firework";
export type SpaceDirection = "forward" | "backward";

export interface EffectParams {
  type: EffectType;
  density: EffectDensity;
  /** 雨・雪: 鉛直からの傾き（度）。0=真下、正で右へ傾く */
  weatherAngleDeg?: number;
  /** 雨・雪: 量 0〜1 */
  weatherAmount?: number;
  /** 雨・雪: 色 #RRGGBB */
  weatherColor?: string;
  /** 雨: 音連動感度 0〜10（0.1刻み、0=音連動オフ） */
  rainAudioSensitivity?: number;
  /** 水滴: 落下強度 0〜1（スポーン率・同時リング上限） */
  waterRippleIntensity?: number;
  /** 水滴: 波紋の色 #RRGGBB */
  waterRippleColor?: string;
  /** 描画: 種類 */
  waterRippleVariant?: WaterRippleVariant;
  /** 描画: 軽量モード（既定 ON — shadowBlur 無効・描画数制限） */
  waterRippleLightMode?: boolean;
  /** 水滴: 音連動感度 0〜10（0.1刻み、0=音連動オフ） */
  waterRippleAudioSensitivity?: number;
  /** 宇宙・きらきら・空気感: トーン色 #RRGGBB */
  effectTintColor?: string;
  /** 宇宙空間: 前進/後退 */
  spaceDirection?: SpaceDirection;
  /** 宇宙空間: 進行速度 0.2〜3.0 */
  spaceSpeed?: number;
  /** 宇宙空間: 中心 X（0〜1、左→右） */
  spaceCenterX?: number;
  /** 宇宙空間: 中心 Y（0〜1、上→下） */
  spaceCenterY?: number;
  /** きらきら: 種類 */
  sparkleVariant?: SparkleVariant;
  /** 空気感: 種類 */
  atmosphereVariant?: AtmosphereVariant;
  /** 空気感: 強度スケール 0.05〜1.0 */
  effectStrengthScale?: number;
  /** ミラーボール: 中心 X（0〜1、左→右） */
  mirrorBallX?: number;
  /** ミラーボール: 中心 Y（0〜1、上→下） */
  mirrorBallY?: number;
  /** ミラーボール: 回転速度（度/秒、負で逆回転） */
  mirrorBallRotationSpeed?: number;
  /** ミラーボール: 光源数（1〜10） */
  mirrorBallLightCount?: number;
  /** ミラーボール: 半径（画面短辺に対する比率 0.04〜0.35） */
  mirrorBallRadius?: number;
  /** ミラーボール: 鏡面ファセット数（8〜64） */
  mirrorBallFacetCount?: number;
  /** ミラーボール: きらめき強度 0〜1 */
  mirrorBallSparkle?: number;
  /** ミラーボール: 光線本数 4〜32 */
  mirrorBallBeamCount?: number;
  /** ミラーボール: 光線の広がり（度 8〜90） */
  mirrorBallBeamSpread?: number;
  /** ミラーボール: 室内の暗さ 0〜1 */
  mirrorBallAmbient?: number;
  /** ミラーボール: ハイライトの鋭さ 0〜1 */
  mirrorBallSpecular?: number;
  /** ミラーボール: 反射率 0〜1 */
  mirrorBallReflectivity?: number;
  /** ミラーボール: 主光源 X（0〜1） */
  mirrorBallLightX?: number;
  /** ミラーボール: 主光源 Y（0〜1） */
  mirrorBallLightY?: number;
  /** ミラーボール: 主光源色 #RRGGBB */
  mirrorBallLightColor?: string;
  /** ミラーボール: 主光源強度 0〜1 */
  mirrorBallLightIntensity?: number;
  /** ミラーボール: 副光源を有効化 */
  mirrorBallSecondaryEnabled?: boolean;
  mirrorBallSecondaryX?: number;
  mirrorBallSecondaryY?: number;
  mirrorBallSecondaryColor?: string;
  mirrorBallSecondaryIntensity?: number;
  /** ミラーボール: 低音で回転をブースト（BPM検出は未実装のため代替） */
  mirrorBallAudioSyncRotation?: boolean;
}

/** 音源連動用メトリクス（0〜1正規化） */
export interface AudioReactiveData {
  bass: number;      // 低域（キック・ベース）
  volume: number;    // 全体音量
  highFreq: number;  // 高域（ハイハット等）
}

// 密度→強度の変換（1=弱, 2=中, 3=強）※オーバーレイエフェクト用に強めに設定
const DENSITY_STRENGTH: Record<EffectDensity, number> = { 1: 0.55, 2: 0.8, 3: 1.0 };

// 恒星の色（温度による色の違い）
const STAR_COLORS = [
  { r: 255, g: 255, b: 255 },   // 白（高温）
  { r: 200, g: 220, b: 255 },   // 青白
  { r: 255, g: 250, b: 220 },   // 黄白
  { r: 255, g: 230, b: 180 },   // 黄
  { r: 255, g: 200, b: 150 },   // オレンジ
  { r: 255, g: 180, b: 180 },   // 赤み（低温）
];

// 宇宙空間エフェクト用パーティクル
interface SpaceParticle {
  angle: number;
  distance: number;
  spawnDistance: number;  // 出現時の距離（内側で出現した星は早く消える）
  speed: number;
  size: number;
  baseAlpha: number;
  colorIndex: number;
  twinklePhase: number;   // キラキラ用の位相（0〜2π）
  twinkleSpeed: number;
  visibilityThreshold?: number;  // 音源連動用: この値未満のaudioLevelで表示
}

type SpaceVariant = "space" | "spaceConstant" | "spaceAudio";

let spaceParticles: SpaceParticle[] = [];
let lastEffectParams: { density: EffectDensity; width: number; height: number; variant: SpaceVariant } | null = null;

const DENSITY_COUNTS: Record<EffectDensity, number> = {
  1: 50,
  2: 120,
  3: 220,
};

// 音源連動用の最大星数（密度でスケール、表示数は音源で動的制御）
const SPACE_AUDIO_MAX_COUNTS: Record<EffectDensity, number> = { 1: 100, 2: 180, 3: 280 };

// 解像度に応じた星のサイズ（最小4px、最大は従来の半分、大きい星は少なく）
function getParticleSize(width: number, height: number): number {
  const minDim = Math.min(width, height);
  const baseMax = Math.max(6, minDim / 180); // 従来の半分程度
  return 4 + (baseMax - 4) * Math.pow(Math.random(), 1.5); // 最小4、大きい星は少なく
}

function initSpaceParticles(width: number, height: number, density: EffectDensity, variant: SpaceVariant): void {
  const count = variant === "spaceAudio" ? SPACE_AUDIO_MAX_COUNTS[density] : DENSITY_COUNTS[density];
  const maxRadius = Math.sqrt(width * width + height * height) / 2 + 100;
  const minSpawnRadius = maxRadius * 0.08;   // 中央から8%離れた位置から
  const maxSpawnRadius = maxRadius * 0.25;  // 最大25%の範囲で出現
  spaceParticles = [];

  const uniformSpeed = 2.5;  // 等速版の速度
  for (let i = 0; i < count; i++) {
    const spawnDist = minSpawnRadius + Math.random() * (maxSpawnRadius - minSpawnRadius);
    const speed = variant === "spaceConstant" ? uniformSpeed : 1.5 + Math.random() * 3;
    const particle: SpaceParticle = {
      angle: Math.random() * Math.PI * 2,
      distance: spawnDist,
      spawnDistance: spawnDist,
      speed,
      size: getParticleSize(width, height),
      baseAlpha: 0.5 + Math.random() * 0.4,
      colorIndex: Math.floor(Math.random() * STAR_COLORS.length),
      twinklePhase: Math.random() * Math.PI * 2,
      twinkleSpeed: 2 + Math.random() * 4,
    };
    if (variant === "spaceAudio") {
      particle.visibilityThreshold = Math.random();  // 0〜1で表示閾値を分散
    }
    spaceParticles.push(particle);
  }
}

/**
 * 宇宙空間（ワープ）エフェクトのパーティクルを更新し、描画用データを返す
 * @param variant space=従来, spaceConstant=等速, spaceAudio=音源連動
 * @param audio 音源連動時のみ使用（音量・帯域で表示数を制御）
 */
export function updateAndGetSpaceParticles(
  width: number,
  height: number,
  density: EffectDensity,
  deltaTime: number,
  variant: SpaceVariant = "space",
  direction: SpaceDirection = "forward",
  speedScale: number = 1,
  audio?: AudioReactiveData,
  tintHex?: string,
  centerXNorm: number = 0.5,
  centerYNorm: number = 0.5
): Array<{ x: number; y: number; size: number; alpha: number; r: number; g: number; b: number }> {
  const maxRadius = Math.sqrt(width * width + height * height) / 2 + 150;
  const centerX = width * Math.max(0.05, Math.min(0.95, centerXNorm));
  const centerY = height * Math.max(0.08, Math.min(0.92, centerYNorm));

  // 密度・サイズ・バリアントが変わったら再初期化
  if (
    !lastEffectParams ||
    lastEffectParams.density !== density ||
    lastEffectParams.width !== width ||
    lastEffectParams.height !== height ||
    lastEffectParams.variant !== variant
  ) {
    initSpaceParticles(width, height, density, variant);
    lastEffectParams = { density, width, height, variant };
  }

  // 音源連動時の表示レベル（音量・帯域幅で0〜1）
  const audioLevel = audio
    ? Math.min(1, audio.volume * 0.4 + (audio.bass + audio.highFreq) / 2 * 0.6)
    : 1;

  const result: Array<{ x: number; y: number; size: number; alpha: number; r: number; g: number; b: number }> = [];
  const minSpawnRadius = maxRadius * 0.08;
  const maxSpawnRadius = maxRadius * 0.25;

  const [tintR, tintG, tintB] = parseWeatherColorHex(tintHex, [255, 255, 255]);
  const tintMix = tintHex ? 0.52 : 0;

  for (const p of spaceParticles) {
    // 音源連動: 閾値未満の星は非表示
    if (variant === "spaceAudio" && p.visibilityThreshold != null && audioLevel >= 0) {
      if (audioLevel < p.visibilityThreshold) continue;
    }

    const normalizedDist = p.distance / maxRadius;
    const normalizedSpawn = p.spawnDistance / maxRadius;

    // 速度: 等速版は一定、それ以外は中央に近いほど速く
    const speedFactor = variant === "spaceConstant" ? 1.0 : 1.5 - normalizedDist * 0.8;
    const effectiveSpeed = Math.max(0.3, p.speed * speedFactor) * (deltaTime / 16) * Math.max(0.2, Math.min(3, speedScale));
    const dir = direction === "backward" ? -1 : 1;
    p.distance += effectiveSpeed * dir;

    // キラキラ位相を更新
    p.twinklePhase += p.twinkleSpeed * (deltaTime / 1000);

    // リセット判定: 画面端に到達、または内側の星は手前で消える
    const innerStarFadeDist = maxRadius * 0.65;  // 内側で出現した星は65%で消える
    const shouldResetForward =
      p.distance > maxRadius ||
      (normalizedSpawn < 0.15 && p.distance > innerStarFadeDist);
    const shouldResetBackward = p.distance < minSpawnRadius * 0.7;
    const shouldReset = direction === "backward" ? shouldResetBackward : shouldResetForward;

    if (shouldReset) {
      p.distance =
        direction === "backward"
          ? maxRadius * (0.75 + Math.random() * 0.22)
          : minSpawnRadius + Math.random() * (maxSpawnRadius - minSpawnRadius);
      p.spawnDistance = p.distance;
      p.angle = Math.random() * Math.PI * 2;
      p.colorIndex = Math.floor(Math.random() * STAR_COLORS.length);
    }

    const x = centerX + Math.cos(p.angle) * p.distance;
    const y = centerY + Math.sin(p.angle) * p.distance;
    const currentNormDist = p.distance / maxRadius;

    // 距離によるフェード（遠くになるほどやや薄く）
    let alpha = p.baseAlpha * (1 - currentNormDist * 0.4);
    // キラキラ: 正弦波で明るさを変動
    const twinkle = 0.7 + 0.3 * Math.sin(p.twinklePhase);
    alpha *= twinkle;

    const color = STAR_COLORS[p.colorIndex];
    const r = Math.round(color.r * (1 - tintMix) + tintR * tintMix);
    const g = Math.round(color.g * (1 - tintMix) + tintG * tintMix);
    const b = Math.round(color.b * (1 - tintMix) + tintB * tintMix);
    result.push({
      x,
      y,
      size: p.size,
      alpha: Math.min(1, alpha),
      r,
      g,
      b,
    });
  }

  return result;
}

let lastTime = performance.now();

/** Canvas 2D オーバーレイ用フレーム間隔（ms） */
let lastOverlayDrawTime = performance.now();

/**
 * Canvas 2Dで宇宙空間エフェクトを描画
 * @param variant space=従来, spaceConstant=等速, spaceAudio=音源連動
 */
export function drawSpaceEffectCanvas(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  density: EffectDensity,
  variant: SpaceVariant = "space",
  direction: SpaceDirection = "forward",
  speedScale: number = 1,
  audio?: AudioReactiveData,
  tintHex?: string,
  centerXNorm: number = 0.5,
  centerYNorm: number = 0.5
): void {
  const now = performance.now();
  const deltaTime = Math.min(now - lastTime, 50);
  lastTime = now;

  const particles = updateAndGetSpaceParticles(
    width,
    height,
    density,
    deltaTime,
    variant,
    direction,
    speedScale,
    audio,
    tintHex,
    centerXNorm,
    centerYNorm
  );

  ctx.save();
  for (const p of particles) {
    ctx.fillStyle = `rgba(${p.r}, ${p.g}, ${p.b}, ${p.alpha})`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// --- フィルムグレイン（ベースに連動して強度がパルス）---
let filmGrainCanvas: HTMLCanvasElement | null = null;
let filmGrainCanvasSize = "";
let filmGrainImageData: ImageData | null = null;

function drawFilmGrainCanvas(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  density: EffectDensity,
  audio: AudioReactiveData
): void {
  if (width <= 0 || height <= 0) return;
  const baseStrength = DENSITY_STRENGTH[density];
  const pulse = 0.6 + 0.4 * audio.bass; // ベースで強度が脈動
  const strength = baseStrength * pulse;
  const sizeKey = `${width}x${height}`;
  if (!filmGrainCanvas || filmGrainCanvasSize !== sizeKey) {
    filmGrainCanvas = document.createElement("canvas");
    filmGrainCanvas.width = width;
    filmGrainCanvas.height = height;
    filmGrainCanvasSize = sizeKey;
    filmGrainImageData = null;
  }
  const grainCtx = filmGrainCanvas.getContext("2d");
  if (!grainCtx) return;
  if (!filmGrainImageData || filmGrainImageData.width !== width || filmGrainImageData.height !== height) {
    filmGrainImageData = grainCtx.createImageData(width, height);
  }
  const data = filmGrainImageData.data;
  const alpha = Math.round(255 * Math.min(0.5, strength * 0.35));
  for (let i = 0; i < data.length; i += 4) {
    const n = Math.floor(Math.random() * 256);
    data[i] = data[i + 1] = data[i + 2] = n;
    data[i + 3] = alpha;
  }
  grainCtx.putImageData(filmGrainImageData, 0, 0);
  ctx.save();
  ctx.globalAlpha = 0.35 * strength;
  ctx.drawImage(filmGrainCanvas, 0, 0);
  ctx.restore();
}

// --- ビネット（音量で暗さが変化、ベースで脈動）---
function drawVignetteCanvas(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  density: EffectDensity,
  audio: AudioReactiveData
): void {
  const baseStrength = DENSITY_STRENGTH[density];
  const dynamic = 0.5 + 0.5 * (audio.volume * 0.7 + audio.bass * 0.3);
  const strength = baseStrength * dynamic * 1.0;
  const cx = width / 2;
  const cy = height / 2;
  const maxR = Math.sqrt(cx * cx + cy * cy);
  const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, maxR);
  gradient.addColorStop(0, "rgba(0,0,0,0)");
  gradient.addColorStop(0.3, "rgba(0,0,0,0)");
  gradient.addColorStop(0.65, `rgba(0,0,0,${strength * 0.6})`);
  gradient.addColorStop(1, `rgba(0,0,0,${strength})`);
  ctx.save();
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}

// --- レインボー（音量で色相の回転速度が変化）---
let rainbowTime = 0;
function drawRainbowCanvas(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  density: EffectDensity,
  audio: AudioReactiveData
): void {
  const speed = 0.02 + 0.08 * (0.3 + 0.7 * audio.volume);
  rainbowTime += speed;
  const strength = DENSITY_STRENGTH[density] * (0.5 + 0.5 * audio.volume);
  const hue = (rainbowTime * 60) % 360;
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, `hsla(${hue}, 85%, 55%, ${strength * 0.18})`);
  gradient.addColorStop(0.5, `hsla(${(hue + 120) % 360}, 85%, 55%, ${strength * 0.12})`);
  gradient.addColorStop(1, `hsla(${(hue + 240) % 360}, 85%, 55%, ${strength * 0.18})`);
  ctx.save();
  ctx.globalCompositeOperation = "soft-light";
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}

// --- カーテン（ベースで波の速度・振幅が変化）---
let curtainTime = 0;
function drawCurtainCanvas(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  density: EffectDensity,
  audio: AudioReactiveData
): void {
  const speed = 0.02 + 0.06 * (0.4 + 0.6 * audio.bass);
  curtainTime += speed;
  const baseStrength = DENSITY_STRENGTH[density];
  const amp = 0.08 + 0.12 * audio.bass;
  const waveCount = density === 1 ? 4 : density === 2 ? 6 : 9;
  ctx.save();
  ctx.globalAlpha = baseStrength * (0.35 + 0.4 * audio.volume);
  for (let i = 0; i < waveCount; i++) {
    ctx.beginPath();
    const phase = (curtainTime + (i / waveCount) * Math.PI * 2) % (Math.PI * 2);
    for (let x = 0; x <= width + 20; x += 8) {
      const y = height / 2 + Math.sin((x / width) * Math.PI * 3 + phase) * (height * amp);
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.lineTo(width + 20, height + 20);
    ctx.lineTo(-20, height + 20);
    ctx.closePath();
    const hue = (i * 55 + curtainTime * 15 + audio.volume * 30) % 360;
    ctx.fillStyle = `hsla(${hue}, 80%, 55%, 0.7)`;
    ctx.fill();
  }
  ctx.restore();
}

// --- きらきら（白+透明度のみ。二重ストローク・中心芯・ゆるい自転。＋/X/＊。ラジアルグロウは使わない）---
interface SparkleParticle {
  x: number;
  y: number;
  driftX: number;
  driftY: number;
  baseRadius: number;
  /** 粒ごとの最大の透明度スケール（色は白固定、明るさは alpha のみ） */
  baseAlpha: number;
  /** 以前のきらきらと同じ位相速度（2.2〜4.5） */
  twinklePhase: number;
  twinkleSpeed: number;
  /** 点滅回数（1 回固定） */
  maxBlinks: number;
  /** 点灯が完了した回数（各 bright フェーズ終了時に +1） */
  blinksCompleted: number;
  phase: "dark" | "bright";
  phaseTimeLeft: number;
  brightDuration: number;
  /** 0: ＋ / 1: X / 2: ＊（8方向） */
  starKind: 0 | 1 | 2;
  /** star variant 用: true=★ false=☆ */
  starFilled: boolean;
  /** ランダム回転（ラジアン） */
  rotation: number;
  /**
   * 移動スピード倍率（1〜2）。スポーン／再出現時のみ決定し、生存中は固定。
   */
  driftSpeedMul: number;
}

let sparkleParticles: SparkleParticle[] = [];
let lastSparkleParams: { density: EffectDensity; width: number; height: number; tint: string } | null = null;

/** 弱≒従来の「強」、中間、強≒従来の強の約3倍 */
const SPARKLE_COUNTS: Record<EffectDensity, number> = { 1: 220, 2: 440, 3: 660 };

/**
 * トゥインクル位相の速度（透明度＝明るさの細かい揺らぎ用）。
 * 明暗の変化を速くするため従来の2倍。
 */
const SPARKLE_TWINKLE_RATE = (0.25 / 8) * 0.3 * 2;

/** 点灯1回の生存時間（ms）0.1〜2秒ランダム */
const SPARKLE_BRIGHT_MS_MIN = 100;
const SPARKLE_BRIGHT_MS_MAX = 2000;

/**
 * 次の点灯までの待ち（dark、ms）。広くランダムにして発生を同期させない
 * （上限は以前の約 1/4 にして、画面上の星の量を戻しつつばらつきは維持）
 */
const SPARKLE_DARK_MS_MIN = 40;
const SPARKLE_DARK_MS_MAX = 2200;

function randomSparkleDarkWait(): number {
  return SPARKLE_DARK_MS_MIN + Math.random() * (SPARKLE_DARK_MS_MAX - SPARKLE_DARK_MS_MIN);
}

/** きらきらの描画半径スケール（線の届き・太さの基準） */
const SPARKLE_RADIUS_SCALE = 1.0; // 以前 0.25 から約4倍

function getSparkleRadiusRange(minDim: number): { rLo: number; rHi: number } {
  const rLo = Math.max(3.2, minDim * 0.0036);
  const rHi = Math.max(5.5, minDim * 0.007);
  return { rLo, rHi };
}

function spawnSparkleParticle(width: number, height: number, rLo: number, rHi: number): SparkleParticle {
  return {
    x: Math.random() * width,
    y: Math.random() * height,
    driftX: (Math.random() - 0.5) * 0.35,
    driftY: (Math.random() - 0.5) * 0.35,
    driftSpeedMul: 1 + Math.random(),
    baseRadius: rLo + Math.random() * (rHi - rLo),
    baseAlpha: 0.5 + Math.random() * 0.5,
    twinklePhase: Math.random() * Math.PI * 2,
    twinkleSpeed: 2.2 + Math.random() * 4.5,
    maxBlinks: 1,
    blinksCompleted: 0,
    phase: "dark",
    phaseTimeLeft: randomSparkleDarkWait(),
    brightDuration: 0,
    starKind: Math.floor(Math.random() * 3) as 0 | 1 | 2,
    starFilled: Math.random() < 0.5,
    rotation: Math.random() * Math.PI * 2,
  };
}

function initSparkleParticles(width: number, height: number, density: EffectDensity): void {
  const { rLo, rHi } = getSparkleRadiusRange(Math.min(width, height));
  sparkleParticles = [];
  const n = SPARKLE_COUNTS[density];
  for (let i = 0; i < n; i++) {
    sparkleParticles.push(spawnSparkleParticle(width, height, rLo, rHi));
  }
}

/** WebGL / Canvas 共通のきらきら1粒の描画データ */
export type SparkleParticleDraw = {
  x: number;
  y: number;
  radius: number;
  r: number;
  g: number;
  b: number;
  alpha: number;
  starKind: 0 | 1 | 2;
  starFilled: boolean;
  sparkleVariant: SparkleVariant;
  rotation: number;
};

/**
 * WebGL 用: きらきら粒子を更新して描画用リストを返す（点灯フェーズ中のみ出力）
 */
export function updateAndGetSparkleParticles(
  width: number,
  height: number,
  density: EffectDensity,
  deltaTime: number,
  sparkleVariant: SparkleVariant = "normal",
  audio?: AudioReactiveData,
  tintHex?: string
): SparkleParticleDraw[] {
  const tintKey = (tintHex && /^#?[0-9a-fA-F]{6}$/.test(tintHex.trim()) ? tintHex.trim() : "") || "__default__";
  if (
    !lastSparkleParams ||
    lastSparkleParams.density !== density ||
    lastSparkleParams.width !== width ||
    lastSparkleParams.height !== height ||
    lastSparkleParams.tint !== tintKey
  ) {
    initSparkleParticles(width, height, density);
    lastSparkleParams = { density, width, height, tint: tintKey };
  }
  const a = audio ?? SILENT_AUDIO_REACTIVE;
  const strength = DENSITY_STRENGTH[density];
  const speedMul = 0.85 + 0.35 * a.volume;
  const { rLo, rHi } = getSparkleRadiusRange(Math.min(width, height));
  const out: SparkleParticleDraw[] = [];

  const [tintR, tintG, tintB] = parseWeatherColorHex(tintHex, [255, 255, 255]);

  for (const p of sparkleParticles) {
    const driftStep =
      (deltaTime / 16) * (0.6 + 0.4 * a.highFreq) * p.driftSpeedMul;
    p.x += p.driftX * driftStep;
    p.y += p.driftY * driftStep;
    if (p.x < -20) p.x += width + 40;
    if (p.x > width + 20) p.x -= width + 40;
    if (p.y < -20) p.y += height + 40;
    if (p.y > height + 20) p.y -= height + 40;

    p.phaseTimeLeft -= deltaTime;

    if (p.phaseTimeLeft <= 0) {
      if (p.phase === "bright") {
        p.blinksCompleted += 1;
        if (p.blinksCompleted >= p.maxBlinks) {
          Object.assign(p, spawnSparkleParticle(width, height, rLo, rHi));
          continue;
        }
        p.phase = "dark";
        p.phaseTimeLeft = randomSparkleDarkWait();
      } else {
        p.phase = "bright";
        // 生存 0.1〜2s（移動倍率 driftSpeedMul はスポーン時のまま）
        p.brightDuration =
          SPARKLE_BRIGHT_MS_MIN +
          Math.random() * (SPARKLE_BRIGHT_MS_MAX - SPARKLE_BRIGHT_MS_MIN);
        p.phaseTimeLeft = p.brightDuration;
        p.twinklePhase = Math.random() * Math.PI * 2;
        p.starKind = Math.floor(Math.random() * 3) as 0 | 1 | 2;
        p.starFilled = Math.random() < 0.5;
        p.rotation = Math.random() * Math.PI * 2;
      }
    }

    if (p.phase !== "bright" || p.brightDuration <= 0) continue;

    // ごくゆっくり回転（白＋透明度の星でも立体感が出る）
    p.rotation += (deltaTime / 1000) * 0.045;

    // トゥインクルは透明度（明るさ）だけに効かせる（色は常に白）
    p.twinklePhase +=
      p.twinkleSpeed * (deltaTime / 1000) * speedMul * SPARKLE_TWINKLE_RATE;
    // 明暗の振れ幅を広げる（暗い方をより暗く）: 従来 0.35〜1 より約2倍のコントラスト感
    const twinkleOsc = Math.pow(0.5 + 0.5 * Math.sin(p.twinklePhase), 2);
    const twinkleAlpha = 0.06 + 0.94 * twinkleOsc;

    // 点灯経過: sin(πt) をやや尖らせて山と谷の差を強める（暗→明→暗のコントラストアップ）
    const lifeT =
      p.brightDuration > 0 ? 1 - p.phaseTimeLeft / p.brightDuration : 0;
    const t = Math.min(1, Math.max(0, lifeT));
    const fadeEnvelope = Math.pow(Math.sin(Math.PI * t), 1.22);
    // 明るさ（フェード×トゥインクル）に応じて半径をわずかにスケール
    const brightnessForSize = Math.min(1, fadeEnvelope * twinkleAlpha);
    const rad =
      p.baseRadius *
      SPARKLE_RADIUS_SCALE *
      (0.96 + 0.09 * brightnessForSize);
    const alpha = Math.min(
      1,
      strength *
        p.baseAlpha *
        fadeEnvelope *
        twinkleAlpha *
        (0.92 + 0.08 * a.volume)
    );
    if (alpha < 0.02) continue;

    out.push({
      x: p.x,
      y: p.y,
      radius: rad,
      r: tintR,
      g: tintG,
      b: tintB,
      alpha,
      starKind: p.starKind,
      starFilled: p.starFilled,
      sparkleVariant,
      rotation: p.rotation,
    });
  }
  return out;
}

function drawSparkleHeartShape(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  r: number,
  g: number,
  b: number,
  a: number,
  rotation: number
): void {
  const s = Math.max(2.2, radius * 1.1);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.scale(s / 16, s / 16);
  ctx.beginPath();
  ctx.moveTo(0, 6);
  ctx.bezierCurveTo(-8, -1, -11, -8, -4, -12);
  ctx.bezierCurveTo(0, -14, 4, -11, 4, -7);
  ctx.bezierCurveTo(4, -11, 8, -14, 12, -12);
  ctx.bezierCurveTo(19, -8, 16, -1, 8, 6);
  ctx.bezierCurveTo(5, 9, 3, 11, 0, 14);
  ctx.bezierCurveTo(-3, 11, -5, 9, -8, 6);
  ctx.closePath();
  ctx.fillStyle = `rgba(${r},${g},${b},${Math.min(1, a * 0.92)})`;
  ctx.fill();
  ctx.restore();
}

function drawSparkleStarGlyph(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  r: number,
  g: number,
  b: number,
  a: number,
  starFilled: boolean
): void {
  ctx.save();
  ctx.fillStyle = `rgba(${r},${g},${b},${Math.min(1, a)})`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `${Math.max(11, Math.round(radius * 3.2))}px sans-serif`;
  ctx.fillText(starFilled ? "★" : "☆", x, y);
  ctx.restore();
}

/** ＋ / X / ＊（8方向）＋中心の白い芯（すべて rgba(255,255,255,a)） */
function drawSparkleStarShape(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  r: number,
  g: number,
  b: number,
  a: number,
  starKind: 0 | 1 | 2,
  rotation: number
): void {
  const L = radius * 1.55;
  const lineW = Math.max(0.85, radius * 0.42);
  const angles =
    starKind === 0
      ? [0, Math.PI / 2]
      : starKind === 1
        ? [Math.PI / 4, -Math.PI / 4]
        : [0, Math.PI / 4, Math.PI / 2, (3 * Math.PI) / 4];

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  // わずかに太い外縁グロー（同じ白・低 alpha で輪郭を柔らかく）
  ctx.strokeStyle = `rgba(255,255,255,${Math.min(1, a * 0.38)})`;
  ctx.lineWidth = lineW * 2.15;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  for (const phi of angles) {
    const c = Math.cos(phi);
    const s = Math.sin(phi);
    ctx.moveTo(-c * L, -s * L);
    ctx.lineTo(c * L, s * L);
  }
  ctx.stroke();

  ctx.strokeStyle = `rgba(${r},${g},${b},${a})`;
  ctx.lineWidth = lineW;
  ctx.beginPath();
  for (const phi of angles) {
    const c = Math.cos(phi);
    const s = Math.sin(phi);
    ctx.moveTo(-c * L, -s * L);
    ctx.lineTo(c * L, s * L);
  }
  ctx.stroke();

  const coreR = Math.max(0.5, lineW * 0.24);
  ctx.fillStyle = `rgba(255,255,255,${Math.min(1, a * 0.95)})`;
  ctx.beginPath();
  ctx.arc(0, 0, coreR, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawSparkleCanvas(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  density: EffectDensity,
  deltaTime: number,
  audio: AudioReactiveData,
  sparkleVariant: SparkleVariant,
  tintHex?: string
): void {
  const list = updateAndGetSparkleParticles(width, height, density, deltaTime, sparkleVariant, audio, tintHex);
  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  for (const p of list) {
    if (p.sparkleVariant === "heart") {
      drawSparkleHeartShape(ctx, p.x, p.y, p.radius, p.r, p.g, p.b, p.alpha, p.rotation);
    } else if (p.sparkleVariant === "star") {
      drawSparkleStarGlyph(ctx, p.x, p.y, p.radius, p.r, p.g, p.b, p.alpha, p.starFilled);
    } else {
      drawSparkleStarShape(
        ctx,
        p.x,
        p.y,
        p.radius,
        p.r,
        p.g,
        p.b,
        p.alpha,
        p.starKind,
        p.rotation
      );
    }
  }
  ctx.restore();
}

// --- ほこり（空気中の微粒子・低コントラスト）---
interface DustParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  baseAlpha: number;
  phase: number;
  variant: AtmosphereVariant;
}

let dustParticles: DustParticle[] = [];
let lastDustParams: { density: EffectDensity; width: number; height: number; variant: AtmosphereVariant } | null = null;

/**
 * 空気感の見え方を一括で調整する係数（確認用にやや強め）。
 * 「今の 1/N にして」ときはこの値を 1/N に近づける（例: 4 → 1 で約1/4）。
 */
export const DUST_INTENSITY_MUL = 4;

/** ほこり各粒の半径レンジ（最小・最大）を現在値の何倍にするか（1/5 = 小さく） */
const DUST_PARTICLE_SIZE_SCALE = 1 / 5;

/**
 * 大きい粒ほど出にくい（一様乱数ではなく累乗で下限寄りに分布）
 * 指数が大きいほど小粒が多くなる
 */
const DUST_SIZE_RANDOM_EXP = 2.4;

const DUST_COUNTS: Record<EffectDensity, number> = { 1: 300, 2: 560, 3: 900 };

/** sLo〜sHi の間で、大きい値ほど確率が低いサイズ */
function randomDustParticleSize(sLo: number, sHi: number): number {
  if (sHi <= sLo) return sLo;
  const t = Math.pow(Math.random(), DUST_SIZE_RANDOM_EXP);
  return sLo + t * (sHi - sLo);
}

function initDustParticles(width: number, height: number, density: EffectDensity, variant: AtmosphereVariant): void {
  const minDim = Math.min(width, height);
  const sizeBoost = 1.45 * Math.pow(DUST_INTENSITY_MUL, 0.25);
  const sLo =
    Math.max(3.5, minDim * 0.0048 * sizeBoost) * DUST_PARTICLE_SIZE_SCALE;
  const sHi =
    Math.max(6.5, minDim * 0.0095 * sizeBoost) * DUST_PARTICLE_SIZE_SCALE;
  dustParticles = [];
  const n = DUST_COUNTS[density];
  for (let i = 0; i < n; i++) {
    dustParticles.push({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * (variant === "sparks" ? 0.9 : 0.55),
      vy: (Math.random() - 0.25) * (variant === "fireflies" ? 0.24 : variant === "sparks" ? 0.78 : 0.42),
      size: randomDustParticleSize(sLo, sHi),
      baseAlpha:
        variant === "fireflies"
          ? 0.36 + Math.random() * 0.3
          : variant === "sparks"
            ? 0.3 + Math.random() * 0.34
            : 0.22 + Math.random() * 0.2,
      phase: Math.random() * Math.PI * 2,
      variant,
    });
  }
}

/**
 * WebGL 用: ほこり粒子を更新して描画用リストを返す
 */
let lastDustTintKey = "";

export function updateAndGetDustParticles(
  width: number,
  height: number,
  density: EffectDensity,
  deltaTime: number,
  variant: AtmosphereVariant = "dust",
  strengthScale: number = 1,
  audio?: AudioReactiveData,
  tintHex?: string
): Array<{ x: number; y: number; radius: number; r: number; g: number; b: number; alpha: number }> {
  const tintKey = (tintHex && /^#?[0-9a-fA-F]{6}$/.test(tintHex.trim()) ? tintHex.trim() : "") || "__default__";
  if (
    !lastDustParams ||
    lastDustParams.density !== density ||
    lastDustParams.width !== width ||
    lastDustParams.height !== height ||
    lastDustParams.variant !== variant ||
    lastDustTintKey !== tintKey
  ) {
    initDustParticles(width, height, density, variant);
    lastDustParams = { density, width, height, variant };
    lastDustTintKey = tintKey;
  }
  const a = audio ?? SILENT_AUDIO_REACTIVE;
  const strength = DENSITY_STRENGTH[density] * (0.15 + 0.85 * Math.pow(Math.max(0.05, Math.min(1, strengthScale)), 1.8));
  const flow = 0.5 + 0.5 * a.volume;
  const out: Array<{ x: number; y: number; radius: number; r: number; g: number; b: number; alpha: number }> = [];

  const [tintR, tintG, tintB] = parseWeatherColorHex(tintHex, [210, 216, 228]);
  const tintMix = tintHex ? 0.58 : 0;

  for (const p of dustParticles) {
    p.phase += 1.05 * (deltaTime / 1000);
    const localFlow =
      variant === "sparks"
        ? 1.2 + 0.8 * a.highFreq
        : variant === "fireflies"
          ? 0.45 + 0.3 * a.volume
          : flow;
    p.x += p.vx * (deltaTime / 16) * localFlow * (1 + 0.4 * a.bass);
    p.y += p.vy * (deltaTime / 16) * localFlow;
    if (variant === "fireflies") {
      p.y += Math.sin(p.phase * 0.7) * 0.35;
    }
    if (p.x < -30) p.x += width + 60;
    if (p.x > width + 30) p.x -= width + 60;
    if (p.y < -30) p.y += height + 60;
    if (p.y > height + 30) p.y -= height + 60;

    const flicker = 0.5 + 0.5 * Math.sin(p.phase);
    const rawAlpha =
      p.baseAlpha * flicker * strength * (variant === "sparks" ? 1.55 : variant === "fireflies" ? 1.1 : (1.2 + 0.45 * a.volume));
    const alpha = Math.min(1, rawAlpha * DUST_INTENSITY_MUL);
    let r = 210 + Math.floor(Math.sin(p.phase * 0.7) * 40);
    let g = 216 + Math.floor(Math.sin(p.phase * 0.8) * 24);
    let b = 228 + Math.floor(Math.sin(p.phase * 1.1) * 18);
    if (variant === "sparks") {
      r = 255;
      g = 180 + Math.floor(Math.sin(p.phase * 1.3) * 40);
      b = 90 + Math.floor(Math.sin(p.phase * 1.7) * 32);
    } else if (variant === "fireflies") {
      r = 185 + Math.floor(Math.sin(p.phase * 0.9) * 30);
      g = 255;
      b = 125 + Math.floor(Math.sin(p.phase * 1.1) * 22);
    }
    r = Math.min(255, Math.max(0, r));
    g = Math.min(255, Math.max(0, g));
    b = Math.min(255, Math.max(0, b));
    if (tintHex) {
      r = Math.round(r * (1 - tintMix) + tintR * tintMix);
      g = Math.round(g * (1 - tintMix) + tintG * tintMix);
      b = Math.round(b * (1 - tintMix) + tintB * tintMix);
    }
    out.push({
      x: p.x,
      y: p.y,
      radius: p.size * (variant === "sparks" ? 0.8 : variant === "fireflies" ? 1.25 : (1.05 + 0.08 * Math.min(DUST_INTENSITY_MUL, 4))),
      r,
      g,
      b,
      alpha,
    });
  }
  return out;
}

function drawDustCanvas(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  density: EffectDensity,
  deltaTime: number,
  variant: AtmosphereVariant,
  strengthScale: number,
  audio: AudioReactiveData,
  tintHex?: string
): void {
  const list = updateAndGetDustParticles(width, height, density, deltaTime, variant, strengthScale, audio, tintHex);
  ctx.save();
  // WebGL 側（SRC_ALPHA + ONE の単色円）に合わせ、ラジアルグロウは使わない
  ctx.globalCompositeOperation = "lighter";
  for (const p of list) {
    const rad = Math.max(1.5, p.radius);
    ctx.fillStyle = `rgba(${p.r},${p.g},${p.b},${p.alpha})`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, rad, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// --- 雨・雪（角度・量・色）---
export function parseWeatherColorHex(
  hex: string | undefined,
  fallback: [number, number, number]
): [number, number, number] {
  if (!hex || typeof hex !== "string") return fallback;
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return fallback;
  const h = m[1];
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

const RAIN_BASE_COUNTS: Record<EffectDensity, number> = { 1: 140, 2: 260, 3: 420 };
const SNOW_BASE_COUNTS: Record<EffectDensity, number> = { 1: 160, 2: 300, 3: 480 };

export const RAIN_AUDIO_SENSITIVITY_MIN = 0;
export const RAIN_AUDIO_SENSITIVITY_MAX = 10;
export const RAIN_AUDIO_SENSITIVITY_STEP = 0.1;

const RAIN_AUDIO_LEVEL_THRESHOLD = 0.35;
const RAIN_AUDIO_ENVELOPE_ATTACK = 0.32;
const RAIN_AUDIO_ENVELOPE_RELEASE = 0.14;
const RAIN_AUDIO_MAX_DROP_MUL = 0.65;
const RAIN_AUDIO_ALPHA_BOOST = 0.55;
const RAIN_AUDIO_LEN_BOOST = 0.3;
const RAIN_AUDIO_LW_BOOST = 0.15;
const RAIN_AUDIO_FLOW_VOLUME = 0.2;
const RAIN_AUDIO_FLOW_DRIVE = 0.28;

let rainAudioEnvelope = 0;

export function normalizeRainAudioSensitivity(v: number, fallback = 0): number {
  const base = Number.isFinite(v) ? v : fallback;
  const clamped = Math.max(
    RAIN_AUDIO_SENSITIVITY_MIN,
    Math.min(RAIN_AUDIO_SENSITIVITY_MAX, base)
  );
  return Math.round(clamped / RAIN_AUDIO_SENSITIVITY_STEP) * RAIN_AUDIO_SENSITIVITY_STEP;
}

/** 雨・描画エフェクト共通の音レベル 0〜1 */
function resolveEffectAudioLevel(audio: AudioReactiveData): number {
  return Math.max(0, Math.min(1, Math.max(audio.volume, audio.bass * 0.75)));
}

/**
 * 閾値超過分の正規化 excess（閾値以下は 0）。
 * サビ揺れ resolveChorusExcessAboveThreshold と同型: (level - threshold) / (1 - threshold)。
 */
export function resolveAudioExcessAboveThreshold(
  level: number,
  threshold: number,
  maxExcess = 1
): number {
  if (level <= threshold) return 0;
  const span = Math.max(1e-6, 1 - threshold);
  return Math.min(maxExcess, (level - threshold) / span);
}

/** 閾値超えの音源 excess 0〜1（感度とは独立） */
function resolveRainRawAudioEnvelope(audio: AudioReactiveData): number {
  return resolveAudioExcessAboveThreshold(
    resolveEffectAudioLevel(audio),
    RAIN_AUDIO_LEVEL_THRESHOLD,
    1
  );
}

function smoothEffectAudioExcess(prev: number, target: number): number {
  const coeff =
    target >= prev ? RAIN_AUDIO_ENVELOPE_ATTACK : RAIN_AUDIO_ENVELOPE_RELEASE;
  return prev + (target - prev) * coeff;
}

/**
 * 実効変調 0〜1 = 平滑化 excess × (感度/10)。
 * 感度 0 のとき常に 0（音による増減なし）。
 */
export function resolveRainAudioModulation(
  audio: AudioReactiveData,
  sensitivity: number,
  smoothedExcess: number
): number {
  const sens = normalizeRainAudioSensitivity(sensitivity, 0);
  if (sens <= 0) return 0;
  return smoothedExcess * (sens / RAIN_AUDIO_SENSITIVITY_MAX);
}

function pushRainDrop(
  width: number,
  height: number,
  density: EffectDensity,
  ux: number,
  uy: number
): void {
  const span = Math.max(width, height) + 200;
  const t = Math.random();
  rainDrops.push({
    x: Math.random() * width + ux * (t - 0.5) * span * 0.3,
    y: Math.random() * height + uy * (t - 0.5) * span * 0.3,
    speed: 0.75 + Math.random() * 0.45,
    len: 10 + Math.random() * (16 + DENSITY_STRENGTH[density] * 10),
  });
}

interface RainDrop {
  x: number;
  y: number;
  speed: number;
  len: number;
}

interface SnowFlake {
  x: number;
  y: number;
  vy: number;
  phase: number;
  size: number;
  driftSign: number;
}

let rainDrops: RainDrop[] = [];
let lastRainInitKey = "";
let snowFlakes: SnowFlake[] = [];
let lastSnowInitKey = "";

function initRainDrops(
  width: number,
  height: number,
  density: EffectDensity,
  amount: number,
  angleDeg: number
): void {
  const n = Math.max(
    30,
    Math.round(RAIN_BASE_COUNTS[density] * (0.2 + 0.8 * Math.max(0.05, Math.min(1, amount))))
  );
  rainDrops = [];
  const rad = (angleDeg * Math.PI) / 180;
  const ux = Math.sin(rad);
  const uy = Math.cos(rad);
  const span = Math.max(width, height) + 200;
  for (let i = 0; i < n; i++) {
    const t = Math.random();
    rainDrops.push({
      x: Math.random() * width + ux * (t - 0.5) * span * 0.3,
      y: Math.random() * height + uy * (t - 0.5) * span * 0.3,
      speed: 0.75 + Math.random() * 0.45,
      len: 10 + Math.random() * (16 + DENSITY_STRENGTH[density] * 10),
    });
  }
}

function initSnowFlakes(
  width: number,
  height: number,
  density: EffectDensity,
  amount: number
): void {
  const n = Math.max(
    40,
    Math.round(SNOW_BASE_COUNTS[density] * (0.2 + 0.8 * Math.max(0.05, Math.min(1, amount))))
  );
  snowFlakes = [];
  const minDim = Math.min(width, height);
  for (let i = 0; i < n; i++) {
    snowFlakes.push({
      x: Math.random() * width,
      y: Math.random() * height,
      vy: 18 + Math.random() * 32 + density * 8,
      phase: Math.random() * Math.PI * 2,
      size: Math.max(2, minDim * (0.002 + Math.random() * 0.004)),
      driftSign: Math.random() < 0.5 ? -1 : 1,
    });
  }
}

export type RainStreakGl = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  lw: number;
  r: number;
  g: number;
  b: number;
  a: number;
};

/** Canvas / WebGL 共用: 雨の線分リスト */
export function updateAndGetRainStreaks(
  width: number,
  height: number,
  density: EffectDensity,
  deltaTime: number,
  audio: AudioReactiveData | undefined,
  angleDeg: number,
  amount: number,
  hexColor: string | undefined,
  audioSensitivityStep = 0
): RainStreakGl[] {
  const [r0, g0, b0] = parseWeatherColorHex(hexColor, [110, 160, 255]);
  const amt = Math.max(0.05, Math.min(1, amount));
  const key = `rain|${width}|${height}|${density}|${angleDeg.toFixed(1)}|${amt.toFixed(2)}|${r0}|${g0}|${b0}`;
  if (key !== lastRainInitKey) {
    initRainDrops(width, height, density, amt, angleDeg);
    lastRainInitKey = key;
    rainAudioEnvelope = 0;
  }
  const rad = (angleDeg * Math.PI) / 180;
  const ux = Math.sin(rad);
  const uy = Math.cos(rad);
  const a = audio ?? SILENT_AUDIO_REACTIVE;
  const sens = normalizeRainAudioSensitivity(audioSensitivityStep, 0);
  if (sens <= 0) {
    rainAudioEnvelope = 0;
  } else {
    const instantExcess = resolveRainRawAudioEnvelope(a);
    rainAudioEnvelope = smoothEffectAudioExcess(rainAudioEnvelope, instantExcess);
  }
  const drive = resolveRainAudioModulation(a, sens, rainAudioEnvelope);

  const baseN = Math.max(
    30,
    Math.round(RAIN_BASE_COUNTS[density] * (0.2 + 0.8 * amt))
  );
  const targetN = Math.round(baseN * (1 + RAIN_AUDIO_MAX_DROP_MUL * drive));
  while (rainDrops.length < targetN) {
    pushRainDrop(width, height, density, ux, uy);
  }
  while (rainDrops.length > targetN) {
    rainDrops.pop();
  }

  const flow =
    sens <= 0
      ? 0.85
      : 0.85 + RAIN_AUDIO_FLOW_VOLUME * a.volume * (sens / RAIN_AUDIO_SENSITIVITY_MAX) + RAIN_AUDIO_FLOW_DRIVE * drive;
  const baseSpeed = (520 + DENSITY_STRENGTH[density] * 220) * flow;
  const dt = Math.min(deltaTime, 50) / 1000;
  const minDim = Math.min(width, height);
  const lwBase = Math.max(1.0, minDim * 0.0018);
  const margin = 80;
  const out: RainStreakGl[] = [];
  const strength = DENSITY_STRENGTH[density];
  const alphaBase = 0.35 + 0.25 * strength;
  const alphaMul = 1 + RAIN_AUDIO_ALPHA_BOOST * drive;
  const lenMul = 1 + RAIN_AUDIO_LEN_BOOST * drive;
  const lwMul = 1 + RAIN_AUDIO_LW_BOOST * drive;

  for (const p of rainDrops) {
    const sp = p.speed * baseSpeed;
    p.x += ux * sp * dt;
    p.y += uy * sp * dt;
    if (p.x < -margin || p.x > width + margin || p.y < -margin || p.y > height + margin) {
      p.x = Math.random() * (width + margin) - margin * 0.5;
      p.y = -margin - Math.random() * height * 0.4;
      if (drive > 0.05 && Math.random() < drive * 0.35) {
        pushRainDrop(width, height, density, ux, uy);
      }
    }
    const x2 = p.x;
    const y2 = p.y;
    const streakLen = p.len * lenMul;
    const x1 = x2 - ux * streakLen;
    const y1 = y2 - uy * streakLen;
    const alpha = Math.min(1, alphaBase * alphaMul);
    out.push({
      x1,
      y1,
      x2,
      y2,
      lw: lwBase * lwMul,
      r: r0,
      g: g0,
      b: b0,
      a: alpha,
    });
  }
  return out;
}

export type SnowParticleGl = {
  x: number;
  y: number;
  radius: number;
  r: number;
  g: number;
  b: number;
  alpha: number;
};

/** Canvas / WebGL 共用: 雪の粒子 */
export function updateAndGetSnowParticles(
  width: number,
  height: number,
  density: EffectDensity,
  deltaTime: number,
  audio: AudioReactiveData | undefined,
  angleDeg: number,
  amount: number,
  hexColor: string | undefined
): SnowParticleGl[] {
  const [r0, g0, b0] = parseWeatherColorHex(hexColor, [250, 252, 255]);
  const amt = Math.max(0.05, Math.min(1, amount));
  const key = `snow|${width}|${height}|${density}|${angleDeg.toFixed(1)}|${amt.toFixed(2)}|${r0}|${g0}|${b0}`;
  if (key !== lastSnowInitKey) {
    initSnowFlakes(width, height, density, amt);
    lastSnowInitKey = key;
  }
  const rad = ((angleDeg * Math.PI) / 180) * 0.35;
  const ux = Math.sin(rad);
  const uy = Math.cos(rad);
  const a = audio ?? SILENT_AUDIO_REACTIVE;
  const sway = 0.45 + 0.35 * a.volume;
  const dt = Math.min(deltaTime, 50) / 1000;
  const margin = 60;
  const out: SnowParticleGl[] = [];
  const strength = DENSITY_STRENGTH[density];

  for (const p of snowFlakes) {
    p.phase += dt * (1.2 + strength);
    const flutter = Math.sin(p.phase) * 28 * sway * p.driftSign;
    p.x += (ux * p.vy * 0.35 + flutter) * dt;
    p.y += uy * p.vy * dt * (0.95 + 0.05 * strength);

    if (p.y > height + margin) {
      p.y = -margin - Math.random() * 40;
      p.x = Math.random() * width;
    }
    if (p.x < -margin) p.x = width + margin;
    if (p.x > width + margin) p.x = -margin;

    const flicker = 0.55 + 0.45 * Math.sin(p.phase * 0.8);
    const alpha = Math.min(1, (0.22 + 0.2 * strength) * flicker * (0.7 + 0.3 * amt));
    out.push({
      x: p.x,
      y: p.y,
      radius: p.size,
      r: r0,
      g: g0,
      b: b0,
      alpha,
    });
  }
  return out;
}

function drawRainCanvas(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  density: EffectDensity,
  deltaTime: number,
  audio: AudioReactiveData,
  effect: EffectParams
): void {
  const angle = effect.weatherAngleDeg ?? 18;
  const amount = effect.weatherAmount ?? 0.65;
  const streaks = updateAndGetRainStreaks(
    width,
    height,
    density,
    deltaTime,
    audio,
    angle,
    amount,
    effect.weatherColor,
    effect.rainAudioSensitivity ?? 0
  );
  ctx.save();
  ctx.lineCap = "round";
  for (const s of streaks) {
    ctx.strokeStyle = `rgba(${s.r},${s.g},${s.b},${s.a})`;
    ctx.lineWidth = s.lw;
    ctx.beginPath();
    ctx.moveTo(s.x1, s.y1);
    ctx.lineTo(s.x2, s.y2);
    ctx.stroke();
  }
  ctx.restore();
}

/** 水滴: スポーン率（滴/秒）— intensity 0 = 弱、1 = 強（10×旧「強」7/sec） */
export const WATER_RIPPLE_SPAWN_MIN = 0.35;
export const WATER_RIPPLE_SPAWN_MAX = 70;
const WATER_RIPPLE_MAX_RINGS_MIN = 36;
const WATER_RIPPLE_MAX_RINGS_MAX = 900;
const WATER_RIPPLE_ALPHA_CULL = 0.015;
const WATER_RIPPLE_RADIUS_CULL = 0.45;
/** 波紋半径の最大スケール（従来比 ~3倍） */
const WATER_RIPPLE_RADIUS_SCALE = 3;

/** 旧 effectDensities 1/2/3 → スライダー 0〜1 */
export function densityToWaterRippleIntensity(density: EffectDensity): number {
  if (density === 1) return 0;
  if (density === 3) return 1;
  return 0.5;
}

export function waterRippleSpawnRateFromIntensity(intensity: number): number {
  const t = Math.max(0, Math.min(1, intensity));
  return WATER_RIPPLE_SPAWN_MIN + (WATER_RIPPLE_SPAWN_MAX - WATER_RIPPLE_SPAWN_MIN) * t;
}

export function waterRippleMaxRingsFromIntensity(intensity: number): number {
  const t = Math.max(0, Math.min(1, intensity));
  return Math.round(WATER_RIPPLE_MAX_RINGS_MIN + (WATER_RIPPLE_MAX_RINGS_MAX - WATER_RIPPLE_MAX_RINGS_MIN) * t);
}

type WaterRippleSize = "small" | "medium" | "large";

interface WaterRippleRing {
  x: number;
  y: number;
  maxRadius: number;
  startMs: number;
  duration: number;
  maxAlpha: number;
  lineWidth: number;
}

/** sens=10・excess=1 時の最大スポーン増幅 (baseRate × (1 + gain)) */
const WATER_RIPPLE_AUDIO_SPAWN_GAIN = 0.65;
/** sens=10・excess=1 時の最大明るさ増幅 */
const WATER_RIPPLE_AUDIO_ALPHA_GAIN = 0.55;
/** sens=10・excess=1 時の同時表示上限の最大増幅 */
const WATER_RIPPLE_AUDIO_MAX_RINGS_GAIN = 0.4;

let waterRippleRings: WaterRippleRing[] = [];
let lastWaterRippleInitKey = "";
let waterRippleSpawnCarry = 0;
let waterRippleAudioExcess = 0;
let waterRippleRenderBuffer: WaterRippleRingGl[] = [];
let waterRippleDrawBuffer: WaterRippleDrawGl[] = [];
let waterRippleFpsSmoothed = 60;
let waterRippleAdaptiveScale = 1;
let waterRippleFrameCounter = 0;

interface WaterRippleHeart {
  x: number;
  y: number;
  startMs: number;
  duration: number;
  maxAlpha: number;
  lineWidth: number;
  baseScale: number;
  rotation: number;
}

interface WaterRippleFirework {
  x: number;
  y: number;
  startMs: number;
  duration: number;
  maxAlpha: number;
  lineWidth: number;
  baseRadius: number;
  spokes: number;
  rotation: number;
}

let waterRippleHearts: WaterRippleHeart[] = [];
let waterRippleFireworks: WaterRippleFirework[] = [];

export function getWaterRippleAdaptiveScale(): number {
  return waterRippleAdaptiveScale;
}

export function getWaterRippleArcSegments(radius: number, lightMode = true): number {
  const scale = waterRippleAdaptiveScale;
  if (lightMode) {
    const base = scale < 0.55 ? 10 : scale < 0.75 ? 14 : 18;
    return Math.max(8, Math.min(22, Math.round(base + radius * 0.008)));
  }
  const base = scale < 0.55 ? 14 : scale < 0.75 ? 18 : 24;
  return Math.max(10, Math.min(28, Math.round(base + radius * 0.012)));
}

export function getWaterRippleHeartSteps(lightMode = true): number {
  const scale = waterRippleAdaptiveScale;
  if (lightMode) return scale < 0.6 ? 10 : 14;
  return scale < 0.6 ? 16 : 22;
}

function capWaterRippleDraws(draws: WaterRippleDrawGl[], cap: number): void {
  if (cap <= 0 || draws.length <= cap) return;
  draws.sort((a, b) => a.a - b.a);
  draws.splice(0, draws.length - cap);
}

function spawnWaterRippleHeart(width: number, height: number, nowMs: number, drive = 0): void {
  const minDim = Math.min(width, height);
  const x = Math.random() * width;
  const y = Math.random() * height;
  const alphaMul = 1 + WATER_RIPPLE_AUDIO_ALPHA_GAIN * drive;
  waterRippleHearts.push({
    x,
    y,
    startMs: nowMs,
    duration: 900 + Math.random() * 600,
    maxAlpha: (0.52 + Math.random() * 0.2) * alphaMul,
    lineWidth: Math.max(1.3, minDim * 0.0014),
    baseScale: minDim * (0.018 + Math.random() * 0.03),
    rotation: (Math.random() - 0.5) * 0.45,
  });
}

function spawnWaterRippleFirework(
  width: number,
  height: number,
  nowMs: number,
  lightMode: boolean,
  drive = 0
): void {
  const minDim = Math.min(width, height);
  const x = Math.random() * width;
  const y = Math.random() * height;
  const alphaMul = 1 + WATER_RIPPLE_AUDIO_ALPHA_GAIN * drive;
  waterRippleFireworks.push({
    x,
    y,
    startMs: nowMs,
    duration: 520 + Math.random() * 520,
    maxAlpha: (0.5 + Math.random() * 0.25) * alphaMul,
    lineWidth: Math.max(1.1, minDim * 0.0013),
    baseRadius: minDim * (0.02 + Math.random() * 0.055),
    spokes: lightMode ? 5 + Math.floor(Math.random() * 3) : 8 + Math.floor(Math.random() * 7),
    rotation: Math.random() * Math.PI * 2,
  });
}

function pickWaterRippleSize(): WaterRippleSize {
  const r = Math.random();
  if (r < 0.45) return "small";
  if (r < 0.82) return "medium";
  return "large";
}

function waterRippleSizeParams(size: WaterRippleSize, minDim: number): {
  maxRadius: number;
  duration: number;
  lineWidth: number;
  maxAlpha: number;
} {
  const jitter = 0.88 + Math.random() * 0.24;
  if (size === "small") {
    return {
      maxRadius: minDim * (0.022 + Math.random() * 0.012) * jitter * WATER_RIPPLE_RADIUS_SCALE,
      duration: 1100 + Math.random() * 500,
      lineWidth: Math.max(1.25, minDim * 0.00115),
      maxAlpha: 0.58 + Math.random() * 0.14,
    };
  }
  if (size === "medium") {
    return {
      maxRadius: minDim * (0.042 + Math.random() * 0.018) * jitter * WATER_RIPPLE_RADIUS_SCALE,
      duration: 1500 + Math.random() * 650,
      lineWidth: Math.max(1.55, minDim * 0.00145),
      maxAlpha: 0.64 + Math.random() * 0.16,
    };
  }
  return {
    maxRadius: minDim * (0.072 + Math.random() * 0.028) * jitter * WATER_RIPPLE_RADIUS_SCALE,
    duration: 2000 + Math.random() * 900,
    lineWidth: Math.max(1.9, minDim * 0.00185),
    maxAlpha: 0.7 + Math.random() * 0.18,
  };
}

function spawnWaterRippleDrop(
  width: number,
  height: number,
  nowMs: number,
  ringCountLimit: number,
  drive = 0
): void {
  const minDim = Math.min(width, height);
  const size = pickWaterRippleSize();
  const p = waterRippleSizeParams(size, minDim);
  const alphaMul = 1 + WATER_RIPPLE_AUDIO_ALPHA_GAIN * drive;
  const x = Math.random() * width;
  const y = Math.random() * height;
  const ringCount = Math.min(ringCountLimit, 2 + (Math.random() < 0.55 ? 1 : 0));
  const delays = [0, 72, 148];
  for (let i = 0; i < ringCount; i++) {
    const delay = delays[i] ?? delays[delays.length - 1];
    const radiusScale = 1 - i * 0.04;
    waterRippleRings.push({
      x,
      y,
      maxRadius: p.maxRadius * radiusScale,
      startMs: nowMs + delay,
      duration: p.duration * (0.92 + i * 0.04),
      maxAlpha: p.maxAlpha * (1 - i * 0.22) * alphaMul,
      lineWidth: p.lineWidth * (1 - i * 0.08),
    });
  }
}

/** 描画エフェクト（水滴・ハート・花火）の音連動 drive 0〜1 */
export function resolveWaterRippleAudioDrive(
  audio: AudioReactiveData,
  sensitivity: number,
  smoothedExcess: number
): number {
  return resolveRainAudioModulation(audio, sensitivity, smoothedExcess);
}

export type WaterRippleRingGl = {
  x: number;
  y: number;
  radius: number;
  lw: number;
  r: number;
  g: number;
  b: number;
  a: number;
};

export type WaterRippleHeartGl = {
  x: number;
  y: number;
  scale: number;
  lw: number;
  r: number;
  g: number;
  b: number;
  a: number;
  rotation: number;
};

export type WaterRippleSparkGl = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  lw: number;
  r: number;
  g: number;
  b: number;
  a: number;
};

export type WaterRippleDrawGl =
  | ({ kind: "ripple" } & WaterRippleRingGl)
  | ({ kind: "heart" } & WaterRippleHeartGl)
  | ({ kind: "firework" } & WaterRippleSparkGl);

/** Canvas / WebGL 共用: 水面リップル（円形の波紋） */
export function updateAndGetWaterRippleRings(
  width: number,
  height: number,
  intensity: number,
  deltaTime: number,
  hexColor: string | undefined
): WaterRippleRingGl[] {
  const drawables = updateAndGetWaterRippleDraws(
    width,
    height,
    intensity,
    deltaTime,
    hexColor,
    "ripple"
  );
  waterRippleRenderBuffer.length = 0;
  for (const d of drawables) {
    if (d.kind === "ripple") {
      waterRippleRenderBuffer.push({
        x: d.x,
        y: d.y,
        radius: d.radius,
        lw: d.lw,
        r: d.r,
        g: d.g,
        b: d.b,
        a: d.a,
      });
    }
  }
  return waterRippleRenderBuffer;
}

export function updateAndGetWaterRippleDraws(
  width: number,
  height: number,
  intensity: number,
  deltaTime: number,
  hexColor: string | undefined,
  variant: WaterRippleVariant = "ripple",
  lightMode = true,
  audio?: AudioReactiveData,
  audioSensitivityStep = 0
): WaterRippleDrawGl[] {
  const t = Math.max(0, Math.min(1, intensity));
  const [r0, g0, b0] = parseWeatherColorHex(hexColor, [210, 245, 255]);
  const key = `waterRipple|${variant}|${width}|${height}|${t.toFixed(3)}|${r0}|${g0}|${b0}`;
  if (key !== lastWaterRippleInitKey) {
    waterRippleRings = [];
    waterRippleHearts = [];
    waterRippleFireworks = [];
    waterRippleRenderBuffer = [];
    waterRippleDrawBuffer = [];
    waterRippleSpawnCarry = 0;
    waterRippleAudioExcess = 0;
    waterRippleFpsSmoothed = 60;
    waterRippleAdaptiveScale = 1;
    waterRippleFrameCounter = 0;
    lastWaterRippleInitKey = key;
  }

  const a = audio ?? SILENT_AUDIO_REACTIVE;
  const sens = normalizeRainAudioSensitivity(audioSensitivityStep, 0);
  if (sens <= 0) {
    waterRippleAudioExcess = 0;
  } else {
    const instantExcess = resolveRainRawAudioEnvelope(a);
    waterRippleAudioExcess = smoothEffectAudioExcess(waterRippleAudioExcess, instantExcess);
  }
  const excessSmooth = waterRippleAudioExcess;
  const drive = resolveWaterRippleAudioDrive(a, sens, excessSmooth);

  const dt = Math.min(deltaTime, 50) / 1000;
  const nowMs = performance.now();
  const frameMs = Math.max(8, Math.min(50, deltaTime || 16.67));
  const fps = 1000 / frameMs;
  waterRippleFpsSmoothed = waterRippleFpsSmoothed * 0.9 + fps * 0.1;
  const lightMul = lightMode ? 0.7 : 1;
  const downscale = waterRippleFpsSmoothed < 50
    ? Math.max(0.22, waterRippleFpsSmoothed / 50)
    : 1;
  const upscale = waterRippleFpsSmoothed > 58
    ? Math.min(1.05, 1 + (waterRippleFpsSmoothed - 58) / 140)
    : 1;
  waterRippleAdaptiveScale = Math.max(0.22, Math.min(1.05, downscale * upscale * lightMul));

  waterRippleFrameCounter++;
  const skipSimUpdate = waterRippleAdaptiveScale < 0.62 && (waterRippleFrameCounter & 1) === 1;

  const baseSpawnRate = waterRippleSpawnRateFromIntensity(t) * waterRippleAdaptiveScale;
  const spawnRate =
    baseSpawnRate * (1 + WATER_RIPPLE_AUDIO_SPAWN_GAIN * excessSmooth * (sens / RAIN_AUDIO_SENSITIVITY_MAX));
  const maxRingsMul = lightMode ? 0.6 : 1;
  const maxRingsFloor = lightMode ? 28 : WATER_RIPPLE_MAX_RINGS_MIN;
  const maxRings = Math.max(
    maxRingsFloor,
    Math.round(
      waterRippleMaxRingsFromIntensity(t) *
        waterRippleAdaptiveScale *
        maxRingsMul *
        (1 + WATER_RIPPLE_AUDIO_MAX_RINGS_GAIN * excessSmooth * (sens / RAIN_AUDIO_SENSITIVITY_MAX))
    )
  );
  const ringCountLimit = t >= 0.75
    ? (waterRippleAdaptiveScale >= 0.75 ? 3 : lightMode ? 1 : 2)
    : lightMode ? 1 : 2;

  if (!skipSimUpdate) {
    waterRippleSpawnCarry += spawnRate * dt;
    while (waterRippleSpawnCarry >= 1) {
      waterRippleSpawnCarry -= 1;
      if (variant === "heart") {
        if (waterRippleHearts.length >= maxRings) break;
        spawnWaterRippleHeart(width, height, nowMs, drive);
      } else if (variant === "firework") {
        if (waterRippleFireworks.length >= maxRings) break;
        spawnWaterRippleFirework(width, height, nowMs, lightMode, drive);
      } else {
        if (waterRippleRings.length >= maxRings) break;
        spawnWaterRippleDrop(width, height, nowMs, ringCountLimit, drive);
      }
    }

    if (variant === "ripple") {
      let write = 0;
      for (let i = 0; i < waterRippleRings.length; i++) {
        const ring = waterRippleRings[i];
        const progress = (nowMs - ring.startMs) / ring.duration;
        if (progress < 1) {
          waterRippleRings[write++] = ring;
        }
      }
      waterRippleRings.length = write;
    } else if (variant === "heart") {
      let write = 0;
      for (let i = 0; i < waterRippleHearts.length; i++) {
        const heart = waterRippleHearts[i];
        const progress = (nowMs - heart.startMs) / heart.duration;
        if (progress < 1) {
          waterRippleHearts[write++] = heart;
        }
      }
      waterRippleHearts.length = write;
    } else {
      let write = 0;
      for (let i = 0; i < waterRippleFireworks.length; i++) {
        const fw = waterRippleFireworks[i];
        const progress = (nowMs - fw.startMs) / fw.duration;
        if (progress < 1) {
          waterRippleFireworks[write++] = fw;
        }
      }
      waterRippleFireworks.length = write;
    }
  }

  waterRippleDrawBuffer.length = 0;
  const strength =
    (0.55 + 0.45 * t) *
    (1 + WATER_RIPPLE_AUDIO_ALPHA_GAIN * excessSmooth * (sens / RAIN_AUDIO_SENSITIVITY_MAX));
  if (variant === "heart") {
    for (const heart of waterRippleHearts) {
      const progress = (nowMs - heart.startMs) / heart.duration;
      if (progress < 0 || progress >= 1) continue;
      const fade = 1 - progress;
      const alpha = Math.min(1, heart.maxAlpha * fade * (0.84 + 0.16 * strength));
      if (alpha < WATER_RIPPLE_ALPHA_CULL) continue;
      waterRippleDrawBuffer.push({
        kind: "heart",
        x: heart.x,
        y: heart.y,
        scale: heart.baseScale * (0.35 + progress * 1.35),
        lw: heart.lineWidth,
        r: r0,
        g: g0,
        b: b0,
        a: alpha,
        rotation: heart.rotation + progress * 0.2,
      });
    }
  } else if (variant === "firework") {
    for (const fw of waterRippleFireworks) {
      const progress = (nowMs - fw.startMs) / fw.duration;
      if (progress < 0 || progress >= 1) continue;
      const fade = 1 - progress;
      const alpha = Math.min(1, fw.maxAlpha * fade * (0.86 + 0.14 * strength));
      if (alpha < WATER_RIPPLE_ALPHA_CULL) continue;
      const baseR = fw.baseRadius * (0.25 + progress * 1.55);
      for (let i = 0; i < fw.spokes; i++) {
        const ang = fw.rotation + (Math.PI * 2 * i) / fw.spokes;
        const inner = baseR * Math.max(0.05, progress * 0.34);
        const outer = baseR + (4 + (i % 3)) * (0.4 + progress * 0.9);
        waterRippleDrawBuffer.push({
          kind: "firework",
          x1: fw.x + Math.cos(ang) * inner,
          y1: fw.y + Math.sin(ang) * inner,
          x2: fw.x + Math.cos(ang) * outer,
          y2: fw.y + Math.sin(ang) * outer,
          lw: fw.lineWidth * (0.95 + (i % 4) * 0.08),
          r: r0,
          g: g0,
          b: b0,
          a: alpha * (0.85 + (i % 3) * 0.05),
        });
      }
    }
  } else {
    for (const ring of waterRippleRings) {
      const progress = (nowMs - ring.startMs) / ring.duration;
      if (progress < 0 || progress >= 1) continue;
      const radius = ring.maxRadius * progress;
      if (radius < WATER_RIPPLE_RADIUS_CULL) continue;
      if (
        ring.x + radius < 0 ||
        ring.y + radius < 0 ||
        ring.x - radius > width ||
        ring.y - radius > height
      ) {
        continue;
      }
      const fade = 1 - progress * progress;
      const alpha = Math.min(1, ring.maxAlpha * fade * (0.82 + 0.18 * strength));
      if (alpha < WATER_RIPPLE_ALPHA_CULL) continue;
      waterRippleDrawBuffer.push({
        kind: "ripple",
        x: ring.x,
        y: ring.y,
        radius,
        lw: ring.lineWidth,
        r: r0,
        g: g0,
        b: b0,
        a: alpha,
      });
    }
  }
  const drawCapBase =
    variant === "firework"
      ? lightMode ? 48 : 90
      : variant === "heart"
        ? lightMode ? 36 : 70
        : lightMode ? 72 : 130;
  const drawCap = Math.max(
    variant === "ripple" ? 24 : 16,
    Math.round(drawCapBase * Math.max(0.3, waterRippleAdaptiveScale))
  );
  capWaterRippleDraws(waterRippleDrawBuffer, drawCap);
  return waterRippleDrawBuffer;
}

function drawWaterRippleCanvas(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  _density: EffectDensity,
  deltaTime: number,
  audio: AudioReactiveData,
  effect: EffectParams
): void {
  const intensity =
    effect.waterRippleIntensity != null
      ? Math.max(0, Math.min(1, effect.waterRippleIntensity))
      : densityToWaterRippleIntensity(effect.density);
  const hex =
    effect.waterRippleColor ?? effect.effectTintColor ?? effect.weatherColor;
  const variant = effect.waterRippleVariant ?? "ripple";
  const lightMode = effect.waterRippleLightMode !== false;
  const draws = updateAndGetWaterRippleDraws(
    width,
    height,
    intensity,
    deltaTime,
    hex,
    variant,
    lightMode,
    audio,
    effect.waterRippleAudioSensitivity ?? 0
  );
  if (draws.length === 0) return;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.lineCap = "round";
  ctx.shadowBlur = 0;
  let prevShadow = -1;
  let prevLw = -1;
  let prevStyle = "";
  let prevShadowColor = "";
  const useShadow = !lightMode;
  for (const d of draws) {
    if (d.a < WATER_RIPPLE_ALPHA_CULL) continue;
    if (useShadow) {
      const shadow = Math.max(4, d.lw * 4);
      if (d.kind === "ripple" && shadow !== prevShadow) {
        ctx.shadowBlur = shadow;
        prevShadow = shadow;
      }
      const shadowColor = `rgba(${d.r},${d.g},${d.b},${d.a * 0.65})`;
      if (shadowColor !== prevShadowColor) {
        ctx.shadowColor = shadowColor;
        prevShadowColor = shadowColor;
      }
    }
    const strokeStyle = `rgba(${d.r},${d.g},${d.b},${d.a})`;
    if (strokeStyle !== prevStyle) {
      ctx.strokeStyle = strokeStyle;
      prevStyle = strokeStyle;
    }
    if (d.lw !== prevLw) {
      ctx.lineWidth = d.lw;
      prevLw = d.lw;
    }
    if (d.kind === "ripple") {
      if (d.radius < WATER_RIPPLE_RADIUS_CULL) continue;
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.radius, 0, Math.PI * 2);
      ctx.stroke();
      continue;
    }
    if (d.kind === "firework") {
      ctx.beginPath();
      ctx.moveTo(d.x1, d.y1);
      ctx.lineTo(d.x2, d.y2);
      ctx.stroke();
      continue;
    }
    const s = Math.max(3, d.scale);
    ctx.save();
    ctx.translate(d.x, d.y);
    ctx.rotate(d.rotation);
    if (lightMode) {
      const steps = getWaterRippleHeartSteps(true);
      const step = (Math.PI * 2) / steps;
      ctx.beginPath();
      for (let i = 0; i <= steps; i++) {
        const ang = i * step;
        const hx = 16 * Math.pow(Math.sin(ang), 3);
        const hy =
          13 * Math.cos(ang) -
          5 * Math.cos(2 * ang) -
          2 * Math.cos(3 * ang) -
          Math.cos(4 * ang);
        const px = (hx / 18) * s;
        const py = (-hy / 18) * s;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.stroke();
    } else {
      ctx.scale(s / 16, s / 16);
      ctx.beginPath();
      ctx.moveTo(0, 6);
      ctx.bezierCurveTo(-8, -1, -11, -8, -4, -12);
      ctx.bezierCurveTo(0, -14, 4, -11, 4, -7);
      ctx.bezierCurveTo(4, -11, 8, -14, 12, -12);
      ctx.bezierCurveTo(19, -8, 16, -1, 8, 6);
      ctx.bezierCurveTo(5, 9, 3, 11, 0, 14);
      ctx.bezierCurveTo(-3, 11, -5, 9, -8, 6);
      ctx.closePath();
      ctx.stroke();
    }
    ctx.restore();
  }
  ctx.shadowBlur = 0;
  ctx.restore();
}

function drawSnowCanvas(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  density: EffectDensity,
  deltaTime: number,
  audio: AudioReactiveData,
  effect: EffectParams
): void {
  const angle = effect.weatherAngleDeg ?? 8;
  const amount = effect.weatherAmount ?? 0.55;
  const list = updateAndGetSnowParticles(width, height, density, deltaTime, audio, angle, amount, effect.weatherColor);
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const p of list) {
    const rad = Math.max(1.2, p.radius);
    ctx.fillStyle = `rgba(${p.r},${p.g},${p.b},${p.alpha})`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, rad, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// --- グリッチ（高域・音量で発生頻度・強度が変化）---
let glitchPhase = 0;
function drawGlitchCanvas(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  density: EffectDensity,
  audio: AudioReactiveData
): void {
  glitchPhase += 0.05 + 0.15 * audio.highFreq;
  const baseStrength = DENSITY_STRENGTH[density];
  const trigger = 0.3 + 0.7 * (audio.highFreq * 0.6 + audio.volume * 0.4);
  const lineCount = Math.floor((density === 1 ? 5 : density === 2 ? 10 : 18) * trigger) + 1;
  ctx.save();
  for (let i = 0; i < lineCount; i++) {
    const y = Math.random() * height;
    const offset = (Math.random() - 0.5) * (25 * baseStrength * trigger);
    const h = Math.max(2, Math.floor(2 + Math.random() * 5));
    const alpha = (0.18 + Math.random() * baseStrength * 0.5) * trigger;
    ctx.fillStyle = `rgba(255,255,255,${alpha})`;
    ctx.fillRect(0, y, width, h);
    ctx.fillStyle = `rgba(0,0,0,${alpha * 0.6})`;
    ctx.fillRect(offset, y, width, h);
  }
  ctx.restore();
}

/** CRT風の水平スキャンライン（密度で間隔、音量で強度がわずかに変化） */
function drawScanlinesCanvas(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  density: EffectDensity,
  audio: AudioReactiveData
): void {
  const strength = DENSITY_STRENGTH[density];
  const spacing = density === 3 ? 2 : density === 2 ? 3 : 4;
  const base = 0.14 + 0.22 * strength;
  const pulse = 0.78 + 0.22 * Math.min(1, audio.volume * 0.7 + audio.bass * 0.35);
  const alpha = Math.min(0.42, base * pulse);
  const lineH = density === 3 ? 2 : 1;
  ctx.save();
  ctx.fillStyle = `rgba(0,0,0,${alpha})`;
  for (let y = 0; y < height; y += spacing) {
    ctx.fillRect(0, y, width, lineH);
    if (lineH === 2 && y + 1 < height) {
      ctx.fillStyle = `rgba(0,0,0,${alpha * 0.35})`;
      ctx.fillRect(0, y + 1, width, 1);
      ctx.fillStyle = `rgba(0,0,0,${alpha})`;
    }
  }
  ctx.restore();
}

// --- ミラーボール（ディスコ）---

export interface MirrorBallLightDraw {
  x: number;
  y: number;
  radius: number;
  r: number;
  g: number;
  b: number;
  a: number;
}

export interface MirrorBallFrameDraw {
  spots: MirrorBallLightDraw[];
  ambientAlpha: number;
}

let mirrorBallRotationRad = 0;

function mirrorBallHash(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function parseMirrorBallColor(hex: string | undefined, fallback: [number, number, number]): [number, number, number] {
  return parseWeatherColorHex(hex, fallback);
}

export function buildMirrorBallFrame(
  width: number,
  height: number,
  effect: EffectParams,
  deltaTime: number,
  audio?: AudioReactiveData
): MirrorBallFrameDraw {
  const a = audio ?? SILENT_AUDIO_REACTIVE;
  const minDim = Math.min(width, height);
  const strength = DENSITY_STRENGTH[effect.density];

  // ボールは天井中央に固定（描画しない）
  const cx = width * 0.5;
  const cy = height * 0.1;
  const r = minDim * 0.12;

  // 回転
  const rotSpeed = Math.max(-180, Math.min(180, effect.mirrorBallRotationSpeed ?? 20));
  mirrorBallRotationRad += (rotSpeed * Math.PI) / 180 * (deltaTime / 1000);

  const audioBoost = a.bass * 0.4 + a.volume * 0.2 + a.highFreq * 0.15;

  // 光源数（1〜10、デフォルト4）
  const lightCount = Math.max(1, Math.min(10, effect.mirrorBallLightCount ?? 4));

  // 各光源の色と強さを読み取り
  const lights: Array<{ color: [number, number, number]; intensity: number }> = [];
  const defaultColors: [number, number, number][] = [
    [255, 0, 0], [0, 255, 0], [0, 0, 255], [255, 255, 0],
    [255, 0, 255], [0, 255, 255], [255, 128, 0], [128, 0, 255],
    [0, 128, 255], [255, 0, 128],
  ];
  for (let i = 0; i < lightCount; i++) {
    const color = parseMirrorBallColor(
      (effect as any)[`mirrorBallLight${i}Color`],
      defaultColors[i % defaultColors.length]
    );
    const intensity = Math.max(0, Math.min(1,
      (effect as any)[`mirrorBallLight${i}Intensity`] ?? 0.7
    ));
    lights.push({ color, intensity });
  }

  // 光源を等間隔で配置（各光源が独立して動く）
  const spots: MirrorBallLightDraw[] = [];

  // ミラーボール表面の鏡面パターン（各鏡面が独立した角度を持つ）
  // 実際のディスコボールは多数の小さな鏡が球面に貼り付けられている
  const mirrorAngles: Array<{ lon: number; lat: number }> = [];
  const mirrorRows = 8;
  const mirrorCols = 12;
  for (let row = 0; row < mirrorRows; row++) {
    const lat = -Math.PI * 0.35 + (row / (mirrorRows - 1)) * Math.PI * 0.7;
    const colsAtLat = Math.max(4, Math.round(mirrorCols * Math.cos(lat)));
    for (let col = 0; col < colsAtLat; col++) {
      const lon = (col / colsAtLat) * Math.PI * 2;
      mirrorAngles.push({ lon, lat });
    }
  }

  for (let li = 0; li < lightCount; li++) {
    const light = lights[li];
    if (light.intensity <= 0.01) continue;

    // 各光源の方向（回転に連動）
    const lightAngle = (Math.PI * 2 * li) / lightCount + mirrorBallRotationRad * 0.4;

    // 光源の3D方向ベクトル
    const ldx = Math.cos(lightAngle);
    const ldy = -0.8;
    const ldz = Math.sin(lightAngle);
    const lLen = Math.hypot(ldx, ldy, ldz);

    // 各鏡面から反射スポットを生成
    for (const mirror of mirrorAngles) {
      // 鏡面の法線ベクトル（球面上の点）
      const mnx = Math.cos(mirror.lon) * Math.cos(mirror.lat);
      const mny = Math.sin(mirror.lat);
      const mnz = Math.sin(mirror.lon) * Math.cos(mirror.lat);

      // 鏡面を回転
      const rot = mirrorBallRotationRad;
      const rnx = mnx * Math.cos(rot) + mnz * Math.sin(rot);
      const rny = mny;
      const rnz = -mnx * Math.sin(rot) + mnz * Math.cos(rot);

      // 反射ベクトル: R = I - 2(N·I)N
      const ndotl = (ldx * rnx + ldy * rny + ldz * rnz) / lLen;
      if (ndotl <= 0) continue; // 光が鏡面の裏側に当たっている

      const rdx = ldx - 2 * ndotl * rnx * lLen;
      const rdy = ldy - 2 * ndotl * rny * lLen;
      const rdz = ldz - 2 * ndotl * rnz * lLen;

      // 反射方向をスクリーン座標に投影
      const projScale = 3.0;
      const sx = cx + (rdx / Math.max(0.1, Math.abs(rdz) + 0.3)) * r * projScale;
      const sy = cy + (rdy / Math.max(0.1, Math.abs(rdz) + 0.3)) * r * projScale * 0.8;

      // 画面外のスポットはスキップ
      if (sx < -r * 2 || sx > width + r * 2 || sy < -r * 2 || sy > height + r * 2) continue;

      // 反射強度（入射角に依存）
      const reflectStrength = Math.pow(ndotl, 1.2);
      const spotR = r * (0.06 + mirrorBallHash(li * 100 + mirror.lon * 10 + mirror.lat * 10) * 0.08);
      const spotA = 0.5 * strength * light.intensity * reflectStrength * (0.7 + audioBoost * 0.3);
      if (spotA < 0.03) continue;

      spots.push({
        x: sx,
        y: sy,
        radius: spotR,
        r: light.color[0],
        g: light.color[1],
        b: light.color[2],
        a: spotA,
      });
    }
  }

  // 輝度順にソートして上限を設定
  if (spots.length > 250) {
    spots.sort((a, b) => b.a - a.a);
    spots.length = 250;
  }

  return { spots, ambientAlpha: 0.25 * strength };
}

function drawMirrorBallSoftSpot(
  ctx: CanvasRenderingContext2D,
  spot: MirrorBallLightDraw
): void {
  const g = ctx.createRadialGradient(spot.x, spot.y, 0, spot.x, spot.y, spot.radius * 1.2);
  g.addColorStop(0, `rgba(255,255,255,${spot.a})`);
  g.addColorStop(0.35, `rgba(${spot.r},${spot.g},${spot.b},${spot.a * 0.7})`);
  g.addColorStop(0.7, `rgba(${spot.r},${spot.g},${spot.b},${spot.a * 0.2})`);
  g.addColorStop(1, `rgba(${spot.r},${spot.g},${spot.b},0)`);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(spot.x, spot.y, spot.radius * 1.1, spot.radius * 0.9, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawMirrorBallCanvas(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  effect: EffectParams,
  deltaTime: number,
  audio: AudioReactiveData
): void {
  const frame = buildMirrorBallFrame(width, height, effect, deltaTime, audio);
  ctx.save();

  // 室内の暗さ
  const roomDim = Math.min(0.35, frame.ambientAlpha);
  if (roomDim > 0.001) {
    ctx.globalCompositeOperation = "multiply";
    const shade = Math.round(255 * (1 - roomDim * 0.8));
    ctx.fillStyle = `rgb(${shade},${shade},${Math.min(255, shade + 5)})`;
    ctx.fillRect(0, 0, width, height);
    ctx.globalCompositeOperation = "source-over";
  }

  // 反射スポット
  ctx.globalCompositeOperation = "lighter";
  for (const spot of frame.spots) {
    drawMirrorBallSoftSpot(ctx, spot);
  }

  ctx.restore();
}

/** 音声データなし時のデフォルト（無音・プレビュー停止中のエフェクト用） */
export const SILENT_AUDIO_REACTIVE: AudioReactiveData = { bass: 0.2, volume: 0.2, highFreq: 0.1 };

/**
 * エフェクトタイプに応じてCanvas 2Dでオーバーレイを描画（音源連動）
 */
export function drawEffectOverlayCanvas(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  effect: EffectParams,
  audio?: AudioReactiveData
): void {
  if (effect.type === "none" || width <= 0 || height <= 0) return;
  const a = audio ?? SILENT_AUDIO_REACTIVE;
  const nowOverlay = performance.now();
  const overlayDelta = Math.min(Math.max(nowOverlay - lastOverlayDrawTime, 0), 50);
  lastOverlayDrawTime = nowOverlay;
  try {
    if (effect.type === "space") {
      drawSpaceEffectCanvas(
        ctx,
        width,
        height,
        effect.density,
        "space",
        effect.spaceDirection ?? "forward",
        effect.spaceSpeed ?? 1,
        undefined,
        effect.effectTintColor,
        effect.spaceCenterX ?? 0.5,
        effect.spaceCenterY ?? 0.5
      );
      return;
    }
    if (effect.type === "spaceConstant") {
      drawSpaceEffectCanvas(
        ctx,
        width,
        height,
        effect.density,
        "spaceConstant",
        effect.spaceDirection ?? "forward",
        effect.spaceSpeed ?? 1,
        undefined,
        effect.effectTintColor,
        effect.spaceCenterX ?? 0.5,
        effect.spaceCenterY ?? 0.5
      );
      return;
    }
    if (effect.type === "spaceAudio") {
      drawSpaceEffectCanvas(
        ctx,
        width,
        height,
        effect.density,
        "spaceAudio",
        effect.spaceDirection ?? "forward",
        effect.spaceSpeed ?? 1,
        a,
        effect.effectTintColor,
        effect.spaceCenterX ?? 0.5,
        effect.spaceCenterY ?? 0.5
      );
      return;
    }
    switch (effect.type) {
      case "filmGrain":
        drawFilmGrainCanvas(ctx, width, height, effect.density, a);
        break;
      case "vignette":
        drawVignetteCanvas(ctx, width, height, effect.density, a);
        break;
      case "rainbow":
        drawRainbowCanvas(ctx, width, height, effect.density, a);
        break;
      case "curtain":
        drawCurtainCanvas(ctx, width, height, effect.density, a);
        break;
      case "glitch":
        drawGlitchCanvas(ctx, width, height, effect.density, a);
        break;
      case "sparkle":
        drawSparkleCanvas(
          ctx,
          width,
          height,
          effect.density,
          overlayDelta,
          a,
          effect.sparkleVariant ?? "normal",
          effect.effectTintColor
        );
        break;
      case "dust":
        drawDustCanvas(
          ctx,
          width,
          height,
          effect.density,
          overlayDelta,
          effect.atmosphereVariant ?? "dust",
          effect.effectStrengthScale ?? 1,
          a,
          effect.effectTintColor
        );
        break;
      case "rain":
        drawRainCanvas(ctx, width, height, effect.density, overlayDelta, a, effect);
        break;
      case "snow":
        drawSnowCanvas(ctx, width, height, effect.density, overlayDelta, a, effect);
        break;
      case "waterRipple":
        drawWaterRippleCanvas(ctx, width, height, effect.density, overlayDelta, a, effect);
        break;
      case "scanlines":
        drawScanlinesCanvas(ctx, width, height, effect.density, a);
        break;
      case "mirrorBall":
        drawMirrorBallCanvas(ctx, width, height, effect, overlayDelta, a);
        break;
      case "laser":
        drawLaserCanvas(ctx, width, height, effect.density, overlayDelta);
        break;
      default:
        break;
    }
  } catch (err) {
    console.warn("Effect draw error:", err);
  }
}
