/**
 * WebGLベースのスペクトラムアナライザーレンダラー
 * GPU加速により高速な描画を実現
 */

import type { ModeAdjustments } from './Canvas';

// 頂点シェーダー（カラー描画用）
const vertexShaderSource = `
attribute vec2 a_position;
attribute vec4 a_color;
uniform vec2 u_resolution;
varying vec4 v_color;

void main() {
  vec2 zeroToOne = a_position / u_resolution;
  vec2 zeroToTwo = zeroToOne * 2.0;
  vec2 clipSpace = zeroToTwo - 1.0;
  gl_Position = vec4(clipSpace * vec2(1, -1), 0, 1);
  v_color = a_color;
}
`;

// フラグメントシェーダー（カラー描画用）
const fragmentShaderSource = `
precision mediump float;
varying vec4 v_color;

void main() {
  gl_FragColor = v_color;
}
`;

// 頂点シェーダー（テクスチャ描画用）
const textureVertexShaderSource = `
attribute vec2 a_position;
attribute vec2 a_texCoord;
uniform vec2 u_resolution;
varying vec2 v_texCoord;

void main() {
  vec2 zeroToOne = a_position / u_resolution;
  vec2 zeroToTwo = zeroToOne * 2.0;
  vec2 clipSpace = zeroToTwo - 1.0;
  gl_Position = vec4(clipSpace * vec2(1, -1), 0, 1);
  v_texCoord = a_texCoord;
}
`;

// フラグメントシェーダー（テクスチャ描画用）
const textureFragmentShaderSource = `
precision mediump float;
varying vec2 v_texCoord;
uniform sampler2D u_texture;

void main() {
  gl_FragColor = texture2D(u_texture, v_texCoord);
}
`;

interface WebGLRendererContext {
  gl: WebGLRenderingContext | WebGL2RenderingContext;
  program: WebGLProgram;
  textureProgram: WebGLProgram;
  positionBuffer: WebGLBuffer;
  colorBuffer: WebGLBuffer;
  texCoordBuffer: WebGLBuffer;
  positionLocation: number;
  colorLocation: number;
  resolutionLocation: WebGLUniformLocation | null;
  texPositionLocation: number;
  texCoordLocation: number;
  texResolutionLocation: WebGLUniformLocation | null;
  textureLocation: WebGLUniformLocation | null;
  imageTexture: WebGLTexture | null;
  imageCache: {
    image: HTMLImageElement | null;
    width: number;
    height: number;
  };
}

let glContext: WebGLRendererContext | null = null;

// FPS測定用
let fpsCounter = 0;
let fpsLastTime = performance.now();
let currentFPS = 0;

// アニメーションフレームID管理
let animationFrameId: number | null = null;

/**
 * WebGLコンテキストを初期化
 */
