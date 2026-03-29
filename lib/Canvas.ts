import { drawEffectOverlayCanvas, type EffectParams, type AudioReactiveData } from "./Effects";
import { drawGalleryBackground, peekGalleryImageTransitionFrame } from "./galleryImageTransition";

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
  glycoColorSet?: string;
  /** スペアナのベース色 #RRGGBB（優先。インポート互換で preset も参照） */
  spectrumColorHex?: string;
  /** 周波数バー・波形・円形など単色寄りモードのベース色（モード6グライコは従来の色セットを維持） */
  spectrumColorPreset?: SpectrumColorPresetKey;
  spectrumCustomHex?: string;
  /** モード3・4で虹色グラデーションを使う（false でプリマリ色ベース） */
  spectrumRainbowColorful?: boolean;
};

const SPECTRUM_PRESET_RGB: Record<Exclude<SpectrumColorPresetKey, "custom">, [number, number, number]> = {
  white: [255, 255, 255],
  cyan: [0, 255, 255],
  magenta: [255, 0, 200],
  green: [80, 255, 120],
  gold: [255, 200, 80],
};

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

/**
 * グライコ風（モード6）: バー index を FFT ビンへ対数周波数で対応付け。
 * 線形割り当てだと右側がナイキスト近傍の高域のみになり、音楽では無音に近く見える問題を避ける。
 */
export function glycoBarToFftBin(i: number, barsLength: number, bufferLength: number): number {
  if (bufferLength < 2 || barsLength < 1) return 0;
  if (barsLength === 1) return Math.min(1, bufferLength - 1);
  const t = i / (barsLength - 1);
  const minB = 1;
  const maxB = Math.max(minB + 2, Math.floor((bufferLength - 1) * GLYCO_LOG_BIN_MAX_FRAC));
  const lnLo = Math.log(minB);
  const lnHi = Math.log(maxB);
  const b = Math.exp(lnLo + t * (lnHi - lnLo));
  return Math.min(maxB, Math.max(0, Math.floor(b)));
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
  if (i < barsLength - 5) {
    return bufferData[c];
  }
  let m = bufferData[c];
  for (let d = -2; d <= 2; d++) {
    const idx = c + d;
    if (idx >= 0 && idx < bufferLength) {
      m = Math.max(m, bufferData[idx]);
    }
  }
  return m;
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
  // GPU加速を有効化（willReadFrequently: falseでGPU最適化）
  const ctx = canvas.getContext("2d", {
    alpha: false, // 透明度を無効化してパフォーマンス向上
    desynchronized: true, // 非同期レンダリングでパフォーマンス向上
    willReadFrequently: false, // GPU最適化を有効化
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
  if (galleryTransition) {
    drawGalleryBackground(ctx, canvasWidth, canvasHeight, imageCtx, galleryTransition);
  } else if (imageCtx) {
    const offscreenCanvas = drawImageToOffscreen(imageCtx, canvasWidth, canvasHeight);
    ctx.drawImage(offscreenCanvas, 0, 0);
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
    animationFrameId = requestAnimationFrame(function () {
      drawBars(canvas, imageCtx, mode, analyser, adjustments, effect, isEffectActive, spectrumSettings);
    });
    return animationFrameId;
  }

  // 折れ線/波形モード: データ取り込みを SPECTRUM_THROTTLE_TARGET_FPS に合わせて間引く
  const now = performance.now();
  const interval = 1000 / SPECTRUM_THROTTLE_TARGET_FPS;
  if (mode === 1) {
    const last = (drawBars as any)._lastTimeMode1 ?? 0;
    if (now - last < interval) {
      animationFrameId = requestAnimationFrame(function () {
        drawBars(canvas, imageCtx, mode, analyser, adjustments, effect, isEffectActive, spectrumSettings);
      });
      return animationFrameId;
    }
    (drawBars as any)._lastTimeMode1 = now;
  }
  if (mode === 5) {
    const last = (drawBars as any)._lastTimeMode5 ?? 0;
    if (now - last < interval) {
      animationFrameId = requestAnimationFrame(function () {
        drawBars(canvas, imageCtx, mode, analyser, adjustments, effect, isEffectActive, spectrumSettings);
      });
      return animationFrameId;
    }
    (drawBars as any)._lastTimeMode5 = now;
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
      const barHeight = bufferData[i];
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
    const op = settings.opacity;
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

  // 最初のsave()に対応するrestore()
  ctx.restore();

  // エフェクトオーバーレイ（このブロックは isEffectActive 時のみ到達＝音源連動）
  if (effect && effect.type !== "none") {
    drawEffectOverlayCanvas(ctx, canvasWidth, canvasHeight, effect, getAudioReactive());
  }

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
