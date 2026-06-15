/**
 * レーザー光線エフェクト（Phase 1: 本体のみ・フラッシュなし）
 * Canvas 2D 主経路。WebGL は updateAndGetLaserSegments + drawLine。
 */

import type { EffectDensity } from "./Effects";

/** 内部チューニング（UI からは density のみ） */
export interface LaserEffectConfig {
  edgeMarginRatio: number;
  edgeTargetBias: number;
  burstShotsPerSource: Record<EffectDensity, number>;
  burstGapMs: Record<EffectDensity, number>;
  fireRatePerSec: Record<EffectDensity, number>;
  maxActiveBeams: Record<EffectDensity, number>;
  maxDrawSegments: Record<EffectDensity, number>;
  glowPassesPerBeam: number;
  durationMsMin: number;
  durationMsMax: number;
  /** ビーム長さ = 画面対角 × この倍率（上限、矩形クリップ後は端まで） */
  lengthMinDiagMul: number;
  lengthMaxDiagMul: number;
}

export const DEFAULT_LASER_CONFIG: LaserEffectConfig = {
  edgeMarginRatio: 0.1,
  edgeTargetBias: 0.85,
  burstShotsPerSource: { 1: 14, 2: 24, 3: 36 },
  burstGapMs: { 1: 320, 2: 200, 3: 130 },
  fireRatePerSec: { 1: 10, 2: 22, 3: 38 },
  maxActiveBeams: { 1: 25, 2: 40, 3: 60 },
  glowPassesPerBeam: 4,
  maxDrawSegments: { 1: 110, 2: 180, 3: 260 },
  durationMsMin: 75,
  durationMsMax: 190,
  lengthMinDiagMul: 1.05,
  lengthMaxDiagMul: 1.95,
};

const DENSITY_STRENGTH: Record<EffectDensity, number> = { 1: 0.55, 2: 0.8, 3: 1.0 };

/** 外側→内側（lighter で重ねる）。alphaMul は寿命フェードに掛けるのみ（ピーク 1.0） */
const GLOW_LAYERS: ReadonlyArray<{
  lwMul: number;
  alphaMul: number;
  whiteMix: number;
}> = [
  { lwMul: 10, alphaMul: 1, whiteMix: 0.12 },
  { lwMul: 4.2, alphaMul: 1, whiteMix: 0.22 },
  { lwMul: 1.5, alphaMul: 1, whiteMix: 0.38 },
  { lwMul: 0.48, alphaMul: 1, whiteMix: 0.78 },
];

const LASER_PALETTE: ReadonlyArray<{ r: number; g: number; b: number }> = [
  { r: 255, g: 30, b: 90 },
  { r: 40, g: 255, b: 140 },
  { r: 90, g: 170, b: 255 },
  { r: 255, g: 60, b: 220 },
  { r: 255, g: 230, b: 70 },
  { r: 200, g: 90, b: 255 },
];

