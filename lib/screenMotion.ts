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
export const SCREEN_MOTION_SHAKE_STRENGTH_MIN = 1;
export const SCREEN_MOTION_SHAKE_STRENGTH_MAX = 30;
export const SCREEN_MOTION_SENSITIVITY_STEP_MIN = -5;
export const SCREEN_MOTION_SENSITIVITY_STEP_MAX = 5;
export const SCREEN_MOTION_SENSITIVITY_STEP_INCREMENT = 0.1;
export const SCREEN_MOTION_CHORUS_ZOOM_PERCENT_MIN = -10;
export const SCREEN_MOTION_CHORUS_ZOOM_PERCENT_MAX = 10;
export const SCREEN_MOTION_BRIGHTNESS_STRENGTH_MIN = 0.03;
export const SCREEN_MOTION_BRIGHTNESS_STRENGTH_MAX = 0.2;
export const SCREEN_MOTION_FLASH_INTENSITY_MIN = 0.1;
export const SCREEN_MOTION_FLASH_INTENSITY_MAX = 0.4;
export const SCREEN_MOTION_FLASH_DURATION_MIN_SEC = 0.05;
export const SCREEN_MOTION_FLASH_DURATION_MAX_SEC = 0.3;
export const SCREEN_MOTION_FLASH_THRESHOLD_MIN = 0.45;
export const SCREEN_MOTION_FLASH_THRESHOLD_MAX = 0.95;
export const SCREEN_MOTION_FLASH_COOLDOWN_MIN_MS = 120;
export const SCREEN_MOTION_FLASH_COOLDOWN_MAX_MS = 2000;
export const SCREEN_MOTION_SECONDS_ONE_WAY_MIN = 16;
export const SCREEN_MOTION_SECONDS_ONE_WAY_MAX = 120;

