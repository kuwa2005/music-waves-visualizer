/**
 * オーバーレイエフェクト（スペクトラムとは独立してON/OFF可能）
 */

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
  | "scanlines"
  | "mirrorBall";

export type EffectDensity = 1 | 2 | 3;
export type AtmosphereVariant = "dust" | "sparks" | "fireflies";
export type SparkleVariant = "normal" | "heart" | "star";
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
  /** 宇宙・きらきら・空気感: トーン色 #RRGGBB */
  effectTintColor?: string;
  /** 宇宙空間: 前進/後退 */
  spaceDirection?: SpaceDirection;
  /** 宇宙空間: 進行速度 0.2〜3.0 */
  spaceSpeed?: number;
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
  tintHex?: string
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
    const [tr, tg, tb] = parseWeatherColorHex(tintHex, [255, 255, 255]);
    const mix = tintHex ? 0.52 : 0;
    const r = Math.round(color.r * (1 - mix) + tr * mix);
    const g = Math.round(color.g * (1 - mix) + tg * mix);
    const b = Math.round(color.b * (1 - mix) + tb * mix);
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
  tintHex?: string
): void {
  const now = performance.now();
  const deltaTime = Math.min(now - lastTime, 50);
  lastTime = now;

  const particles = updateAndGetSpaceParticles(width, height, density, deltaTime, variant, direction, speedScale, audio, tintHex);

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

    const [tr, tg, tb] = parseWeatherColorHex(tintHex, [255, 255, 255]);
    out.push({
      x: p.x,
      y: p.y,
      radius: rad,
      r: tr,
      g: tg,
      b: tb,
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
      const [tr, tg, tb] = parseWeatherColorHex(tintHex, [r, g, b]);
      const mix = 0.58;
      r = Math.round(r * (1 - mix) + tr * mix);
      g = Math.round(g * (1 - mix) + tg * mix);
      b = Math.round(b * (1 - mix) + tb * mix);
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
  hexColor: string | undefined
): RainStreakGl[] {
  const [r0, g0, b0] = parseWeatherColorHex(hexColor, [110, 160, 255]);
  const amt = Math.max(0.05, Math.min(1, amount));
  const key = `rain|${width}|${height}|${density}|${angleDeg.toFixed(1)}|${amt.toFixed(2)}|${r0}|${g0}|${b0}`;
  if (key !== lastRainInitKey) {
    initRainDrops(width, height, density, amt, angleDeg);
    lastRainInitKey = key;
  }
  const rad = (angleDeg * Math.PI) / 180;
  const ux = Math.sin(rad);
  const uy = Math.cos(rad);
  const a = audio ?? SILENT_AUDIO_REACTIVE;
  const flow = 0.85 + 0.2 * a.volume;
  const baseSpeed = (520 + DENSITY_STRENGTH[density] * 220) * flow;
  const dt = Math.min(deltaTime, 50) / 1000;
  const minDim = Math.min(width, height);
  const lw = Math.max(1.0, minDim * 0.0018);
  const margin = 80;
  const out: RainStreakGl[] = [];

  for (const p of rainDrops) {
    const sp = p.speed * baseSpeed;
    p.x += ux * sp * dt;
    p.y += uy * sp * dt;
    if (p.x < -margin || p.x > width + margin || p.y < -margin || p.y > height + margin) {
      p.x = Math.random() * (width + margin) - margin * 0.5;
      p.y = -margin - Math.random() * height * 0.4;
    }
    const x2 = p.x;
    const y2 = p.y;
    const x1 = x2 - ux * p.len;
    const y1 = y2 - uy * p.len;
    const alpha = 0.35 + 0.25 * DENSITY_STRENGTH[density];
    out.push({ x1, y1, x2, y2, lw, r: r0, g: g0, b: b0, a: alpha });
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
  const streaks = updateAndGetRainStreaks(width, height, density, deltaTime, audio, angle, amount, effect.weatherColor);
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
/** @deprecated 光線ビームは描画しない（互換のため型のみ残す） */
export interface MirrorBallBeamDraw {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  r: number;
  g: number;
  b: number;
  a: number;
  lw: number;
  kind?: "reflected" | "spotlight";
}

/** 壁・床・天井に落ちる反射スポット（小さめの角丸四角） */
export interface MirrorBallWallSpotDraw {
  x: number;
  y: number;
  radius: number;
  r: number;
  g: number;
  b: number;
  a: number;
  /** 1=正方形に近い, 未指定時1 */
  square?: number;
}

export interface MirrorBallFacetDraw {
  points: [number, number, number, number, number, number];
  r: number;
  g: number;
  b: number;
  a: number;
}

export interface MirrorBallSparkleDraw {
  x: number;
  y: number;
  radius: number;
  r: number;
  g: number;
  b: number;
  a: number;
}

export interface MirrorBallFrameDraw {
  ambientAlpha: number;
  beams: MirrorBallBeamDraw[];
  wallSpots: MirrorBallWallSpotDraw[];
  facets: MirrorBallFacetDraw[];
  sparkles: MirrorBallSparkleDraw[];
  ballCx: number;
  ballCy: number;
  ballR: number;
  coreR: number;
  coreAlpha: number;
  lightX: number;
  lightY: number;
}

let mirrorBallRotationRad = 0;
let mirrorBallSparklePhase = 0;

export interface ResolvedMirrorBallParams {
  ballX: number;
  ballY: number;
  rotationSpeedDeg: number;
  radiusFrac: number;
  facetCount: number;
  sparkle: number;
  beamCount: number;
  beamSpreadDeg: number;
  ambient: number;
  specular: number;
  reflectivity: number;
  lightX: number;
  lightY: number;
  lightRgb: [number, number, number];
  lightIntensity: number;
  secondaryEnabled: boolean;
  secondaryX: number;
  secondaryY: number;
  secondaryRgb: [number, number, number];
  secondaryIntensity: number;
  audioSyncRotation: boolean;
  strength: number;
}

export function resolveMirrorBallParams(effect: EffectParams): ResolvedMirrorBallParams {
  const strength = DENSITY_STRENGTH[effect.density];
  return {
    ballX: Math.max(0.05, Math.min(0.95, effect.mirrorBallX ?? 0.5)),
    ballY: Math.max(0.08, Math.min(0.92, effect.mirrorBallY ?? 0.28)),
    rotationSpeedDeg: Math.max(-180, Math.min(180, effect.mirrorBallRotationSpeed ?? 14)),
    radiusFrac: Math.max(0.04, Math.min(0.35, effect.mirrorBallRadius ?? 0.12)),
    facetCount: Math.round(Math.max(8, Math.min(64, effect.mirrorBallFacetCount ?? 32))),
    sparkle: Math.max(0, Math.min(1, effect.mirrorBallSparkle ?? 0.65)),
    beamCount: Math.round(Math.max(4, Math.min(32, effect.mirrorBallBeamCount ?? 18))),
    beamSpreadDeg: Math.max(8, Math.min(90, effect.mirrorBallBeamSpread ?? 26)),
    ambient: Math.max(0, Math.min(1, effect.mirrorBallAmbient ?? 0.62)),
    specular: Math.max(0.05, Math.min(1, effect.mirrorBallSpecular ?? 0.72)),
    reflectivity: Math.max(0.1, Math.min(1, effect.mirrorBallReflectivity ?? 0.88)),
    lightX: Math.max(0, Math.min(1, effect.mirrorBallLightX ?? 0.5)),
    lightY: Math.max(0, Math.min(1, effect.mirrorBallLightY ?? 0.08)),
    lightRgb: parseWeatherColorHex(effect.mirrorBallLightColor, [255, 248, 220]),
    lightIntensity: Math.max(0, Math.min(1, effect.mirrorBallLightIntensity ?? 0.85)),
    secondaryEnabled: effect.mirrorBallSecondaryEnabled ?? false,
    secondaryX: Math.max(0, Math.min(1, effect.mirrorBallSecondaryX ?? 0.18)),
    secondaryY: Math.max(0, Math.min(1, effect.mirrorBallSecondaryY ?? 0.22)),
    secondaryRgb: parseWeatherColorHex(effect.mirrorBallSecondaryColor, [180, 210, 255]),
    secondaryIntensity: Math.max(0, Math.min(1, effect.mirrorBallSecondaryIntensity ?? 0.45)),
    audioSyncRotation: effect.mirrorBallAudioSyncRotation ?? false,
    strength,
  };
}

/** 天井から吊るボール: Y軸（上下）を極にして水平回転 */
function rotateY3(x: number, y: number, z: number, angle: number): [number, number, number] {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [x * c + z * s, y, -x * s + z * c];
}

/** 球面法線（Y=上下極, XZ=赤道面） */
function sphereNormal(lon: number, lat: number): [number, number, number] {
  const cl = Math.cos(lat);
  return [Math.cos(lon) * cl, Math.sin(lat), Math.sin(lon) * cl];
}

function projectBallPoint(
  nx: number,
  ny: number,
  nz: number,
  cx: number,
  cy: number,
  r: number
): [number, number] {
  const depth = 0.78 + 0.22 * ((nz + 1) * 0.5);
  return [cx + nx * r * depth, cy - ny * r * depth];
}

function mirrorBallHash(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/** 入射方向 I（光源→面）を法線 N で鏡面反射: R = I - 2(N·I)N */
function reflectDir3(
  ix: number,
  iy: number,
  iz: number,
  nx: number,
  ny: number,
  nz: number
): [number, number, number] {
  const ndoti = nx * ix + ny * iy + nz * iz;
  return [ix - 2 * ndoti * nx, iy - 2 * ndoti * ny, iz - 2 * ndoti * nz];
}

/** スクリーン矩形 [0,w]×[0,h] への前方レイ出口 */
function rayRectExit(
  px: number,
  py: number,
  dx: number,
  dy: number,
  w: number,
  h: number
): { x: number; y: number; t: number } | null {
  const eps = 1e-5;
  if (Math.abs(dx) < eps && Math.abs(dy) < eps) return null;
  let tMax = Infinity;
  if (dx > eps) tMax = Math.min(tMax, (w - px) / dx);
  else if (dx < -eps) tMax = Math.min(tMax, -px / dx);
  if (dy > eps) tMax = Math.min(tMax, (h - py) / dy);
  else if (dy < -eps) tMax = Math.min(tMax, -py / dy);
  if (!Number.isFinite(tMax) || tMax <= eps) return null;
  return { t: tMax, x: px + dx * tMax, y: py + dy * tMax };
}

/**
 * 反射方向を部屋の壁面座標へ（画面全体にスポットが流れるよう、境界のみに偏らない）
 * @param preferBorder true のとき画面端の壁面ヒットを優先（全体の約35%）
 */
function reflectionToRoomPoint(
  sx: number,
  sy: number,
  dirX: number,
  dirY: number,
  width: number,
  height: number,
  p: ResolvedMirrorBallParams,
  seed: number,
  preferBorder: boolean
): { x: number; y: number } | null {
  const len = Math.hypot(dirX, dirY);
  if (len < 0.05) return null;
  const ux = dirX / len;
  const uy = dirY / len;
  const edgeHit = rayRectExit(sx, sy, ux, uy, width, height);
  const spread = 0.42 + p.beamSpreadDeg / 220;
  const panX = 0.5 + spread * Math.tanh(ux * (1.15 + p.specular * 0.35));
  const panY = 0.5 + spread * Math.tanh(uy * (0.95 + p.specular * 0.25));
  const margin = 0.02;
  const interiorX = Math.max(margin, Math.min(1 - margin, panX)) * width;
  const interiorY = Math.max(margin, Math.min(1 - margin, panY)) * height;

  if (preferBorder && edgeHit && mirrorBallHash(seed * 5.9) < 0.35) {
    return { x: edgeHit.x, y: edgeHit.y };
  }
  return { x: interiorX, y: interiorY };
}

interface MirrorBallLightSource {
  x: number;
  y: number;
  z: number;
  rgb: [number, number, number];
  intensity: number;
}

/** 外部スポットライトの細い円錐内か（ボール中心方向を軸） */
function facetInSpotlightCone(
  lx: number,
  ly: number,
  lz: number,
  fx: number,
  fy: number,
  fz: number,
  cx: number,
  cy: number,
  cz: number,
  halfAngleRad: number
): boolean {
  const ax = cx - lx;
  const ay = cy - ly;
  const az = cz - lz;
  const aLen = Math.hypot(ax, ay, az) || 1;
  const tx = fx - lx;
  const ty = fy - ly;
  const tz = fz - lz;
  const tLen = Math.hypot(tx, ty, tz) || 1;
  const dot = (ax * tx + ay * ty + az * tz) / (aLen * tLen);
  return dot >= Math.cos(halfAngleRad);
}

function pushWallSpot(spots: MirrorBallWallSpotDraw[], spot: MirrorBallWallSpotDraw): void {
  if (spot.a < 0.012) return;
  spots.push(spot);
}

function computeTileReflectionSpot(
  width: number,
  height: number,
  cx: number,
  cy: number,
  r: number,
  minDim: number,
  nx: number,
  ny: number,
  nz: number,
  p: ResolvedMirrorBallParams,
  light: MirrorBallLightSource,
  halfConeRad: number,
  audioBoost: number,
  seed: number,
  preferBorder: boolean
): MirrorBallWallSpotDraw | null {
  const ballDepth = r * 0.55;
  const fx = cx + nx * r;
  const fy = cy - ny * r;
  const fz = nz * ballDepth;
  const cz = nz * r * 0.15;

  if (!facetInSpotlightCone(light.x, light.y, light.z, fx, fy, fz, cx, cy, cz, halfConeRad)) {
    return null;
  }

  const iix = fx - light.x;
  const iiy = fy - light.y;
  const iiz = fz - light.z;
  const iLen = Math.hypot(iix, iiy, iiz) || 1;
  const iux = iix / iLen;
  const iuy = iiy / iLen;
  const iuz = iiz / iLen;

  const ndoti = nx * iux + ny * iuy + nz * iuz;
  if (ndoti <= 0.03) return null;

  const [rrx, rry, rrz] = reflectDir3(iux, iuy, iuz, nx, ny, nz);
  const rdx = rrx;
  const rdy = -rry;
  const rdLen = Math.hypot(rdx, rdy);
  if (rdLen < 0.05) return null;

  const [sx, sy] = projectBallPoint(nx, ny, nz, cx, cy, r);
  const roomPt = reflectionToRoomPoint(sx, sy, rdx, rdy, width, height, p, seed, preferBorder);
  if (!roomPt) return null;

  const facing = Math.pow(ndoti, 0.25 + p.specular * 0.55);
  const forward = Math.pow(Math.max(0.08, rdLen), 0.45 + (1 - p.specular) * 0.35);
  const flicker =
    0.72 +
    0.28 *
      Math.pow(
        0.5 + 0.5 * Math.sin(mirrorBallSparklePhase * 2.1 + seed * 4.17),
        1.6 + p.sparkle
      );
  let bright =
    light.intensity *
    p.reflectivity *
    p.strength *
    facing *
    forward *
    flicker *
    (1 + audioBoost * 0.35);
  bright *= 0.55 + 0.45 * (1 - halfConeRad / (Math.PI * 0.5));
  if (bright < 0.01) return null;

  const baseSize = minDim * (0.0028 + p.specular * 0.0022) * (0.75 + p.beamSpreadDeg / 120);
  const sizeVar = 0.65 + mirrorBallHash(seed * 1.9) * 0.7 + p.sparkle * 0.25;
  const half = Math.max(1.4, baseSize * sizeVar * (0.55 + bright * 2.2));

  const [lr, lg, lb] = light.rgb;
  const mix = 0.15 + mirrorBallHash(seed * 3.1) * 0.35;
  return {
    x: roomPt.x,
    y: roomPt.y,
    radius: half,
    r: Math.round(lr * (1 - mix) + 255 * mix),
    g: Math.round(lg * (1 - mix) + 248 * mix),
    b: Math.round(lb * (1 - mix) + 235 * mix),
    a: Math.min(0.72, bright * 0.42),
    square: 0.85 + mirrorBallHash(seed * 5.3) * 0.3,
  };
}

function collectRaycastWallSpots(
  width: number,
  height: number,
  cx: number,
  cy: number,
  r: number,
  minDim: number,
  p: ResolvedMirrorBallParams,
  light: MirrorBallLightSource,
  audioBoost: number
): MirrorBallWallSpotDraw[] {
  const spots: MirrorBallWallSpotDraw[] = [];
  const seg = Math.max(10, p.facetCount);
  const latRings = Math.max(5, Math.round(seg / 2.8));
  const halfConeRad = ((p.beamSpreadDeg * 0.5) * Math.PI) / 180;
  let seed = 0;

  for (let lat = 0; lat < latRings; lat++) {
    const lat0 = -Math.PI * 0.46 + (lat / latRings) * Math.PI * 0.92;
    const lat1 = -Math.PI * 0.46 + ((lat + 1) / latRings) * Math.PI * 0.92;
    const latM = (lat0 + lat1) * 0.5;
    const lonSeg = Math.max(8, Math.round(seg * (0.5 + 0.5 * Math.cos(latM))));
    for (let lon = 0; lon < lonSeg; lon++) {
      const lonM = ((lon + 0.5) / lonSeg) * Math.PI * 2;
      const jitterLon = (mirrorBallHash(seed++) - 0.5) * 0.08;
      const jitterLat = (mirrorBallHash(seed++) - 0.5) * 0.06;
      const [nx0, ny0, nz0] = sphereNormal(lonM + jitterLon, latM + jitterLat);
      const [rx, ry, rz] = rotateY3(nx0, ny0, nz0, mirrorBallRotationRad);
      const len = Math.hypot(rx, ry, rz) || 1;
      const spot = computeTileReflectionSpot(
        width,
        height,
        cx,
        cy,
        r,
        minDim,
        rx / len,
        ry / len,
        rz / len,
        p,
        light,
        halfConeRad,
        audioBoost,
        seed,
        true
      );
      if (spot) pushWallSpot(spots, spot);
    }
  }
  return spots;
}

function collectProceduralWallSpots(
  width: number,
  height: number,
  cx: number,
  cy: number,
  r: number,
  minDim: number,
  p: ResolvedMirrorBallParams,
  light: MirrorBallLightSource,
  audioBoost: number,
  count: number
): MirrorBallWallSpotDraw[] {
  const spots: MirrorBallWallSpotDraw[] = [];
  const halfConeRad = ((p.beamSpreadDeg * 0.55) * Math.PI) / 180;

  for (let i = 0; i < count; i++) {
    const h1 = mirrorBallHash(i * 17.3 + 2.1);
    const h2 = mirrorBallHash(i * 31.7 + 9.4);
    const h3 = mirrorBallHash(i * 53.1 + 0.7);
    const lon = h1 * Math.PI * 2;
    const lat = (h2 - 0.5) * Math.PI * 0.88;
    const [nx0, ny0, nz0] = sphereNormal(lon, lat);
    const [rx, ry, rz] = rotateY3(nx0, ny0, nz0, mirrorBallRotationRad);
    const len = Math.hypot(rx, ry, rz) || 1;
    const spot = computeTileReflectionSpot(
      width,
      height,
      cx,
      cy,
      r,
      minDim,
      rx / len,
      ry / len,
      rz / len,
      p,
      light,
      halfConeRad * (1.05 + h3 * 0.35),
      audioBoost,
      i + 1000,
      false
    );
    if (spot) pushWallSpot(spots, spot);
  }
  return spots;
}

function capWallSpots(spots: MirrorBallWallSpotDraw[], maxSpots: number): MirrorBallWallSpotDraw[] {
  if (spots.length <= maxSpots) return spots;
  spots.sort((a, b) => b.a - a.a);
  return spots.slice(0, maxSpots);
}

function drawMirrorBallSoftSpot(
  ctx: CanvasRenderingContext2D,
  spot: MirrorBallWallSpotDraw
): void {
  const half = spot.radius;
  const aspect = spot.square ?? 1;
  const hw = half * aspect;
  const hh = half / Math.max(0.75, aspect);
  const g = ctx.createRadialGradient(spot.x, spot.y, 0, spot.x, spot.y, Math.max(hw, hh) * 1.15);
  g.addColorStop(0, `rgba(255,255,255,${spot.a * 0.95})`);
  g.addColorStop(0.35, `rgba(${spot.r},${spot.g},${spot.b},${spot.a * 0.85})`);
  g.addColorStop(1, `rgba(${spot.r},${spot.g},${spot.b},0)`);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(spot.x, spot.y, hw, hh, 0, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * ミラーボール1フレーム分の描画データ（Canvas / WebGL 共用）
 */
export function buildMirrorBallFrame(
  width: number,
  height: number,
  effect: EffectParams,
  deltaTime: number,
  audio?: AudioReactiveData
): MirrorBallFrameDraw {
  const p = resolveMirrorBallParams(effect);
  const a = audio ?? SILENT_AUDIO_REACTIVE;
  const minDim = Math.min(width, height);
  const cx = p.ballX * width;
  const cy = p.ballY * height;
  const r = p.radiusFrac * minDim;
  const lx = p.lightX * width;
  const ly = p.lightY * height;

  let rotDeg = p.rotationSpeedDeg;
  if (p.audioSyncRotation) {
    rotDeg += a.bass * 18 + a.volume * 6;
  }
  mirrorBallRotationRad += (rotDeg * Math.PI) / 180 * (deltaTime / 1000);
  mirrorBallSparklePhase += deltaTime * 0.0035 * (1 + a.highFreq * 2 * p.sparkle);

  const audioBoost = a.bass * 0.45 + a.volume * 0.18 + a.highFreq * 0.12 * p.sparkle;
  const lightZ = -minDim * 0.42;

  const lights: MirrorBallLightSource[] = [
    { x: lx, y: ly, z: lightZ, rgb: p.lightRgb, intensity: p.lightIntensity },
  ];
  if (p.secondaryEnabled) {
    lights.push({
      x: p.secondaryX * width,
      y: p.secondaryY * height,
      z: lightZ * 0.92,
      rgb: p.secondaryRgb,
      intensity: p.secondaryIntensity,
    });
  }

  const wallSpotsRaw: MirrorBallWallSpotDraw[] = [];
  const procPerLight = Math.round((14 + p.beamCount * 14) * p.strength);
  const maxSpots = Math.round((120 + p.beamCount * 28 + p.facetCount * 10) * p.strength);

  for (let li = 0; li < lights.length; li++) {
    const light = lights[li];
    const scale = li === 0 ? 1 : 0.72;
    wallSpotsRaw.push(
      ...collectRaycastWallSpots(width, height, cx, cy, r, minDim, p, light, audioBoost)
    );
    wallSpotsRaw.push(
      ...collectProceduralWallSpots(
        width,
        height,
        cx,
        cy,
        r,
        minDim,
        p,
        light,
        audioBoost,
        Math.round(procPerLight * scale)
      )
    );
  }

  const wallSpots = capWallSpots(wallSpotsRaw, maxSpots);
  const beams: MirrorBallBeamDraw[] = [];

  const lightDirs: Array<{ dx: number; dy: number; dz: number; rgb: [number, number, number]; w: number }> = [
    {
      dx: cx - lx,
      dy: cy - ly,
      dz: r * 0.85,
      rgb: p.lightRgb,
      w: p.lightIntensity,
    },
  ];
  if (p.secondaryEnabled) {
    const sx = p.secondaryX * width;
    const sy = p.secondaryY * height;
    lightDirs.push({
      dx: cx - sx,
      dy: cy - sy,
      dz: r * 0.85,
      rgb: p.secondaryRgb,
      w: p.secondaryIntensity,
    });
  }
  for (const ld of lightDirs) {
    const len = Math.hypot(ld.dx, ld.dy, ld.dz) || 1;
    ld.dx /= len;
    ld.dy /= len;
    ld.dz /= len;
  }

  const seg = Math.max(8, p.facetCount);
  const latRings = Math.max(4, Math.round(seg / 3.2));
  const facets: MirrorBallFacetDraw[] = [];

  for (let lat = 0; lat < latRings; lat++) {
    const lat0 = -Math.PI * 0.46 + (lat / latRings) * Math.PI * 0.92;
    const lat1 = -Math.PI * 0.46 + ((lat + 1) / latRings) * Math.PI * 0.92;
    const latM = (lat0 + lat1) * 0.5;
    const lonSeg = Math.max(6, Math.round(seg * (0.5 + 0.5 * Math.cos(latM))));
    for (let lon = 0; lon < lonSeg; lon++) {
      const u0 = (lon / lonSeg) * Math.PI * 2;
      const u1 = ((lon + 1) / lonSeg) * Math.PI * 2;
      const corners: [number, number, number][] = [
        sphereNormal(u0, lat0),
        sphereNormal(u1, lat0),
        sphereNormal(u1, lat1),
        sphereNormal(u0, lat1),
      ];
      let br = 0;
      let tintR = 0;
      let tintG = 0;
      let tintB = 0;
      let tintW = 0;
      const proj: [number, number][] = [];
      for (const [nx0, ny0, nz0] of corners) {
        const [rx, ry, rz] = rotateY3(nx0, ny0, nz0, mirrorBallRotationRad);
        const len = Math.hypot(rx, ry, rz) || 1;
        const nx = rx / len;
        const ny = ry / len;
        const nz = rz / len;
        let spec = 0;
        for (const ld of lightDirs) {
          const dot = Math.max(0, nx * ld.dx + ny * ld.dy + nz * ld.dz);
          const specPow = 2 + p.specular * 46;
          spec += Math.pow(dot, specPow) * ld.w;
          if (dot > 0.02) {
            tintR += ld.rgb[0] * dot * ld.w;
            tintG += ld.rgb[1] * dot * ld.w;
            tintB += ld.rgb[2] * dot * ld.w;
            tintW += dot * ld.w;
          }
        }
        br += spec;
        proj.push(projectBallPoint(nx, ny, nz, cx, cy, r));
      }
      br /= corners.length;
      const ambient = p.ambient * 0.045;
      const base = ambient + br * p.reflectivity * p.strength * (1 + audioBoost * 0.18);
      if (base < 0.04) continue;
      const tr = tintW > 0 ? tintR / tintW : 175;
      const tg = tintW > 0 ? tintG / tintW : 178;
      const tb = tintW > 0 ? tintB / tintW : 188;
      const edge = 0.5 + 0.5 * Math.sin(u0 * 5 + mirrorBallRotationRad * 2 + lat);
      facets.push({
        points: [
          proj[0][0], proj[0][1],
          proj[1][0], proj[1][1],
          proj[2][0], proj[2][1],
        ],
        r: Math.min(255, Math.round(28 + tr * base * edge * 0.55)),
        g: Math.min(255, Math.round(30 + tg * base * edge * 0.55)),
        b: Math.min(255, Math.round(38 + tb * base * edge * 0.55)),
        a: Math.min(1, 0.18 + base * 0.65),
      });
    }
  }

  const sparkles: MirrorBallSparkleDraw[] = [];
  const sparkleN = Math.round(3 + p.sparkle * 10 * p.strength);
  for (let i = 0; i < sparkleN; i++) {
    const phase = mirrorBallSparklePhase + i * 2.11;
    const flicker = Math.pow(0.5 + 0.5 * Math.sin(phase * 3.2), 4);
    if (flicker < 0.55) continue;
    const lon = (i / sparkleN) * Math.PI * 2 + mirrorBallRotationRad;
    const lat = (mirrorBallHash(i * 7.3) - 0.5) * 1.1;
    const [nx0, ny0, nz0] = sphereNormal(lon, lat);
    const [rx, ry, rz] = rotateY3(nx0, ny0, nz0, mirrorBallRotationRad);
    const len = Math.hypot(rx, ry, rz) || 1;
    const [sx, sy] = projectBallPoint(rx / len, ry / len, rz / len, cx, cy, r);
    const [lr, lg, lb] = p.lightRgb;
    sparkles.push({
      x: sx,
      y: sy,
      radius: Math.max(0.8, r * 0.018 * flicker),
      r: lr,
      g: lg,
      b: lb,
      a: p.sparkle * flicker * p.strength * 0.35 * p.lightIntensity,
    });
  }

  return {
    ambientAlpha: p.ambient * p.strength * 0.28,
    beams,
    wallSpots,
    facets,
    sparkles,
    ballCx: cx,
    ballCy: cy,
    ballR: r,
    coreR: Math.max(1.5, r * 0.05),
    coreAlpha: 0.12 + 0.18 * p.reflectivity * p.strength,
    lightX: lx,
    lightY: ly,
  };
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
  const p = resolveMirrorBallParams(effect);
  const [cr, cg, cb] = p.lightRgb;
  ctx.save();

  // 室内の暗さ（背景・スペアナの上、反射スポットの下）
  const roomDim = Math.min(0.55, frame.ambientAlpha);
  if (roomDim > 0.001) {
    ctx.globalCompositeOperation = "multiply";
    const shade = Math.round(255 * (1 - roomDim * 0.92));
    ctx.fillStyle = `rgb(${shade},${shade},${Math.min(255, shade + 8)})`;
    ctx.fillRect(0, 0, width, height);
    ctx.globalCompositeOperation = "source-over";
  }

  ctx.globalCompositeOperation = "lighter";
  for (const w of frame.wallSpots) {
    drawMirrorBallSoftSpot(ctx, w);
  }

  ctx.globalCompositeOperation = "source-over";
  for (const f of frame.facets) {
    const [x1, y1, x2, y2, x3, y3] = f.points;
    ctx.fillStyle = `rgba(${f.r},${f.g},${f.b},${f.a})`;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.lineTo(x3, y3);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = `rgba(255,255,255,${f.a * 0.18})`;
    ctx.lineWidth = Math.max(0.35, frame.ballR * 0.005);
    ctx.stroke();
  }

  ctx.globalCompositeOperation = "lighter";
  for (const s of frame.sparkles) {
    const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.radius * 2.2);
    g.addColorStop(0, `rgba(255,255,255,${s.a})`);
    g.addColorStop(0.5, `rgba(${s.r},${s.g},${s.b},${s.a * 0.5})`);
    g.addColorStop(1, `rgba(${s.r},${s.g},${s.b},0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.radius * 2.2, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.globalCompositeOperation = "source-over";
  const ballGrad = ctx.createRadialGradient(
    frame.ballCx - frame.ballR * 0.2,
    frame.ballCy - frame.ballR * 0.15,
    frame.ballR * 0.08,
    frame.ballCx,
    frame.ballCy,
    frame.ballR
  );
  ballGrad.addColorStop(0, `rgba(200,205,220,${frame.coreAlpha * 0.25})`);
  ballGrad.addColorStop(0.65, `rgba(55,58,72,0.75)`);
  ballGrad.addColorStop(1, "rgba(12,12,22,0.88)");
  ctx.fillStyle = ballGrad;
  ctx.beginPath();
  ctx.arc(frame.ballCx, frame.ballCy, frame.ballR, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "rgba(140,145,165,0.28)";
  ctx.lineWidth = Math.max(0.6, frame.ballR * 0.01);
  ctx.beginPath();
  ctx.arc(frame.ballCx, frame.ballCy, frame.ballR, 0, Math.PI * 2);
  ctx.stroke();

  const lightGlow = ctx.createRadialGradient(
    frame.lightX,
    frame.lightY,
    0,
    frame.lightX,
    frame.lightY,
    frame.ballR * 1.35
  );
  lightGlow.addColorStop(0, `rgba(${cr},${cg},${cb},${0.14 * p.lightIntensity * p.strength})`);
  lightGlow.addColorStop(0.55, `rgba(${cr},${cg},${cb},${0.03 * p.lightIntensity})`);
  lightGlow.addColorStop(1, "rgba(255,255,255,0)");
  ctx.globalCompositeOperation = "lighter";
  ctx.fillStyle = lightGlow;
  ctx.beginPath();
  ctx.arc(frame.lightX, frame.lightY, frame.ballR * 1.35, 0, Math.PI * 2);
  ctx.fill();

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
        effect.effectTintColor
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
        effect.effectTintColor
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
        effect.effectTintColor
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
      case "scanlines":
        drawScanlinesCanvas(ctx, width, height, effect.density, a);
        break;
      case "mirrorBall":
        drawMirrorBallCanvas(ctx, width, height, effect, overlayDelta, a);
        break;
      default:
        break;
    }
  } catch (err) {
    console.warn("Effect draw error:", err);
  }
}
