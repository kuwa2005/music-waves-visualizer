/**
 * 背景静止画モーション・演出（画面タブ）の設定型と補間。
 * 描画は drawStillScreenBackground.ts 経由。対象外範囲は同ファイル先頭コメント参照。
 */
import type { ResolvedClip } from "./clipAudioFade";

export const SCREEN_MOTION_ZOOM_MIN_PERCENT = 100;
export const SCREEN_MOTION_IMAGE_FADE_MIN_SEC = 0;
export const SCREEN_MOTION_IMAGE_FADE_MAX_SEC = 30;
export const SCREEN_MOTION_IMAGE_FADE_STEP = 0.1;
export const SCREEN_MOTION_ZOOM_MAX_PERCENT = 500;
export const SCREEN_MOTION_PAN_MIN = 0;
export const SCREEN_MOTION_PAN_MAX = 100;
export const SCREEN_MOTION_SPEED_MIN = 1;
export const SCREEN_MOTION_SPEED_MAX = 10;
export const SCREEN_MOTION_SPEED_STEP = 0.1;

export type ScreenMotionSettings = {
  motionEnabled: boolean;
  imageZoomPercent: number;
  panForwardPercent: number;
  panXPercent: number;
  panYPercent: number;
  speedForward: number;
  speedX: number;
  speedY: number;
  brightnessOnPeak: boolean;
  brightnessStrength: number;
  brightnessSensitivityStep: number;
  shakeOnChorus: boolean;
  chorusZoomOnPeak: boolean;
  chorusZoomPercent: number;
  shakeStrength: number;
  shakeSensitivityStep: number;
  flashOnDrop: boolean;
  flashSensitivityStep: number;
  flashIntensity: number;
  flashDurationSec: number;
  flashThreshold: number;
  flashCooldownMs: number;
  /** 再生開始から画像を暗から明るくする秒数。0=オフ */
  imageFadeInSec: number;
  /** 曲終了前に画像を暗くする秒数。0=オフ */
  imageFadeOutSec: number;
};

export const DEFAULT_SCREEN_MOTION: ScreenMotionSettings = {
  motionEnabled: false,
  imageZoomPercent: 100,
  panForwardPercent: 0,
  panXPercent: 0,
  panYPercent: 0,
  speedForward: 3,
  speedX: 3,
  speedY: 3,
  brightnessOnPeak: false,
  brightnessStrength: 0.05,
  brightnessSensitivityStep: 0,
  shakeOnChorus: false,
  chorusZoomOnPeak: false,
  chorusZoomPercent: 2,
  shakeStrength: 2,
  shakeSensitivityStep: 0,
  flashOnDrop: false,
  flashSensitivityStep: 0,
  flashIntensity: 0.2,
  flashDurationSec: 0.12,
  flashThreshold: 0.68,
  flashCooldownMs: 380,
  imageFadeInSec: 0,
  imageFadeOutSec: 0,
};

function clampNum(v: number, min: number, max: number, fallback?: number): number {
  const base = Number.isNaN(v) ? (fallback ?? min) : v;
  return Math.max(min, Math.min(max, base));
}

export function clampZoomPercent(percent: number): number {
  return Math.max(SCREEN_MOTION_ZOOM_MIN_PERCENT, Math.min(SCREEN_MOTION_ZOOM_MAX_PERCENT, percent));
}

export function normalizeSpeedSlider(v: number, fallback: number = DEFAULT_SCREEN_MOTION.speedX): number {
  const clamped = clampNum(v, SCREEN_MOTION_SPEED_MIN, SCREEN_MOTION_SPEED_MAX, fallback);
  return Math.round(clamped / SCREEN_MOTION_SPEED_STEP) * SCREEN_MOTION_SPEED_STEP;
}

export function pingPongSignedCosine(cyclePhase01: number): number {
  const phase = Math.max(0, Math.min(1, cyclePhase01));
  return -Math.cos(2 * Math.PI * phase);
}

export function resolveForwardScalePercentAtProgress(
  settings: ScreenMotionSettings,
  cyclePhase01: number
): number {
  if (!settings.motionEnabled) {
    return SCREEN_MOTION_ZOOM_MIN_PERCENT;
  }
  const baseZoom = clampZoomPercent(settings.imageZoomPercent);
  if (settings.panForwardPercent <= 0) {
    return baseZoom;
  }
  const panAmt = clampNum(settings.panForwardPercent, SCREEN_MOTION_PAN_MIN, SCREEN_MOTION_PAN_MAX, 0) / 100;
  const minZoom = baseZoom - (baseZoom - SCREEN_MOTION_ZOOM_MIN_PERCENT) * panAmt;
  const signed = pingPongSignedCosine(cyclePhase01);
  const u = (signed + 1) / 2;
  return clampZoomPercent(minZoom + (baseZoom - minZoom) * u);
}