export type ScreenMotionSettings = {
  /** 背景をゆっくりズーム・パンする（マスター） */
  motionEnabled: boolean;
  /**
   * 画像拡大（%）。cover 基準に対する静止スケール。100=最小 cover、500=5倍。
   * モーション速度の影響を受けず、パンだけがトリミング窓を動かす。
   */
  imageZoomPercent: number;
  /**
   * 前後パン量（0..100%）。旧「拡大縮小」相当。
   * cover 基準(100%)と imageZoomPercent のスケール間を往復する深度方向のパン。
   */
  panForwardPercent: number;
  /** 左右パン量（0..100%）。はみ出し量に対する往復振幅。 */
  panXPercent: number;
  /** 上下パン量（0..100%）。はみ出し量に対する往復振幅。 */
  panYPercent: number;
  /** 前後パン用 動かす速さ（1.0=ゆっくり … 10.0=速い、0.1刻み） */
  speedForward: number;
  /** 左右パン用 動かす速さ（0.1刻み） */
  speedX: number;
  /** 上下パン用 動かす速さ（0.1刻み） */
  speedY: number;
  brightnessOnPeak: boolean;
  brightnessStrength: number;
  brightnessSensitivityStep: number;
  shakeOnChorus: boolean;
  chorusZoomOnPeak: boolean;
  /** サビ時ズーム（%）。+で押し込み、-で引き */
  chorusZoomPercent: number;
  shakeStrength: number;
  shakeSensitivityStep: number;
  flashOnDrop: boolean;
  flashSensitivityStep: number;
  flashIntensity: number;
  flashDurationSec: number;
  flashThreshold: number;
  flashCooldownMs: number;
  imageFadeInSec: number;
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

/** 0〜1 の進行率に smoothstep イージングを適用 */
export function smoothstep(t: number): number {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
}

export function smootherstep(t: number): number {
  const x = Math.max(0, Math.min(1, t));
  return x * x * x * (x * (x * 6 - 15) + 10);
}

export function easedLerp(
  start: number,
  end: number,
  progress: number,
  easing: (t: number) => number = smoothstep
): number {
  return start + (end - start) * easing(Math.max(0, Math.min(1, progress)));
}

function clampNum(v: number, min: number, max: number, fallback?: number): number {
  const base = Number.isNaN(v) ? (fallback ?? min) : v;
  return Math.max(min, Math.min(max, base));
}

/**
 * cover 基準のズーム % を下限 100% にクランプする。
 * 100% 未満にすると letterbox（黒帯）が出るため、UI 設定に関わらず内部で必ず >= 100 とする。
 */
export function clampZoomPercent(percent: number): number {
  return Math.max(SCREEN_MOTION_ZOOM_MIN_PERCENT, Math.min(SCREEN_MOTION_ZOOM_MAX_PERCENT, percent));
}

/** 動かす速さスライダー: 1.0〜10.0 にクランプし 0.1 単位に丸める */
export function normalizeSpeedSlider(v: number, fallback: number = DEFAULT_SCREEN_MOTION.speedX): number {
  const clamped = clampNum(v, SCREEN_MOTION_SPEED_MIN, SCREEN_MOTION_SPEED_MAX, fallback);
  return Math.round(clamped / SCREEN_MOTION_SPEED_STEP) * SCREEN_MOTION_SPEED_STEP;
}

/** 音連動の感度ステップ: -5〜5 にクランプし 0.1 単位に丸める */
export function normalizeSensitivityStep(
  v: number,
  fallback: number = DEFAULT_SCREEN_MOTION.shakeSensitivityStep
): number {
  const clamped = clampNum(
    v,
    SCREEN_MOTION_SENSITIVITY_STEP_MIN,
    SCREEN_MOTION_SENSITIVITY_STEP_MAX,
    fallback
  );
  return Math.round(clamped / SCREEN_MOTION_SENSITIVITY_STEP_INCREMENT) * SCREEN_MOTION_SENSITIVITY_STEP_INCREMENT;
}

/** UI 表示用（小数第1位） */
export function formatMotionSpeedLabel(speed: number): string {
  return normalizeSpeedSlider(speed).toFixed(1);
}

/** 静止の画像拡大 %（モーション速度非依存） */
export function resolveStaticImageZoomPercent(settings: ScreenMotionSettings): number {
  return clampZoomPercent(settings.imageZoomPercent);
}

/** cover スケールに対する乗数（1.0 = 画面を埋める最小） */
export function resolveCoverScaleMultiplier(percent: number): number {
  return clampZoomPercent(percent) / 100;
}

/**
 * 前後パン: cover 基準(100%) ↔ imageZoomPercent の間を panForwardPercent 分だけスケール往復。
 * progress 0→1→0（ping-pong）に連動。旧ズームアニメの深度方向パン相当。
 */
export function resolveForwardScalePercentAtProgress(
  settings: ScreenMotionSettings,
  cyclePhase01: number
): number {
  if (!settings.motionEnabled) {
    return SCREEN_MOTION_ZOOM_MIN_PERCENT;
  }
  const baseZoom = resolveStaticImageZoomPercent(settings);
  if (settings.panForwardPercent <= 0) {
    return baseZoom;
  }
  const panAmt = clampNum(settings.panForwardPercent, SCREEN_MOTION_PAN_MIN, SCREEN_MOTION_PAN_MAX, 0) / 100;
  const minZoom = baseZoom - (baseZoom - SCREEN_MOTION_ZOOM_MIN_PERCENT) * panAmt;
  const signed = pingPongSignedCosine(cyclePhase01);
  const u = (signed + 1) / 2;
  return clampZoomPercent(minZoom + (baseZoom - minZoom) * u);
}

/**
 * 1周期位相 0..1 を -1..+1..-1 へ。両端（±1）で速度ゼロの対称 ease-in-out。
 * signed = -cos(2π·phase): phase=0,1 → 左端、phase=0.5 → 右端。
 */
export function pingPongSignedCosine(cyclePhase01: number): number {
  const phase = Math.max(0, Math.min(1, cyclePhase01));
  return -Math.cos(2 * Math.PI * phase);
}

/**
 * パン振幅（%）と overflow から、周期位相に応じたオフセット(px)を返す。
 * 0%=中央固定、100%=はみ出し最大幅の端↔反対端を往復。
 */
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

/** UI スライダー 1〜10 を片道秒数へ（1=遅い, 10=速い）。体感を均一化するため非線形。 */
export function speedSliderToOneWaySeconds(speedSlider: number): number {
  const s = clampNum(speedSlider, SCREEN_MOTION_SPEED_MIN, SCREEN_MOTION_SPEED_MAX, DEFAULT_SCREEN_MOTION.speedX);
  const t = (s - SCREEN_MOTION_SPEED_MIN) / (SCREEN_MOTION_SPEED_MAX - SCREEN_MOTION_SPEED_MIN);
  const eased = Math.pow(t, 0.75);
  return SCREEN_MOTION_SECONDS_ONE_WAY_MAX - (SCREEN_MOTION_SECONDS_ONE_WAY_MAX - SCREEN_MOTION_SECONDS_ONE_WAY_MIN) * eased;
}

/** 表示用ヘルパー。現在設定の片道秒数と往復周期秒数 */
export function getMotionTimingLabelSeconds(speedSlider: number): { oneWaySec: number; cycleSec: number } {
  const oneWaySec = speedSliderToOneWaySeconds(speedSlider);
  return { oneWaySec, cycleSec: oneWaySec * 2 };
}

/** 1往復周期内の位相 0..1（0=左/手前端、0.5=右/奥端、1=左/手前端） */
export function getMotionCyclePhase(elapsedSec: number, speedSlider: number): number {
  const oneWaySec = speedSliderToOneWaySeconds(speedSlider);
  const cycleSec = oneWaySec * 2;
  if (cycleSec <= 0) return 0;
  return (Math.max(0, elapsedSec) % cycleSec) / cycleSec;
}

/** @deprecated 三角波 0..1..0。パンには getMotionCyclePhase + pingPongSignedCosine を使用 */
export function pingPongProgress(elapsedSec: number, cycleSec: number): number {
  if (cycleSec <= 0) return 0;
  const phase = (elapsedSec % cycleSec) / cycleSec;
  return phase < 0.5 ? phase * 2 : (1 - phase) * 2;
}

/** 各軸の1周期位相 0..1（パン・前後スケール共通） */
export type AxisMotionProgress = {
  forward: number;
  x: number;
  y: number;
};

export function getAxisMotionProgress(
  elapsedSec: number,
  settings: ScreenMotionSettings
): AxisMotionProgress {
  return {
    forward: getMotionCyclePhase(elapsedSec, settings.speedForward),
    x: getMotionCyclePhase(elapsedSec, settings.speedX),
    y: getMotionCyclePhase(elapsedSec, settings.speedY),
  };
}

function migrateLegacyFields(o: Record<string, unknown>): Partial<ScreenMotionSettings> {
  const patch: Partial<ScreenMotionSettings> = {};

  const legacySpeed =
    typeof o.motionSpeed === "number" ? o.motionSpeed : DEFAULT_SCREEN_MOTION.speedX;
  if (typeof o.speedForward !== "number") patch.speedForward = legacySpeed;
  if (typeof o.speedX !== "number") patch.speedX = legacySpeed;
  if (typeof o.speedY !== "number") patch.speedY = legacySpeed;

  const hasImageZoom = typeof o.imageZoomPercent === "number";
  if (!hasImageZoom) {
    if (typeof o.zoomPercent === "number") {
      patch.imageZoomPercent = clampZoomPercent(o.zoomPercent);
      const delta = Math.max(0, o.zoomPercent - SCREEN_MOTION_ZOOM_MIN_PERCENT);
      const range = SCREEN_MOTION_ZOOM_MAX_PERCENT - SCREEN_MOTION_ZOOM_MIN_PERCENT;
      patch.panForwardPercent = clampNum((delta / range) * 100, 0, 100);
    } else {
      const legacyStart = typeof o.initialZoomPercent === "number" ? o.initialZoomPercent : 100;
      const legacyDelta = typeof o.zoomDeltaPercent === "number" ? o.zoomDeltaPercent : 0;
      if (typeof o.initialZoomPercent === "number" || typeof o.zoomDeltaPercent === "number") {
        patch.imageZoomPercent = clampZoomPercent(legacyStart + legacyDelta);
        const delta = Math.max(0, patch.imageZoomPercent - SCREEN_MOTION_ZOOM_MIN_PERCENT);
        const range = SCREEN_MOTION_ZOOM_MAX_PERCENT - SCREEN_MOTION_ZOOM_MIN_PERCENT;
        patch.panForwardPercent = clampNum((delta / range) * 100, 0, 100);
      } else if (o.zoomIn === true) {
        patch.imageZoomPercent = 112;
        patch.panForwardPercent = 3;
      } else if (o.zoomOut === true) {
        patch.imageZoomPercent = 102;
        patch.panForwardPercent = 0.5;
      }
    }
  }

  const mapLegacyTargetPanToAmplitude = (legacyTarget: number): number => {
    const t = clampNum(legacyTarget, 0, 100, 50);
    return Math.abs(t - 50) * 2;
  };

  if (typeof o.panXPercent === "number") {
    const x = o.panXPercent;
    if (!hasImageZoom) {
      if (x >= -10 && x <= 10) {
        const clamped = clampNum(x, -10, 10, 0);
        patch.panXPercent = ((clamped - -10) / 20) * 100;
      } else if (x >= 0 && x <= 100) {
        patch.panXPercent = mapLegacyTargetPanToAmplitude(x);
      }
    }
  } else if (o.panHorizontal === true) {
    patch.panXPercent = 40;
  }

  if (typeof o.panYPercent === "number" && !hasImageZoom) {
    const y = o.panYPercent;
    if (y >= -10 && y <= 10) {
      const clamped = clampNum(y, -10, 10, 0);
      patch.panYPercent = ((clamped - -10) / 20) * 100;
    } else if (y >= 0 && y <= 100) {
      patch.panYPercent = mapLegacyTargetPanToAmplitude(y);
    }
  }

  return patch;
}

export function parseScreenMotion(raw: unknown): ScreenMotionSettings {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_SCREEN_MOTION };
  const o = raw as Record<string, unknown>;
  const legacy = migrateLegacyFields(o);
  const num = (key: keyof ScreenMotionSettings, fallback: number) => {
    const v = o[key];
    return typeof v === "number" && !Number.isNaN(v) ? v : fallback;
  };
  const bool = (key: keyof ScreenMotionSettings) => o[key] === true;
  return normalizeScreenMotion({
    motionEnabled: bool("motionEnabled"),
    imageZoomPercent: num("imageZoomPercent", legacy.imageZoomPercent ?? DEFAULT_SCREEN_MOTION.imageZoomPercent),
    panForwardPercent: num("panForwardPercent", legacy.panForwardPercent ?? DEFAULT_SCREEN_MOTION.panForwardPercent),
    panXPercent: num("panXPercent", legacy.panXPercent ?? DEFAULT_SCREEN_MOTION.panXPercent),
    panYPercent: num("panYPercent", legacy.panYPercent ?? DEFAULT_SCREEN_MOTION.panYPercent),
    speedForward: num("speedForward", legacy.speedForward ?? DEFAULT_SCREEN_MOTION.speedForward),
    speedX: num("speedX", legacy.speedX ?? DEFAULT_SCREEN_MOTION.speedX),
    speedY: num("speedY", legacy.speedY ?? DEFAULT_SCREEN_MOTION.speedY),
    brightnessOnPeak: bool("brightnessOnPeak"),
    brightnessStrength: num("brightnessStrength", DEFAULT_SCREEN_MOTION.brightnessStrength),
    brightnessSensitivityStep: num("brightnessSensitivityStep", DEFAULT_SCREEN_MOTION.brightnessSensitivityStep),
    shakeOnChorus: bool("shakeOnChorus"),
    chorusZoomOnPeak: bool("chorusZoomOnPeak"),
    chorusZoomPercent: num("chorusZoomPercent", DEFAULT_SCREEN_MOTION.chorusZoomPercent),
    shakeStrength: num("shakeStrength", DEFAULT_SCREEN_MOTION.shakeStrength),
    shakeSensitivityStep: num("shakeSensitivityStep", DEFAULT_SCREEN_MOTION.shakeSensitivityStep),
    flashOnDrop: bool("flashOnDrop"),
    flashSensitivityStep: num("flashSensitivityStep", DEFAULT_SCREEN_MOTION.flashSensitivityStep),
    flashIntensity: num("flashIntensity", DEFAULT_SCREEN_MOTION.flashIntensity),
    flashDurationSec: num("flashDurationSec", DEFAULT_SCREEN_MOTION.flashDurationSec),
    flashThreshold: num("flashThreshold", DEFAULT_SCREEN_MOTION.flashThreshold),
    flashCooldownMs: num("flashCooldownMs", DEFAULT_SCREEN_MOTION.flashCooldownMs),
    imageFadeInSec: num("imageFadeInSec", DEFAULT_SCREEN_MOTION.imageFadeInSec),
    imageFadeOutSec: num("imageFadeOutSec", DEFAULT_SCREEN_MOTION.imageFadeOutSec),
  });
}

