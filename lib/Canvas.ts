import { drawEffectOverlayCanvas, type EffectParams, type AudioReactiveData } from "./Effects";
import {
  renderSubtitleOverlayCanvas,
  renderTitleOverlayCanvas,
  type SubtitleOverlaySettings,
  type TitleOverlaySettings,
} from "./subtitles";
import { drawGalleryBackground, peekGalleryImageTransitionFrame } from "./galleryImageTransition";
import { drawVideoCover } from "./drawVideoCover";

const BASE_LINE_WIDTH_WAVEFORM = 2.0;
const BASE_LINE_WIDTH_CIRCLE   = 2.0;
const BASE_LINE_WIDTH_SYMWAVE  = 2.4;

export type ModeAdjustments = {
  scaleX: number;
  scaleY: number;
  offsetX: number;
  offsetY: number;
};

/** モード1・5のスペアナデータ更新間隔の目標fps（UI設定なし・固定）。 */
export const SPECTRUM_THROTTLE_TARGET_FPS = 60;

export type SpectrumColorPresetKey = "white" | "cyan" | "magenta" | "green" | "gold" | "custom";

export type SpectrumSettings = {
  opacity: number;
  lineWidthWaveform: number;
  lineWidthCircle: number;
  lineWidthSymWave: number;
  /** 円形スペアナ回転（rpm）。null=OFF、0=停止、負=左回転、正=右回転 */
  circleRotationRpm?: number | null;
  /** 音圧系（8〜14）: ゲイン/ガンマ/アタック/リリース */
  loudnessParams?: {
    gain: number;
    gamma: number;
    attack: number;
    release: number;
  };
  /** WMP風追い込み（mode15/16） */
  wmpTrailParams?: {
    trailLength: number;
    trailDecay: number;
    additive: number;
  };
  glycoColorSet?: string;
  /** スペアナのベース色 #RRGGBB（優先。インポート互換で preset も参照） */
  spectrumColorHex?: string;
  /** 周波数バー・波形・円形など単色寄りモードのベース色（モード6グライコは従来の色セットを維持） */
  spectrumColorPreset?: SpectrumColorPresetKey;
  spectrumCustomHex?: string;
  /** モード3・4で虹色グラデーションを使う（false でプリマリ色ベース） */
  spectrumRainbowColorful?: boolean;
  /** SRT字幕オーバーレイ */
  subtitleOverlay?: SubtitleOverlaySettings;
  /** タイトルオーバーレイ（Canvas 2D） */
  titleOverlay?: TitleOverlaySettings;
  /** 背景として毎フレーム描画する動画（静止画・ギャラリートランジションが無いとき） */
  backgroundVideo?: HTMLVideoElement | null;
  /** 背景動画が音声タイムラインと別要素のとき、描画前に currentTime を同期 */
  syncBackgroundVideo?: () => void;
  /** 背景を透明クリア（映像なし・合成用オーバーレイ） */
  clearBackgroundTransparent?: boolean;
};

const SPECTRUM_PRESET_RGB: Record<Exclude<SpectrumColorPresetKey, "custom">, [number, number, number]> = {
  white: [255, 255, 255],
  cyan: [0, 255, 255],
  magenta: [255, 0, 200],
  green: [80, 255, 120],
  gold: [255, 200, 80],
};

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

function computeLoudnessTarget(bufferData: Uint8Array, gamma: number, gain: number): number {
  let sum = 0;
  for (let i = 0; i < bufferData.length; i++) sum += bufferData[i];
  const volume = sum / (Math.max(1, bufferData.length) * 255);
  return clamp01(Math.pow(volume, gamma) * gain);
}

function smoothAR(prev: number, target: number, attack: number, release: number): number {
  const a = target > prev ? attack : release;
  return prev + (target - prev) * a;
}

function getVisualOpacity(opacity: number): number {
  // 透過率スライダーの体感を均し、白飛びを抑える上限を設ける
  return Math.min(0.92, 0.12 + opacity * 0.8);
}

function getParticlePerfScale(): number {
  if (typeof navigator === "undefined") return 0.7;
  const hc = (navigator as any).hardwareConcurrency ?? 4;
  const dm = (navigator as any).deviceMemory ?? 4;
  if (hc <= 4 || dm <= 4) return 0.45;
  if (hc <= 8 || dm <= 8) return 0.7;
  return 1.0;
}

function trailFade(age: number, trailDecay: number): number {
  // trailDecay が高いほど残像を長く残す（減衰が遅い）
  const exp = Math.max(0.5, 6.0 * (1 - trailDecay) + 0.6);
  return Math.pow(age, exp);
}

function oscColorAt(t: number, pr: number, pg: number, pb: number, sr: number, sg: number, sb: number): [number, number, number] {
  const r = Math.round(pr + (sr - pr) * t);
  const g = Math.round(pg + (sg - pg) * t);
  const b = Math.round(pb + (sb - pb) * t);
  return [r, g, b];
}

/** 旧プリセット保存値から #RRGGBB へ（スペアナ色の移行用） */
export function legacySpectrumPresetToHex(preset: string | undefined, customHex: string | undefined): string {
  if (preset === "custom" && customHex && /^#[0-9a-fA-F]{6}$/.test(customHex)) {
    return customHex.toUpperCase();
  }
  const k = preset as SpectrumColorPresetKey;
  if (k && k !== "custom" && SPECTRUM_PRESET_RGB[k as Exclude<SpectrumColorPresetKey, "custom">]) {
    const [r, g, b] = SPECTRUM_PRESET_RGB[k as Exclude<SpectrumColorPresetKey, "custom">];
    return `#${[r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("")}`.toUpperCase();
  }
  return "#FFFFFF";
}

