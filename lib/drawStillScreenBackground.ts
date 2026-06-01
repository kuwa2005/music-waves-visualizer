/**
 * 画面タブ: 静止画背景の描画（Canvas 2D / WebGL 合成の共通実装）。
 *
 * 意図的な対象外（拡張予定なし）:
 * - 背景動画 MP4
 * - ギャラリー画像トランジション中
 * - QuickVideoEncoder のオフライン描画経路
 * - 再生停止中のモーション進行（停止時は開始位置の静止表示）
 * - サビ区間の手動時間指定（音量連動のみ）
 */
import type { AudioReactiveData } from "./Effects";
import {
  DEFAULT_SCREEN_MOTION,
  getAxisMotionProgress,
  hasImageTimelineFade,
  resolveForwardScalePercentAtProgress,
  resolveImageTimelineFadeAlpha,
  resolvePanOffsetPixels,
  type ScreenMotionSettings,
} from "./screenMotion";

export type PlaybackTiming = {
  elapsedSec: number;
  durationSec: number;
};

export type StillBackgroundRect = {
  posX: number;
  posY: number;
  width: number;
  height: number;
  rawWidth: number;
  rawHeight: number;
};

const CHORUS_VOLUME_THRESHOLD = 0.52;

const CHORUS_ENVELOPE_ATTACK = 0.28;
const CHORUS_ENVELOPE_RELEASE = 0.08;
const FLASH_RISE_TRIGGER = 0.01;
const FLASH_MIN_THRESHOLD = 0.35;
const SENSITIVITY_GAIN_PER_STEP = 0.12;
const SENSITIVITY_THRESHOLD_DELTA_PER_STEP = -0.03;
const BRIGHTNESS_BASE_THRESHOLD = 0.5;
const BRIGHTNESS_BASE_RISE_TRIGGER = 0.012;
const BRIGHTNESS_PULSE_DECAY_MS = 180;
const BRIGHTNESS_PULSE_ATTACK = 0.7;
const BRIGHTNESS_PULSE_RELEASE = 0.25;

let brightnessEnvelope = 0;
let prevBrightnessEnvelope = 0;
let brightnessPulse = 0;
let brightnessLastUpdateMs = 0;
let shakeEnvelope = 0;
let chorusZoomEnvelope = 0;
let flashEnvelope = 0;
let prevFlashEnvelope = 0;
let flashUntilMs = 0;
let flashCooldownUntilMs = 0;

function getSensitivityGain(step: number): number {
  return Math.max(0.5, Math.min(1.8, 1 + step * SENSITIVITY_GAIN_PER_STEP));
}

function getThresholdWithSensitivity(base: number, step: number, min: number = 0.2, max: number = 0.95): number {
  return Math.max(min, Math.min(max, base + step * SENSITIVITY_THRESHOLD_DELTA_PER_STEP));
}

function resolveChorusEnvelope(
  sensitivityStep: number,
  audioR: AudioReactiveData | undefined,
  prev: number
): number {
  if (!audioR) return prev * 0.88;
  const sensitivityGain = getSensitivityGain(sensitivityStep);
  const sensedVolume = Math.max(0, Math.min(1, audioR.volume * sensitivityGain));
  const coeff = sensedVolume >= prev ? CHORUS_ENVELOPE_ATTACK : CHORUS_ENVELOPE_RELEASE;
  return prev + (sensedVolume - prev) * coeff;
}

function resolveChorusDrive(envelope: number, sensitivityStep: number): number {
  const threshold = getThresholdWithSensitivity(CHORUS_VOLUME_THRESHOLD, sensitivityStep, 0.3, 0.85);
  return Math.max(0, Math.min(1, (envelope - threshold) / Math.max(1e-6, 1 - threshold)));
}

export function resetScreenEffectRuntime(): void {
  brightnessEnvelope = 0;
  prevBrightnessEnvelope = 0;
  brightnessPulse = 0;
  brightnessLastUpdateMs = 0;
  shakeEnvelope = 0;
  chorusZoomEnvelope = 0;
  flashEnvelope = 0;
  prevFlashEnvelope = 0;
  flashUntilMs = 0;
  flashCooldownUntilMs = 0;
}

