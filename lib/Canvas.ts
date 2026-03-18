import { drawEffectOverlayCanvas, type EffectParams, type AudioReactiveData } from "./Effects";

const BASE_LINE_WIDTH_WAVEFORM = 2.0;
const BASE_LINE_WIDTH_CIRCLE   = 2.0;
const BASE_LINE_WIDTH_SYMWAVE  = 2.4;

export type ModeAdjustments = {
  scaleX: number;
  scaleY: number;
  offsetX: number;
  offsetY: number;
};

export type SpectrumSettings = {
  opacity: number;
  fps: number;
  lineWidthWaveform: number;
  lineWidthCircle: number;
  lineWidthSymWave: number;
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
  return `${image.src}-${image.width}-${image.height}-${canvasWidth}-${canvasHeight}`;
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
  const rawWidth = image.width;
  const rawHeight = image.height;
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
    fps: 30,
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
      drawBars(canvas, imageCtx, mode, analyser, adjustments, effect, isEffectActive);
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

  // 画像をオフスクリーンキャンバスからコピー（高速化）
  if (imageCtx) {
    const offscreenCanvas = drawImageToOffscreen(imageCtx, canvasWidth, canvasHeight);
    ctx.drawImage(offscreenCanvas, 0, 0);
  } else {
    // 画像がない場合は背景のみ描画
    ctx.fillStyle = "rgba(34, 34, 34, 1.0)";
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);
  }

  ctx.save();

  // プレビュー/録画中のみスペクトラムを描画（エフェクトと同様）
  if (!isEffectActive) {
    ctx.restore();
    return;
  }

  if (!analyser) {
    animationFrameId = requestAnimationFrame(function () {
      drawBars(canvas, imageCtx, mode, analyser, adjustments, effect, isEffectActive);
    });
    return animationFrameId;
  }

  // 折れ線/波形モードの描画更新頻度を設定値に合わせて落とす
  const now = performance.now();
  const interval = 1000 / settings.fps;
  if (mode === 1) {
    const last = (drawBars as any)._lastTimeMode1 ?? 0;
    if (now - last < interval) {
      animationFrameId = requestAnimationFrame(function () {
        drawBars(canvas, imageCtx, mode, analyser, adjustments, effect, isEffectActive);
      });
      return animationFrameId;
    }
    (drawBars as any)._lastTimeMode1 = now;
  }
  if (mode === 5) {
    const last = (drawBars as any)._lastTimeMode5 ?? 0;
    if (now - last < interval) {
      animationFrameId = requestAnimationFrame(function () {
        drawBars(canvas, imageCtx, mode, analyser, adjustments, effect, isEffectActive);
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
  // offsetX, offsetYはパーセンテージ（-150%〜150%）なので、Canvasサイズを掛けてピクセルに変換
  const offsetXPixels = (canvasWidth * adj.offsetX) / 100;
  const offsetYPixels = (canvasHeight * adj.offsetY) / 100;
  
  ctx.save();
  ctx.translate(canvasWidth / 2 + offsetXPixels, canvasHeight / 2 + offsetYPixels);
  ctx.scale(adj.scaleX, adj.scaleY);
  ctx.translate(-canvasWidth / 2, -canvasHeight / 2);
  
  if (mode === -1) {
    // OFF: 背景と画像のみ（スペアナ描画なし）
    ctx.restore();
    ctx.restore();
    animationFrameId = requestAnimationFrame(function () {
      drawBars(canvas, imageCtx, mode, analyser, adjustments, effect, isEffectActive);
    });
    return animationFrameId;
  } else if (mode === 0) {
    analyser.getByteFrequencyData(bufferData);
    ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
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
    ctx.strokeStyle = `rgba(255, 255, 255, ${settings.opacity})`;
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
    ctx.fillStyle = `rgba(255, 255, 255, ${settings.opacity})`;

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
    // モード3: 上下対称バー
    analyser.getByteFrequencyData(bufferData);
    const barsLength = 128;
    const barWidth = canvasWidth / barsLength;
    const centerY = canvasHeight / 2;
    
    for (let i = 0; i < barsLength; i++) {
      const barHeight = bufferData[i] * 2;
      const hue = (i / barsLength) * 360;
      
      // グラデーション付きバー
      const gradient = ctx.createLinearGradient(
        i * barWidth,
        centerY - barHeight / 2,
        i * barWidth,
        centerY + barHeight / 2
      );
      gradient.addColorStop(0, `hsla(${hue}, 100%, 50%, 0.8)`);
      gradient.addColorStop(1, `hsla(${hue + 60}, 100%, 70%, 0.8)`);
      
      ctx.fillStyle = gradient;
      ctx.fillRect(
        i * barWidth,
        centerY - barHeight / 2,
        barWidth - 1,
        barHeight
      );
    }
  } else if (mode === 4) {
    // モード4: ドット表示
    analyser.getByteFrequencyData(bufferData);
    const dotsPerRow = 32;
    const dotsPerCol = 16;
    const dotSize = Math.min(canvasWidth / dotsPerRow, canvasHeight / dotsPerCol);
    
    for (let col = 0; col < dotsPerRow; col++) {
      const freqIndex = Math.floor((col / dotsPerRow) * bufferLength);
      const value = bufferData[freqIndex];
      
      for (let row = 0; row < dotsPerCol; row++) {
        const threshold = (255 / dotsPerCol) * (dotsPerCol - row);
        const opacity = value > threshold ? 0.8 : 0.2;
        const hue = (col / dotsPerRow) * 360;
        
        ctx.fillStyle = `hsla(${hue}, 100%, 50%, ${opacity})`;
        ctx.beginPath();
        ctx.arc(
          col * dotSize + dotSize / 2,
          row * dotSize + dotSize / 2,
          dotSize / 3,
          0,
          Math.PI * 2
        );
        ctx.fill();
      }
    }
  } else if (mode === 5) {
    // モード5: 波形（上下対称）
    analyser.getByteTimeDomainData(bufferData);
    ctx.strokeStyle = `rgba(255, 255, 255, ${settings.opacity})`;
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
  } else if (mode === 6) {
    // モード6: 3D風バー（奥行き効果）
    analyser.getByteFrequencyData(bufferData);
    const barsLength = 64;
    const barWidth = canvasWidth / barsLength;
    
    for (let i = 0; i < barsLength; i++) {
      const value = bufferData[Math.floor((i / barsLength) * bufferLength)];
      const barHeight = value * 1.5;
      const x = i * barWidth;
      const offset = (i - barsLength / 2) * 2;
      
      // 奥行き効果のためのグラデーション
      const gradient = ctx.createLinearGradient(
        x,
        canvasHeight,
        x,
        canvasHeight - barHeight
      );
      const hue = (i / barsLength) * 360;
      gradient.addColorStop(0, `hsla(${hue}, 100%, 30%, 0.9)`);
      gradient.addColorStop(0.5, `hsla(${hue}, 100%, 50%, 0.8)`);
      gradient.addColorStop(1, `hsla(${hue}, 100%, 70%, 0.7)`);
      
      ctx.fillStyle = gradient;
      
      // 3D風の平行四辺形
      ctx.beginPath();
      ctx.moveTo(x, canvasHeight);
      ctx.lineTo(x + barWidth, canvasHeight);
      ctx.lineTo(x + barWidth + offset * 0.3, canvasHeight - barHeight);
      ctx.lineTo(x + offset * 0.3, canvasHeight - barHeight);
      ctx.closePath();
      ctx.fill();
    }
  }

  // 調整パラメータの適用を解除
  ctx.restore();

  // 最初のsave()に対応するrestore()
  ctx.restore();

  // エフェクトオーバーレイ（プレビュー/録画中のみ、音源連動）
  if (effect && effect.type !== "none" && isEffectActive) {
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
    drawBars(canvas, imageCtx, mode, analyser, adjustments, effect, isEffectActive);
  });
  return animationFrameId;
};