function initWebGL(canvas: HTMLCanvasElement): WebGLRendererContext | null {
  const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
  if (!gl) {
    console.error('WebGL not supported');
    return null;
  }

  // カラー描画用シェーダーをコンパイル
  const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
  const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);

  if (!vertexShader || !fragmentShader) {
    console.error('Failed to create shaders');
    return null;
  }

  // カラー描画用プログラムをリンク
  const program = createProgram(gl, vertexShader, fragmentShader);
  if (!program) {
    console.error('Failed to create program');
    return null;
  }

  // テクスチャ描画用シェーダーをコンパイル
  const texVertexShader = createShader(gl, gl.VERTEX_SHADER, textureVertexShaderSource);
  const texFragmentShader = createShader(gl, gl.FRAGMENT_SHADER, textureFragmentShaderSource);

  if (!texVertexShader || !texFragmentShader) {
    console.error('Failed to create texture shaders');
    return null;
  }

  // テクスチャ描画用プログラムをリンク
  const textureProgram = createProgram(gl, texVertexShader, texFragmentShader);
  if (!textureProgram) {
    console.error('Failed to create texture program');
    return null;
  }

  // バッファを作成
  const positionBuffer = gl.createBuffer();
  const colorBuffer = gl.createBuffer();
  const texCoordBuffer = gl.createBuffer();

  if (!positionBuffer || !colorBuffer || !texCoordBuffer) {
    console.error('Failed to create buffers');
    return null;
  }

  // attribute/uniformの位置を取得（カラー描画用）
  const positionLocation = gl.getAttribLocation(program, 'a_position');
  const colorLocation = gl.getAttribLocation(program, 'a_color');
  const resolutionLocation = gl.getUniformLocation(program, 'u_resolution');

  // attribute/uniformの位置を取得（テクスチャ描画用）
  const texPositionLocation = gl.getAttribLocation(textureProgram, 'a_position');
  const texCoordLocation = gl.getAttribLocation(textureProgram, 'a_texCoord');
  const texResolutionLocation = gl.getUniformLocation(textureProgram, 'u_resolution');
  const textureLocation = gl.getUniformLocation(textureProgram, 'u_texture');

  return {
    gl,
    program,
    textureProgram,
    positionBuffer,
    colorBuffer,
    texCoordBuffer,
    positionLocation,
    colorLocation,
    resolutionLocation,
    texPositionLocation,
    texCoordLocation,
    texResolutionLocation,
    textureLocation,
    imageTexture: null,
    imageCache: {
      image: null,
      width: 0,
      height: 0,
    },
  };
}

/**
 * シェーダーを作成
 */
function createShader(
  gl: WebGLRenderingContext | WebGL2RenderingContext,
  type: number,
  source: string
): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;

  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  const success = gl.getShaderParameter(shader, gl.COMPILE_STATUS);
  if (success) {
    return shader;
  }

  console.error('Shader compile error:', gl.getShaderInfoLog(shader));
  gl.deleteShader(shader);
  return null;
}

/**
 * プログラムを作成
 */
function createProgram(
  gl: WebGLRenderingContext | WebGL2RenderingContext,
  vertexShader: WebGLShader,
  fragmentShader: WebGLShader
): WebGLProgram | null {
  const program = gl.createProgram();
  if (!program) return null;

  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);

  const success = gl.getProgramParameter(program, gl.LINK_STATUS);
  if (success) {
    return program;
  }

  console.error('Program link error:', gl.getProgramInfoLog(program));
  gl.deleteProgram(program);
  return null;
}

/**
 * WebGLで背景画像を描画
 */