export function computeStillBackgroundRect(
  image: HTMLImageElement,
  canvasWidth: number,
  canvasHeight: number,
  settings: ScreenMotionSettings,
  timing: PlaybackTiming | undefined,
  shakeOffset: { x: number; y: number } = { x: 0, y: 0 }
): StillBackgroundRect {
  const rawWidth = image.naturalWidth || image.width || 1;
  const rawHeight = image.naturalHeight || image.height || 1;
  const coverScale = Math.max(canvasWidth / rawWidth, canvasHeight / rawHeight);
  const elapsed = settings.motionEnabled ? (timing?.elapsedSec ?? 0) : 0;
  const axisProgress = getAxisMotionProgress(elapsed, settings);
  const zoomPercent = resolveForwardScalePercentAtProgress(settings, axisProgress.forward);
  const scale = coverScale * (zoomPercent / 100);
  const width = Math.round(rawWidth * scale);
  const height = Math.round(rawHeight * scale);
  const overflowX = Math.max(0, width - canvasWidth);
  const overflowY = Math.max(0, height - canvasHeight);
  const pan = resolvePanOffsetPixels(settings, axisProgress.x, axisProgress.y, overflowX, overflowY);
  const posX = (canvasWidth - width) / 2 + pan.x + shakeOffset.x;
  const posY = (canvasHeight - height) / 2 + pan.y + shakeOffset.y;
  return { posX, posY, width, height, rawWidth, rawHeight };
}

function resolveShakeOffset(settings: ScreenMotionSettings, audioR: AudioReactiveData | undefined, nowMs: number): { x: number; y: number } {
  if (!settings.shakeOnChorus || !audioR) {
    return { x: 0, y: 0 };
  }
  shakeEnvelope = resolveChorusEnvelope(settings.shakeSensitivityStep, audioR, shakeEnvelope);
  const baseDrive = resolveChorusDrive(shakeEnvelope, settings.shakeSensitivityStep);
  const sensitivityScalar = Math.max(0.55, Math.min(1.7, 1 + settings.shakeSensitivityStep * 0.12));
  const chorusDrive = Math.max(0, Math.min(1, Math.pow(baseDrive * sensitivityScalar, 0.92)));
  if (chorusDrive <= 0.001) return { x: 0, y: 0 };
  const t = nowMs * 0.02;
  const amp = settings.shakeStrength * chorusDrive;
  return { x: Math.sin(t * 1.7) * amp, y: Math.cos(t * 2.3) * amp };
}

function updateFlashState(settings: ScreenMotionSettings, audioR: AudioReactiveData | undefined, nowMs: number): number {
  if (!settings.flashOnDrop || !audioR) {
    flashEnvelope *= 0.88;
    prevFlashEnvelope = flashEnvelope;
    return 0;
  }
  flashEnvelope = resolveChorusEnvelope(settings.flashSensitivityStep, audioR, flashEnvelope);
  const rising = flashEnvelope - prevFlashEnvelope;
  prevFlashEnvelope = flashEnvelope;
  const effectiveThreshold = getThresholdWithSensitivity(settings.flashThreshold, settings.flashSensitivityStep, FLASH_MIN_THRESHOLD, 0.98);
  const effectiveRisingTrigger = getThresholdWithSensitivity(FLASH_RISE_TRIGGER, settings.flashSensitivityStep, 0.004, 0.03);

  if (flashEnvelope >= effectiveThreshold && rising >= effectiveRisingTrigger && nowMs >= flashCooldownUntilMs) {
    const decayMs = Math.max(1, settings.flashDurationSec * 1000);
    flashUntilMs = nowMs + decayMs;
    flashCooldownUntilMs = nowMs + settings.flashCooldownMs;
  }
  const decayMs = Math.max(1, settings.flashDurationSec * 1000);
  if (nowMs < flashUntilMs) {
    const remain = (flashUntilMs - nowMs) / decayMs;
    return settings.flashIntensity * Math.max(0, Math.min(1, remain));
  }

  return 0;
}

function updateSmoothedBrightness(
  settings: ScreenMotionSettings,
  audioR: AudioReactiveData | undefined,
  nowMs: number
): number {
  if (!settings.brightnessOnPeak || !audioR) {
    brightnessEnvelope *= 0.82;
    prevBrightnessEnvelope = brightnessEnvelope;
    brightnessPulse *= 0.7;
    brightnessLastUpdateMs = nowMs;
    return 0;
  }
  if (brightnessLastUpdateMs <= 0) brightnessLastUpdateMs = nowMs;
  const dtMs = Math.max(1, nowMs - brightnessLastUpdateMs);
  brightnessLastUpdateMs = nowMs;

  brightnessEnvelope = resolveChorusEnvelope(settings.brightnessSensitivityStep, audioR, brightnessEnvelope);
  const rising = Math.max(0, brightnessEnvelope - prevBrightnessEnvelope);
  prevBrightnessEnvelope = brightnessEnvelope;

  const threshold = getThresholdWithSensitivity(BRIGHTNESS_BASE_THRESHOLD, settings.brightnessSensitivityStep, 0.28, 0.88);
  const riseTrigger = getThresholdWithSensitivity(BRIGHTNESS_BASE_RISE_TRIGGER, settings.brightnessSensitivityStep, 0.004, 0.03);
  const gate = Math.max(0, Math.min(1, (brightnessEnvelope - threshold) / Math.max(1e-6, 1 - threshold)));
  const riseNorm = Math.max(0, Math.min(1, (rising - riseTrigger) / Math.max(1e-6, 0.24 - riseTrigger)));
  const impulse = Math.max(0, Math.min(1, gate * (0.45 + 0.55 * riseNorm) + riseNorm * 0.65));

  const pulseCoeff = impulse >= brightnessPulse ? BRIGHTNESS_PULSE_ATTACK : BRIGHTNESS_PULSE_RELEASE;
  brightnessPulse += (impulse - brightnessPulse) * pulseCoeff;
  brightnessPulse *= Math.exp(-dtMs / BRIGHTNESS_PULSE_DECAY_MS);

  const strength01 = Math.max(0, Math.min(1, (settings.brightnessStrength - 0.03) / 0.17));
  const maxBoost = 0.12 + 0.48 * Math.pow(strength01, 0.8);
  return Math.max(0, Math.min(0.62, brightnessPulse * maxBoost));
}