export function parseSpectrumHexRgb(hex: string): [number, number, number] | null {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return null;
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

export function getSpectrumPrimaryRgb(settings: SpectrumSettings): [number, number, number] {
  const fromHex = settings.spectrumColorHex && parseSpectrumHexRgb(settings.spectrumColorHex);
  if (fromHex) return fromHex;
  const preset = settings.spectrumColorPreset ?? "white";
  if (preset === "custom") {
    const p = parseSpectrumHexRgb(settings.spectrumCustomHex ?? "#FFFFFF");
    if (p) return p;
  } else if (SPECTRUM_PRESET_RGB[preset]) {
    return SPECTRUM_PRESET_RGB[preset];
  }
  return [255, 255, 255];
}

export function getSpectrumSecondaryRgb(settings: SpectrumSettings): [number, number, number] {
  const [r, g, b] = getSpectrumPrimaryRgb(settings);
  return [
    Math.min(255, Math.floor(r * 0.5 + 120)),
    Math.min(255, Math.floor(g * 0.5 + 100)),
    Math.min(255, Math.floor(b * 0.5 + 140)),
  ];
}

/** 対数マップの上限ビン（ナイキストのこの割合まで）。それ以上は音楽では無音に近く右端が死にやすい */
const GLYCO_LOG_BIN_MAX_FRAC = 0.66;
/** 対数マップの下限 FFT ビン（DC～超低域はエネルギーが張り付きやすいので参照開始を少し上げる） */
const GLYCO_LOG_MIN_BIN = 5;

/**
 * グライコ風（モード6）: バー index を FFT ビンへ対数周波数で対応付け。
 * 線形割り当てだと右側がナイキスト近傍の高域のみになり、音楽では無音に近く見える問題を避ける。
 */
export function glycoBarToFftBin(i: number, barsLength: number, bufferLength: number): number {
  if (bufferLength < 2 || barsLength < 1) return 0;
  if (barsLength === 1) return Math.min(1, bufferLength - 1);
  const t = i / (barsLength - 1);
  const maxB = Math.max(3, Math.floor((bufferLength - 1) * GLYCO_LOG_BIN_MAX_FRAC));
  const minB = Math.max(1, Math.min(GLYCO_LOG_MIN_BIN, maxB - 2));
  const lnLo = Math.log(minB);
  const lnHi = Math.log(maxB);
  const b = Math.exp(lnLo + t * (lnHi - lnLo));
  return Math.min(maxB, Math.max(0, Math.floor(b)));
}

/**
 * 左端（低音寄り）バーの張り付きを抑える感度 0..1（対数マップのモード3/4/6 等で glycoBarRawEnergy の後に掛ける想定）。
 */
export function glycoLowBandGain(barIndex: number, barsLength: number): number {
  if (barsLength < 2) return 1;
  const t = barIndex / (barsLength - 1);
  const u = Math.max(0, Math.min(1, (t - 0.05) / 0.2));
  const s = u * u * (3 - 2 * u);
  return 0.5 + 0.5 * s;
}

/**
 * モード0の線形ビン用。index が小さいほど超低域＝値が張り付きやすいので感度を下げる。
 */
export function spectrumLinearBarLowGain(i: number, barsLength: number): number {
  if (barsLength < 2) return 1;
  const t = i / (barsLength - 1);
  const u = Math.max(0, Math.min(1, (t - 0.008) / 0.12));
  const s = u * u * (3 - 2 * u);
  return 0.45 + 0.55 * s;
}

/**
 * グライコ用生エネルギー。右端数本は±2ビンの最大を取り、きらびゆる反応を補う。
 */
export function glycoBarRawEnergy(
  i: number,
  barsLength: number,
  bufferLength: number,
  bufferData: Uint8Array
): number {
  const c = glycoBarToFftBin(i, barsLength, bufferLength);
  let m: number;
  if (i < barsLength - 5) {
    m = bufferData[c];
  } else {
    m = bufferData[c];
    for (let d = -2; d <= 2; d++) {
      const idx = c + d;
      if (idx >= 0 && idx < bufferLength) {
        m = Math.max(m, bufferData[idx]);
      }
    }
  }
  const g = glycoLowBandGain(i, barsLength);
  return Math.min(255, m * g);
}

/**
 * グライコ縦ダイナミクス（Canvas/WebGL 共通）。
 * 対数ビン寄せ後はバイト値が高めに出やすいので γ>1 でピークを圧縮し、描画側で GLYCO_BAR_VERTICAL_SCALE を掛けてヘッドルームを確保する。
 */
export const GLYCO_LEVEL_GAMMA = 1.18;
export const GLYCO_BAR_VERTICAL_SCALE = 0.88;

export function glycoAdjustedLevel(rawValue: number): number {
  const clamped = Math.min(255, Math.max(0, rawValue));
  const shaped = 255 * Math.pow(clamped / 255, GLYCO_LEVEL_GAMMA);
  return Math.min(255, shaped);
}

/** グライコ風の色セット: バー色・ピーク色 [r,g,b] 0-255 */
export const GLYCO_COLOR_SETS: Record<string, { bar: [number, number, number]; dash: [number, number, number] }> = {
  amber: { bar: [255, 180, 0], dash: [255, 220, 100] },
  green: { bar: [34, 139, 34], dash: [144, 238, 144] },
  red: { bar: [180, 50, 50], dash: [255, 100, 100] },
  blue: { bar: [50, 80, 180], dash: [100, 150, 255] },
  yellow: { bar: [200, 180, 0], dash: [255, 255, 150] },
  white: { bar: [200, 200, 200], dash: [255, 255, 255] },
  cyan: { bar: [0, 160, 160], dash: [100, 255, 255] },
  magenta: { bar: [160, 0, 160], dash: [255, 100, 255] },
  neonGreen: { bar: [0, 255, 100], dash: [150, 255, 200] },
  neonPink: { bar: [255, 0, 128], dash: [255, 150, 200] },
  neonCyan: { bar: [0, 255, 255], dash: [150, 255, 255] },
};
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  h = h / 360;
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hue2rgb = (t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [Math.round(hue2rgb(h + 1 / 3) * 255), Math.round(hue2rgb(h) * 255), Math.round(hue2rgb(h - 1 / 3) * 255)];
}

/** グラデーション系: (barIndex, totalBars) => [r,g,b] */
export const GLYCO_GRADIENT_SETS: Record<string, (i: number, n: number) => [number, number, number]> = {
  rainbow: (i, n) => hslToRgb((i / n) * 360, 1, 0.5),
  blueGreen: (i, n) => {
    const t = i / n;
    return [Math.round(50 * (1 - t)), Math.round(80 + 120 * t), Math.round(180 * (1 - t) + 80 * t)];
  },
  redYellow: (i, n) => {
    const t = i / n;
    return [Math.round(180 + 75 * t), Math.round(50 + 130 * t), Math.round(50 * (1 - t))];
  },
};

// FPS測定用の変数
let fpsCounter = 0;
let fpsLastTime = performance.now();
let currentFPS = 0;

// アニメーションフレームID
let animationFrameId: number | null = null;

// FPSを取得
export function getFPS(): number {
  return currentFPS;
}

// FPSをリセット
export function resetFPS(): void {
  fpsCounter = 0;
  fpsLastTime = performance.now();
  currentFPS = 0;
}

// Canvas 2Dアニメーションを停止
export function stopCanvas2DAnimation(): void {
  if (animationFrameId !== null) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
}

// オフスクリーンキャンバスのキャッシュ（画像処理の最適化）
interface ImageCache {
  canvas: HTMLCanvasElement;
  imageHash: string;
  canvasWidth: number;
  canvasHeight: number;
}

let imageCache: ImageCache | null = null;

// 画像のハッシュを生成（簡易版）
function getImageHash(image: HTMLImageElement, canvasWidth: number, canvasHeight: number): string {
  const w = image.naturalWidth || image.width || 0;
  const h = image.naturalHeight || image.height || 0;
  return `${image.src}-${w}-${h}-${canvasWidth}-${canvasHeight}`;
}

// キャッシュをクリア（キャンバスサイズ変更時などに使用）
export function clearImageCache(): void {
  imageCache = null;
}

// オフスクリーンキャンバスに画像を描画（画像が変更された時のみ実行）
function drawImageToOffscreen(
  image: HTMLImageElement,
  canvasWidth: number,
  canvasHeight: number
): HTMLCanvasElement {
  const hash = getImageHash(image, canvasWidth, canvasHeight);
  
  // キャッシュが有効な場合は再利用
  if (imageCache && imageCache.imageHash === hash && 
      imageCache.canvasWidth === canvasWidth && 
      imageCache.canvasHeight === canvasHeight) {
    return imageCache.canvas;
  }

  // 新しいオフスクリーンキャンバスを作成
  const offscreenCanvas = document.createElement('canvas');
  offscreenCanvas.width = canvasWidth;
  offscreenCanvas.height = canvasHeight;
  const offscreenCtx = offscreenCanvas.getContext("2d", {
    alpha: false,
    desynchronized: true,
    willReadFrequently: false,
  });

  if (!offscreenCtx) {
    return offscreenCanvas;
  }

  // 背景を描画
  offscreenCtx.fillStyle = "rgba(34, 34, 34, 1.0)";
  offscreenCtx.fillRect(0, 0, canvasWidth, canvasHeight);

  // 画像のサイズ計算（アスペクト比維持、隙間なしで最大表示＝cover）
  const rawWidth = image.naturalWidth || image.width || 1;
  const rawHeight = image.naturalHeight || image.height || 1;
  const scale = Math.max(canvasWidth / rawWidth, canvasHeight / rawHeight);
  const imageCtxWidth = Math.round(rawWidth * scale);
  const imageCtxHeight = Math.round(rawHeight * scale);
  
  const marginWidth = canvasWidth - imageCtxWidth;
  const posX = marginWidth === 0 ? 0 : marginWidth / 2;
  const marginHeight = canvasHeight - imageCtxHeight;
  const posY = marginHeight === 0 ? 0 : marginHeight / 2;
  
  // 画像を描画
  offscreenCtx.drawImage(
    image,
    0,
    0,
    rawWidth,
    rawHeight,
    posX,
    posY,
    imageCtxWidth,
    imageCtxHeight
  );

  // キャッシュを更新
  imageCache = {
    canvas: offscreenCanvas,
    imageHash: hash,
    canvasWidth,
    canvasHeight,
  };

  return offscreenCanvas;
}

export const drawBars = (
  canvas: HTMLCanvasElement,
  imageCtx: HTMLImageElement | null,
  mode: number,
  analyser: AnalyserNode | null,
  adjustments?: ModeAdjustments,
  effect?: EffectParams,
  isEffectActive?: boolean,
  spectrumSettings?: SpectrumSettings
) => {
  const settings: SpectrumSettings = spectrumSettings ?? {
    opacity: 0.9,
    lineWidthWaveform: 3.2,
    lineWidthCircle: 3.2,
    lineWidthSymWave: 3.6,
  };
  // 安定表示優先: desynchronized は動画背景でのちらつきを誘発する環境がある
  const ctx = canvas.getContext("2d", {
    alpha: true,
    desynchronized: false,
    willReadFrequently: false,
  });
  
  if (!ctx) {
    animationFrameId = requestAnimationFrame(function () {
      drawBars(canvas, imageCtx, mode, analyser, adjustments, effect, isEffectActive, spectrumSettings);
    });
    return animationFrameId;
  }
  
  const canvasWidth = canvas.width;
  const canvasHeight = canvas.height;
  
  // 調整パラメータのデフォルト値
  const adj = adjustments || {
    scaleX: 1.0,
    scaleY: 1.0,
    offsetX: 0,
    offsetY: 0,
  };

  const galleryTransition = peekGalleryImageTransitionFrame();
  const bgVideo = settings.backgroundVideo;
  if (galleryTransition) {
    drawGalleryBackground(ctx, canvasWidth, canvasHeight, imageCtx, galleryTransition);
  } else if (bgVideo) {
    settings.syncBackgroundVideo?.();
    const vw = bgVideo.videoWidth || 0;
    const vh = bgVideo.videoHeight || 0;
    const canDrawFrame =
      bgVideo.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && vw > 0 && vh > 0;
    if (canDrawFrame) {
      ctx.fillStyle = "rgba(34, 34, 34, 1.0)";
      ctx.fillRect(0, 0, canvasWidth, canvasHeight);
      drawVideoCover(ctx, bgVideo, canvasWidth, canvasHeight);
    } else if (settings.clearBackgroundTransparent) {
      ctx.clearRect(0, 0, canvasWidth, canvasHeight);
    } else {
      // デコード準備中は静止画分岐に落ちないよう単色を維持（ちらつき防止）
      ctx.fillStyle = "rgba(34, 34, 34, 1.0)";
      ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    }
  } else if (imageCtx) {
    const offscreenCanvas = drawImageToOffscreen(imageCtx, canvasWidth, canvasHeight);
    ctx.drawImage(offscreenCanvas, 0, 0);
  } else if (settings.clearBackgroundTransparent) {
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);
  } else {
    ctx.fillStyle = "rgba(34, 34, 34, 1.0)";
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);
  }

  ctx.save();

  // プレビュー/録画中のみスペクトラム＆エフェクトを描画（停止中は背景のみ・負荷なし）
  if (!isEffectActive) {
    ctx.restore();
    return;
  }

  if (!analyser) {
    ctx.restore();
    animationFrameId = requestAnimationFrame(function () {
      drawBars(canvas, imageCtx, mode, analyser, adjustments, effect, isEffectActive, spectrumSettings);
    });
    return animationFrameId;
  }

  // 折れ線/波形モード: スペアナ本体のみ間引く（エフェクト・字幕は毎フレーム＝WebGLと同じ）
  const now = performance.now();
  const interval = 1000 / SPECTRUM_THROTTLE_TARGET_FPS;
  let skipSpectrumDraw = false;
  if (mode === 1) {
    const last = (drawBars as any)._lastTimeMode1 ?? 0;
    if (now - last < interval) {
      skipSpectrumDraw = true;
    } else {
      (drawBars as any)._lastTimeMode1 = now;
    }
  }
  if (mode === 5) {
    const last = (drawBars as any)._lastTimeMode5 ?? 0;
    if (now - last < interval) {
      skipSpectrumDraw = true;
    } else {
      (drawBars as any)._lastTimeMode5 = now;
    }
  }

  const bufferLength = analyser.frequencyBinCount; // analyser.fftSizeの半分になる(1024)
  const bufferData = new Uint8Array(bufferLength);
  const freqForEffect = new Uint8Array(bufferLength);
  analyser.getByteFrequencyData(freqForEffect);

  // 音声メトリクス（エフェクト連動用）: 0〜1正規化（常に周波数データを使用）
  const getAudioReactive = (): AudioReactiveData => {
    let bass = 0, volume = 0, highFreq = 0;
    for (let i = 0; i < 16; i++) bass += freqForEffect[i];
    for (let i = 0; i < bufferLength; i++) volume += freqForEffect[i];
    for (let i = 200; i < Math.min(256, bufferLength); i++) highFreq += freqForEffect[i];
    return {
      bass: Math.min(1, bass / (16 * 200)),
      volume: Math.min(1, volume / (bufferLength * 180)),
      highFreq: Math.min(1, highFreq / (56 * 150)),
    };
  };

  // 調整パラメータを適用
  // グライコ(6): 縦倍率3.0=現在の1.0相当、横倍率1.0=横幅いっぱい
  const effAdj = mode === 6
    ? { ...adj, scaleY: adj.scaleY / 3, scaleX: adj.scaleX }
    : adj;
  const offsetXPixels = (canvasWidth * effAdj.offsetX) / 100;
  const offsetYPixels = (canvasHeight * effAdj.offsetY) / 100;

  const [pr, pg, pb] = getSpectrumPrimaryRgb(settings);
  const [sr, sg, sb] = getSpectrumSecondaryRgb(settings);
  const useRainbow34 = settings.spectrumRainbowColorful !== false;
  const visualOpacity = getVisualOpacity(settings.opacity);

  if (!skipSpectrumDraw) {
  ctx.save();
  ctx.translate(canvasWidth / 2 + offsetXPixels, canvasHeight / 2 + offsetYPixels);
  ctx.scale(effAdj.scaleX, effAdj.scaleY);
  ctx.translate(-canvasWidth / 2, -canvasHeight / 2);
  
  if (mode === -1) {
    // OFF: スペアナ描画なし。早期 return しない（下の restore → エフェクトと WebGL case -1 を揃える）
  } else if (mode === 0) {
    analyser.getByteFrequencyData(bufferData);
    ctx.fillStyle = `rgba(${pr}, ${pg}, ${pb}, 0.8)`;
    const barsLength = 128;
    const barWidth = canvasWidth / barsLength;
    let barX = 0;
    for (let i = 0; i < barsLength; i++) {
      const g = spectrumLinearBarLowGain(i, barsLength);
      const barHeight = Math.min(255, bufferData[i] * g);
      ctx.fillRect(barX, canvasHeight - barHeight, barWidth, barHeight);
      barX += canvasWidth / barsLength;
    }
} else if (mode === 1) {
    analyser.getByteTimeDomainData(bufferData); //Waveform Data
    ctx.strokeStyle = `rgba(${pr}, ${pg}, ${pb}, ${settings.opacity})`;
    ctx.lineWidth = BASE_LINE_WIDTH_WAVEFORM * settings.lineWidthWaveform;
    ctx.beginPath();
    const centerY = canvasHeight / 2;
    const scale = (canvasHeight / 2) / 128;
    for (let i = 0; i < bufferLength; i++) {
      const x = (i / bufferLength) * canvasWidth;
      const y = centerY - (bufferData[i] - 128) * scale;
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();
} else if (mode === 2) {
    analyser.getByteFrequencyData(bufferData); //spectrum data
    ctx.fillStyle = `rgba(${pr}, ${pg}, ${pb}, ${settings.opacity})`;

    ctx.scale(0.5, 0.5);
    ctx.translate(canvasWidth, canvasHeight);

    const bass = Math.floor(bufferData[1]); //1Hz Freq
    const radius =
      0.2 * canvasWidth <= 200
        ? -(bass * 0.25 + 0.2 * canvasWidth)
        : -(bass * 0.25 + 200);

    const threshold = 0;
    const barLengthFactor = 1;
    const circleRotationRpm = settings.circleRotationRpm ?? 0;
    const rotationOffsetRad = ((circleRotationRpm * 2 * Math.PI) / 60) * (performance.now() / 1000);
    if (rotationOffsetRad !== 0) {
      ctx.rotate(rotationOffsetRad);
    }
    for (let i = 0; i < 256; i++) {
      let value = bufferData[i];
      if (value >= threshold) {
        const barWidth = BASE_LINE_WIDTH_CIRCLE * settings.lineWidthCircle;
        ctx.fillRect(
          0,
          radius,
          barWidth,
          -value / barLengthFactor
        );
        ctx.rotate(((180 / 128) * Math.PI) / 180);
      }
    }
  } else if (mode === 3) {
    // モード3: 上下対称バー（横軸は対数周波数ビン＝モード6と同系。線形だと右側がナイキスト寄りで無反応に近くなる）
    analyser.getByteFrequencyData(bufferData);
    const barsLength = 128;
    const barWidth = canvasWidth / barsLength;
    const centerY = canvasHeight / 2;
    
    for (let i = 0; i < barsLength; i++) {
      const barHeight = glycoBarRawEnergy(i, barsLength, bufferLength, bufferData) * 2;
      if (useRainbow34) {
        const hue = (i / barsLength) * 360;
        const gradient = ctx.createLinearGradient(
          i * barWidth,
          centerY - barHeight / 2,
          i * barWidth,
          centerY + barHeight / 2
        );
        gradient.addColorStop(0, `hsla(${hue}, 100%, 50%, 0.8)`);
        gradient.addColorStop(1, `hsla(${hue + 60}, 100%, 70%, 0.8)`);
        ctx.fillStyle = gradient;
      } else {
        const gradient = ctx.createLinearGradient(
          i * barWidth,
          centerY - barHeight / 2,
          i * barWidth,
          centerY + barHeight / 2
        );
        gradient.addColorStop(0, `rgba(${pr}, ${pg}, ${pb}, 0.85)`);
        gradient.addColorStop(1, `rgba(${sr}, ${sg}, ${sb}, 0.85)`);
        ctx.fillStyle = gradient;
      }
      ctx.fillRect(
        i * barWidth,
        centerY - barHeight / 2,
        barWidth - 1,
        barHeight
      );
    }
  } else if (mode === 4) {
    // モード4: ドット表示（32列×16行）。列→FFT は対数ビン（グライコと同系）で帯域を横全体に載せる
    analyser.getByteFrequencyData(bufferData);
    const dotsPerRow = 32;
    const dotsPerCol = 16;
    const dotSizeX = canvasWidth / dotsPerRow;
    const dotSizeY = canvasHeight / dotsPerCol;
    const dotRadius = Math.min(dotSizeX, dotSizeY) / 3;
    
    for (let col = 0; col < dotsPerRow; col++) {
      const value = glycoBarRawEnergy(col, dotsPerRow, bufferLength, bufferData);
      
      for (let row = 0; row < dotsPerCol; row++) {
        const threshold = (255 / dotsPerCol) * (dotsPerCol - row);
        const opacity = value > threshold ? 0.8 : 0.2;
        if (useRainbow34) {
          const hue = (col / dotsPerRow) * 360;
          ctx.fillStyle = `hsla(${hue}, 100%, 50%, ${opacity})`;
        } else {
          const t = col / dotsPerRow;
          const r = Math.round(pr + (sr - pr) * t);
          const g = Math.round(pg + (sg - pg) * t);
          const b = Math.round(pb + (sb - pb) * t);
          ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${opacity})`;
        }
        ctx.beginPath();
        ctx.arc(
          col * dotSizeX + dotSizeX / 2,
          row * dotSizeY + dotSizeY / 2,
          dotRadius,
          0,
          Math.PI * 2
        );
        ctx.fill();
      }
    }
  } else if (mode === 5) {
    // モード5: 波形（上下対称）
    analyser.getByteTimeDomainData(bufferData);
    ctx.strokeStyle = `rgba(${pr}, ${pg}, ${pb}, ${settings.opacity})`;
    ctx.lineWidth = settings.lineWidthSymWave;
    ctx.beginPath();
    
    const centerY = canvasHeight / 2;
    const scale = canvasHeight / 512;
    
    for (let i = 0; i < bufferLength; i++) {
      const x = (i / bufferLength) * canvasWidth;
      const y = centerY - (bufferData[i] - 128) * scale;
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    
    // 上下対称に描画
    ctx.stroke();
    ctx.save();
    ctx.scale(1, -1);
    ctx.translate(0, -canvasHeight);
    ctx.stroke();
    ctx.restore();
  } else if (mode === 15) {
    // モード15: Oscilloscope（発光する波形線）
    analyser.getByteTimeDomainData(bufferData);
    const lp = settings.loudnessParams ?? { gain: 1.6, gamma: 0.75, attack: 0.28, release: 0.12 };
    // freqForEffect は常に取っているので音圧はそちらから（見た目強め）
    const target = computeLoudnessTarget(freqForEffect, lp.gamma, lp.gain);
    const st = (drawBars as any)._mode15Scope ?? { level: 0 };
    st.level = smoothAR(st.level, target, lp.attack, lp.release);
    (drawBars as any)._mode15Scope = st;
    const level = st.level;

    const cx = canvasWidth / 2;
    const cy = canvasHeight / 2;
    const amp = (canvasHeight * 0.18) * (0.55 + 1.35 * level);
    const lineW = Math.max(1.5, (BASE_LINE_WIDTH_WAVEFORM * 0.9 + level * 3.2));
    const op = visualOpacity;
    const t0 = performance.now() / 1000;
    const wobble = Math.sin(t0 * 0.6) * (0.08 + 0.15 * level);
    const wmp = settings.wmpTrailParams ?? { trailLength: 8, trailDecay: 0.86, additive: 1.0 };

    const scopeTrail = (drawBars as any)._mode15ScopeTrail ?? { frames: [] as Uint8Array[] };
    scopeTrail.frames.push(new Uint8Array(bufferData));
    const maxTrail = Math.max(2, Math.floor(wmp.trailLength));
    while (scopeTrail.frames.length > maxTrail) scopeTrail.frames.shift();
    (drawBars as any)._mode15ScopeTrail = scopeTrail;

    // グロー（下地）: 太め＆低α + 履歴
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.globalCompositeOperation = "lighter";
    for (let f = 0; f < scopeTrail.frames.length; f++) {
      const frame = scopeTrail.frames[f];
      const age = (f + 1) / scopeTrail.frames.length;
      const fade = trailFade(age, wmp.trailDecay);
      const add = Math.max(0.2, wmp.additive);
      ctx.shadowColor = `rgba(${sr}, ${sg}, ${sb}, ${0.7 * op * fade * add})`;
      ctx.shadowBlur = (10 + 36 * level) * fade;
      ctx.beginPath();
      for (let i = 0; i < bufferLength; i++) {
        const x = (i / (bufferLength - 1)) * canvasWidth;
        const v = (frame[i] - 128) / 128;
        const y = cy + (v + wobble * Math.sin((i / bufferLength) * Math.PI * 2)) * amp;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = `rgba(${sr}, ${sg}, ${sb}, ${0.18 * op * fade * add})`;
      ctx.lineWidth = lineW * (1.8 + 1.2 * level) * fade;
      ctx.stroke();
    }

    // 本線（グラデ）
    ctx.shadowBlur = 0;
    ctx.beginPath();
    for (let i = 0; i < bufferLength; i++) {
      const x = (i / (bufferLength - 1)) * canvasWidth;
      const v = (bufferData[i] - 128) / 128;
      const y = cy + v * amp;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    const grad = ctx.createLinearGradient(0, cy, canvasWidth, cy);
    grad.addColorStop(0, `rgba(${pr}, ${pg}, ${pb}, ${0.65 * op})`);
    grad.addColorStop(0.5, `rgba(${sr}, ${sg}, ${sb}, ${0.85 * op})`);
    grad.addColorStop(1, `rgba(255, 255, 255, ${0.55 * op})`);
    ctx.strokeStyle = grad;
    ctx.lineWidth = lineW;
    ctx.stroke();
    ctx.restore();
  } else if (mode === 16) {
    // モード16: Lissajous / Spiro（幾何学曲線）
    analyser.getByteTimeDomainData(bufferData);
    const lp = settings.loudnessParams ?? { gain: 1.45, gamma: 0.78, attack: 0.26, release: 0.1 };
    const target = computeLoudnessTarget(freqForEffect, lp.gamma, lp.gain);
    const st = (drawBars as any)._mode16Lis ?? { level: 0 };
    st.level = smoothAR(st.level, target, lp.attack, lp.release);
    (drawBars as any)._mode16Lis = st;
    const level = st.level;

    const cx = canvasWidth / 2;
    const cy = canvasHeight / 2;
    const baseR = Math.min(canvasWidth, canvasHeight) * (0.22 + 0.18 * level);
    const op = visualOpacity;
    const n = bufferLength;
    const offset = Math.max(1, Math.floor(n * (0.17 + 0.08 * Math.sin(performance.now() / 1200))));
    const rot = (performance.now() / 1000) * (0.15 + 0.55 * level);
    const wmp = settings.wmpTrailParams ?? { trailLength: 8, trailDecay: 0.86, additive: 1.0 };

    const lisTrail = (drawBars as any)._mode16LisTrail ?? { frames: [] as { offset: number; rot: number; level: number }[] };
    lisTrail.frames.push({ offset, rot, level });
    const maxTrail = Math.max(2, Math.floor(wmp.trailLength));
    while (lisTrail.frames.length > maxTrail) lisTrail.frames.shift();
    (drawBars as any)._mode16LisTrail = lisTrail;

    for (let h = 0; h < lisTrail.frames.length; h++) {
      const fr = lisTrail.frames[h];
      const age = (h + 1) / lisTrail.frames.length;
      const fade = trailFade(age, wmp.trailDecay);
      const add = Math.max(0.2, wmp.additive);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(fr.rot);
      ctx.globalCompositeOperation = "lighter";
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      // グロー（多重線）
      for (let pass = 0; pass < 2; pass++) {
        ctx.beginPath();
        for (let i = 0; i <= n; i++) {
          const idx = i % n;
          const x0 = (bufferData[idx] - 128) / 128;
          const y0 = (bufferData[(idx + fr.offset) % n] - 128) / 128;
          const r = baseR * (0.6 + 0.55 * fr.level);
          const x = x0 * r;
          const y = y0 * r;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        const a = (pass === 0 ? 0.16 : 0.06) * op * fade * add;
        ctx.strokeStyle = `rgba(${sr}, ${sg}, ${sb}, ${a})`;
        ctx.lineWidth = (pass === 0 ? 6 : 12) * (0.7 + fr.level) * fade;
        ctx.stroke();
      }

      // 本線（色相グラデ風に点を散らす）
      const steps = 220;
      for (let i = 0; i < steps; i++) {
        const t = i / steps;
        const idx = Math.floor(t * (n - 1));
        const x0 = (bufferData[idx] - 128) / 128;
        const y0 = (bufferData[(idx + fr.offset) % n] - 128) / 128;
        const r = baseR * (0.6 + 0.55 * fr.level);
        const x = x0 * r;
        const y = y0 * r;
        const [rr, gg, bb] = oscColorAt(t, pr, pg, pb, sr, sg, sb);
        ctx.fillStyle = `rgba(${rr}, ${gg}, ${bb}, ${0.42 * op * fade * add})`;
        ctx.beginPath();
        ctx.arc(x, y, (0.9 + 1.6 * fr.level) * fade, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  } else if (mode === 7) {
    // モード7: 周波数スペクトラム面（下辺固定の塗りつぶし＋上縁ライン）
    analyser.getByteFrequencyData(bufferData);
    const barsLength = 128;
    const barWidth = canvasWidth / barsLength;
    ctx.beginPath();
    ctx.moveTo(0, canvasHeight);
    for (let i = 0; i < barsLength; i++) {
      const h = bufferData[Math.floor((i / barsLength) * bufferLength)];
      const x = i * barWidth + barWidth / 2;
      ctx.lineTo(x, canvasHeight - h);
    }
    ctx.lineTo(canvasWidth, canvasHeight);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, canvasHeight, 0, 0);
    const op = visualOpacity;
    g.addColorStop(0, `rgba(${pr}, ${pg}, ${pb}, ${0.78 * op})`);
    g.addColorStop(1, `rgba(${sr}, ${sg}, ${sb}, ${0.38 * op})`);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.beginPath();
    for (let i = 0; i < barsLength; i++) {
      const h = bufferData[Math.floor((i / barsLength) * bufferLength)];
      const x = i * barWidth + barWidth / 2;
      const y = canvasHeight - h;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = `rgba(${sr}, ${sg}, ${sb}, ${0.92 * op})`;
    ctx.lineWidth = Math.max(1, BASE_LINE_WIDTH_WAVEFORM * 0.55);
    ctx.stroke();
  } else if (mode === 8) {
    // モード8: 音圧パルス（周波数分解なし、全帯域の音圧でリング/グローが脈動）
    analyser.getByteFrequencyData(bufferData);
    const lp = settings.loudnessParams ?? { gain: 1.35, gamma: 0.82, attack: 0.22, release: 0.08 };
    const target = computeLoudnessTarget(bufferData, lp.gamma, lp.gain);

    const pulseState = (drawBars as any)._mode8Pulse ?? { level: 0 };
    pulseState.level = smoothAR(pulseState.level, target, lp.attack, lp.release);
    (drawBars as any)._mode8Pulse = pulseState;
    const level = pulseState.level;

    const cx = canvasWidth / 2;
    const cy = canvasHeight / 2;
    const baseR = Math.min(canvasWidth, canvasHeight) * 0.16;
    const pulseR = baseR * (1 + level * 1.15);
    const glowR = pulseR * (1.6 + level * 0.75);
    const op = visualOpacity;

    const glow = ctx.createRadialGradient(cx, cy, pulseR * 0.2, cx, cy, glowR);
    glow.addColorStop(0, `rgba(${sr}, ${sg}, ${sb}, ${0.65 * op})`);
    glow.addColorStop(1, `rgba(${pr}, ${pg}, ${pb}, 0)`);
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx, cy, glowR, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = `rgba(${pr}, ${pg}, ${pb}, ${0.28 * op + 0.25 * level * op})`;
    ctx.beginPath();
    ctx.arc(cx, cy, pulseR, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = `rgba(${sr}, ${sg}, ${sb}, ${0.75 * op})`;
    ctx.lineWidth = Math.max(2, baseR * 0.08 + level * 3);
    ctx.beginPath();
    ctx.arc(cx, cy, pulseR * 1.02, 0, Math.PI * 2);
    ctx.stroke();
  } else if (mode === 9) {
    // モード9: VUメーター（2ch風）+ ピークホールド
    analyser.getByteFrequencyData(bufferData);
    const lp = settings.loudnessParams ?? { gain: 1.25, gamma: 0.85, attack: 0.28, release: 0.12 };
    let leftSum = 0;
    let rightSum = 0;
    const half = Math.max(1, Math.floor(bufferLength / 2));
    for (let i = 0; i < half; i++) leftSum += bufferData[i];
    for (let i = half; i < bufferLength; i++) rightSum += bufferData[i];
    const left = leftSum / (half * 255);
    const right = rightSum / (Math.max(1, bufferLength - half) * 255);
    const rawL = clamp01(Math.pow(left, lp.gamma) * lp.gain);
    const rawR = clamp01(Math.pow(right, lp.gamma) * lp.gain);

    const vuState = (drawBars as any)._mode9Vu ?? { levelL: 0, levelR: 0, peakL: 0, peakR: 0, lastMs: performance.now() };
    const now = performance.now();
    const dt = Math.min(60, now - vuState.lastMs);
    vuState.lastMs = now;
    vuState.levelL = smoothAR(vuState.levelL, rawL, lp.attack, lp.release);
    vuState.levelR = smoothAR(vuState.levelR, rawR, lp.attack, lp.release);
    vuState.peakL = Math.max(vuState.levelL, vuState.peakL - dt * 0.00075);
    vuState.peakR = Math.max(vuState.levelR, vuState.peakR - dt * 0.00075);
    (drawBars as any)._mode9Vu = vuState;

    const barW = canvasWidth * 0.16;
    const gap = canvasWidth * 0.08;
    const xL = canvasWidth / 2 - gap / 2 - barW;
    const xR = canvasWidth / 2 + gap / 2;
    const maxH = canvasHeight * 0.72;
    const baseY = canvasHeight * 0.9;
    const op = visualOpacity;
    const drawVu = (x: number, level: number, peak: number) => {
      const h = maxH * level;
      const grad = ctx.createLinearGradient(x, baseY, x, baseY - maxH);
      grad.addColorStop(0, `rgba(${pr}, ${pg}, ${pb}, ${0.8 * op})`);
      grad.addColorStop(0.7, `rgba(${sr}, ${sg}, ${sb}, ${0.88 * op})`);
      grad.addColorStop(1, `rgba(255, 90, 90, ${0.95 * op})`);
      ctx.fillStyle = grad;
      ctx.fillRect(x, baseY - h, barW, h);
      const peakY = baseY - maxH * peak;
      ctx.fillStyle = `rgba(255, 240, 120, ${0.95 * op})`;
      ctx.fillRect(x, peakY - 2, barW, 4);
    };
    drawVu(xL, vuState.levelL, vuState.peakL);
    drawVu(xR, vuState.levelR, vuState.peakR);
  } else if (mode === 10) {
    // モード10: 円リング脈動（半径/線幅/グロー）
    analyser.getByteFrequencyData(bufferData);
    const lp = settings.loudnessParams ?? { gain: 1.35, gamma: 0.82, attack: 0.22, release: 0.08 };
    const target = computeLoudnessTarget(bufferData, lp.gamma, lp.gain);
    const st = (drawBars as any)._mode10Ring ?? { level: 0 };
    st.level = smoothAR(st.level, target, lp.attack, lp.release);
    (drawBars as any)._mode10Ring = st;
    const level = st.level;
    const cx = canvasWidth / 2;
    const cy = canvasHeight / 2;
    const baseR = Math.min(canvasWidth, canvasHeight) * 0.2;
    const r = baseR * (1 + level * 0.42);
    const lw = 2 + level * 10;
    const op = visualOpacity;
    const glow = ctx.createRadialGradient(cx, cy, r * 0.7, cx, cy, r * 1.9);
    glow.addColorStop(0, `rgba(${sr}, ${sg}, ${sb}, ${0.25 * op})`);
    glow.addColorStop(1, `rgba(${pr}, ${pg}, ${pb}, 0)`);
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 1.9, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = `rgba(${pr}, ${pg}, ${pb}, ${0.88 * op})`;
    ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
  } else if (mode === 11) {
    // モード11: 中央オーブ（発光球）
    analyser.getByteFrequencyData(bufferData);
    const lp = settings.loudnessParams ?? { gain: 1.4, gamma: 0.8, attack: 0.22, release: 0.08 };
    const target = computeLoudnessTarget(bufferData, lp.gamma, lp.gain);
    const st = (drawBars as any)._mode11Orb ?? { level: 0 };
    st.level = smoothAR(st.level, target, lp.attack, lp.release);
    (drawBars as any)._mode11Orb = st;
    const level = st.level;
    const cx = canvasWidth / 2;
    const cy = canvasHeight / 2;
    const r = Math.min(canvasWidth, canvasHeight) * (0.1 + level * 0.24);
    const op = visualOpacity;
    const orb = ctx.createRadialGradient(cx, cy, r * 0.08, cx, cy, r * 2.5);
    orb.addColorStop(0, `rgba(255, 255, 255, ${0.95 * op})`);
    orb.addColorStop(0.35, `rgba(${sr}, ${sg}, ${sb}, ${0.72 * op})`);
    orb.addColorStop(1, `rgba(${pr}, ${pg}, ${pb}, 0)`);
    ctx.fillStyle = orb;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 2.5, 0, Math.PI * 2);
    ctx.fill();
  } else if (mode === 12) {
    // モード12: 背景ブリージング（明度/彩度）
    analyser.getByteFrequencyData(bufferData);
    const lp = settings.loudnessParams ?? { gain: 1.15, gamma: 0.9, attack: 0.18, release: 0.08 };
    const target = computeLoudnessTarget(bufferData, lp.gamma, lp.gain);
    const st = (drawBars as any)._mode12Bg ?? { level: 0 };
    st.level = smoothAR(st.level, target, lp.attack, lp.release);
    (drawBars as any)._mode12Bg = st;
    const level = st.level;
    const op = visualOpacity;
    const t = performance.now() / 1000;
    const breathe = 0.5 + 0.5 * Math.sin(t * 1.7);
    const a = (0.1 + 0.35 * level) * (0.75 + 0.25 * breathe) * op;
    const bg = ctx.createLinearGradient(0, 0, canvasWidth, canvasHeight);
    bg.addColorStop(0, `rgba(${pr}, ${pg}, ${pb}, ${a})`);
    bg.addColorStop(1, `rgba(${sr}, ${sg}, ${sb}, ${a * 0.65})`);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);
  } else if (mode === 13) {
    // モード13: パーティクル密度制御
    analyser.getByteFrequencyData(bufferData);
    const lp = settings.loudnessParams ?? { gain: 1.3, gamma: 0.85, attack: 0.22, release: 0.1 };
    const target = computeLoudnessTarget(bufferData, lp.gamma, lp.gain);
    const stL = (drawBars as any)._mode13Level ?? { level: 0 };
    stL.level = smoothAR(stL.level, target, lp.attack, lp.release);
    (drawBars as any)._mode13Level = stL;
    const level = stL.level;
    const op = visualOpacity;
    const now = performance.now();
    const state = (drawBars as any)._mode13Particles ?? { arr: [] as any[], lastMs: now };
    const dt = Math.min(40, now - state.lastMs);
    state.lastMs = now;
    const perfScale = getParticlePerfScale();
    const targetCount = Math.floor((20 + level * 120) * perfScale);
    const trailLen = perfScale <= 0.5 ? 35 : perfScale <= 0.75 ? 45 : 60;
    while (state.arr.length < targetCount) {
      state.arr.push({
        x: Math.random() * canvasWidth,
        y: canvasHeight + Math.random() * 40,
        vx: (Math.random() - 0.5) * (0.04 + level * 0.25),
        vy: -(0.08 + Math.random() * (0.18 + level * 0.55)),
        life: 1,
      });
    }
    if (state.arr.length > targetCount) state.arr.length = targetCount;
    for (const p of state.arr) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt * (0.0006 + 0.0007 * (1 - level));
      if (p.y < -30 || p.life <= 0) {
        p.x = Math.random() * canvasWidth;
        p.y = canvasHeight + Math.random() * 30;
        p.life = 1;
      }
      const alpha = Math.max(0, p.life) * (0.25 + 0.65 * level) * op;
      ctx.strokeStyle = `rgba(${sr}, ${sg}, ${sb}, ${alpha})`;
      ctx.lineWidth = (1 + level * 2) * Math.max(0.7, perfScale);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - p.vx * trailLen, p.y - p.vy * trailLen);
      ctx.stroke();
    }
    (drawBars as any)._mode13Particles = state;
  } else if (mode === 14) {
    // モード14: ジオメトリ連続変形（単一形状）
    analyser.getByteFrequencyData(bufferData);
    const lp = settings.loudnessParams ?? { gain: 1.25, gamma: 0.86, attack: 0.22, release: 0.1 };
    const target = computeLoudnessTarget(bufferData, lp.gamma, lp.gain);
    const st = (drawBars as any)._mode14Morph ?? { level: 0 };
    st.level = smoothAR(st.level, target, lp.attack, lp.release);
    (drawBars as any)._mode14Morph = st;
    const level = st.level;
    const cx = canvasWidth / 2;
    const cy = canvasHeight / 2;
    const baseR = Math.min(canvasWidth, canvasHeight) * 0.22;
    const op = visualOpacity;
    const points = 96;
    const spikes = 3 + Math.floor(level * 8);
    ctx.beginPath();
    for (let i = 0; i <= points; i++) {
      const t = i / points;
      const a = t * Math.PI * 2;
      const wave = Math.sin(a * spikes);
      const morph = (0.15 + 0.55 * level) * wave;
      const r = baseR * (1 + morph);
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    const g = ctx.createRadialGradient(cx, cy, baseR * 0.2, cx, cy, baseR * 1.6);
    g.addColorStop(0, `rgba(${sr}, ${sg}, ${sb}, ${0.75 * op})`);
    g.addColorStop(1, `rgba(${pr}, ${pg}, ${pb}, ${0.18 * op})`);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = `rgba(${sr}, ${sg}, ${sb}, ${0.95 * op})`;
    ctx.lineWidth = 2 + level * 4;
    ctx.stroke();
  } else if (mode === 6) {
    // モード6: グライコ風（1980年代コンポ風ピークホールド）
    analyser.getByteFrequencyData(bufferData);
    const barsLength = 64;
    const barWidth = canvasWidth / barsLength;
    const scale = (canvasHeight / 255) * GLYCO_BAR_VERTICAL_SCALE;
    const holdMs = 350;
    const decayPerFrame = 2.5;
    const now = performance.now();
    const colorSet = settings.glycoColorSet ?? "amber";

    const peakState = (drawBars as any)._glycoPeak ?? { peak: [] as number[], lastPeakTime: [] as number[], lastMode: -1 };
    if (peakState.lastMode !== 6) {
      peakState.peak = new Array(barsLength).fill(0);
      peakState.lastPeakTime = new Array(barsLength).fill(0);
    }
    peakState.lastMode = 6;
    (drawBars as any)._glycoPeak = peakState;

    const peak = peakState.peak;
    const lastPeakTime = peakState.lastPeakTime;

    const getColor = (i: number) => {
      if (GLYCO_COLOR_SETS[colorSet]) {
        const c = GLYCO_COLOR_SETS[colorSet];
        return { bar: c.bar, dash: c.dash };
      }
      if (GLYCO_GRADIENT_SETS[colorSet]) {
        const c = GLYCO_GRADIENT_SETS[colorSet](i, barsLength);
        const dash: [number, number, number] = [Math.min(255, c[0] + 40), Math.min(255, c[1] + 40), Math.min(255, c[2] + 40)];
        return { bar: c, dash };
      }
      const c = GLYCO_COLOR_SETS.amber;
      return { bar: c.bar, dash: c.dash };
    };

    const useVerticalGradient = colorSet === "verticalEQ";
    const useVerticalGradientFixed = colorSet === "verticalEQFixed";
    const opacity = 0.6 * settings.opacity;
    const peakLineWidth = 5; // ピーク「-」を太く

    for (let i = 0; i < barsLength; i++) {
      const rawValue = glycoBarRawEnergy(i, barsLength, bufferLength, bufferData);
      const value = glycoAdjustedLevel(rawValue);
      const barHeight = Math.min(value * scale, canvasHeight);
      const x = i * barWidth;

      if (value >= peak[i]) {
        peak[i] = value;
        lastPeakTime[i] = now;
      } else if (now - lastPeakTime[i] > holdMs) {
        peak[i] = Math.max(0, peak[i] - decayPerFrame);
      }

      const { bar, dash } = getColor(i);

      if (useVerticalGradient) {
        // 縦グラデーション（下:青紫→シアン→緑→上:赤橙、EQ風）
        const grad = ctx.createLinearGradient(x, canvasHeight, x, canvasHeight - barHeight);
        grad.addColorStop(0, `rgba(60, 50, 120, ${opacity})`);
        grad.addColorStop(0.35, `rgba(0, 160, 180, ${opacity})`);
        grad.addColorStop(0.65, `rgba(0, 220, 100, ${opacity})`);
        grad.addColorStop(1, `rgba(255, 100, 50, ${opacity})`);
        ctx.fillStyle = grad;
      } else if (useVerticalGradientFixed) {
        // 縦グラデーション固定: 表示エリア最大高さを100%とする（バー高さに依存しない）
        // 下60%: 青、61%〜上: 青→黄緑→黄→橙→赤
        const grad = ctx.createLinearGradient(x, canvasHeight, x, 0);
        grad.addColorStop(0, `rgba(50, 80, 180, ${opacity})`);
        grad.addColorStop(0.6, `rgba(50, 80, 180, ${opacity})`);
        grad.addColorStop(0.61, `rgba(50, 80, 180, ${opacity})`);
        grad.addColorStop(0.72, `rgba(150, 220, 50, ${opacity})`);
        grad.addColorStop(0.82, `rgba(255, 220, 0, ${opacity})`);
        grad.addColorStop(0.91, `rgba(255, 150, 50, ${opacity})`);
        grad.addColorStop(1, `rgba(220, 50, 50, ${opacity})`);
        ctx.fillStyle = grad;
      } else {
        ctx.fillStyle = `rgba(${bar[0]}, ${bar[1]}, ${bar[2]}, ${opacity})`;
      }
      ctx.fillRect(x, canvasHeight - barHeight, barWidth, barHeight);

      const peakHeight = Math.min(peak[i] * scale, canvasHeight);
      const dashWidth = barWidth * 0.7;
      const dashX = x + (barWidth - dashWidth) / 2;
      const dashY = canvasHeight - peakHeight;
      ctx.strokeStyle = (useVerticalGradient || useVerticalGradientFixed)
        ? `rgba(100, 200, 255, ${0.95 * settings.opacity})`
        : `rgba(${dash[0]}, ${dash[1]}, ${dash[2]}, ${0.95 * settings.opacity})`;
      ctx.lineWidth = peakLineWidth;
      ctx.beginPath();
      ctx.moveTo(dashX, dashY);
      ctx.lineTo(dashX + dashWidth, dashY);
      ctx.stroke();
    }
  }

  // 調整パラメータの適用を解除
  ctx.restore();
  }

  // 最初のsave()に対応するrestore()
  ctx.restore();

  // エフェクトオーバーレイ（背景→スペアナの上。字幕/UIより下）
  if (effect && effect.type !== "none") {
    let effectForOverlay: EffectParams = effect;
    // 主役埋もれ対策: 雨/ほこり/scanlines はスペアナ表示中に自動減衰
    if ((effect.type === "rain" || effect.type === "dust" || effect.type === "scanlines") && mode !== -1) {
      effectForOverlay = {
        ...effect,
        density: effect.density === 3 ? 2 : effect.density,
        weatherAmount: effect.weatherAmount != null ? effect.weatherAmount * 0.78 : effect.weatherAmount,
      };
    }
    drawEffectOverlayCanvas(ctx, canvasWidth, canvasHeight, effectForOverlay, getAudioReactive());
  }

  // 字幕オーバーレイ
  renderSubtitleOverlayCanvas(ctx, canvasWidth, canvasHeight, settings.subtitleOverlay);
  // タイトル（字幕より手前）
  renderTitleOverlayCanvas(ctx, canvasWidth, canvasHeight, settings.titleOverlay);

  // FPS測定
  fpsCounter++;
  const currentTime = performance.now();
  const elapsed = currentTime - fpsLastTime;
  if (elapsed >= 1000) { // 1秒ごとに更新
    currentFPS = Math.round((fpsCounter * 1000) / elapsed);
    fpsCounter = 0;
    fpsLastTime = currentTime;
  }

  animationFrameId = requestAnimationFrame(function () {
    drawBars(canvas, imageCtx, mode, analyser, adjustments, effect, isEffectActive, spectrumSettings);
  });
  return animationFrameId;
};
