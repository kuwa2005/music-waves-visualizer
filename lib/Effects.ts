/**
 * オーバーレイエフェクト（スペクトラムとは独立してON/OFF可能）
 */

export type EffectType = "none" | "space";

export type EffectDensity = 1 | 2 | 3;

export interface EffectParams {
  type: EffectType;
  density: EffectDensity;
}

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
}

let spaceParticles: SpaceParticle[] = [];
let lastEffectParams: { density: EffectDensity; width: number; height: number } | null = null;

const DENSITY_COUNTS: Record<EffectDensity, number> = {
  1: 50,
  2: 120,
  3: 220,
};

// 解像度に応じた星のサイズ（プレビュー縮小時も見えるように）
function getParticleSize(width: number, height: number): number {
  const minDim = Math.min(width, height);
  return Math.max(6, minDim / 120) * (0.8 + Math.random() * 0.5);
}

function initSpaceParticles(width: number, height: number, density: EffectDensity): void {
  const count = DENSITY_COUNTS[density];
  const maxRadius = Math.sqrt(width * width + height * height) / 2 + 100;
  const minSpawnRadius = maxRadius * 0.08;   // 中央から8%離れた位置から
  const maxSpawnRadius = maxRadius * 0.25;  // 最大25%の範囲で出現
  spaceParticles = [];

  for (let i = 0; i < count; i++) {
    const spawnDist = minSpawnRadius + Math.random() * (maxSpawnRadius - minSpawnRadius);
    spaceParticles.push({
      angle: Math.random() * Math.PI * 2,
      distance: spawnDist,
      spawnDistance: spawnDist,
      speed: 1.5 + Math.random() * 3,
      size: getParticleSize(width, height),
      baseAlpha: 0.5 + Math.random() * 0.4,
      colorIndex: Math.floor(Math.random() * STAR_COLORS.length),
      twinklePhase: Math.random() * Math.PI * 2,
      twinkleSpeed: 2 + Math.random() * 4,
    });
  }
}

/**
 * 宇宙空間（ワープ）エフェクトのパーティクルを更新し、描画用データを返す
 */
export function updateAndGetSpaceParticles(
  width: number,
  height: number,
  density: EffectDensity,
  deltaTime: number
): Array<{ x: number; y: number; size: number; alpha: number; r: number; g: number; b: number }> {
  const maxRadius = Math.sqrt(width * width + height * height) / 2 + 150;
  const centerX = width / 2;
  const centerY = height / 2;

  // 密度やサイズが変わったら再初期化
  if (
    !lastEffectParams ||
    lastEffectParams.density !== density ||
    lastEffectParams.width !== width ||
    lastEffectParams.height !== height
  ) {
    initSpaceParticles(width, height, density);
    lastEffectParams = { density, width, height };
  }

  const result: Array<{ x: number; y: number; size: number; alpha: number; r: number; g: number; b: number }> = [];
  const minSpawnRadius = maxRadius * 0.08;
  const maxSpawnRadius = maxRadius * 0.25;

  for (const p of spaceParticles) {
    const normalizedDist = p.distance / maxRadius;
    const normalizedSpawn = p.spawnDistance / maxRadius;

    // 速度: 中央に近いほど速く、遠いほどゆっくり
    const speedFactor = 1.5 - normalizedDist * 0.8;
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
 */
export function drawSpaceEffectCanvas(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  density: EffectDensity
): void {
  const now = performance.now();
  const deltaTime = Math.min(now - lastTime, 50);
  lastTime = now;

  const particles = updateAndGetSpaceParticles(width, height, density, deltaTime);

  ctx.save();
  for (const p of particles) {
    ctx.fillStyle = `rgba(${p.r}, ${p.g}, ${p.b}, ${p.alpha})`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