function drawBackgroundWebGL(
  ctx: WebGLRendererContext,
  canvas: HTMLCanvasElement,
  image: HTMLImageElement | null
): void {
  const { gl, textureProgram, texPositionLocation, texCoordLocation,
          texResolutionLocation, textureLocation, positionBuffer, texCoordBuffer } = ctx;
  const canvasWidth = canvas.width;
  const canvasHeight = canvas.height;

  // 背景色でクリア
  gl.clearColor(34 / 255, 34 / 255, 34 / 255, 1.0);
  gl.clear(gl.COLOR_BUFFER_BIT);

  // 画像がない場合は背景色のみ
  if (!image) {
    return;
  }

  // 画像テクスチャの準備
  prepareImageTexture(ctx, image, canvasWidth, canvasHeight);

  // テクスチャプログラムを使用
  gl.useProgram(textureProgram);

  // 解像度を設定
  if (texResolutionLocation) {
    gl.uniform2f(texResolutionLocation, canvasWidth, canvasHeight);
  }

  // 画像のサイズ計算
  const rawWidth = image.width;
  const rawHeight = image.height;
  let imageCtxWidth = 0;
  let imageCtxHeight = 0;

  if (rawWidth > canvasWidth || rawHeight > canvasHeight) {
    imageCtxWidth = canvasWidth;
    imageCtxHeight = Math.round(rawHeight * (canvasWidth / rawWidth));
    if (imageCtxHeight > canvasHeight) {
      imageCtxHeight = canvasHeight;
      imageCtxWidth = Math.round(rawWidth * (canvasHeight / rawHeight));
    }
  } else {
    imageCtxWidth = image.width;
    imageCtxHeight = image.height;
  }

  const marginWidth = canvasWidth - imageCtxWidth;
  const posX = marginWidth === 0 ? 0 : marginWidth / 2;
  const marginHeight = canvasHeight - imageCtxHeight;
  const posY = marginHeight === 0 ? 0 : marginHeight / 2;

  // 画像を描画する矩形の頂点（2つの三角形）
  const x1 = posX;
  const y1 = posY;
  const x2 = posX + imageCtxWidth;
  const y2 = posY + imageCtxHeight;

  const positions = new Float32Array([
    x1, y1,
    x2, y1,
    x1, y2,
    x1, y2,
    x2, y1,
    x2, y2,
  ]);

  const texCoords = new Float32Array([
    0, 0,
    1, 0,
    0, 1,
    0, 1,
    1, 0,
    1, 1,
  ]);

  // 位置バッファを設定
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(texPositionLocation);
  gl.vertexAttribPointer(texPositionLocation, 2, gl.FLOAT, false, 0, 0);

  // テクスチャ座標バッファを設定
  gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, texCoords, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(texCoordLocation);
  gl.vertexAttribPointer(texCoordLocation, 2, gl.FLOAT, false, 0, 0);

  // テクスチャを設定
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, ctx.imageTexture);
  if (textureLocation) {
    gl.uniform1i(textureLocation, 0);
  }

  // 描画
  gl.drawArrays(gl.TRIANGLES, 0, 6);
}

/**
 * 画像テクスチャを準備
 */