function resolveChorusZoomMultiplier(settings: ScreenMotionSettings, audioR: AudioReactiveData | undefined): number {
  if (!settings.chorusZoomOnPeak || !audioR) {
    chorusZoomEnvelope *= 0.88;
    return 1;
  }
  chorusZoomEnvelope = resolveChorusEnvelope(settings.shakeSensitivityStep, audioR, chorusZoomEnvelope);
  const chorusDrive = resolveChorusDrive(chorusZoomEnvelope, settings.shakeSensitivityStep);
  return 1 + (settings.chorusZoomPercent / 100) * chorusDrive;
}

/** 静止画背景（ズーム・パン・音連動）を Canvas 2D に描画 */
export function drawStillScreenBackground(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  canvasWidth: number,
  canvasHeight: number,
  settings: ScreenMotionSettings | undefined,
  timing: PlaybackTiming | undefined,
  audioReactive?: AudioReactiveData
): void {
  const sm = settings ?? DEFAULT_SCREEN_MOTION;
  const nowMs = performance.now();
  const shake = resolveShakeOffset(sm, audioReactive, nowMs);
  const rect = computeStillBackgroundRect(image, canvasWidth, canvasHeight, sm, timing, shake);
  const chorusZoomMul = resolveChorusZoomMultiplier(sm, audioReactive);
  const minCoverMul = 1;
  const finalZoomMul = Math.max(minCoverMul, chorusZoomMul);
  const finalWidth = Math.round(rect.width * finalZoomMul);
  const finalHeight = Math.round(rect.height * finalZoomMul);
  const zoomedRect = {
    ...rect,
    width: finalWidth,
    height: finalHeight,
    posX: rect.posX - (finalWidth - rect.width) / 2,
    posY: rect.posY - (finalHeight - rect.height) / 2,
  };
  const brightnessBoost = updateSmoothedBrightness(sm, audioReactive, nowMs);
  const flashAlpha = updateFlashState(sm, audioReactive, nowMs);
  const timelineFadeAlpha = resolveImageTimelineFadeAlpha(sm, timing);

  ctx.fillStyle = "rgba(34, 34, 34, 1.0)";
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  ctx.save();
  if (timelineFadeAlpha < 0.999) {
    ctx.globalAlpha = timelineFadeAlpha;
  }
  if (brightnessBoost > 0.001) {
    ctx.filter = `brightness(${1 + brightnessBoost})`;
  }
  ctx.drawImage(
    image,
    0,
    0,
    rect.rawWidth,
    rect.rawHeight,
    zoomedRect.posX,
    zoomedRect.posY,
    zoomedRect.width,
    zoomedRect.height
  );
  ctx.restore();

  if (flashAlpha > 0.001) {
    ctx.fillStyle = `rgba(255, 255, 255, ${flashAlpha})`;
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);
  }
}

/** 静止画専用パイプラインを使うか（動画背景・ギャラリートランジションは従来描画のまま） */
export function shouldUseStillScreenBackgroundPipeline(
  image: HTMLImageElement | null,
  settings: ScreenMotionSettings | undefined,
  hasBackgroundVideo: boolean,
  hasGalleryTransition: boolean
): boolean {
  if (!image || hasBackgroundVideo || hasGalleryTransition) return false;
  if (!settings) return false;
  const hasMotionTransform =
    settings.motionEnabled &&
    (settings.imageZoomPercent > 100 ||
      settings.panForwardPercent > 0 ||
      settings.panXPercent > 0 ||
      settings.panYPercent > 0);
  return (
    hasMotionTransform ||
    hasImageTimelineFade(settings) ||
    settings.brightnessOnPeak ||
    settings.shakeOnChorus ||
    settings.chorusZoomOnPeak ||
    settings.flashOnDrop
  );
}
