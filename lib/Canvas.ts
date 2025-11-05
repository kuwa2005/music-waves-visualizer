export type ModeAdjustments = {
  scaleX: number;
  scaleY: number;
  offsetX: number;
  offsetY: number;
};

export const drawBars = (
  canvas: HTMLCanvasElement,
  imageCtx: HTMLImageElement,
  mode: number,
  analyser: AnalyserNode,
  adjustments?: ModeAdjustments
) => {
  // GPU加速を有効化（willReadFrequently: falseでGPU最適化）
  const ctx = canvas.getContext("2d", {
    alpha: false, // 透明度を無効化してパフォーマンス向上
    desynchronized: true, // 非同期レンダリングでパフォーマンス向上
    willReadFrequently: false, // GPU最適化を有効化
  });
  
  if (!ctx) {
    return requestAnimationFrame(function () {
      drawBars(canvas, imageCtx, mode, analyser, adjustments);
    });
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

  ctx.fillStyle = "rgba(34, 34, 34, 1.0)";
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  ctx.save();

  // drawImage
  if (imageCtx) {
    const rawWidth = imageCtx.width;
    const rawHeight = imageCtx.height;
    let imageCtxWidth = 0;
    let imageCtxHeight = 0;
    if (rawWidth > canvasWidth || rawHeight > canvasHeight) {
      imageCtxWidth = canvasWidth;
      imageCtxHeight = Math.round(rawHeight * (canvasWidth / rawWidth));
      do {
        imageCtxWidth -= 1;
        imageCtxHeight -= 1;
      } while (imageCtxWidth > canvasWidth);
    } else {
      imageCtxWidth = imageCtx.width;
      imageCtxHeight = imageCtx.height;
    }
    const marginWidth = canvasWidth - imageCtxWidth;
    const posX = marginWidth === 0 ? 0 : marginWidth / 2; // imageのwidthをcenterにする
    const marginHeight = canvasHeight - imageCtxHeight;
    const posY = marginHeight === 0 ? 0 : marginHeight / 2; // imageのheightをcenterにする
    ctx.drawImage(
      imageCtx,
      0,
      0,
      rawWidth,
      rawHeight,
      posX,
      posY,
      imageCtxWidth,
      imageCtxHeight
    );
  }

  if (!analyser) {
    return requestAnimationFrame(function () {
      drawBars(canvas, imageCtx, mode, analyser, adjustments);
    });
  }

  const bufferLength = analyser.frequencyBinCount; // analyser.fftSizeの半分になる(1024)
  const bufferData = new Uint8Array(bufferLength);
  
  // 調整パラメータを適用
  // offsetX, offsetYはパーセンテージ（-150%〜150%）なので、Canvasサイズを掛けてピクセルに変換
  const offsetXPixels = (canvasWidth * adj.offsetX) / 100;
  const offsetYPixels = (canvasHeight * adj.offsetY) / 100;
  
  ctx.save();
  ctx.translate(canvasWidth / 2 + offsetXPixels, canvasHeight / 2 + offsetYPixels);
  ctx.scale(adj.scaleX, adj.scaleY);
  ctx.translate(-canvasWidth / 2, -canvasHeight / 2);
  
  if (mode === 0) {
    analyser.getByteFrequencyData(bufferData); //spectrum data
    ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
    const barsLength = 128;
    const barWidth = (canvasWidth / barsLength) * adj.scaleX;
    let barX = 0;
    for (let i = 0; i < barsLength; i++) {
      const barHeight = bufferData[i] * adj.scaleY;
      ctx.fillRect(barX, canvasHeight - barHeight, barWidth, barHeight);
      barX += canvasWidth / barsLength;
    }
  } else if (mode === 1) {
    analyser.getByteTimeDomainData(bufferData); //Waveform Data
    ctx.strokeStyle = "rgba(255, 255, 255, 0.8)";
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
    ctx.fillStyle = "rgba(255, 255, 255, 0.8)";

    ctx.scale(0.5 * adj.scaleX, 0.5 * adj.scaleY);
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
        ctx.fillRect(
          0,
          radius,
          canvasWidth <= 450 ? 2 : 3,
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
    ctx.strokeStyle = "rgba(255, 255, 255, 0.8)";
    ctx.lineWidth = 2;
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
      const barHeight = value * 1.5 * adj.scaleY;
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

  return requestAnimationFrame(function () {
    drawBars(canvas, imageCtx, mode, analyser, adjustments);
  });
};