function prepareImageTexture(
  ctx: WebGLRendererContext,
  image: HTMLImageElement,
  canvasWidth: number,
  canvasHeight: number
): void {
  const { gl } = ctx;

  // キャッシュチェック
  if (ctx.imageCache.image === image &&
      ctx.imageCache.width === canvasWidth &&
      ctx.imageCache.height === canvasHeight &&
      ctx.imageTexture) {
    return; // キャッシュが有効
  }

  // オフスクリーンcanvasに画像を描画
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = canvasWidth;
  tempCanvas.height = canvasHeight;
  const tempCtx = tempCanvas.getContext('2d');

  if (tempCtx) {
    tempCtx.fillStyle = 'rgba(34, 34, 34, 1.0)';
    tempCtx.fillRect(0, 0, canvasWidth, canvasHeight);

    // 画像のサイズ計算（drawBackgroundWebGLと同じロジック）
    const rawWidth = image.width;
    const rawHeight = image.height;
    let imageCtxWidth = 0;
    let imageCtxHeight = 0;

    if (rawWidth > canvasWidth || rawHeight > canvasHeight) {
      imageCtxWidth = canvasWidth;
      imageCtxHeight = Math.round(rawHeight * (canvasWidth / rawWidth));
      if (imageCtxHeight > canvasHeight) {
        imageCtxHeight = canvasHeight;
        imageCtxWidth = Math.round(rawWidth * (canvasHeight / rawHeight));
      }
    } else {
      imageCtxWidth = image.width;
      imageCtxHeight = image.height;
    }

    const marginWidth = canvasWidth - imageCtxWidth;
    const posX = marginWidth === 0 ? 0 : marginWidth / 2;
    const marginHeight = canvasHeight - imageCtxHeight;
    const posY = marginHeight === 0 ? 0 : marginHeight / 2;

    tempCtx.drawImage(
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
  }

  // テクスチャを作成
  if (!ctx.imageTexture) {
    ctx.imageTexture = gl.createTexture();
  }

  gl.bindTexture(gl.TEXTURE_2D, ctx.imageTexture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, tempCanvas);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

  // キャッシュを更新
  ctx.imageCache = {
    image,
    width: canvasWidth,
    height: canvasHeight,
  };
}

/**
 * WebGLで矩形（バー）を描画
 */
function drawRect(
  ctx: WebGLRendererContext,
  x: number,
  y: number,
  width: number,
  height: number,
  r: number,
  g: number,
  b: number,
  a: number
): void {
  const { gl, positionBuffer, colorBuffer, positionLocation, colorLocation } = ctx;

  // 矩形の頂点（2つの三角形）
  const x1 = x;
  const y1 = y;
  const x2 = x + width;
  const y2 = y + height;

  const positions = new Float32Array([
    x1, y1,
    x2, y1,
    x1, y2,
    x1, y2,
    x2, y1,
    x2, y2,
  ]);

  const colors = new Float32Array([
    r, g, b, a,
    r, g, b, a,
    r, g, b, a,
    r, g, b, a,
    r, g, b, a,
    r, g, b, a,
  ]);

  // 位置バッファを設定
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(positionLocation);
  gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

  // 色バッファを設定
  gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, colors, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(colorLocation);
  gl.vertexAttribPointer(colorLocation, 4, gl.FLOAT, false, 0, 0);

  // 描画
  gl.drawArrays(gl.TRIANGLES, 0, 6);
}

/**
 * WebGLで線を描画
 */
function drawLine(
  ctx: WebGLRendererContext,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  r: number,
  g: number,
  b: number,
  a: number,
  lineWidth: number = 2
): void {
  const { gl, positionBuffer, colorBuffer, positionLocation, colorLocation } = ctx;

  // 線の太さを考慮した矩形として描画
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len === 0) return;

  const nx = -dy / len;
  const ny = dx / len;

  const hw = lineWidth / 2;

  const positions = new Float32Array([
    x1 + nx * hw, y1 + ny * hw,
    x2 + nx * hw, y2 + ny * hw,
    x1 - nx * hw, y1 - ny * hw,
    x1 - nx * hw, y1 - ny * hw,
    x2 + nx * hw, y2 + ny * hw,
    x2 - nx * hw, y2 - ny * hw,
  ]);

  const colors = new Float32Array([
    r, g, b, a,
    r, g, b, a,
    r, g, b, a,
    r, g, b, a,
    r, g, b, a,
    r, g, b, a,
  ]);

  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(positionLocation);
  gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

  gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, colors, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(colorLocation);
  gl.vertexAttribPointer(colorLocation, 4, gl.FLOAT, false, 0, 0);

  gl.drawArrays(gl.TRIANGLES, 0, 6);
}

/**
 * WebGLで円を描画
 */
function drawCircle(
  ctx: WebGLRendererContext,
  x: number,
  y: number,
  radius: number,
  r: number,
  g: number,
  b: number,
  a: number
): void {
  const { gl, positionBuffer, colorBuffer, positionLocation, colorLocation } = ctx;

  const segments = 32;
  const positions: number[] = [];
  const colors: number[] = [];

  // 中心点
  const cx = x;
  const cy = y;

  for (let i = 0; i < segments; i++) {
    const angle1 = (i / segments) * Math.PI * 2;
    const angle2 = ((i + 1) / segments) * Math.PI * 2;

    // 三角形
    positions.push(cx, cy);
    positions.push(cx + Math.cos(angle1) * radius, cy + Math.sin(angle1) * radius);
    positions.push(cx + Math.cos(angle2) * radius, cy + Math.sin(angle2) * radius);

    colors.push(r, g, b, a);
    colors.push(r, g, b, a);
    colors.push(r, g, b, a);
  }

  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(positionLocation);
  gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

  gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(colors), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(colorLocation);
  gl.vertexAttribPointer(colorLocation, 4, gl.FLOAT, false, 0, 0);

  gl.drawArrays(gl.TRIANGLES, 0, segments * 3);
}

/**
 * WebGLでスペクトラムを描画（メイン関数）
 */