export function resolvePanAxisOffsetPixels(
  panPercent: number,
  overflow: number,
  cyclePhase01: number
): number {
  const panAmt = clampNum(panPercent, SCREEN_MOTION_PAN_MIN, SCREEN_MOTION_PAN_MAX, 0) / 100;
  if (panAmt <= 0 || overflow <= 0) return 0;
  const maxOffset = (overflow / 2) * panAmt;
  return pingPongSignedCosine(cyclePhase01) * maxOffset;
}

export function resolvePanOffsetPixels(
  settings: ScreenMotionSettings,
  phaseX: number,
  phaseY: number,
  overflowX: number,
  overflowY: number
): { x: number; y: number } {
  if (!settings.motionEnabled) {
    return { x: 0, y: 0 };
  }
  return {
    x: resolvePanAxisOffsetPixels(settings.panXPercent, overflowX, phaseX),
    y: resolvePanAxisOffsetPixels(settings.panYPercent, overflowY, phaseY),
  };
}

export function speedSliderToOneWaySeconds(speedSlider: number): number {
  const s = clampNum(speedSlider, SCREEN_MOTION_SPEED_MIN, SCREEN_MOTION_SPEED_MAX, DEFAULT_SCREEN_MOTION.speedX);
  const t = (s - SCREEN_MOTION_SPEED_MIN) / (SCREEN_MOTION_SPEED_MAX - SCREEN_MOTION_SPEED_MIN);
  const eased = Math.pow(t, 0.75);
  const min = 16;
  const max = 120;
  return max - (max - min) * eased;
}

export function getMotionCyclePhase(elapsedSec: number, speedSlider: number): number {
  const oneWaySec = speedSliderToOneWaySeconds(speedSlider);
  const cycleSec = oneWaySec * 2;
  if (cycleSec <= 0) return 0;
  return (Math.max(0, elapsedSec) % cycleSec) / cycleSec;
}

export function getAxisMotionProgress(elapsedSec: number, settings: ScreenMotionSettings) {
  return {
    forward: getMotionCyclePhase(elapsedSec, settings.speedForward),
    x: getMotionCyclePhase(elapsedSec, settings.speedX),
    y: getMotionCyclePhase(elapsedSec, settings.speedY),
  };
}

export function parseScreenMotion(raw: unknown): ScreenMotionSettings {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_SCREEN_MOTION };
  const o = raw as Record<string, unknown>;
  const num = (key: string, fallback: number) => {
    const v = o[key];
    return typeof v === "number" && !Number.isNaN(v) ? v : fallback;
  };
  const legacySpeed = typeof o.motionSpeed === "number" ? o.motionSpeed : DEFAULT_SCREEN_MOTION.speedX;
  return normalizeScreenMotion({
    motionEnabled: o.motionEnabled === true,
    imageZoomPercent: num("imageZoomPercent", num("zoomPercent", DEFAULT_SCREEN_MOTION.imageZoomPercent)),
    panForwardPercent: num("panForwardPercent", 0),
    panXPercent: num("panXPercent", 50),
    panYPercent: num("panYPercent", 50),
    speedForward: num("speedForward", legacySpeed),
    speedX: num("speedX", legacySpeed),
    speedY: num("speedY", legacySpeed),
    brightnessOnPeak: o.brightnessOnPeak === true,
    brightnessStrength: num("brightnessStrength", DEFAULT_SCREEN_MOTION.brightnessStrength),
    brightnessSensitivityStep: num("brightnessSensitivityStep", 0),
    shakeOnChorus: o.shakeOnChorus === true,
    chorusZoomOnPeak: o.chorusZoomOnPeak === true,
    chorusZoomPercent: num("chorusZoomPercent", DEFAULT_SCREEN_MOTION.chorusZoomPercent),
    shakeStrength: num("shakeStrength", DEFAULT_SCREEN_MOTION.shakeStrength),
    shakeSensitivityStep: num("shakeSensitivityStep", 0),
    flashOnDrop: o.flashOnDrop === true,
    flashSensitivityStep: num("flashSensitivityStep", 0),
    flashIntensity: num("flashIntensity", DEFAULT_SCREEN_MOTION.flashIntensity),
    flashDurationSec: num("flashDurationSec", DEFAULT_SCREEN_MOTION.flashDurationSec),
    flashThreshold: num("flashThreshold", DEFAULT_SCREEN_MOTION.flashThreshold),
    flashCooldownMs: num("flashCooldownMs", DEFAULT_SCREEN_MOTION.flashCooldownMs),
    imageFadeInSec: num("imageFadeInSec", DEFAULT_SCREEN_MOTION.imageFadeInSec),
    imageFadeOutSec: num("imageFadeOutSec", DEFAULT_SCREEN_MOTION.imageFadeOutSec),
  });
}