export function normalizeScreenMotion(s: ScreenMotionSettings): ScreenMotionSettings {
  const clampSpeed = (v: number, fallback: number) => normalizeSpeedSlider(v, fallback);
  return {
    ...s,
    imageZoomPercent: clampZoomPercent(
      clampNum(
        s.imageZoomPercent,
        SCREEN_MOTION_ZOOM_MIN_PERCENT,
        SCREEN_MOTION_ZOOM_MAX_PERCENT,
        DEFAULT_SCREEN_MOTION.imageZoomPercent
      )
    ),
    panForwardPercent: clampNum(s.panForwardPercent, SCREEN_MOTION_PAN_MIN, SCREEN_MOTION_PAN_MAX, DEFAULT_SCREEN_MOTION.panForwardPercent),
    panXPercent: clampNum(s.panXPercent, SCREEN_MOTION_PAN_MIN, SCREEN_MOTION_PAN_MAX, DEFAULT_SCREEN_MOTION.panXPercent),
    panYPercent: clampNum(s.panYPercent, SCREEN_MOTION_PAN_MIN, SCREEN_MOTION_PAN_MAX, DEFAULT_SCREEN_MOTION.panYPercent),
    speedForward: clampSpeed(s.speedForward, DEFAULT_SCREEN_MOTION.speedForward),
    speedX: clampSpeed(s.speedX, DEFAULT_SCREEN_MOTION.speedX),
    speedY: clampSpeed(s.speedY, DEFAULT_SCREEN_MOTION.speedY),
    chorusZoomPercent: clampNum(
      s.chorusZoomPercent,
      SCREEN_MOTION_CHORUS_ZOOM_PERCENT_MIN,
      SCREEN_MOTION_CHORUS_ZOOM_PERCENT_MAX,
      DEFAULT_SCREEN_MOTION.chorusZoomPercent
    ),
    shakeStrength: clampNum(
      s.shakeStrength,
      SCREEN_MOTION_SHAKE_STRENGTH_MIN,
      SCREEN_MOTION_SHAKE_STRENGTH_MAX,
      DEFAULT_SCREEN_MOTION.shakeStrength
    ),
    brightnessSensitivityStep: normalizeSensitivityStep(
      s.brightnessSensitivityStep,
      DEFAULT_SCREEN_MOTION.brightnessSensitivityStep
    ),
    shakeSensitivityStep: normalizeSensitivityStep(
      s.shakeSensitivityStep,
      DEFAULT_SCREEN_MOTION.shakeSensitivityStep
    ),
    flashSensitivityStep: normalizeSensitivityStep(
      s.flashSensitivityStep,
      DEFAULT_SCREEN_MOTION.flashSensitivityStep
    ),
    flashIntensity: clampNum(
      s.flashIntensity,
      SCREEN_MOTION_FLASH_INTENSITY_MIN,
      SCREEN_MOTION_FLASH_INTENSITY_MAX,
      DEFAULT_SCREEN_MOTION.flashIntensity
    ),
    brightnessStrength: clampNum(
      s.brightnessStrength,
      SCREEN_MOTION_BRIGHTNESS_STRENGTH_MIN,
      SCREEN_MOTION_BRIGHTNESS_STRENGTH_MAX,
      DEFAULT_SCREEN_MOTION.brightnessStrength
    ),
    flashDurationSec: clampNum(
      s.flashDurationSec,
      SCREEN_MOTION_FLASH_DURATION_MIN_SEC,
      SCREEN_MOTION_FLASH_DURATION_MAX_SEC,
      DEFAULT_SCREEN_MOTION.flashDurationSec
    ),
    flashThreshold: clampNum(
      s.flashThreshold,
      SCREEN_MOTION_FLASH_THRESHOLD_MIN,
      SCREEN_MOTION_FLASH_THRESHOLD_MAX,
      DEFAULT_SCREEN_MOTION.flashThreshold
    ),
    flashCooldownMs: clampNum(
      s.flashCooldownMs,
      SCREEN_MOTION_FLASH_COOLDOWN_MIN_MS,
      SCREEN_MOTION_FLASH_COOLDOWN_MAX_MS,
      DEFAULT_SCREEN_MOTION.flashCooldownMs
    ),
    imageFadeInSec: clampNum(
      s.imageFadeInSec,
      SCREEN_MOTION_IMAGE_FADE_MIN_SEC,
      SCREEN_MOTION_IMAGE_FADE_MAX_SEC,
      DEFAULT_SCREEN_MOTION.imageFadeInSec
    ),
    imageFadeOutSec: clampNum(
      s.imageFadeOutSec,
      SCREEN_MOTION_IMAGE_FADE_MIN_SEC,
      SCREEN_MOTION_IMAGE_FADE_MAX_SEC,
      DEFAULT_SCREEN_MOTION.imageFadeOutSec
    ),
  };
}