export type LaserSegmentGl = {
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

interface LaserBeam {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  bornMs: number;
  durationMs: number;
  lw: number;
  r: number;
  g: number;
  b: number;
}

let lasers: LaserBeam[] = [];
let sourceX = 0;
let sourceY = 0;
let shotsLeftInBurst = 0;
let burstCooldownMs = 0;
let fireCarry = 0;
let lastSimKey = "";
const segmentBuffer: LaserSegmentGl[] = [];

function mixWhite(r: number, g: number, b: number, mix: number): { r: number; g: number; b: number } {
  const t = Math.max(0, Math.min(1, mix));
  return {
    r: Math.round(r + (255 - r) * t),
    g: Math.round(g + (255 - g) * t),
    b: Math.round(b + (255 - b) * t),
  };
}

/** 発射点から (dx,dy) 方向に矩形 [0,w]×[0,h] の辺へ届く正の t */
function rayLengthToRectBounds(
  ox: number,
  oy: number,
  dx: number,
  dy: number,
  w: number,
  h: number
): number {
  const eps = 1e-9;
  let tMin = Infinity;
  if (Math.abs(dx) > eps) {
    for (const tx of [(0 - ox) / dx, (w - ox) / dx]) {
      if (tx > eps) tMin = Math.min(tMin, tx);
    }
  }
  if (Math.abs(dy) > eps) {
    for (const ty of [(0 - oy) / dy, (h - oy) / dy]) {
      if (ty > eps) tMin = Math.min(tMin, ty);
    }
  }
  return Number.isFinite(tMin) ? tMin : Math.hypot(w, h);
}

function pickEdgeTargetPoint(w: number, h: number, margin: number): { x: number; y: number } {
  const mx = Math.max(4, margin);
  const my = Math.max(4, margin);
  const side = Math.floor(Math.random() * 4);
  if (side === 0) return { x: mx + Math.random() * Math.max(1, w - 2 * mx), y: my };
  if (side === 1) return { x: w - mx, y: my + Math.random() * Math.max(1, h - 2 * my) };
  if (side === 2) return { x: mx + Math.random() * Math.max(1, w - 2 * mx), y: h - my };
  return { x: mx, y: my + Math.random() * Math.max(1, h - 2 * my) };
}

function pickSource(width: number, height: number, cfg: LaserEffectConfig): void {
  const m = cfg.edgeMarginRatio;
  const mx = width * m;
  const my = height * m;
  sourceX = mx + Math.random() * Math.max(1, width - 2 * mx);
  sourceY = my + Math.random() * Math.max(1, height - 2 * my);
}

function resetLaserSim(
  width: number,
  height: number,
  density: EffectDensity,
  cfg: LaserEffectConfig
): void {
  lasers = [];
  pickSource(width, height, cfg);
  shotsLeftInBurst = cfg.burstShotsPerSource[density];
  burstCooldownMs = 0;
  fireCarry = 0;
}

function spawnLaser(
  width: number,
  height: number,
  density: EffectDensity,
  cfg: LaserEffectConfig
): void {
  const diag = Math.hypot(width, height);
  const strength = DENSITY_STRENGTH[density];
  const margin = Math.min(width, height) * cfg.edgeMarginRatio;

  let ux: number;
  let uy: number;
  if (Math.random() < cfg.edgeTargetBias) {
    const tgt = pickEdgeTargetPoint(width, height, margin);
    let dx = tgt.x - sourceX;
    let dy = tgt.y - sourceY;
    const d0 = Math.hypot(dx, dy);
    if (d0 < 6) {
      const a = Math.random() * Math.PI * 2;
      ux = Math.cos(a);
      uy = Math.sin(a);
    } else {
      ux = dx / d0;
      uy = dy / d0;
    }
  } else {
    const a = Math.random() * Math.PI * 2;
    ux = Math.cos(a);
    uy = Math.sin(a);
  }

  const reachMin = diag * cfg.lengthMinDiagMul * (0.9 + 0.1 * strength);
  const reachMax = diag * cfg.lengthMaxDiagMul * (0.94 + 0.06 * strength);
  const wantLen = reachMin + Math.random() * Math.max(0, reachMax - reachMin);
  const maxClip = rayLengthToRectBounds(sourceX, sourceY, ux, uy, width, height);
  const len = Math.min(wantLen, maxClip);

  const color = LASER_PALETTE[Math.floor(Math.random() * LASER_PALETTE.length)];
  lasers.push({
    x1: sourceX,
    y1: sourceY,
    x2: sourceX + ux * len,
    y2: sourceY + uy * len,
    bornMs: performance.now(),
    durationMs:
      cfg.durationMsMin + Math.random() * (cfg.durationMsMax - cfg.durationMsMin),
    lw: Math.max(1.1, 1.2 + Math.random() * (1.6 + density * 0.45)),
    r: color.r,
    g: color.g,
    b: color.b,
  });
}

function pushBeamGlowLayers(
  beam: LaserBeam,
  alpha: number,
  passes: number,
  out: LaserSegmentGl[],
  segCap: number
): void {
  const baseLw = Math.max(0.9, beam.lw);
  const n = Math.min(passes, GLOW_LAYERS.length);

  for (let li = 0; li < n; li++) {
    if (out.length >= segCap) return;
    const layer = GLOW_LAYERS[li];
    const rgb = mixWhite(beam.r, beam.g, beam.b, layer.whiteMix);
    out.push({
      x1: beam.x1,
      y1: beam.y1,
      x2: beam.x2,
      y2: beam.y2,
      lw: baseLw * layer.lwMul,
      r: rgb.r,
      g: rgb.g,
      b: rgb.b,
      a: alpha * layer.alphaMul,
    });
  }
}

function buildSegments(nowMs: number, cfg: LaserEffectConfig, density: EffectDensity): LaserSegmentGl[] {
  segmentBuffer.length = 0;
  const segCap = cfg.maxDrawSegments[density];
  const passes = Math.min(cfg.glowPassesPerBeam, GLOW_LAYERS.length);

  for (let i = 0; i < lasers.length; i++) {
    if (segmentBuffer.length >= segCap) break;
    const beam = lasers[i];
    const t = (nowMs - beam.bornMs) / beam.durationMs;
    if (t < 0 || t >= 1) continue;
    const fade = 1 - t * t;
    if (fade < 0.018) continue;
    pushBeamGlowLayers(beam, fade, passes, segmentBuffer, segCap);
  }
  return segmentBuffer;
}

/** Canvas / WebGL 共用: レーザー線分（多層グロー） */
export function updateAndGetLaserSegments(
  width: number,
  height: number,
  density: EffectDensity,
  deltaTime: number,
  cfg: LaserEffectConfig = DEFAULT_LASER_CONFIG
): LaserSegmentGl[] {
  if (width <= 0 || height <= 0) {
    segmentBuffer.length = 0;
    return segmentBuffer;
  }

  const key = `laser|${width}|${height}|${density}`;
  if (key !== lastSimKey) {
    resetLaserSim(width, height, density, cfg);
    lastSimKey = key;
  }

  const dtMs = Math.min(Math.max(deltaTime, 0), 50);
  const dt = dtMs / 1000;
  const nowMs = performance.now();
  const maxActive = cfg.maxActiveBeams[density];

  let write = 0;
  for (let i = 0; i < lasers.length; i++) {
    const beam = lasers[i];
    if (nowMs - beam.bornMs < beam.durationMs) {
      lasers[write++] = beam;
    }
  }
  lasers.length = write;

  if (burstCooldownMs > 0) {
    burstCooldownMs = Math.max(0, burstCooldownMs - dtMs);
    if (burstCooldownMs <= 0) {
      pickSource(width, height, cfg);
      shotsLeftInBurst = cfg.burstShotsPerSource[density];
      fireCarry = 0;
    }
    return buildSegments(nowMs, cfg, density);
  }

  if (shotsLeftInBurst <= 0) {
    burstCooldownMs = cfg.burstGapMs[density];
    return buildSegments(nowMs, cfg, density);
  }

  fireCarry += cfg.fireRatePerSec[density] * dt;
  while (fireCarry >= 1 && shotsLeftInBurst > 0 && lasers.length < maxActive) {
    fireCarry -= 1;
    shotsLeftInBurst -= 1;
    spawnLaser(width, height, density, cfg);
  }

  if (shotsLeftInBurst <= 0) {
    burstCooldownMs = cfg.burstGapMs[density];
  }

  return buildSegments(nowMs, cfg, density);
}

export function drawLaserCanvas(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  density: EffectDensity,
  deltaTime: number,
  cfg: LaserEffectConfig = DEFAULT_LASER_CONFIG
): void {
  const segments = updateAndGetLaserSegments(width, height, density, deltaTime, cfg);
  if (segments.length === 0) return;

  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.lineCap = "round";
  ctx.shadowBlur = 0;

  let prevLw = -1;
  let prevStyle = "";
  for (const s of segments) {
    if (s.a < 0.018) continue;
    const strokeStyle = `rgba(${s.r},${s.g},${s.b},${s.a})`;
    if (strokeStyle !== prevStyle) {
      ctx.strokeStyle = strokeStyle;
      prevStyle = strokeStyle;
    }
    if (s.lw !== prevLw) {
      ctx.lineWidth = s.lw;
      prevLw = s.lw;
    }
    ctx.beginPath();
    ctx.moveTo(s.x1, s.y1);
    ctx.lineTo(s.x2, s.y2);
    ctx.stroke();
  }
  ctx.restore();
}