export const drawBarsWebGL = (
  canvas: HTMLCanvasElement,
  imageCtx: HTMLImageElement,
  mode: number,
  analyser: AnalyserNode,
  adjustments?: ModeAdjustments
): void => {
  // WebGLコンテキストを初期化（初回のみ）
  if (!glContext || glContext.gl.canvas !== canvas) {
    glContext = initWebGL(canvas);
  }

  if (!glContext) {
    console.error('Failed to initialize WebGL, falling back to Canvas 2D');
    return;
  }

  const { gl, program, resolutionLocation } = glContext;
  const canvasWidth = canvas.width;
  const canvasHeight = canvas.height;

  // 調整パラメータのデフォルト値
  const adj = adjustments || {
    scaleX: 1.0,
    scaleY: 1.0,
    offsetX: 0,
    offsetY: 0,
  };

  // 背景を描画（WebGLでテクスチャとして描画）
  drawBackgroundWebGL(glContext, canvas, imageCtx);

  // WebGLの準備（スペクトラム描画用）
  gl.viewport(0, 0, canvasWidth, canvasHeight);
  gl.useProgram(program);

  // 解像度を設定
  if (resolutionLocation) {
    gl.uniform2f(resolutionLocation, canvasWidth, canvasHeight);
  }

  // ブレンディングを有効化
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  // スペクトラムデータを取得
  const bufferLength = analyser.frequencyBinCount;
  const bufferData = new Uint8Array(bufferLength);

  // モードに応じて描画
  switch (mode) {
    case 0:
      // 周波数バー
      analyser.getByteFrequencyData(bufferData);
      drawMode0(glContext, bufferData, canvasWidth, canvasHeight, adj);
      break;
    case 1:
      // 折れ線
      analyser.getByteFrequencyData(bufferData);
      drawMode1(glContext, bufferData, canvasWidth, canvasHeight, adj);
      break;
    case 2:
      // 円形
      analyser.getByteFrequencyData(bufferData);
      drawMode2(glContext, bufferData, canvasWidth, canvasHeight, adj);
      break;
    case 3:
      // 上下対称バー
      analyser.getByteFrequencyData(bufferData);
      drawMode3(glContext, bufferData, canvasWidth, canvasHeight, adj);
      break;
    case 4:
      // ドット表示
      analyser.getByteFrequencyData(bufferData);
      drawMode4(glContext, bufferData, canvasWidth, canvasHeight, adj);
      break;
    case 5:
      // 波形（上下対称）
      analyser.getByteTimeDomainData(bufferData);
      drawMode5(glContext, bufferData, canvasWidth, canvasHeight, adj);
      break;
    case 6:
      // 3D風バー
      analyser.getByteFrequencyData(bufferData);
      drawMode6(glContext, bufferData, canvasWidth, canvasHeight, adj);
      break;
  }

  // FPS計測
  fpsCounter++;
  const now = performance.now();
  if (now - fpsLastTime >= 1000) {
    currentFPS = Math.round((fpsCounter * 1000) / (now - fpsLastTime));
    fpsCounter = 0;
    fpsLastTime = now;
  }

  // Canvas.tsのdrawBars関数と同じパターン：再帰的にrequestAnimationFrameを呼び出す
  animationFrameId = requestAnimationFrame(() => {
    drawBarsWebGL(canvas, imageCtx, mode, analyser, adjustments);
  });
};

// モード0: 周波数バー
function drawMode0(
  ctx: WebGLRendererContext,
  bufferData: Uint8Array,
  canvasWidth: number,
  canvasHeight: number,
  adj: ModeAdjustments
): void {
  const barWidth = (canvasWidth / bufferData.length) * 2.5 * adj.scaleX;
  let x = adj.offsetX;

  for (let i = 0; i < bufferData.length; i++) {
    const barHeight = (bufferData[i] / 255) * canvasHeight * adj.scaleY;
    const r = (bufferData[i] + 100) / 255;
    const g = 0.5;
    const b = 0.8;

    drawRect(ctx, x, canvasHeight - barHeight + adj.offsetY, barWidth, barHeight, r, g, b, 1.0);
    x += barWidth + 1;
  }
}

