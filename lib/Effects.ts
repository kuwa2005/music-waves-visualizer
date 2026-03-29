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
  | "scanlines";

export type EffectDensity = 1 | 2 | 3;

export interface EffectParams {
  type: EffectType;
  density: EffectDensity;
  /** 雨・雪: 鉛直からの傾き（度）。0=真下、正で右へ傾く */
  weatherAngleDeg?: number;
  /** 雨・雪: 量 0〜1 */
  weatherAmount?: number;
  /** 雨・雪: 色 #RRGGBB */
  weatherColor?: string;
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
  /** ランダム回転（ラジアン） */
  rotation: number;
  /**
   * 移動スピード倍率（1〜2）。スポーン／再出現時のみ決定し、生存中は固定。
   */
  driftSpeedMul: number;
}

let sparkleParticles: SparkleParticle[] = [];
let lastSparkleParams: { density: EffectDensity; width: number; height: number } | null = null;

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
  audio?: AudioReactiveData
): SparkleParticleDraw[] {
  if (
    !lastSparkleParams ||
    lastSparkleParams.density !== density ||
    lastSparkleParams.width !== width ||
    lastSparkleParams.height !== height
  ) {
    initSparkleParticles(width, height, density);
    lastSparkleParams = { density, width, height };
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
      r: 255,
      g: 255,
      b: 255,
      alpha,
      starKind: p.starKind,
      rotation: p.rotation,
    });
  }
  return out;
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
  audio: AudioReactiveData
): void {
  const list = updateAndGetSparkleParticles(width, height, density, deltaTime, audio);
  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  for (const p of list) {
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
}

let dustParticles: DustParticle[] = [];
let lastDustParams: { density: EffectDensity; width: number; height: number } | null = null;

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

function initDustParticles(width: number, height: number, density: EffectDensity): void {
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
      vx: (Math.random() - 0.5) * 0.55,
      vy: (Math.random() - 0.25) * 0.42,
      size: randomDustParticleSize(sLo, sHi),
      baseAlpha: 0.22 + Math.random() * 0.2,
      phase: Math.random() * Math.PI * 2,
    });
  }
}

/**
 * WebGL 用: ほこり粒子を更新して描画用リストを返す
 */
export function updateAndGetDustParticles(
  width: number,
  height: number,
  density: EffectDensity,
  deltaTime: number,
  audio?: AudioReactiveData
): Array<{ x: number; y: number; radius: number; r: number; g: number; b: number; alpha: number }> {
  if (
    !lastDustParams ||
    lastDustParams.density !== density ||
    lastDustParams.width !== width ||
    lastDustParams.height !== height
  ) {
    initDustParticles(width, height, density);
    lastDustParams = { density, width, height };
  }
  const a = audio ?? SILENT_AUDIO_REACTIVE;
  const strength = DENSITY_STRENGTH[density];
  const flow = 0.5 + 0.5 * a.volume;
  const out: Array<{ x: number; y: number; radius: number; r: number; g: number; b: number; alpha: number }> = [];

  for (const p of dustParticles) {
    p.phase += 1.05 * (deltaTime / 1000);
    p.x += p.vx * (deltaTime / 16) * flow * (1 + 0.4 * a.bass);
    p.y += p.vy * (deltaTime / 16) * flow;
    if (p.x < -30) p.x += width + 60;
    if (p.x > width + 30) p.x -= width + 60;
    if (p.y < -30) p.y += height + 60;
    if (p.y > height + 30) p.y -= height + 60;

    const flicker = 0.5 + 0.5 * Math.sin(p.phase);
    const rawAlpha =
      p.baseAlpha * flicker * strength * (1.2 + 0.45 * a.volume);
    const alpha = Math.min(1, rawAlpha * DUST_INTENSITY_MUL);
    const gray = 210 + Math.floor(Math.sin(p.phase * 0.7) * 40);
    const blueLift = Math.floor(Math.sin(p.phase * 1.1) * 18);
    out.push({
      x: p.x,
      y: p.y,
      radius: p.size * (1.05 + 0.08 * Math.min(DUST_INTENSITY_MUL, 4)),
      r: Math.min(255, gray + blueLift),
      g: Math.min(255, gray + 6),
      b: Math.min(255, gray + 18 + blueLift),
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
  audio: AudioReactiveData
): void {
  const list = updateAndGetDustParticles(width, height, density, deltaTime, audio);
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
  const spacing = density === 3 ? 3 : density === 2 ? 4 : 5;
  const base = 0.055 + 0.11 * strength;
  const pulse = 0.82 + 0.18 * Math.min(1, audio.volume * 0.7 + audio.bass * 0.35);
  const alpha = Math.min(0.2, base * pulse);
  ctx.save();
  ctx.fillStyle = `rgba(0,0,0,${alpha})`;
  for (let y = 0; y < height; y += spacing) {
    ctx.fillRect(0, y, width, 1);
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
      case "sparkle":
        drawSparkleCanvas(ctx, width, height, effect.density, overlayDelta, a);
        break;
      case "dust":
        drawDustCanvas(ctx, width, height, effect.density, overlayDelta, a);
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
      default:
        break;
    }
  } catch (err) {
    console.warn("Effect draw error:", err);
  }
}