export function normalizeScreenMotion(s: ScreenMotionSettings): ScreenMotionSettings {
  return {
    ...s,
    imageZoomPercent: clampZoomPercent(s.imageZoomPercent),
    panForwardPercent: clampNum(s.panForwardPercent, SCREEN_MOTION_PAN_MIN, SCREEN_MOTION_PAN_MAX, 0),
    panXPercent: clampNum(s.panXPercent, SCREEN_MOTION_PAN_MIN, SCREEN_MOTION_PAN_MAX, 0),
    panYPercent: clampNum(s.panYPercent, SCREEN_MOTION_PAN_MIN, SCREEN_MOTION_PAN_MAX, 0),
    speedForward: normalizeSpeedSlider(s.speedForward, DEFAULT_SCREEN_MOTION.speedForward),
    speedX: normalizeSpeedSlider(s.speedX, DEFAULT_SCREEN_MOTION.speedX),
    speedY: normalizeSpeedSlider(s.speedY, DEFAULT_SCREEN_MOTION.speedY),
    imageFadeInSec: clampNum(
      s.imageFadeInSec,
      SCREEN_MOTION_IMAGE_FADE_MIN_SEC,
      SCREEN_MOTION_IMAGE_FADE_MAX_SEC,
      0
    ),
    imageFadeOutSec: clampNum(
      s.imageFadeOutSec,
      SCREEN_MOTION_IMAGE_FADE_MIN_SEC,
      SCREEN_MOTION_IMAGE_FADE_MAX_SEC,
      0
    ),
  };
}

export function hasImageTimelineFade(settings: ScreenMotionSettings | undefined): boolean {
  if (!settings) return false;
  return settings.imageFadeInSec > 0 || settings.imageFadeOutSec > 0;
}

/**
 * 画像フェード用の再生タイミング（クリップ区間 relative）。
 * shortOutput 等で区間が切られているときは elapsed=0 が区間開始、duration=区間長。
 */
export function resolveImageFadePlaybackTiming(
  absoluteElapsedSec: number,
  mediaDurationSec: number,
  clip: ResolvedClip | null | undefined
): { elapsedSec: number; durationSec: number } {
  if (!(mediaDurationSec > 0)) {
    return {
      elapsedSec: Math.max(0, absoluteElapsedSec),
      durationSec: Math.max(0.001, mediaDurationSec || 60),
    };
  }
  if (!clip || clip.full !== false) {
    return {
      elapsedSec: Math.max(0, absoluteElapsedSec),
      durationSec: Math.max(0.001, mediaDurationSec),
    };
  }
  if (!(clip.duration > 0)) {
    return { elapsedSec: 0, durationSec: 0.001 };
  }
  const clipStart = clip.start;
  const clipDuration = clip.duration;
  const elapsed = Math.max(0, Math.min(clipDuration, absoluteElapsedSec - clipStart));
  return { elapsedSec: elapsed, durationSec: clipDuration };
}

/** 再生タイムライン上の画像不透明度 0..1。timing はクリップ relative を想定 */
export function resolveImageTimelineFadeAlpha(
  settings: ScreenMotionSettings | undefined,
  timing: { elapsedSec: number; durationSec: number } | undefined
): number {
  if (!settings || !timing) return 1;
  const fadeIn = Math.max(0, settings.imageFadeInSec);
  const fadeOut = Math.max(0, settings.imageFadeOutSec);
  if (fadeIn <= 0 && fadeOut <= 0) return 1;
  const elapsed = Math.max(0, timing.elapsedSec);
  const duration = Math.max(0.001, timing.durationSec);
  let alpha = 1;
  if (fadeIn > 0) {
    alpha = Math.min(alpha, elapsed / fadeIn);
  }
  if (fadeOut > 0) {
    const remain = duration - elapsed;
    alpha = Math.min(alpha, remain / fadeOut);
  }
  return Math.max(0, Math.min(1, alpha));
}