// モード1: 折れ線
function drawMode1(
  ctx: WebGLRendererContext,
  bufferData: Uint8Array,
  canvasWidth: number,
  canvasHeight: number,
  adj: ModeAdjustments
): void {
  const sliceWidth = (canvasWidth / bufferData.length) * adj.scaleX;
  let x = adj.offsetX;

  for (let i = 0; i < bufferData.length - 1; i++) {
    const v1 = bufferData[i] / 255.0;
    const v2 = bufferData[i + 1] / 255.0;
    const y1 = canvasHeight - v1 * canvasHeight * adj.scaleY + adj.offsetY;
    const y2 = canvasHeight - v2 * canvasHeight * adj.scaleY + adj.offsetY;

    drawLine(ctx, x, y1, x + sliceWidth, y2, 0.2, 0.8, 1.0, 1.0, 3);
    x += sliceWidth;
  }
}

// モード2: 円形
function drawMode2(
  ctx: WebGLRendererContext,
  bufferData: Uint8Array,
  canvasWidth: number,
  canvasHeight: number,
  adj: ModeAdjustments
): void {
  const centerX = canvasWidth / 2 + adj.offsetX;
  const centerY = canvasHeight / 2 + adj.offsetY;
  const radius = Math.min(canvasWidth, canvasHeight) / 4;
  const barCount = bufferData.length;

  for (let i = 0; i < barCount; i++) {
    const angle = (i / barCount) * Math.PI * 2;
    const barHeight = (bufferData[i] / 255) * radius * adj.scaleY;

    const x1 = centerX + Math.cos(angle) * radius;
    const y1 = centerY + Math.sin(angle) * radius;
    const x2 = centerX + Math.cos(angle) * (radius + barHeight);
    const y2 = centerY + Math.sin(angle) * (radius + barHeight);

    const hue = (i / barCount) * 360;
    const [r, g, b] = hslToRgb(hue, 1.0, 0.5);

    drawLine(ctx, x1, y1, x2, y2, r, g, b, 1.0, 3);
  }
}

// モード3: 上下対称バー
function drawMode3(
  ctx: WebGLRendererContext,
  bufferData: Uint8Array,
  canvasWidth: number,
  canvasHeight: number,
  adj: ModeAdjustments
): void {
  const barWidth = (canvasWidth / bufferData.length) * 2.5 * adj.scaleX;
  let x = adj.offsetX;
  const centerY = canvasHeight / 2;

  for (let i = 0; i < bufferData.length; i++) {
    const barHeight = (bufferData[i] / 255) * (canvasHeight / 2) * adj.scaleY;
    const hue = (i / bufferData.length) * 360;
    const [r, g, b] = hslToRgb(hue, 1.0, 0.5);

    // 上半分
    drawRect(ctx, x, centerY - barHeight + adj.offsetY, barWidth, barHeight, r, g, b, 0.8);
    // 下半分
    drawRect(ctx, x, centerY + adj.offsetY, barWidth, barHeight, r, g, b, 0.8);

    x += barWidth + 1;
  }
}

// モード4: ドット表示
function drawMode4(
  ctx: WebGLRendererContext,
  bufferData: Uint8Array,
  canvasWidth: number,
  canvasHeight: number,
  adj: ModeAdjustments
): void {
  const centerX = canvasWidth / 2 + adj.offsetX;
  const centerY = canvasHeight / 2 + adj.offsetY;
  const maxRadius = Math.min(canvasWidth, canvasHeight) / 2;

  for (let i = 0; i < bufferData.length; i++) {
    const angle = (i / bufferData.length) * Math.PI * 2;
    const distance = (bufferData[i] / 255) * maxRadius * adj.scaleY;
    const x = centerX + Math.cos(angle) * distance;
    const y = centerY + Math.sin(angle) * distance;
    const size = 3 + (bufferData[i] / 255) * 5;

    const hue = (i / bufferData.length) * 360;
    const [r, g, b] = hslToRgb(hue, 1.0, 0.5);

    drawCircle(ctx, x, y, size, r, g, b, 0.9);
  }
}