function hasMotionTransform(settings: ScreenMotionSettings): boolean {
  return (
    settings.imageZoomPercent > SCREEN_MOTION_ZOOM_MIN_PERCENT ||
    settings.panForwardPercent > 0 ||
    settings.panXPercent > 0 ||
    settings.panYPercent > 0
  );
}

/** 毎フレーム描画が必要か（キャッシュ不可） */
export function needsAnimatedBackgroundDraw(settings: ScreenMotionSettings | undefined): boolean {
  if (!settings) return false;
  if (hasImageTimelineFade(settings)) return true;
  if (settings.brightnessOnPeak || settings.shakeOnChorus || settings.chorusZoomOnPeak || settings.flashOnDrop) return true;
  if (!settings.motionEnabled) return false;
  return hasMotionTransform(settings);
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

/** 早期停止時の画面輝度フェード（停止時点の alpha から 0 へ） */
export type StopGracefulImageFade = {
  startPerfMs: number;
  fadeOutSec: number;
  startAlpha: number;
};

export function resolveStopGracefulImageAlpha(
  state: StopGracefulImageFade | null | undefined
): number {
  if (!state || !(state.fadeOutSec > 0)) return 1;
  const elapsed = (performance.now() - state.startPerfMs) / 1000;
  if (elapsed >= state.fadeOutSec) return 0;
  return Math.max(0, state.startAlpha * (1 - elapsed / state.fadeOutSec));
}

export function resolveCombinedImageFadeAlpha(
  settings: ScreenMotionSettings | undefined,
  timing: { elapsedSec: number; durationSec: number } | undefined,
  stopGraceful: StopGracefulImageFade | null | undefined
): number {
  return (
    resolveImageTimelineFadeAlpha(settings, timing) *
    resolveStopGracefulImageAlpha(stopGraceful)
  );
}