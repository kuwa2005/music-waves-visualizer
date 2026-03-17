/**
 * オーバーレイエフェクト（スペクトラムとは独立してON/OFF可能）
 */

export type EffectType = "none" | "space" | "spaceConstant" | "spaceAudio" | "filmGrain" | "vignette" | "rainbow" | "curtain" | "glitch";

export type EffectDensity = 1 | 2 | 3;

export interface EffectParams {
  type: EffectType;
  density: EffectDensity;
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

// 解像度に応じた星のサイズ（プレビュー縮小時も見えるように）
function getParticleSize(width: number, height: number): number {
  const minDim = Math.min(width, height);
  return Math.max(6, minDim / 120) * (0.8 + Math.random() * 0.5);
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
  audio?: AudioReactiveData
): Array<{ x: number; y: number; size: number; alpha: number; r: number; g: number; b: number }> {
  const maxRadius = Math.sqrt(width * width + height * height) / 2 + 150;
  const centerX = width / 2;
  const centerY = height / 2;

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

  for (const p of spaceParticles) {
    // 音源連動: 閾値未満の星は非表示
    if (variant === "spaceAudio" && p.visibilityThreshold != null && audioLevel >= 0) {
      if (audioLevel < p.visibilityThreshold) continue;
    }

    const normalizedDist = p.distance / maxRadius;
    const normalizedSpawn = p.spawnDistance / maxRadius;

    // 速度: 等速版は一定、それ以外は中央に近いほど速く
    const speedFactor = variant === "spaceConstant" ? 1.0 : 1.5 - normalizedDist * 0.8;
    const effectiveSpeed = Math.max(0.3, p.speed * speedFactor) * (deltaTime / 16);
    p.distance += effectiveSpeed;

    // キラキラ位相を更新
    p.twinklePhase += p.twinkleSpeed * (deltaTime / 1000);

    // リセット判定: 画面端に到達、または内側の星は手前で消える
    const innerStarFadeDist = maxRadius * 0.65;  // 内側で出現した星は65%で消える
    const shouldReset =
      p.distance > maxRadius ||
      (normalizedSpawn < 0.15 && p.distance > innerStarFadeDist);

    if (shouldReset) {
      p.distance = minSpawnRadius + Math.random() * (maxSpawnRadius - minSpawnRadius);
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
    result.push({
      x,
      y,
      size: p.size,
      alpha: Math.min(1, alpha),
      r: color.r,
      g: color.g,
      b: color.b,
    });
  }

  return result;
}

let lastTime = performance.now();

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
  audio?: AudioReactiveData
): void {
  const now = performance.now();
  const deltaTime = Math.min(now - lastTime, 50);
  lastTime = now;

  const particles = updateAndGetSpaceParticles(width, height, density, deltaTime, variant, audio);

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
  }
  const grainCtx = filmGrainCanvas.getContext("2d");
  if (!grainCtx) return;
  const imageData = grainCtx.createImageData(width, height);
  const data = imageData.data;
  const alpha = Math.round(255 * Math.min(0.5, strength * 0.35));
  for (let i = 0; i < data.length; i += 4) {
    const n = Math.floor(Math.random() * 256);
    data[i] = data[i + 1] = data[i + 2] = n;
    data[i + 3] = alpha;
  }
  grainCtx.putImageData(imageData, 0, 0);
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

/** 音声データなし時のデフォルト（無音時用） */
const DEFAULT_AUDIO: AudioReactiveData = { bass: 0.2, volume: 0.2, highFreq: 0.1 };

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
  const a = audio ?? DEFAULT_AUDIO;
  try {
    if (effect.type === "space") {
      drawSpaceEffectCanvas(ctx, width, height, effect.density, "space");
      return;
    }
    if (effect.type === "spaceConstant") {
      drawSpaceEffectCanvas(ctx, width, height, effect.density, "spaceConstant");
      return;
    }
    if (effect.type === "spaceAudio") {
      drawSpaceEffectCanvas(ctx, width, height, effect.density, "spaceAudio", a);
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
      default:
        break;
    }
  } catch (err) {
    console.warn("Effect draw error:", err);
  }
}