// モード5: 波形（上下対称）
function drawMode5(
  ctx: WebGLRendererContext,
  bufferData: Uint8Array,
  canvasWidth: number,
  canvasHeight: number,
  adj: ModeAdjustments
): void {
  const sliceWidth = (canvasWidth / bufferData.length) * adj.scaleX;
  const centerY = canvasHeight / 2;
  let x = adj.offsetX;

  for (let i = 0; i < bufferData.length - 1; i++) {
    const v1 = (bufferData[i] / 128.0 - 1.0) * (canvasHeight / 2) * adj.scaleY;
    const v2 = (bufferData[i + 1] / 128.0 - 1.0) * (canvasHeight / 2) * adj.scaleY;

    // 上側
    drawLine(ctx, x, centerY + v1 + adj.offsetY, x + sliceWidth, centerY + v2 + adj.offsetY, 0.2, 1.0, 0.8, 1.0, 2);
    // 下側（反転）
    drawLine(ctx, x, centerY - v1 + adj.offsetY, x + sliceWidth, centerY - v2 + adj.offsetY, 1.0, 0.4, 0.8, 1.0, 2);

    x += sliceWidth;
  }
}

// モード6: 3D風バー
function drawMode6(
  ctx: WebGLRendererContext,
  bufferData: Uint8Array,
  canvasWidth: number,
  canvasHeight: number,
  adj: ModeAdjustments
): void {
  const barWidth = (canvasWidth / bufferData.length) * 2.5 * adj.scaleX;
  let x = adj.offsetX;

  for (let i = 0; i < bufferData.length; i++) {
    const barHeight = (bufferData[i] / 255) * canvasHeight * adj.scaleY;
    const hue = (i / bufferData.length) * 360;
    const [r, g, b] = hslToRgb(hue, 1.0, 0.5);

    // メインバー
    drawRect(ctx, x, canvasHeight - barHeight + adj.offsetY, barWidth, barHeight, r, g, b, 0.9);

    // 3D効果（影）
    const offset = 5;
    drawRect(ctx, x + offset, canvasHeight - barHeight + offset + adj.offsetY, barWidth, barHeight, r * 0.5, g * 0.5, b * 0.5, 0.3);

    x += barWidth + 1;
  }
}

// HSLをRGBに変換
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  h = h / 360;
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;

  const r = hueToRgb(p, q, h + 1 / 3);
  const g = hueToRgb(p, q, h);
  const b = hueToRgb(p, q, h - 1 / 3);

  return [r, g, b];
}

function hueToRgb(p: number, q: number, t: number): number {
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
  return p;
}

/**
 * FPSを取得
 */
export function getFPSWebGL(): number {
  return currentFPS;
}

/**
 * WebGLアニメーションを停止
 */
export function stopWebGLAnimation(): void {
  if (animationFrameId !== null) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
}

/**
 * WebGLコンテキストをクリーンアップ
 */
export function cleanupWebGL(): void {
  // アニメーションフレームをキャンセル
  if (animationFrameId !== null) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }

  if (glContext) {
    const { gl, program, textureProgram, positionBuffer, colorBuffer, texCoordBuffer, imageTexture } = glContext;
    gl.deleteProgram(program);
    gl.deleteProgram(textureProgram);
    gl.deleteBuffer(positionBuffer);
    gl.deleteBuffer(colorBuffer);
    gl.deleteBuffer(texCoordBuffer);
    if (imageTexture) {
      gl.deleteTexture(imageTexture);
    }
    glContext = null;
  }
  fpsCounter = 0;
  fpsLastTime = performance.now();
  currentFPS = 0;
}
