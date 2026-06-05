/**
 * WebGLベースのスペクトラムアナライザーレンダラー
 * GPU加速により高速な描画を実現
 */

import type { ModeAdjustments, SpectrumSettings } from './Canvas';
import { applyMode2LocalToScreen, applyModeAdjustments } from './spectrumAdjustments';
import {
  drawStillScreenBackground,
  shouldUseStillScreenBackgroundPipeline,
} from './drawStillScreenBackground';
import {
  DEFAULT_SCREEN_MOTION,
  resolveCombinedImageFadeAlpha,
} from './screenMotion';
import {
  GLYCO_COLOR_SETS,
  GLYCO_GRADIENT_SETS,
  getVisualOpacity,
  getSpectrumPrimaryRgb,
  getSpectrumSecondaryRgb,
  parseSpectrumHexRgb,
  glycoBarRawEnergy,
  glycoAdjustedLevel,
  glycoBarLayout,
  glycoBackgroundDimAlpha,
  glycoBarRegionBounds,
  areaModeBarX,
  GLYCO_BAR_VERTICAL_SCALE,
  SPECTRUM_THROTTLE_TARGET_FPS,
  resolveSpectrumTargetFps,
  updateSpectrumFrameThrottle,
  spectrumLinearBarLowGain,
  getSpectrumDotRadiusScale,
} from './Canvas';
import {
  updateAndGetSpaceParticles,
  updateAndGetSparkleParticles,
  updateAndGetDustParticles,
  updateAndGetRainStreaks,
  updateAndGetWaterRippleDraws,
  getWaterRippleArcSegments,
  getWaterRippleHeartSteps,
  densityToWaterRippleIntensity,
  updateAndGetSnowParticles,
  buildMirrorBallFrame,
  type EffectParams,
  type EffectType,
  type AudioReactiveData,
} from './Effects';
import { updateAndGetLaserSegments } from './laserEffect';
import { drawGalleryBackground, peekGalleryImageTransitionFrame } from './galleryImageTransition';

const BASE_LINE_WIDTH_WAVEFORM = 2.0;
const BASE_LINE_WIDTH_CIRCLE = 2.0;

const DENSITY_STRENGTH: Record<1 | 2 | 3, number> = { 1: 0.55, 2: 0.8, 3: 1.0 };
const EFFECT_TYPE_TO_GL: Record<EffectType, number> = {
  none: 0,
  space: 0,
  spaceConstant: 0,
  spaceAudio: 0,
  sparkle: 0,
  dust: 0,
  rain: 0,
  snow: 0,
  waterRipple: 0,
  scanlines: 0,
  mirrorBall: 0,
  laser: 0,
  filmGrain: 1,
  vignette: 2,
  rainbow: 3,
  curtain: 4,
  glitch: 5,
};

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
uniform float u_alpha;

void main() {
  vec4 c = texture2D(u_texture, v_texCoord);
  gl_FragColor = vec4(c.rgb, c.a * u_alpha);
}
`;

// エフェクトオーバーレイ用（フルスクリーンクアッド）
const effectVertexShaderSource = `
attribute vec2 a_position;
uniform mediump vec2 u_resolution;
varying vec2 v_uv;

void main() {
  vec2 zeroToOne = a_position / u_resolution;
  vec2 zeroToTwo = zeroToOne * 2.0;
  vec2 clipSpace = zeroToTwo - 1.0;
  gl_Position = vec4(clipSpace * vec2(1, -1), 0, 1);
  v_uv = zeroToOne;
}
`;

const effectFragmentShaderSource = `
precision mediump float;
varying vec2 v_uv;
uniform mediump float u_time;
uniform mediump float u_strength;
uniform mediump vec2 u_resolution;
uniform int u_effectType;
uniform mediump float u_bass;
uniform mediump float u_volume;
uniform mediump float u_highFreq;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void main() {
  vec2 uv = v_uv;
  vec2 coord = uv * u_resolution;
  float pulse = 0.6 + 0.4 * u_bass;
  float str = u_strength * pulse;
  
  if (u_effectType == 1) {
    float n = hash(floor(coord) + u_time);
    gl_FragColor = vec4(vec3(n), str * 0.35);
  } else if (u_effectType == 2) {
    vec2 c = uv - 0.5;
    float d = length(c) * 2.0;
    float dyn = 0.5 + 0.5 * (u_volume * 0.7 + u_bass * 0.3);
    float v = smoothstep(0.3, 1.2, d) * u_strength * dyn * 1.0;
    gl_FragColor = vec4(0.0, 0.0, 0.0, v);
  } else if (u_effectType == 3) {
    float speed = 0.02 + 0.08 * (0.3 + 0.7 * u_volume);
    float hue = fract(u_time * speed * 3.0) * 6.0;
    vec3 rgb = vec3(
      abs(hue - 3.0) - 1.0,
      2.0 - abs(hue - 2.0),
      2.0 - abs(hue - 4.0)
    );
    rgb = clamp(rgb, 0.0, 1.0);
    float alpha = u_strength * (0.5 + 0.5 * u_volume) * 0.18;
    gl_FragColor = vec4(rgb, alpha);
  } else if (u_effectType == 4) {
    float waveSpeed = 0.02 + 0.06 * (0.4 + 0.6 * u_bass);
    float amp = 0.08 + 0.12 * u_bass;
    float wave = sin(uv.x * 6.28318 * 1.5 + u_time * waveSpeed * 60.0) * 0.5 + 0.5;
    float mask = smoothstep(0.3, 0.5, abs(uv.y - 0.5 - wave * amp));
    float hue = fract(u_time * 0.02 + u_volume * 0.1) * 6.0;
    vec3 rgb = vec3(
      abs(hue - 3.0) - 1.0,
      2.0 - abs(hue - 2.0),
      2.0 - abs(hue - 4.0)
    );
    rgb = clamp(rgb, 0.0, 1.0);
    gl_FragColor = vec4(rgb, mask * u_strength * (0.35 + 0.4 * u_volume) * 0.7);
  } else if (u_effectType == 5) {
    float trigger = 0.3 + 0.7 * (u_highFreq * 0.6 + u_volume * 0.4);
    float line = step(0.95, hash(coord + vec2(0, u_time * (50.0 + 50.0 * u_highFreq))));
    gl_FragColor = vec4(1.0, 1.0, 1.0, line * u_strength * trigger * 0.55);
  } else {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
  }
}
`;

interface WebGLRendererContext {
  gl: WebGLRenderingContext | WebGL2RenderingContext;
  program: WebGLProgram;
  textureProgram: WebGLProgram;
  effectProgram: WebGLProgram;
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
  texAlphaLocation: WebGLUniformLocation | null;
  effectPositionLocation: number;
  effectResolutionLocation: WebGLUniformLocation | null;
  effectTimeLocation: WebGLUniformLocation | null;
  effectStrengthLocation: WebGLUniformLocation | null;
  effectTypeLocation: WebGLUniformLocation | null;
  effectBassLocation: WebGLUniformLocation | null;
  effectVolumeLocation: WebGLUniformLocation | null;
  effectHighFreqLocation: WebGLUniformLocation | null;
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
let renderFrameLastFrameTime = 0;

// アニメーションフレームID管理
let animationFrameId: number | null = null;

// アニメーション実行中フラグ
let isAnimating = false;

// 最新のパラメータを保持（再帰呼び出し時に使用）
let latestCanvas: HTMLCanvasElement | null = null;
let latestImageCtx: HTMLImageElement | null = null;
let latestMode: number = 0;
let latestAnalyser: AnalyserNode | null = null;
let latestAdjustments: ModeAdjustments | undefined = undefined;
let latestSpectrumSettings: SpectrumSettings | undefined = undefined;
let latestEffect: EffectParams | undefined = undefined;
let latestEffectActive: boolean = false;
let lastEffectTime = performance.now();

// グライコ風（モード6）ピークホールド用
let glycoPeak: number[] = [];
let glycoLastPeakTime: number[] = [];
let lastGlycoMode = -1;

/** 再生タイムライン上の画像フェード（スペアナ・エフェクト描画用乗数） */
let imageTimelineFadeMul = 1;

function fadeAlpha(a: number): number {
  return a * imageTimelineFadeMul;
}

function setTextureDrawAlpha(ctx: WebGLRendererContext, alpha: number): void {
  if (ctx.texAlphaLocation) {
    ctx.gl.uniform1f(ctx.texAlphaLocation, alpha);
  }
}

// デバッグログ用フラグ
const DEBUG_WEBGL = false;

function debugLog(message: string, data?: any) {
  if (DEBUG_WEBGL) {
    if (data !== undefined) {
      console.log(`[WebGL] ${message}`, data);
    } else {
      console.log(`[WebGL] ${message}`);
    }
  }
}

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

  // エフェクトオーバーレイ用シェーダーをコンパイル
  const effectVertexShader = createShader(gl, gl.VERTEX_SHADER, effectVertexShaderSource);
  const effectFragmentShader = createShader(gl, gl.FRAGMENT_SHADER, effectFragmentShaderSource);
  if (!effectVertexShader || !effectFragmentShader) {
    console.error('Failed to create effect shaders');
    return null;
  }
  const effectProgram = createProgram(gl, effectVertexShader, effectFragmentShader);
  if (!effectProgram) {
    console.error('Failed to create effect program');
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
  const texAlphaLocation = gl.getUniformLocation(textureProgram, 'u_alpha');

  const effectPositionLocation = gl.getAttribLocation(effectProgram, 'a_position');
  const effectResolutionLocation = gl.getUniformLocation(effectProgram, 'u_resolution');
  const effectTimeLocation = gl.getUniformLocation(effectProgram, 'u_time');
  const effectStrengthLocation = gl.getUniformLocation(effectProgram, 'u_strength');
  const effectTypeLocation = gl.getUniformLocation(effectProgram, 'u_effectType');
  const effectBassLocation = gl.getUniformLocation(effectProgram, 'u_bass');
  const effectVolumeLocation = gl.getUniformLocation(effectProgram, 'u_volume');
  const effectHighFreqLocation = gl.getUniformLocation(effectProgram, 'u_highFreq');

  return {
    gl,
    program,
    textureProgram,
    effectProgram,
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
    texAlphaLocation,
    effectPositionLocation,
    effectResolutionLocation,
    effectTimeLocation,
    effectStrengthLocation,
    effectTypeLocation,
    effectBassLocation,
    effectVolumeLocation,
    effectHighFreqLocation,
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
  image: HTMLImageElement | null,
  spectrumSettings?: SpectrumSettings,
  bgAudioReactive?: AudioReactiveData,
  plainImageFadeAlpha: number = 1
): void {
  debugLog('drawBackgroundWebGL called', {
    hasImage: !!image,
    imageSrc: image?.src?.substring(0, 50) + '...',
    canvasSize: `${canvas.width}x${canvas.height}`
  });

  const { gl, textureProgram, texPositionLocation, texCoordLocation,
          texResolutionLocation, textureLocation, positionBuffer, texCoordBuffer } = ctx;
  const canvasWidth = canvas.width;
  const canvasHeight = canvas.height;

  // 背景色でクリア
  gl.clearColor(34 / 255, 34 / 255, 34 / 255, 1.0);
  gl.clear(gl.COLOR_BUFFER_BIT);

  const galleryTransition = peekGalleryImageTransitionFrame();
  if (galleryTransition) {
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = canvasWidth;
    tempCanvas.height = canvasHeight;
    const tctx = tempCanvas.getContext('2d', {
      alpha: false,
      desynchronized: true,
      willReadFrequently: false,
    });
    if (tctx) {
      drawGalleryBackground(tctx, canvasWidth, canvasHeight, null, galleryTransition);
      if (!ctx.imageTexture) {
        ctx.imageTexture = gl.createTexture();
      }
      gl.bindTexture(gl.TEXTURE_2D, ctx.imageTexture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, tempCanvas);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      ctx.imageCache = { image: null, width: -1, height: -1 };
      gl.useProgram(textureProgram);
      if (texResolutionLocation) {
        gl.uniform2f(texResolutionLocation, canvasWidth, canvasHeight);
      }
      const positions = new Float32Array([
        0, 0,
        canvasWidth, 0,
        0, canvasHeight,
        0, canvasHeight,
        canvasWidth, 0,
        canvasWidth, canvasHeight,
      ]);
      const texCoords = new Float32Array([
        0, 0,
        1, 0,
        0, 1,
        0, 1,
        1, 0,
        1, 1,
      ]);
      gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(texPositionLocation);
      gl.vertexAttribPointer(texPositionLocation, 2, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, texCoords, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(texCoordLocation);
      gl.vertexAttribPointer(texCoordLocation, 2, gl.FLOAT, false, 0, 0);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, ctx.imageTexture);
      if (textureLocation) {
        gl.uniform1i(textureLocation, 0);
      }
      setTextureDrawAlpha(ctx, 1);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }
    return;
  }

  // 画像がない場合は背景色のみ
  if (!image) {
    debugLog('No image provided, showing background color only');
    return;
  }

  const bgVideo = spectrumSettings?.backgroundVideo;
  if (
    shouldUseStillScreenBackgroundPipeline(image, spectrumSettings?.screenMotion, !!bgVideo, !!galleryTransition)
  ) {
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = canvasWidth;
    tempCanvas.height = canvasHeight;
    const tctx = tempCanvas.getContext('2d', { alpha: false });
    if (tctx) {
      drawStillScreenBackground(
        tctx,
        image,
        canvasWidth,
        canvasHeight,
        spectrumSettings?.screenMotion,
        spectrumSettings?.getPlaybackTiming?.(),
        bgAudioReactive,
        spectrumSettings?.getStopGracefulImageFade?.() ?? null
      );
      if (!ctx.imageTexture) {
        ctx.imageTexture = gl.createTexture();
      }
      gl.bindTexture(gl.TEXTURE_2D, ctx.imageTexture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, tempCanvas);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      ctx.imageCache = { image, width: canvasWidth, height: canvasHeight };
      gl.useProgram(textureProgram);
      if (texResolutionLocation) {
        gl.uniform2f(texResolutionLocation, canvasWidth, canvasHeight);
      }
      const positions = new Float32Array([
        0, 0,
        canvasWidth, 0,
        0, canvasHeight,
        0, canvasHeight,
        canvasWidth, 0,
        canvasWidth, canvasHeight,
      ]);
      const texCoords = new Float32Array([0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1]);
      gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(texPositionLocation);
      gl.vertexAttribPointer(texPositionLocation, 2, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, texCoords, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(texCoordLocation);
      gl.vertexAttribPointer(texCoordLocation, 2, gl.FLOAT, false, 0, 0);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, ctx.imageTexture);
      if (textureLocation) {
        gl.uniform1i(textureLocation, 0);
      }
      setTextureDrawAlpha(ctx, 1);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }
    return;
  }

  debugLog('Image dimensions', { width: image.width, height: image.height });

  // 画像テクスチャの準備
  prepareImageTexture(ctx, image, canvasWidth, canvasHeight);

  // テクスチャプログラムを使用
  gl.useProgram(textureProgram);

  // 解像度を設定
  if (texResolutionLocation) {
    gl.uniform2f(texResolutionLocation, canvasWidth, canvasHeight);
  }

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
  setTextureDrawAlpha(ctx, plainImageFadeAlpha);

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
    debugLog('Using cached texture');
    return; // キャッシュが有効
  }

  debugLog('Creating new texture', {
    canvasSize: `${canvasWidth}x${canvasHeight}`,
    imageSize: `${image.naturalWidth || image.width || 0}x${image.naturalHeight || image.height || 0}`
  });

  // オフスクリーンcanvasに画像を描画
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = canvasWidth;
  tempCanvas.height = canvasHeight;
  const tempCtx = tempCanvas.getContext('2d');

  if (tempCtx) {
    tempCtx.fillStyle = 'rgba(34, 34, 34, 1.0)';
    tempCtx.fillRect(0, 0, canvasWidth, canvasHeight);

    // 画像のサイズ計算（アスペクト比を保ちながらcanvasに収める）
    const rawWidth = image.naturalWidth || image.width || 1;
    const rawHeight = image.naturalHeight || image.height || 1;
    // アスペクト比維持、隙間なしで最大表示（cover）
    const scale = Math.max(canvasWidth / rawWidth, canvasHeight / rawHeight);
    const imageCtxWidth = Math.round(rawWidth * scale);
    const imageCtxHeight = Math.round(rawHeight * scale);
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
  const aFade = fadeAlpha(a);

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
    r, g, b, aFade,
    r, g, b, aFade,
    r, g, b, aFade,
    r, g, b, aFade,
    r, g, b, aFade,
    r, g, b, aFade,
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

function drawGlycoBackgroundDimOverlayWebGL(
  ctx: WebGLRendererContext,
  canvasWidth: number,
  canvasHeight: number,
  params?: SpectrumSettings["retroEqParams"],
  adj?: ModeAdjustments,
  glycoRotationDeg?: number,
  glycoColorSet?: string
): void {
  const amount = params?.backgroundDimAmount ?? 0;
  if (amount <= 0) return;
  const alpha = glycoBackgroundDimAlpha(amount);
  const rgb = parseSpectrumHexRgb(params?.backgroundDimColor ?? "#000000") ?? [0, 0, 0];
  const region = glycoBarRegionBounds(canvasWidth, canvasHeight, adj ?? {
    scaleX: 1,
    scaleY: 1,
    offsetX: 0,
    offsetY: 0,
  }, {
    glycoRotationDeg,
    glycoColorSet,
  });
  const { gl, program } = ctx;
  gl.useProgram(program);
  drawRect(
    ctx,
    region.x,
    region.y,
    region.width,
    region.height,
    rgb[0] / 255,
    rgb[1] / 255,
    rgb[2] / 255,
    alpha
  );
}

/** WebGLで三角形を描画 */
function drawTriangle(
  ctx: WebGLRendererContext,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  x3: number,
  y3: number,
  r: number,
  g: number,
  b: number,
  a: number
): void {
  const { gl, positionBuffer, colorBuffer, positionLocation, colorLocation } = ctx;
  const aFade = fadeAlpha(a);
  const positions = new Float32Array([x1, y1, x2, y2, x3, y3]);
  const colors = new Float32Array([r, g, b, aFade, r, g, b, aFade, r, g, b, aFade]);
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(positionLocation);
  gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, colors, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(colorLocation);
  gl.vertexAttribPointer(colorLocation, 4, gl.FLOAT, false, 0, 0);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}

/**
 * WebGLでグラデーション付き矩形を描画
 */
function drawRectGradient(
  ctx: WebGLRendererContext,
  x: number,
  y: number,
  width: number,
  height: number,
  r1: number,
  g1: number,
  b1: number,
  a1: number,
  r2: number,
  g2: number,
  b2: number,
  a2: number
): void {
  const { gl, positionBuffer, colorBuffer, positionLocation, colorLocation } = ctx;
  const a1Fade = fadeAlpha(a1);
  const a2Fade = fadeAlpha(a2);

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

  // 上側の頂点(y1)には色1、下側の頂点(y2)には色2
  const colors = new Float32Array([
    r1, g1, b1, a1Fade,  // 左上
    r1, g1, b1, a1Fade,  // 右上
    r2, g2, b2, a2Fade,  // 左下
    r2, g2, b2, a2Fade,  // 左下(2つ目の三角形)
    r1, g1, b1, a1Fade,  // 右上(2つ目の三角形)
    r2, g2, b2, a2Fade,  // 右下
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
 * WebGLで多角形（塗りつぶし）を描画
 */
function drawPolygon(
  ctx: WebGLRendererContext,
  vertices: number[], // [x1, y1, x2, y2, x3, y3, ...]
  r: number,
  g: number,
  b: number,
  a: number
): void {
  const { gl, positionBuffer, colorBuffer, positionLocation, colorLocation } = ctx;
  const aFade = fadeAlpha(a);

  // 頂点数
  const numVertices = vertices.length / 2;

  // 三角形に分解（fan triangulation: 最初の頂点を中心に）
  const positions: number[] = [];
  const colors: number[] = [];

  for (let i = 1; i < numVertices - 1; i++) {
    // 三角形: 0, i, i+1
    positions.push(vertices[0], vertices[1]);
    positions.push(vertices[i * 2], vertices[i * 2 + 1]);
    positions.push(vertices[(i + 1) * 2], vertices[(i + 1) * 2 + 1]);

    // 各頂点に同じ色
    for (let j = 0; j < 3; j++) {
      colors.push(r, g, b, aFade);
    }
  }

  const positionsArray = new Float32Array(positions);
  const colorsArray = new Float32Array(colors);

  // 位置バッファを設定
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, positionsArray, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(positionLocation);
  gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

  // 色バッファを設定
  gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, colorsArray, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(colorLocation);
  gl.vertexAttribPointer(colorLocation, 4, gl.FLOAT, false, 0, 0);

  // 描画
  gl.drawArrays(gl.TRIANGLES, 0, positions.length / 2);
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
  const aFade = fadeAlpha(a);

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
    r, g, b, aFade,
    r, g, b, aFade,
    r, g, b, aFade,
    r, g, b, aFade,
    r, g, b, aFade,
    r, g, b, aFade,
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
 * きらきら: ＋ / X / ＊（8方向）を線で描画。
 * lineWidthMul / alphaMul で外側の淡いストローク用に再利用。
 */
function drawSparkleStarWebGL(
  ctx: WebGLRendererContext,
  cx: number,
  cy: number,
  radius: number,
  r: number,
  g: number,
  b: number,
  a: number,
  starKind: 0 | 1 | 2,
  rotation: number,
  lineWidthMul: number = 1,
  alphaMul: number = 1
): void {
  const L = radius * 1.55;
  const lineW = Math.max(0.6, radius * 0.42) * lineWidthMul;
  const aEff = Math.min(1, a * alphaMul);
  const angles =
    starKind === 0
      ? [0, Math.PI / 2]
      : starKind === 1
        ? [Math.PI / 4, -Math.PI / 4]
        : [0, Math.PI / 4, Math.PI / 2, (3 * Math.PI) / 4];
  const cosR = Math.cos(rotation);
  const sinR = Math.sin(rotation);
  for (const phi of angles) {
    const x0 = -Math.cos(phi) * L;
    const y0 = -Math.sin(phi) * L;
    const x1 = Math.cos(phi) * L;
    const y1 = Math.sin(phi) * L;
    const wx0 = cx + x0 * cosR - y0 * sinR;
    const wy0 = cy + x0 * sinR + y0 * cosR;
    const wx1 = cx + x1 * cosR - y1 * sinR;
    const wy1 = cy + x1 * sinR + y1 * cosR;
    drawLine(ctx, wx0, wy0, wx1, wy1, r, g, b, aEff, lineW);
  }
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
  const aFade = fadeAlpha(a);

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

    colors.push(r, g, b, aFade);
    colors.push(r, g, b, aFade);
    colors.push(r, g, b, aFade);
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
 * WebGLでエフェクトオーバーレイを描画（filmGrain, vignette, rainbow, curtain, glitch）音源連動
 */
function drawEffectOverlayWebGL(
  ctx: WebGLRendererContext,
  width: number,
  height: number,
  effect: EffectParams,
  audio: AudioReactiveData
): void {
  const glType = EFFECT_TYPE_TO_GL[effect.type];
  if (glType === 0) return;

  const { gl, effectProgram, effectPositionLocation, effectResolutionLocation,
          effectTimeLocation, effectStrengthLocation, effectTypeLocation,
          effectBassLocation, effectVolumeLocation, effectHighFreqLocation,
          positionBuffer } = ctx;
  const strength = DENSITY_STRENGTH[effect.density] * imageTimelineFadeMul;

  gl.useProgram(effectProgram);
  if (effectResolutionLocation) gl.uniform2f(effectResolutionLocation, width, height);
  if (effectTimeLocation) gl.uniform1f(effectTimeLocation, performance.now() * 0.001);
  if (effectStrengthLocation) gl.uniform1f(effectStrengthLocation, strength);
  if (effectTypeLocation) gl.uniform1i(effectTypeLocation, glType);
  if (effectBassLocation) gl.uniform1f(effectBassLocation, audio.bass);
  if (effectVolumeLocation) gl.uniform1f(effectVolumeLocation, audio.volume);
  if (effectHighFreqLocation) gl.uniform1f(effectHighFreqLocation, audio.highFreq);

  const positions = new Float32Array([0, 0, width, 0, 0, height, 0, height, width, 0, width, height]);
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(effectPositionLocation);
  gl.vertexAttribPointer(effectPositionLocation, 2, gl.FLOAT, false, 0, 0);

  gl.drawArrays(gl.TRIANGLES, 0, 6);
}

/**
 * アニメーションループの本体
 */
function renderFrame(): void {
  if (!latestCanvas || !latestAnalyser || !glContext) {
    debugLog('renderFrame: Missing required parameters', {
      hasCanvas: !!latestCanvas,
      hasAnalyser: !!latestAnalyser,
      hasGlContext: !!glContext
    });
    isAnimating = false;
    return;
  }

  const canvas = latestCanvas;
  const imageCtx = latestImageCtx;
  const mode = latestMode;
  const analyser = latestAnalyser;
  const adjustments = latestAdjustments;

  const targetFps = latestSpectrumSettings ? resolveSpectrumTargetFps(latestSpectrumSettings) : null;
  if (targetFps) {
    const now = performance.now();
    const throttle = updateSpectrumFrameThrottle(now, targetFps, renderFrameLastFrameTime);
    if (!throttle.shouldDraw) {
      animationFrameId = requestAnimationFrame(renderFrame);
      return;
    }
    renderFrameLastFrameTime = throttle.lastFrameTime;
  } else {
    renderFrameLastFrameTime = 0;
  }

  // 最初のフレームのみログ出力
  if (fpsCounter === 0) {
    debugLog('renderFrame: Starting render', {
      hasImage: !!imageCtx,
      imageSrc: imageCtx?.src?.substring(0, 50) + '...',
      mode,
      canvasSize: `${canvas.width}x${canvas.height}`
    });
  }

  const { gl, program, resolutionLocation } = glContext;
  const canvasWidth = canvas.width;
  const canvasHeight = canvas.height;

  // 背景のみ描画（プレビュー停止中）でも常に最新キャンバスサイズで描画する
  gl.viewport(0, 0, canvasWidth, canvasHeight);

  // 調整パラメータのデフォルト値
  const adj = adjustments || {
    scaleX: 1.0,
    scaleY: 1.0,
    offsetX: 0,
    offsetY: 0,
  };

  const spectrumForBg = latestSpectrumSettings;
  const screenMotion = spectrumForBg?.screenMotion ?? DEFAULT_SCREEN_MOTION;
  const imageTimelineFadeAlpha = resolveCombinedImageFadeAlpha(
    screenMotion,
    spectrumForBg?.getPlaybackTiming?.(),
    spectrumForBg?.getStopGracefulImageFade?.() ?? null
  );
  imageTimelineFadeMul = imageTimelineFadeAlpha;

  const galleryTransition = peekGalleryImageTransitionFrame();
  const bgVideo = spectrumForBg?.backgroundVideo;
  const useStillBackgroundPipeline =
    !!imageCtx &&
    shouldUseStillScreenBackgroundPipeline(
      imageCtx,
      screenMotion,
      !!bgVideo,
      !!galleryTransition
    );
  const plainImageFadeAlpha = useStillBackgroundPipeline ? 1 : imageTimelineFadeAlpha;

  let bgAudioReactive: AudioReactiveData | undefined;
  const sm = screenMotion;
  if (
    imageCtx &&
    latestEffectActive &&
    latestAnalyser &&
    sm &&
    (sm.brightnessOnPeak || sm.shakeOnChorus || sm.chorusZoomOnPeak || sm.flashOnDrop)
  ) {
    const earlyFreq = new Uint8Array(latestAnalyser.frequencyBinCount);
    latestAnalyser.getByteFrequencyData(earlyFreq);
    let bass = 0;
    let volume = 0;
    let highFreq = 0;
    const bl = earlyFreq.length;
    for (let i = 0; i < 16; i++) bass += earlyFreq[i];
    for (let i = 0; i < bl; i++) volume += earlyFreq[i];
    for (let i = 200; i < Math.min(256, bl); i++) highFreq += earlyFreq[i];
    bgAudioReactive = {
      bass: Math.min(1, bass / (16 * 200)),
      volume: Math.min(1, volume / (bl * 180)),
      highFreq: Math.min(1, highFreq / (56 * 150)),
    };
  }

  // 背景を描画（WebGLでテクスチャとして描画）
  drawBackgroundWebGL(
    glContext,
    canvas,
    imageCtx,
    spectrumForBg,
    bgAudioReactive,
    plainImageFadeAlpha
  );

  // プレビュー/録画中のみアニメーション（エフェクトも同様。停止中は背景1枚のみで負荷なし）
  const wantSpectrum = latestEffectActive;
  const wantEffects = !!(latestEffect && latestEffect.type !== "none");

  if (!wantSpectrum) {
    isAnimating = false;
    return;
  }

  if (mode === 6) {
    const { gl } = glContext;
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    drawGlycoBackgroundDimOverlayWebGL(
      glContext,
      canvasWidth,
      canvasHeight,
      spectrumForBg?.retroEqParams,
      adj,
      spectrumForBg?.glycoRotationDeg,
      spectrumForBg?.glycoColorSet
    );
  }

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  // 直後のブロックで常に上書き（プレビュー/録画時のみこの関数はここまで到達）
  let audioRForEffects: AudioReactiveData = { bass: 0, volume: 0, highFreq: 0 };

  if (wantSpectrum) {
    gl.useProgram(program);

    if (resolutionLocation) {
      gl.uniform2f(resolutionLocation, canvasWidth, canvasHeight);
    }

    const settings: SpectrumSettings = latestSpectrumSettings ?? {
      opacity: 0.9,
      lineWidthWaveform: 3.2,
      lineWidthCircle: 3.2,
      lineWidthSymWave: 3.6,
    };

    const bufferLength = analyser.frequencyBinCount;
    const bufferData = new Uint8Array(bufferLength);
    const freqForEffect = new Uint8Array(bufferLength);
    const needsFreqForEffect =
      latestEffect &&
      [
        "spaceAudio",
        "filmGrain",
        "vignette",
        "rainbow",
        "curtain",
        "glitch",
        "sparkle",
        "dust",
        "rain",
        "snow",
        "waterRipple",
        "mirrorBall",
        "laser",
      ].includes(latestEffect.type);
    if (needsFreqForEffect) {
      analyser.getByteFrequencyData(freqForEffect);
    }

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

    audioRForEffects = getAudioReactive();

    // モード1・5: スペアナ本体を SPECTRUM_THROTTLE_TARGET_FPS に合わせて間引く
    let skipSpectrumDraw = false;
    if (mode === 1 || mode === 5) {
      const now = performance.now();
      const interval = 1000 / SPECTRUM_THROTTLE_TARGET_FPS;
      const key = mode === 1 ? '_lastTimeMode1' : '_lastTimeMode5';
      const last = (renderFrame as any)[key] ?? 0;
      if (now - last < interval) {
        if (isAnimating) {
          requestAnimationFrame(renderFrame);
        }
        // エフェクトON時はスペアナを間引いてもオーバーレイは毎フレーム更新
        if (!wantEffects) {
          return;
        }
        skipSpectrumDraw = true;
      } else {
        (renderFrame as any)[key] = now;
      }
    }

    const effAdj: ModeAdjustments =
      mode === 6 ? { ...adj, scaleY: adj.scaleY / 3, scaleX: adj.scaleX } : adj;

    // モードに応じて描画
    if (!skipSpectrumDraw)
    switch (mode) {
      case -1:
        // OFF: 背景テクスチャのみ（スペアナ描画なし）
        break;
      case 0:
        analyser.getByteFrequencyData(bufferData);
        drawMode0(glContext, bufferData, canvasWidth, canvasHeight, effAdj, settings);
        break;
      case 1:
        analyser.getByteTimeDomainData(bufferData);
        drawMode1(glContext, bufferData, canvasWidth, canvasHeight, effAdj, settings);
        break;
      case 2:
        analyser.getByteFrequencyData(bufferData);
        drawMode2(glContext, bufferData, canvasWidth, canvasHeight, effAdj, settings);
        break;
      case 3:
        analyser.getByteFrequencyData(bufferData);
        drawMode3(glContext, bufferData, canvasWidth, canvasHeight, effAdj, settings);
        break;
      case 4:
        analyser.getByteFrequencyData(bufferData);
        drawMode4(glContext, bufferData, canvasWidth, canvasHeight, effAdj, settings);
        break;
      case 5:
        analyser.getByteTimeDomainData(bufferData);
        drawMode5(glContext, bufferData, canvasWidth, canvasHeight, effAdj, settings);
        break;
      case 6:
        analyser.getByteFrequencyData(bufferData);
        drawMode6Glyco(glContext, bufferData, canvasWidth, canvasHeight, adj, settings);
        break;
      case 7:
        analyser.getByteFrequencyData(bufferData);
        drawMode7Area(glContext, bufferData, canvasWidth, canvasHeight, effAdj, settings);
        break;
      case 8:
        analyser.getByteFrequencyData(bufferData);
        drawMode8LoudnessPulse(glContext, bufferData, canvasWidth, canvasHeight, effAdj, settings);
        break;
      case 9:
        analyser.getByteFrequencyData(bufferData);
        drawMode9Vu(glContext, bufferData, canvasWidth, canvasHeight, effAdj, settings);
        break;
      case 10:
        analyser.getByteFrequencyData(bufferData);
        drawMode10Ring(glContext, bufferData, canvasWidth, canvasHeight, effAdj, settings);
        break;
      case 11:
        analyser.getByteFrequencyData(bufferData);
        drawMode11Orb(glContext, bufferData, canvasWidth, canvasHeight, effAdj, settings);
        break;
      case 12:
        analyser.getByteFrequencyData(bufferData);
        drawMode12Breathing(glContext, bufferData, canvasWidth, canvasHeight, effAdj, settings);
        break;
      case 13:
        analyser.getByteFrequencyData(bufferData);
        drawMode13Particles(glContext, bufferData, canvasWidth, canvasHeight, effAdj, settings);
        break;
      case 14:
        analyser.getByteFrequencyData(bufferData);
        drawMode14Morph(glContext, bufferData, canvasWidth, canvasHeight, effAdj, settings);
        break;
      case 15:
        analyser.getByteTimeDomainData(bufferData);
        drawMode15Oscilloscope(glContext, bufferData, canvasWidth, canvasHeight, effAdj, settings);
        break;
      case 16:
        analyser.getByteTimeDomainData(bufferData);
        drawMode16Lissajous(glContext, bufferData, canvasWidth, canvasHeight, effAdj, settings);
        break;
    }
  }

  // エフェクトオーバーレイ（背景→スペアナの上。字幕は Canvas 2D フォールバック時のみ手前）
  if (latestEffect && latestEffect.type !== "none") {
    const effectDucking =
      mode !== -1 && (latestEffect.type === "scanlines" || latestEffect.type === "rain" || latestEffect.type === "dust")
        ? 0.78
        : 1.0;
    if (latestEffect.type === "space" || latestEffect.type === "spaceConstant" || latestEffect.type === "spaceAudio") {
      const now = performance.now();
      const deltaTime = Math.min(now - lastEffectTime, 50);
      lastEffectTime = now;
      const variant = latestEffect.type === "space" ? "space" : latestEffect.type === "spaceConstant" ? "spaceConstant" : "spaceAudio";
      const particles = updateAndGetSpaceParticles(
        canvasWidth,
        canvasHeight,
        latestEffect.density,
        deltaTime,
        variant,
        latestEffect.spaceDirection ?? "forward",
        latestEffect.spaceSpeed ?? 1,
        variant === "spaceAudio" ? audioRForEffects : undefined,
        latestEffect.effectTintColor,
        latestEffect.spaceCenterX ?? 0.5,
        latestEffect.spaceCenterY ?? 0.5
      );
      for (const p of particles) {
        const r = p.r / 255;
        const g = p.g / 255;
        const b = p.b / 255;
        const radius = Math.max(1, p.size / 2);
        drawCircle(glContext, p.x, p.y, radius, r, g, b, p.alpha);
      }
    } else if (latestEffect.type === "sparkle" || latestEffect.type === "dust") {
      const now = performance.now();
      const deltaTime = Math.min(now - lastEffectTime, 50);
      lastEffectTime = now;
      if (latestEffect.type === "sparkle") {
        // きらきら: 通常アルファで輪郭をはっきり（透明度を抑えた描画）
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        const parts = updateAndGetSparkleParticles(
          canvasWidth,
          canvasHeight,
          latestEffect.density,
          deltaTime,
          latestEffect.sparkleVariant ?? "normal",
          audioRForEffects,
          latestEffect.effectTintColor
        );
        for (const p of parts) {
          const rad = Math.max(1, p.radius);
          const r = p.r / 255;
          const g = p.g / 255;
          const b = p.b / 255;
          const a = p.alpha;
          drawSparkleStarWebGL(
            glContext,
            p.x,
            p.y,
            rad,
            r,
            g,
            b,
            a,
            p.starKind,
            p.rotation,
            2.12,
            0.36
          );
          drawSparkleStarWebGL(
            glContext,
            p.x,
            p.y,
            rad,
            r,
            g,
            b,
            a,
            p.starKind,
            p.rotation,
            1,
            1
          );
          const lineW = Math.max(0.6, rad * 0.42);
          const coreR = Math.max(0.45, lineW * 0.24);
          drawCircle(glContext, p.x, p.y, coreR, r, g, b, Math.min(1, a * 0.92));
        }
      } else {
        // 加算ブレンドで発光・空気感（ほこり）
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
        const parts = updateAndGetDustParticles(
          canvasWidth,
          canvasHeight,
          latestEffect.density,
          deltaTime,
          latestEffect.atmosphereVariant ?? "dust",
          latestEffect.effectStrengthScale ?? 1,
          audioRForEffects,
          latestEffect.effectTintColor
        );
        for (const p of parts) {
          drawCircle(
            glContext,
            p.x,
            p.y,
            Math.max(1.5, p.radius),
            p.r / 255,
            p.g / 255,
            p.b / 255,
            p.alpha * effectDucking
          );
        }
      }
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    } else if (latestEffect.type === "rain") {
      const now = performance.now();
      const deltaTime = Math.min(now - lastEffectTime, 50);
      lastEffectTime = now;
      const streaks = updateAndGetRainStreaks(
        canvasWidth,
        canvasHeight,
        latestEffect.density,
        deltaTime,
        audioRForEffects,
        latestEffect.weatherAngleDeg ?? 18,
        latestEffect.weatherAmount ?? 0.65,
        latestEffect.weatherColor,
        latestEffect.rainAudioSensitivity ?? 0
      );
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      for (const s of streaks) {
        drawLine(
          glContext,
          s.x1,
          s.y1,
          s.x2,
          s.y2,
          s.r / 255,
          s.g / 255,
          s.b / 255,
          s.a * effectDucking,
          s.lw
        );
      }
    } else if (latestEffect.type === "snow") {
      const now = performance.now();
      const deltaTime = Math.min(now - lastEffectTime, 50);
      lastEffectTime = now;
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
      const parts = updateAndGetSnowParticles(
        canvasWidth,
        canvasHeight,
        latestEffect.density,
        deltaTime,
        audioRForEffects,
        latestEffect.weatherAngleDeg ?? 8,
        latestEffect.weatherAmount ?? 0.55,
        latestEffect.weatherColor
      );
      for (const p of parts) {
        drawCircle(
          glContext,
          p.x,
          p.y,
          Math.max(1.2, p.radius),
          p.r / 255,
          p.g / 255,
          p.b / 255,
          p.alpha
        );
      }
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    } else if (latestEffect.type === "waterRipple") {
      const now = performance.now();
      const deltaTime = Math.min(now - lastEffectTime, 50);
      lastEffectTime = now;
      const wrIntensity =
        latestEffect.waterRippleIntensity != null
          ? Math.max(0, Math.min(1, latestEffect.waterRippleIntensity))
          : densityToWaterRippleIntensity(latestEffect.density);
      const wrLightMode = latestEffect.waterRippleLightMode !== false;
      const draws = updateAndGetWaterRippleDraws(
        canvasWidth,
        canvasHeight,
        wrIntensity,
        deltaTime,
        latestEffect.waterRippleColor ??
          latestEffect.effectTintColor ??
          latestEffect.weatherColor,
        latestEffect.waterRippleVariant ?? "ripple",
        wrLightMode,
        audioRForEffects,
        latestEffect.waterRippleAudioSensitivity ?? 0
      );
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
      for (const d of draws) {
        const rr = d.r / 255;
        const gg = d.g / 255;
        const bb = d.b / 255;
        const aa = d.a * effectDucking;
        if (aa < 0.012) continue;
        const lw = d.lw;
        if (d.kind === "firework") {
          drawLine(
            glContext,
            d.x1,
            d.y1,
            d.x2,
            d.y2,
            rr,
            gg,
            bb,
            aa,
            lw
          );
          continue;
        }
        if (d.kind === "heart") {
          const s = Math.max(3, d.scale);
          const heartPts: Array<[number, number]> = [];
          const steps = getWaterRippleHeartSteps(wrLightMode);
          const cosR = Math.cos(d.rotation);
          const sinR = Math.sin(d.rotation);
          for (let i = 0; i <= steps; i++) {
            const t = (Math.PI * 2 * i) / steps;
            const hx = 16 * Math.pow(Math.sin(t), 3);
            const hy =
              13 * Math.cos(t) -
              5 * Math.cos(2 * t) -
              2 * Math.cos(3 * t) -
              Math.cos(4 * t);
            const px = (hx / 18) * s;
            const py = (-hy / 18) * s;
            const rx = px * cosR - py * sinR;
            const ry = px * sinR + py * cosR;
            heartPts.push([d.x + rx, d.y + ry]);
          }
          for (let i = 0; i < heartPts.length - 1; i++) {
            const p1 = heartPts[i];
            const p2 = heartPts[i + 1];
            drawLine(glContext, p1[0], p1[1], p2[0], p2[1], rr, gg, bb, aa, lw);
          }
          continue;
        }
        if (d.radius < 0.45) continue;
        const segments = getWaterRippleArcSegments(d.radius, wrLightMode);
        const step = (Math.PI * 2) / segments;
        let prevCos = 1;
        let prevSin = 0;
        for (let i = 0; i < segments; i++) {
          const a2 = (i + 1) * step;
          const nextCos = Math.cos(a2);
          const nextSin = Math.sin(a2);
          drawLine(
            glContext,
            d.x + prevCos * d.radius,
            d.y + prevSin * d.radius,
            d.x + nextCos * d.radius,
            d.y + nextSin * d.radius,
            rr,
            gg,
            bb,
            aa,
            lw
          );
          prevCos = nextCos;
          prevSin = nextSin;
        }
      }
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    } else if (latestEffect.type === "scanlines") {
      const strength = DENSITY_STRENGTH[latestEffect.density];
      const spacing = latestEffect.density === 3 ? 2 : latestEffect.density === 2 ? 3 : 4;
      const base = 0.14 + 0.22 * strength;
      const pulse =
        0.78 +
        0.22 *
          Math.min(1, audioRForEffects.volume * 0.7 + audioRForEffects.bass * 0.35);
      const alpha = Math.min(0.42, base * pulse) * effectDucking;
      const lineH = latestEffect.density === 3 ? 2 : 1;
      for (let y = 0; y < canvasHeight; y += spacing) {
        drawRect(glContext, 0, y, canvasWidth, lineH, 0, 0, 0, alpha);
        if (lineH === 2 && y + 1 < canvasHeight) {
          drawRect(glContext, 0, y + 1, canvasWidth, 1, 0, 0, 0, alpha * 0.35);
        }
      }
    } else if (latestEffect.type === "laser") {
      const now = performance.now();
      const deltaTime = Math.min(now - lastEffectTime, 50);
      lastEffectTime = now;
      const segments = updateAndGetLaserSegments(
        canvasWidth,
        canvasHeight,
        latestEffect.density,
        deltaTime
      );
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
      for (const s of segments) {
        if (s.a < 0.018) continue;
        drawLine(
          glContext,
          s.x1,
          s.y1,
          s.x2,
          s.y2,
          s.r / 255,
          s.g / 255,
          s.b / 255,
          s.a,
          s.lw
        );
      }
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    } else if (latestEffect.type === "mirrorBall") {
      const now = performance.now();
      const deltaTime = Math.min(now - lastEffectTime, 50);
      lastEffectTime = now;
      const frame = buildMirrorBallFrame(
        canvasWidth,
        canvasHeight,
        latestEffect,
        deltaTime,
        audioRForEffects
      );
      const roomDim = Math.min(0.55, frame.ambientAlpha);
      if (roomDim > 0.001) {
        const shade = 1 - roomDim * 0.92;
        gl.blendFunc(gl.DST_COLOR, gl.ZERO);
        drawRect(
          glContext,
          0,
          0,
          canvasWidth,
          canvasHeight,
          shade,
          shade,
          Math.min(1, shade + 0.03),
          1
        );
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      }
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
      for (const w of frame.wallSpots) {
        const aspect = w.square ?? 1;
        const hw = w.radius * aspect;
        const hh = w.radius / Math.max(0.75, aspect);
        const spotA = w.a * 0.92;
        drawRect(
          glContext,
          w.x - hw,
          w.y - hh,
          hw * 2,
          hh * 2,
          w.r / 255,
          w.g / 255,
          w.b / 255,
          spotA
        );
        drawCircle(
          glContext,
          w.x,
          w.y,
          Math.max(hw, hh) * 0.55,
          1,
          1,
          0.98,
          spotA * 0.35
        );
      }
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      for (const f of frame.facets) {
        const [x1, y1, x2, y2, x3, y3] = f.points;
        drawTriangle(
          glContext,
          x1,
          y1,
          x2,
          y2,
          x3,
          y3,
          f.r / 255,
          f.g / 255,
          f.b / 255,
          f.a
        );
      }
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
      for (const s of frame.sparkles) {
        drawCircle(
          glContext,
          s.x,
          s.y,
          Math.max(1.2, s.radius * 2),
          s.r / 255,
          s.g / 255,
          s.b / 255,
          s.a
        );
      }
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      drawCircle(glContext, frame.ballCx, frame.ballCy, frame.ballR, 0.22, 0.23, 0.28, 0.82);
      drawCircle(
        glContext,
        frame.ballCx,
        frame.ballCy,
        frame.coreR,
        0.78,
        0.8,
        0.86,
        frame.coreAlpha * 0.35
      );
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
      drawCircle(
        glContext,
        frame.lightX,
        frame.lightY,
        frame.ballR * 1.25,
        1,
        0.97,
        0.86,
        0.06
      );
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    } else {
      drawEffectOverlayWebGL(glContext, canvasWidth, canvasHeight, latestEffect, audioRForEffects);
    }
  }

  // FPS計測
  fpsCounter++;
  const now = performance.now();
  if (now - fpsLastTime >= 1000) {
    currentFPS = Math.round((fpsCounter * 1000) / (now - fpsLastTime));
    fpsCounter = 0;
    fpsLastTime = now;
  }

  // 次のフレームをスケジュール
  animationFrameId = requestAnimationFrame(renderFrame);
}

/**
 * WebGLでスペクトラムを描画（メイン関数）
 */
export const drawBarsWebGL = (
  canvas: HTMLCanvasElement,
  imageCtx: HTMLImageElement | null,
  mode: number,
  analyser: AnalyserNode,
  adjustments?: ModeAdjustments,
  effect?: EffectParams,
  isEffectActive?: boolean,
  spectrumSettings?: SpectrumSettings
): void => {
  debugLog('drawBarsWebGL called', {
    hasImage: !!imageCtx,
    imageSrc: imageCtx?.src?.substring(0, 50) + '...',
    mode,
    isAnimating,
    canvasSize: `${canvas.width}x${canvas.height}`
  });

  // 最新のパラメータを保存（再帰呼び出し時に使用）
  latestCanvas = canvas;
  latestImageCtx = imageCtx;
  latestMode = mode;
  latestAnalyser = analyser;
  latestAdjustments = adjustments;
  latestEffect = effect;
  latestEffectActive = isEffectActive ?? false;
  latestSpectrumSettings = spectrumSettings;

  // 既にアニメーション中: パラメータ更新後すぐ1フレーム描画（offset/scale 変更を即反映）
  if (isAnimating) {
    renderFrame();
    return;
  }

  // アニメーション開始
  isAnimating = true;

  // WebGLコンテキストを初期化（初回のみ）
  if (!glContext || glContext.gl.canvas !== canvas) {
    glContext = initWebGL(canvas);
  }

  if (!glContext) {
    console.error('Failed to initialize WebGL, falling back to Canvas 2D');
    isAnimating = false;
    return;
  }

  // 最初のフレームをレンダリング
  renderFrame();
};

// モード0: 周波数バー（Canvas.tsに合わせる）
function drawMode0(
  ctx: WebGLRendererContext,
  bufferData: Uint8Array,
  canvasWidth: number,
  canvasHeight: number,
  adj: ModeAdjustments,
  settings: SpectrumSettings
): void {
  const barsLength = 128;
  const barPitch = canvasWidth / barsLength;
  const barWidth = Math.max(1, barPitch * 0.72);
  const barGap = barPitch - barWidth;
  const opacity = getVisualOpacity(settings.opacity);
  const [pr, pg, pb] = getSpectrumPrimaryRgb(settings);
  const r = pr / 255;
  const gCol = pg / 255;
  const b = pb / 255;

  for (let i = 0; i < barsLength; i++) {
    const g = spectrumLinearBarLowGain(i, barsLength);
    const barHeight = Math.min(255, bufferData[i] * g);
    const barX = i * barPitch + barGap * 0.5;
    const y = canvasHeight - barHeight;

    // 4つの角の座標を変換
    const [x1, y1] = applyTransform(barX, y, canvasWidth, canvasHeight, adj);
    const [x2, y2] = applyTransform(barX + barWidth, y + barHeight, canvasWidth, canvasHeight, adj);

    // 変換後のサイズを計算
    const transformedWidth = x2 - x1;
    const transformedHeight = y2 - y1;

    drawRect(ctx, x1, y1, transformedWidth, transformedHeight, r, gCol, b, 0.84 * opacity);
    const edgeR = Math.min(1, r + 0.1);
    const edgeG = Math.min(1, gCol + 0.1);
    const edgeB = Math.min(1, b + 0.1);
    drawLine(ctx, x1, y1, x2, y1, edgeR, edgeG, edgeB, 0.45 * opacity, 1);
    drawLine(ctx, x1, y1, x1, y2, edgeR, edgeG, edgeB, 0.3 * opacity, 1);
  }
}

// モード1: 波形（Canvas.tsに合わせる）
function drawMode1(
  ctx: WebGLRendererContext,
  bufferData: Uint8Array,
  canvasWidth: number,
  canvasHeight: number,
  adj: ModeAdjustments,
  settings: SpectrumSettings
): void {
  const bufferLength = bufferData.length;
  const centerY = canvasHeight / 2;
  const scale = (canvasHeight / 2) / 128;
  const opacity = settings.opacity;
  const lineWidth = BASE_LINE_WIDTH_WAVEFORM * settings.lineWidthWaveform;
  const [pr, pg, pb] = getSpectrumPrimaryRgb(settings);
  const r = pr / 255;
  const g = pg / 255;
  const b = pb / 255;

  for (let i = 0; i < bufferLength - 1; i++) {
    const x1 = (i / bufferLength) * canvasWidth;
    const x2 = ((i + 1) / bufferLength) * canvasWidth;
    const y1 = centerY - (bufferData[i] - 128) * scale;
    const y2 = centerY - (bufferData[i + 1] - 128) * scale;

    // 変換を適用
    const [tx1, ty1] = applyTransform(x1, y1, canvasWidth, canvasHeight, adj);
    const [tx2, ty2] = applyTransform(x2, y2, canvasWidth, canvasHeight, adj);

    drawLine(ctx, tx1, ty1, tx2, ty2, r, g, b, opacity, lineWidth);
  }
}

// モード2: 円形（Canvas.tsに合わせる）
function drawMode2(
  ctx: WebGLRendererContext,
  bufferData: Uint8Array,
  canvasWidth: number,
  canvasHeight: number,
  adj: ModeAdjustments,
  settings: SpectrumSettings
): void {
  const bass = Math.floor(bufferData[1]); // 1Hz Freq
  const baseRadius = 0.2 * canvasWidth <= 200 ? 0.2 * canvasWidth : 200;
  const radius = -(bass * 0.25 + baseRadius);  // radius is negative (matching Canvas.ts)
  const barWidth = BASE_LINE_WIDTH_CIRCLE * settings.lineWidthCircle;

  // User adjustment offsets in pixels
  const opacity = settings.opacity;
  const [pr, pg, pb] = getSpectrumPrimaryRgb(settings);
  const r = pr / 255;
  const g = pg / 255;
  const b = pb / 255;
  const circleRotationRpm = settings.circleRotationRpm ?? 0;
  const rotationOffsetRad = ((circleRotationRpm * 2 * Math.PI) / 60) * (performance.now() / 1000);

  for (let i = 0; i < 256; i++) {
    const value = bufferData[i];
    const angle = i * ((180 / 128) * Math.PI / 180) + rotationOffsetRad;

    const localX1 = -radius * Math.sin(angle);
    const localY1 = radius * Math.cos(angle);
    const localX2 = -(radius - value) * Math.sin(angle);
    const localY2 = (radius - value) * Math.cos(angle);

    const [tx1, ty1] = applyMode2LocalToScreen(localX1, localY1, canvasWidth, canvasHeight, adj);
    const [tx2, ty2] = applyMode2LocalToScreen(localX2, localY2, canvasWidth, canvasHeight, adj);

    drawLine(ctx, tx1, ty1, tx2, ty2, r, g, b, opacity, barWidth);
  }
}

// モード3: 上下対称バー（Canvas.tsに合わせる）
function drawMode3(
  ctx: WebGLRendererContext,
  bufferData: Uint8Array,
  canvasWidth: number,
  canvasHeight: number,
  adj: ModeAdjustments,
  settings: SpectrumSettings
): void {
  const barsLength = 128;
  const barWidth = canvasWidth / barsLength;
  const centerY = canvasHeight / 2;
  const opacity = settings.opacity;
  const useRainbow = settings.spectrumRainbowColorful !== false;
  const [pr, pg, pb] = getSpectrumPrimaryRgb(settings);
  const [sr, sg, sb] = getSpectrumSecondaryRgb(settings);

  for (let i = 0; i < barsLength; i++) {
    const barHeight = glycoBarRawEnergy(i, barsLength, bufferData.length, bufferData) * 2;
    let r1: number;
    let g1: number;
    let b1: number;
    let r2: number;
    let g2: number;
    let b2: number;
    if (useRainbow) {
      const hue = (i / barsLength) * 360;
      [r1, g1, b1] = hslToRgb(hue, 1.0, 0.5);
      [r2, g2, b2] = hslToRgb(hue + 60, 1.0, 0.7);
    } else {
      r1 = pr / 255;
      g1 = pg / 255;
      b1 = pb / 255;
      r2 = sr / 255;
      g2 = sg / 255;
      b2 = sb / 255;
    }

    const x = i * barWidth;
    const y = centerY - barHeight / 2;

    // 変換を適用
    const [x1, y1] = applyTransform(x, y, canvasWidth, canvasHeight, adj);
    const [x2, y2] = applyTransform(x + barWidth - 1, y + barHeight, canvasWidth, canvasHeight, adj);

    const transformedWidth = x2 - x1;
    const transformedHeight = y2 - y1;

    drawRectGradient(ctx, x1, y1, transformedWidth, transformedHeight, r1, g1, b1, opacity, r2, g2, b2, opacity);
  }
}

// モード4: ドット表示（32列×16行をキャンバス全幅・全高で使い切る）
function drawMode4(
  ctx: WebGLRendererContext,
  bufferData: Uint8Array,
  canvasWidth: number,
  canvasHeight: number,
  adj: ModeAdjustments,
  settings: SpectrumSettings
): void {
  const bufferLength = bufferData.length;
  const dotsPerRow = 32;
  const dotsPerCol = 16;
  const dotSizeX = canvasWidth / dotsPerRow;
  const dotSizeY = canvasHeight / dotsPerCol;
  const baseDotRadius = Math.min(dotSizeX, dotSizeY) / 3;
  const dotRadius = baseDotRadius * getSpectrumDotRadiusScale(settings.dotSizeLevel);
  const baseOpacity = settings.opacity;
  const useRainbow = settings.spectrumRainbowColorful !== false;
  const [pr, pg, pb] = getSpectrumPrimaryRgb(settings);
  const [sr, sg, sb] = getSpectrumSecondaryRgb(settings);

  for (let col = 0; col < dotsPerRow; col++) {
    const value = glycoBarRawEnergy(col, dotsPerRow, bufferLength, bufferData);
    const tcol = col / dotsPerRow;

    for (let row = 0; row < dotsPerCol; row++) {
      const threshold = (255 / dotsPerCol) * (dotsPerCol - row);
      const opacity = (value > threshold ? 0.8 : 0.2) * baseOpacity;
      let r: number;
      let g: number;
      let b: number;
      if (useRainbow) {
        const hue = tcol * 360;
        [r, g, b] = hslToRgb(hue, 1.0, 0.5);
      } else {
        r = (pr + (sr - pr) * tcol) / 255;
        g = (pg + (sg - pg) * tcol) / 255;
        b = (pb + (sb - pb) * tcol) / 255;
      }

      const x = col * dotSizeX + dotSizeX / 2;
      const y = row * dotSizeY + dotSizeY / 2;

      // 変換を適用
      const [tx, ty] = applyTransform(x, y, canvasWidth, canvasHeight, adj);

      // スケールに応じて半径も調整
      const radius = dotRadius * Math.min(adj.scaleX, adj.scaleY);

      drawCircle(ctx, tx, ty, radius, r, g, b, opacity);
    }
  }
}

// モード5: 波形（上下対称）（Canvas.tsに合わせる）
function drawMode5(
  ctx: WebGLRendererContext,
  bufferData: Uint8Array,
  canvasWidth: number,
  canvasHeight: number,
  adj: ModeAdjustments,
  settings: SpectrumSettings
): void {
  const bufferLength = bufferData.length;
  const centerY = canvasHeight / 2;
  const scale = canvasHeight / 512;
  const opacity = settings.opacity;
  // Canvas.ts mode5 と同様に lineWidthSymWave を直接使用
  const lineWidth = settings.lineWidthSymWave;
  const [pr, pg, pb] = getSpectrumPrimaryRgb(settings);
  const r = pr / 255;
  const g = pg / 255;
  const b = pb / 255;

  for (let i = 0; i < bufferLength - 1; i++) {
    const x1 = (i / bufferLength) * canvasWidth;
    const x2 = ((i + 1) / bufferLength) * canvasWidth;
    const y1 = centerY - (bufferData[i] - 128) * scale;
    const y2 = centerY - (bufferData[i + 1] - 128) * scale;

    // 上側（通常）の変換
    const [tx1, ty1] = applyTransform(x1, y1, canvasWidth, canvasHeight, adj);
    const [tx2, ty2] = applyTransform(x2, y2, canvasWidth, canvasHeight, adj);
    drawLine(ctx, tx1, ty1, tx2, ty2, r, g, b, opacity, lineWidth);

    // 下側（反転）の変換
    const y1Mirror = canvasHeight - y1;
    const y2Mirror = canvasHeight - y2;
    const [tx1m, ty1m] = applyTransform(x1, y1Mirror, canvasWidth, canvasHeight, adj);
    const [tx2m, ty2m] = applyTransform(x2, y2Mirror, canvasWidth, canvasHeight, adj);
    drawLine(ctx, tx1m, ty1m, tx2m, ty2m, r, g, b, opacity, lineWidth);
  }
}

// 縦グラデ固定: t(0=下,1=上)で青→黄緑→黄→橙→赤、表示エリア最大高さを100%とする
function getVerticalEQFixedColor(t: number): [number, number, number] {
  if (t <= 0.6) return [50 / 255, 80 / 255, 180 / 255];
  const u = (t - 0.61) / 0.39; // 0.61→0, 1→1
  const stops = [0, 0.282, 0.538, 0.769, 1]; // 0.61,0.72,0.82,0.91,1に対応
  const colors: [number, number, number][] = [
    [50 / 255, 80 / 255, 180 / 255],
    [150 / 255, 220 / 255, 50 / 255],
    [255 / 255, 220 / 255, 0 / 255],
    [255 / 255, 150 / 255, 50 / 255],
    [220 / 255, 50 / 255, 50 / 255],
  ];
  let i = 0;
  while (i < stops.length - 1 && u > stops[i + 1]) i++;
  const local = Math.max(0, Math.min(1, (u - stops[i]) / (stops[i + 1] - stops[i])));
  const c0 = colors[i], c1 = colors[i + 1];
  return [
    c0[0] + (c1[0] - c0[0]) * local,
    c0[1] + (c1[1] - c0[1]) * local,
    c0[2] + (c1[2] - c0[2]) * local,
  ];
}

function rotatePointAroundCenter(
  x: number,
  y: number,
  centerX: number,
  centerY: number,
  rad: number
): [number, number] {
  if (rad === 0) return [x, y];
  const dx = x - centerX;
  const dy = y - centerY;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return [centerX + dx * c - dy * s, centerY + dx * s + dy * c];
}

// 縦グラデーション用カラー（下→上: 青紫→シアン→緑→赤橙）
const VERTICAL_EQ_COLORS = [
  [60 / 255, 50 / 255, 120 / 255] as [number, number, number],
  [0 / 255, 160 / 255, 180 / 255] as [number, number, number],
  [0 / 255, 220 / 255, 100 / 255] as [number, number, number],
  [255 / 255, 100 / 255, 50 / 255] as [number, number, number],
];

// モード6: グライコ風（1980年代コンポ風ピークホールド）
function drawMode6Glyco(
  ctx: WebGLRendererContext,
  bufferData: Uint8Array,
  canvasWidth: number,
  canvasHeight: number,
  adj: ModeAdjustments,
  settings: SpectrumSettings
): void {
  const bufferLength = bufferData.length;
  const retro = settings.retroEqParams;
  const barsLength = Math.max(24, Math.min(160, Math.round(retro?.bars ?? 64)));
  const gapMul = Math.max(0.5, Math.min(2, retro?.barGap ?? 1));
  const widthMul = Math.max(0.5, Math.min(2, retro?.barWidth ?? 1));
  const { barPitch, barWidth, barGap } = glycoBarLayout(canvasWidth, barsLength, widthMul, gapMul);
  const scale = (canvasHeight / 255) * GLYCO_BAR_VERTICAL_SCALE;
  const holdMs = 350;
  const decayPerFrame = 2.5;
  const now = performance.now();
  const glycoOp = settings.opacity;
  const colorSet = settings.glycoColorSet ?? "amber";
  const useVerticalGradient = colorSet === "verticalEQ";
  const useVerticalGradientFixed = colorSet === "verticalEQFixed";
  const peakLineWidth = 5; // ピーク「-」を太く
  const effAdj: ModeAdjustments = { ...adj, scaleY: adj.scaleY / 3, scaleX: adj.scaleX };
  const glycoRotationRad = ((settings.glycoRotationDeg ?? 0) * Math.PI) / 180;
  const [glycoCenterX, glycoCenterY] = applyTransform(
    canvasWidth / 2,
    canvasHeight / 2,
    canvasWidth,
    canvasHeight,
    effAdj
  );

  if (lastGlycoMode !== 6 || glycoPeak.length !== barsLength) {
    glycoPeak = new Array(barsLength).fill(0);
    glycoLastPeakTime = new Array(barsLength).fill(0);
  }
  lastGlycoMode = 6;

  const getColor = (i: number) => {
    if (colorSet === "palette") {
      const p = settings.spectrumColorHex ? parseSpectrumHexRgb(settings.spectrumColorHex) : null;
      const bar: [number, number, number] = p ?? GLYCO_COLOR_SETS.amber.bar;
      const dash: [number, number, number] = [
        Math.min(255, bar[0] + 44),
        Math.min(255, bar[1] + 44),
        Math.min(255, bar[2] + 44),
      ];
      return { bar, dash };
    }
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

  for (let i = 0; i < barsLength; i++) {
    const rawValue = glycoBarRawEnergy(i, barsLength, bufferLength, bufferData);
    const value = glycoAdjustedLevel(rawValue);
    const barHeight = Math.min(value * scale, canvasHeight);
    const x = i * barPitch + barGap * 0.5;

    if (value >= glycoPeak[i]) {
      glycoPeak[i] = value;
      glycoLastPeakTime[i] = now;
    } else if (now - glycoLastPeakTime[i] > holdMs) {
      glycoPeak[i] = Math.max(0, glycoPeak[i] - decayPerFrame);
    }

    const barOpacity = glycoOp;

    if (useVerticalGradient) {
      let [x1, y1] = applyTransform(x, canvasHeight - barHeight, canvasWidth, canvasHeight, effAdj);
      let [x2, y2] = applyTransform(x + barWidth, canvasHeight, canvasWidth, canvasHeight, effAdj);
      [x1, y1] = rotatePointAroundCenter(x1, y1, glycoCenterX, glycoCenterY, glycoRotationRad);
      [x2, y2] = rotatePointAroundCenter(x2, y2, glycoCenterX, glycoCenterY, glycoRotationRad);
      const rectW = Math.abs(x2 - x1);
      const rectH = Math.abs(y2 - y1);
      const segH = rectH / 3;
      const rectX = Math.min(x1, x2);
      const rectY = Math.min(y1, y2);
      // 下→上: 青紫→シアン→緑→赤橙（各セグメント: 上側色→下側色）
      drawRectGradient(ctx, rectX, rectY + segH * 2, rectW, segH, ...VERTICAL_EQ_COLORS[1], barOpacity, ...VERTICAL_EQ_COLORS[0], barOpacity);
      drawRectGradient(ctx, rectX, rectY + segH, rectW, segH, ...VERTICAL_EQ_COLORS[2], barOpacity, ...VERTICAL_EQ_COLORS[1], barOpacity);
      drawRectGradient(ctx, rectX, rectY, rectW, segH, ...VERTICAL_EQ_COLORS[3], barOpacity, ...VERTICAL_EQ_COLORS[2], barOpacity);
    } else if (useVerticalGradientFixed) {
      const [rwLx, rwLy] = applyTransform(x, 0, canvasWidth, canvasHeight, effAdj);
      const [rwRx, rwRy] = applyTransform(x + barWidth, 0, canvasWidth, canvasHeight, effAdj);
      const [rwLrx, rwLry] = rotatePointAroundCenter(rwLx, rwLy, glycoCenterX, glycoCenterY, glycoRotationRad);
      const [rwRrx, rwRry] = rotatePointAroundCenter(rwRx, rwRy, glycoCenterX, glycoCenterY, glycoRotationRad);
      const rectW = Math.hypot(rwRrx - rwLrx, rwRry - rwLry);
      const segCount = 16;
      for (let s = 0; s < segCount; s++) {
        const segBottom = canvasHeight - ((s + 1) / segCount) * barHeight;
        const segTop = canvasHeight - (s / segCount) * barHeight;
        const midY = (segBottom + segTop) / 2;
        const t = (canvasHeight - midY) / canvasHeight;
        const [r, g, b] = getVerticalEQFixedColor(t);
        let [sx1, sy1] = applyTransform(x, segBottom, canvasWidth, canvasHeight, effAdj);
        let [sx2, sy2] = applyTransform(x + barWidth, segTop, canvasWidth, canvasHeight, effAdj);
        [sx1, sy1] = rotatePointAroundCenter(sx1, sy1, glycoCenterX, glycoCenterY, glycoRotationRad);
        [sx2, sy2] = rotatePointAroundCenter(sx2, sy2, glycoCenterX, glycoCenterY, glycoRotationRad);
        const segX = Math.min(sx1, sx2);
        const segY = Math.min(sy1, sy2);
        const segW = Math.abs(sx2 - sx1);
        const segH = Math.abs(sy2 - sy1);
        drawRect(ctx, segX, segY, segW, segH, r, g, b, barOpacity);
      }
    } else {
      const { bar, dash } = getColor(i);
      let [x1, y1] = applyTransform(x, canvasHeight - barHeight, canvasWidth, canvasHeight, effAdj);
      let [x2, y2] = applyTransform(x + barWidth, canvasHeight, canvasWidth, canvasHeight, effAdj);
      [x1, y1] = rotatePointAroundCenter(x1, y1, glycoCenterX, glycoCenterY, glycoRotationRad);
      [x2, y2] = rotatePointAroundCenter(x2, y2, glycoCenterX, glycoCenterY, glycoRotationRad);
      const rectX = Math.min(x1, x2);
      const rectY = Math.min(y1, y2);
      drawRect(ctx, rectX, rectY, Math.abs(x2 - x1), Math.abs(y2 - y1), bar[0] / 255, bar[1] / 255, bar[2] / 255, barOpacity);
    }

    const peakHeight = Math.min(glycoPeak[i] * scale, canvasHeight);
    const dashWidth = barWidth * 0.7;
    const dashX = x + (barWidth - dashWidth) / 2;
    const dashY = canvasHeight - peakHeight;
    let [dx1, dy1] = applyTransform(dashX, dashY, canvasWidth, canvasHeight, effAdj);
    let [dx2, dy2] = applyTransform(dashX + dashWidth, dashY, canvasWidth, canvasHeight, effAdj);
    [dx1, dy1] = rotatePointAroundCenter(dx1, dy1, glycoCenterX, glycoCenterY, glycoRotationRad);
    [dx2, dy2] = rotatePointAroundCenter(dx2, dy2, glycoCenterX, glycoCenterY, glycoRotationRad);
    const dashOpacity = 0.95 * glycoOp;
    if (useVerticalGradient || useVerticalGradientFixed) {
      drawLine(ctx, dx1, dy1, dx2, dy2, 100 / 255, 200 / 255, 255 / 255, dashOpacity, peakLineWidth);
    } else {
      const { dash } = getColor(i);
      drawLine(ctx, dx1, dy1, dx2, dy2, dash[0] / 255, dash[1] / 255, dash[2] / 255, dashOpacity, peakLineWidth);
    }
  }
}

/** モード7: 周波数スペクトラム面（縦帯の積み上げ＋上縁ライン） */
function drawMode7Area(
  ctx: WebGLRendererContext,
  bufferData: Uint8Array,
  canvasWidth: number,
  canvasHeight: number,
  adj: ModeAdjustments,
  settings: SpectrumSettings
): void {
  const bufferLength = bufferData.length;
  const barsLength = 128;
  const op = getVisualOpacity(settings.opacity);
  const [pr, pg, pb] = getSpectrumPrimaryRgb(settings);
  const [sr, sg, sb] = getSpectrumSecondaryRgb(settings);
  const smoothed = new Float32Array(barsLength);
  for (let i = 0; i < barsLength; i++) {
    const cur = glycoBarRawEnergy(i, barsLength, bufferLength, bufferData);
    const prev = i > 0 ? glycoBarRawEnergy(i - 1, barsLength, bufferLength, bufferData) : cur;
    const next = i < barsLength - 1 ? glycoBarRawEnergy(i + 1, barsLength, bufferLength, bufferData) : cur;
    smoothed[i] = prev * 0.2 + cur * 0.6 + next * 0.2;
  }

  const vertices: number[] = [];
  const [baseLeftX, baseLeftY] = applyTransform(0, canvasHeight, canvasWidth, canvasHeight, adj);
  vertices.push(baseLeftX, baseLeftY);
  for (let i = 0; i < barsLength; i++) {
    const h = smoothed[i];
    const x = areaModeBarX(i, barsLength, canvasWidth);
    const y = canvasHeight - h;
    const [tx, ty] = applyTransform(x, y, canvasWidth, canvasHeight, adj);
    vertices.push(tx, ty);
  }
  const [baseRightX, baseRightY] = applyTransform(canvasWidth, canvasHeight, canvasWidth, canvasHeight, adj);
  vertices.push(baseRightX, baseRightY);
  drawPolygon(ctx, vertices, pr / 255, pg / 255, pb / 255, 0.62 * op);

  const lineW = Math.max(1.6, BASE_LINE_WIDTH_WAVEFORM * 1.05);
  for (let i = 0; i < barsLength - 1; i++) {
    const h0 = smoothed[i];
    const h1 = smoothed[i + 1];
    const x0 = areaModeBarX(i, barsLength, canvasWidth);
    const x1 = areaModeBarX(i + 1, barsLength, canvasWidth);
    const y0 = canvasHeight - h0;
    const y1 = canvasHeight - h1;
    const [tx0, ty0] = applyTransform(x0, y0, canvasWidth, canvasHeight, adj);
    const [tx1, ty1] = applyTransform(x1, y1, canvasWidth, canvasHeight, adj);
    drawLine(ctx, tx0, ty0, tx1, ty1, sr / 255, sg / 255, sb / 255, 0.92 * op, lineW);
  }
}

/** モード8: 音圧パルス（全帯域平均音圧で中心オーブ/リングを脈動） */
function drawMode8LoudnessPulse(
  ctx: WebGLRendererContext,
  bufferData: Uint8Array,
  canvasWidth: number,
  canvasHeight: number,
  adj: ModeAdjustments,
  settings: SpectrumSettings
): void {
  const lp = settings.loudnessParams ?? { gain: 1.35, gamma: 0.82, attack: 0.22, release: 0.08 };
  const target = getLoudnessLevel(bufferData, lp.gamma, lp.gain);

  const pulseState = (drawMode8LoudnessPulse as any)._pulse ?? { level: 0 };
  pulseState.level = smoothAR(pulseState.level, target, lp.attack, lp.release);
  (drawMode8LoudnessPulse as any)._pulse = pulseState;
  const level = pulseState.level;

  const cx = canvasWidth / 2;
  const cy = canvasHeight / 2;
  const baseR = Math.min(canvasWidth, canvasHeight) * 0.16;
  const pulseR = baseR * (1 + level * 1.15);
  const op = getVisualOpacity(settings.opacity);
  const [pr, pg, pb] = getSpectrumPrimaryRgb(settings);
  const [sr, sg, sb] = getSpectrumSecondaryRgb(settings);
  const coreOpacity = (0.28 + 0.25 * level) * op;
  const glowOpacity = (0.1 + 0.35 * level) * op;

  const [tcx, tcy] = applyTransform(cx, cy, canvasWidth, canvasHeight, adj);
  const radiusScale = Math.max(0.1, Math.min(adj.scaleX, adj.scaleY));
  const coreR = pulseR * radiusScale;
  const glowR = coreR * (1.6 + level * 0.75);

  // 外側グロー: 同心円を重ねて疑似グラデーション化
  const steps = 10;
  for (let i = steps; i >= 1; i--) {
    const t = i / steps;
    const r = glowR * t;
    const a = glowOpacity * (1 - t) * 0.55;
    drawCircle(ctx, tcx, tcy, r, sr / 255, sg / 255, sb / 255, a);
  }
  drawCircle(ctx, tcx, tcy, coreR, pr / 255, pg / 255, pb / 255, coreOpacity);
  drawCircle(ctx, tcx, tcy, coreR * 1.03, sr / 255, sg / 255, sb / 255, Math.min(1, 0.75 * op));
}

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

function getLoudnessLevel(bufferData: Uint8Array, gamma = 0.85, boost = 1.3): number {
  let sum = 0;
  for (let i = 0; i < bufferData.length; i++) sum += bufferData[i];
  const volume = sum / (bufferData.length * 255);
  return clamp01(Math.pow(volume, gamma) * boost);
}

function smoothAR(prev: number, target: number, attack: number, release: number): number {
  const a = target > prev ? attack : release;
  return prev + (target - prev) * a;
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
  const exp = Math.max(0.5, 6.0 * (1 - trailDecay) + 0.6);
  return Math.pow(age, exp);
}

function drawMode9Vu(
  ctx: WebGLRendererContext,
  bufferData: Uint8Array,
  canvasWidth: number,
  canvasHeight: number,
  adj: ModeAdjustments,
  settings: SpectrumSettings
): void {
  const lp = settings.loudnessParams ?? { gain: 1.25, gamma: 0.85, attack: 0.28, release: 0.12 };
  const half = Math.max(1, Math.floor(bufferData.length / 2));
  let leftSum = 0;
  let rightSum = 0;
  for (let i = 0; i < half; i++) leftSum += bufferData[i];
  for (let i = half; i < bufferData.length; i++) rightSum += bufferData[i];
  const rawL = clamp01(Math.pow(leftSum / (half * 255), lp.gamma) * lp.gain);
  const rawR = clamp01(Math.pow(rightSum / (Math.max(1, bufferData.length - half) * 255), lp.gamma) * lp.gain);
  const s = (drawMode9Vu as any)._state ?? { levelL: 0, levelR: 0, peakL: 0, peakR: 0, lastMs: performance.now() };
  const now = performance.now();
  const dt = Math.min(60, now - s.lastMs);
  s.lastMs = now;
  s.levelL = smoothAR(s.levelL, rawL, lp.attack, lp.release);
  s.levelR = smoothAR(s.levelR, rawR, lp.attack, lp.release);
  s.peakL = Math.max(s.levelL, s.peakL - dt * 0.00075);
  s.peakR = Math.max(s.levelR, s.peakR - dt * 0.00075);
  (drawMode9Vu as any)._state = s;
  const barW = canvasWidth * 0.16;
  const gap = canvasWidth * 0.08;
  const maxH = canvasHeight * 0.72;
  const baseY = canvasHeight * 0.9;
  const [pr, pg, pb] = getSpectrumPrimaryRgb(settings);
  const op = getVisualOpacity(settings.opacity);
  const drawOne = (x: number, level: number, peak: number) => {
    const h = maxH * level;
    const [x1, y1] = applyTransform(x, baseY - h, canvasWidth, canvasHeight, adj);
    const [x2, y2] = applyTransform(x + barW, baseY, canvasWidth, canvasHeight, adj);
    drawRect(ctx, Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1), pr / 255, pg / 255, pb / 255, 0.82 * op);
    const py = baseY - maxH * peak;
    const [px1, py1] = applyTransform(x, py - 2, canvasWidth, canvasHeight, adj);
    const [px2, py2] = applyTransform(x + barW, py + 2, canvasWidth, canvasHeight, adj);
    drawRect(ctx, Math.min(px1, px2), Math.min(py1, py2), Math.abs(px2 - px1), Math.abs(py2 - py1), 1, 0.94, 0.47, 0.95 * op);
  };
  drawOne(canvasWidth / 2 - gap / 2 - barW, s.levelL, s.peakL);
  drawOne(canvasWidth / 2 + gap / 2, s.levelR, s.peakR);
}

function drawMode10Ring(
  ctx: WebGLRendererContext,
  bufferData: Uint8Array,
  canvasWidth: number,
  canvasHeight: number,
  adj: ModeAdjustments,
  settings: SpectrumSettings
): void {
  const lp = settings.loudnessParams ?? { gain: 1.35, gamma: 0.82, attack: 0.22, release: 0.08 };
  const target = getLoudnessLevel(bufferData, lp.gamma, lp.gain);
  const st = (drawMode10Ring as any)._state ?? { level: 0 };
  st.level = smoothAR(st.level, target, lp.attack, lp.release);
  (drawMode10Ring as any)._state = st;
  const level = st.level;
  const [pr, pg, pb] = getSpectrumPrimaryRgb(settings);
  const [sr, sg, sb] = getSpectrumSecondaryRgb(settings);
  const [cx, cy] = applyTransform(canvasWidth / 2, canvasHeight / 2, canvasWidth, canvasHeight, adj);
  const scale = Math.max(0.1, Math.min(adj.scaleX, adj.scaleY));
  const r = Math.min(canvasWidth, canvasHeight) * 0.2 * (1 + level * 0.42) * scale;
  const op = getVisualOpacity(settings.opacity);
  for (let i = 10; i >= 1; i--) {
    const t = i / 10;
    drawCircle(ctx, cx, cy, r * (1 + (1 - t) * 0.9), sr / 255, sg / 255, sb / 255, (0.2 + 0.4 * level) * (1 - t) * 0.25 * op);
  }
  drawCircle(ctx, cx, cy, r, pr / 255, pg / 255, pb / 255, 0.16 * op);
  drawCircle(ctx, cx, cy, r * 1.02, sr / 255, sg / 255, sb / 255, 0.92 * op);
}

function drawMode11Orb(
  ctx: WebGLRendererContext,
  bufferData: Uint8Array,
  canvasWidth: number,
  canvasHeight: number,
  adj: ModeAdjustments,
  settings: SpectrumSettings
): void {
  const lp = settings.loudnessParams ?? { gain: 1.4, gamma: 0.8, attack: 0.22, release: 0.08 };
  const target = getLoudnessLevel(bufferData, lp.gamma, lp.gain);
  const st = (drawMode11Orb as any)._state ?? { level: 0 };
  st.level = smoothAR(st.level, target, lp.attack, lp.release);
  (drawMode11Orb as any)._state = st;
  const level = st.level;
  const [pr, pg, pb] = getSpectrumPrimaryRgb(settings);
  const [sr, sg, sb] = getSpectrumSecondaryRgb(settings);
  const [cx, cy] = applyTransform(canvasWidth / 2, canvasHeight / 2, canvasWidth, canvasHeight, adj);
  const scale = Math.max(0.1, Math.min(adj.scaleX, adj.scaleY));
  const r = Math.min(canvasWidth, canvasHeight) * (0.1 + level * 0.24) * scale;
  const op = getVisualOpacity(settings.opacity);
  for (let i = 12; i >= 1; i--) {
    const t = i / 12;
    drawCircle(ctx, cx, cy, r * (0.5 + t * 2.0), sr / 255, sg / 255, sb / 255, (1 - t) * 0.18 * op);
  }
  drawCircle(ctx, cx, cy, r, pr / 255, pg / 255, pb / 255, (0.35 + 0.4 * level) * op);
}

function drawMode12Breathing(
  ctx: WebGLRendererContext,
  bufferData: Uint8Array,
  canvasWidth: number,
  canvasHeight: number,
  adj: ModeAdjustments,
  settings: SpectrumSettings
): void {
  const lp = settings.loudnessParams ?? { gain: 1.15, gamma: 0.9, attack: 0.18, release: 0.08 };
  const target = getLoudnessLevel(bufferData, lp.gamma, lp.gain);
  const st = (drawMode12Breathing as any)._state ?? { level: 0 };
  st.level = smoothAR(st.level, target, lp.attack, lp.release);
  (drawMode12Breathing as any)._state = st;
  const level = st.level;
  const [pr, pg, pb] = getSpectrumPrimaryRgb(settings);
  const [sr, sg, sb] = getSpectrumSecondaryRgb(settings);
  const breathe = 0.5 + 0.5 * Math.sin((performance.now() / 1000) * 1.7);
  const alpha = (0.1 + 0.35 * level) * (0.75 + 0.25 * breathe) * getVisualOpacity(settings.opacity);
  const [x1, y1] = applyTransform(0, 0, canvasWidth, canvasHeight, adj);
  const [x2, y2] = applyTransform(canvasWidth, canvasHeight, canvasWidth, canvasHeight, adj);
  drawRectGradient(ctx, Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1), pr / 255, pg / 255, pb / 255, alpha, sr / 255, sg / 255, sb / 255, alpha * 0.65);
}

function drawMode13Particles(
  ctx: WebGLRendererContext,
  bufferData: Uint8Array,
  canvasWidth: number,
  canvasHeight: number,
  adj: ModeAdjustments,
  settings: SpectrumSettings
): void {
  const lp = settings.loudnessParams ?? { gain: 1.3, gamma: 0.85, attack: 0.22, release: 0.1 };
  const target = getLoudnessLevel(bufferData, lp.gamma, lp.gain);
  const st = (drawMode13Particles as any)._level ?? { level: 0 };
  st.level = smoothAR(st.level, target, lp.attack, lp.release);
  (drawMode13Particles as any)._level = st;
  const level = st.level;
  const state = (drawMode13Particles as any)._state ?? { arr: [] as any[], lastMs: performance.now() };
  const now = performance.now();
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
  const [sr, sg, sb] = getSpectrumSecondaryRgb(settings);
  for (const p of state.arr) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt * (0.0006 + 0.0007 * (1 - level));
    if (p.y < -30 || p.life <= 0) {
      p.x = Math.random() * canvasWidth;
      p.y = canvasHeight + Math.random() * 30;
      p.life = 1;
    }
    const alpha = Math.max(0, p.life) * (0.25 + 0.65 * level) * getVisualOpacity(settings.opacity);
    const [x1, y1] = applyTransform(p.x, p.y, canvasWidth, canvasHeight, adj);
    const [x2, y2] = applyTransform(p.x - p.vx * trailLen, p.y - p.vy * trailLen, canvasWidth, canvasHeight, adj);
    drawLine(ctx, x1, y1, x2, y2, sr / 255, sg / 255, sb / 255, alpha, (1 + level * 2) * Math.max(0.7, perfScale));
  }
  (drawMode13Particles as any)._state = state;
}

function drawMode14Morph(
  ctx: WebGLRendererContext,
  bufferData: Uint8Array,
  canvasWidth: number,
  canvasHeight: number,
  adj: ModeAdjustments,
  settings: SpectrumSettings
): void {
  const lp = settings.loudnessParams ?? { gain: 1.25, gamma: 0.86, attack: 0.22, release: 0.1 };
  const target = getLoudnessLevel(bufferData, lp.gamma, lp.gain);
  const st = (drawMode14Morph as any)._state ?? { level: 0 };
  st.level = smoothAR(st.level, target, lp.attack, lp.release);
  (drawMode14Morph as any)._state = st;
  const level = st.level;
  const [pr, pg, pb] = getSpectrumPrimaryRgb(settings);
  const [sr, sg, sb] = getSpectrumSecondaryRgb(settings);
  const cx = canvasWidth / 2;
  const cy = canvasHeight / 2;
  const baseR = Math.min(canvasWidth, canvasHeight) * 0.22;
  const points = 96;
  const spikes = 3 + Math.floor(level * 8);
  const op = getVisualOpacity(settings.opacity);
  let px = 0;
  let py = 0;
  for (let i = 0; i <= points; i++) {
    const t = i / points;
    const a = t * Math.PI * 2;
    const wave = Math.sin(a * spikes);
    const morph = (0.15 + 0.55 * level) * wave;
    const r = baseR * (1 + morph);
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    const [tx, ty] = applyTransform(x, y, canvasWidth, canvasHeight, adj);
    if (i > 0) {
      drawLine(ctx, px, py, tx, ty, sr / 255, sg / 255, sb / 255, 0.95 * op, 2 + level * 4);
    }
    px = tx;
    py = ty;
  }
  const [tcx, tcy] = applyTransform(cx, cy, canvasWidth, canvasHeight, adj);
  drawCircle(ctx, tcx, tcy, baseR * 0.7 * Math.max(0.1, Math.min(adj.scaleX, adj.scaleY)), pr / 255, pg / 255, pb / 255, 0.2 * op);
}

function drawMode15Oscilloscope(
  ctx: WebGLRendererContext,
  bufferData: Uint8Array,
  canvasWidth: number,
  canvasHeight: number,
  adj: ModeAdjustments,
  settings: SpectrumSettings
): void {
  const lp = settings.loudnessParams ?? { gain: 1.6, gamma: 0.75, attack: 0.28, release: 0.12 };
  // WebGL側は timeDomain しか渡されないので、timeDomain から擬似音圧（平均偏差）を作る
  let sum = 0;
  for (let i = 0; i < bufferData.length; i++) sum += Math.abs(bufferData[i] - 128);
  const v = sum / (bufferData.length * 128);
  const target = clamp01(Math.pow(v, lp.gamma) * lp.gain);
  const st = (drawMode15Oscilloscope as any)._state ?? { level: 0 };
  st.level = smoothAR(st.level, target, lp.attack, lp.release);
  (drawMode15Oscilloscope as any)._state = st;
  const level = st.level;

  const op = getVisualOpacity(settings.opacity);
  const [pr, pg, pb] = getSpectrumPrimaryRgb(settings);
  const [sr, sg, sb] = getSpectrumSecondaryRgb(settings);
  const centerY = canvasHeight / 2;
  const amp = (canvasHeight * 0.18) * (0.55 + 1.35 * level);
  const lineW = Math.max(1.5, (BASE_LINE_WIDTH_WAVEFORM * 0.9 + level * 3.2));
  const wmp = settings.wmpTrailParams ?? { trailLength: 8, trailDecay: 0.86, additive: 1.0 };

  const trail = (drawMode15Oscilloscope as any)._trail ?? { frames: [] as Uint8Array[] };
  trail.frames.push(new Uint8Array(bufferData));
  const maxTrail = Math.max(2, Math.floor(wmp.trailLength));
  while (trail.frames.length > maxTrail) trail.frames.shift();
  (drawMode15Oscilloscope as any)._trail = trail;

  // glow + trail pass
  for (let f = 0; f < trail.frames.length; f++) {
    const frame = trail.frames[f];
    const age = (f + 1) / trail.frames.length;
    const fade = trailFade(age, wmp.trailDecay);
    const add = Math.max(0.2, wmp.additive);
    for (let pass = 0; pass < 2; pass++) {
      const alpha = (pass === 0 ? 0.16 : 0.07) * op * fade * add;
      const lw = lineW * (pass === 0 ? (2.2 + 1.1 * level) : (4 + 1.5 * level)) * fade;
      for (let i = 0; i < frame.length - 1; i++) {
        const x1 = (i / (frame.length - 1)) * canvasWidth;
        const x2 = ((i + 1) / (frame.length - 1)) * canvasWidth;
        const y1 = centerY + ((frame[i] - 128) / 128) * amp;
        const y2 = centerY + ((frame[i + 1] - 128) / 128) * amp;
        const [tx1, ty1] = applyTransform(x1, y1, canvasWidth, canvasHeight, adj);
        const [tx2, ty2] = applyTransform(x2, y2, canvasWidth, canvasHeight, adj);
        drawLine(ctx, tx1, ty1, tx2, ty2, sr / 255, sg / 255, sb / 255, alpha, lw);
      }
    }
  }

  // main line (simple gradient-ish by segment)
  for (let i = 0; i < bufferData.length - 1; i++) {
    const t = i / (bufferData.length - 1);
    const r = (pr + (sr - pr) * t) / 255;
    const g = (pg + (sg - pg) * t) / 255;
    const b = (pb + (sb - pb) * t) / 255;
      const x1 = (i / (bufferData.length - 1)) * canvasWidth;
      const x2 = ((i + 1) / (bufferData.length - 1)) * canvasWidth;
      const y1 = centerY + ((bufferData[i] - 128) / 128) * amp;
      const y2 = centerY + ((bufferData[i + 1] - 128) / 128) * amp;
      const [tx1, ty1] = applyTransform(x1, y1, canvasWidth, canvasHeight, adj);
      const [tx2, ty2] = applyTransform(x2, y2, canvasWidth, canvasHeight, adj);
    drawLine(ctx, tx1, ty1, tx2, ty2, r, g, b, 0.72 * op, lineW);
  }
}

function drawMode16Lissajous(
  ctx: WebGLRendererContext,
  bufferData: Uint8Array,
  canvasWidth: number,
  canvasHeight: number,
  adj: ModeAdjustments,
  settings: SpectrumSettings
): void {
  const lp = settings.loudnessParams ?? { gain: 1.45, gamma: 0.78, attack: 0.26, release: 0.1 };
  let sum = 0;
  for (let i = 0; i < bufferData.length; i++) sum += Math.abs(bufferData[i] - 128);
  const v = sum / (bufferData.length * 128);
  const target = clamp01(Math.pow(v, lp.gamma) * lp.gain);
  const st = (drawMode16Lissajous as any)._state ?? { level: 0 };
  st.level = smoothAR(st.level, target, lp.attack, lp.release);
  (drawMode16Lissajous as any)._state = st;
  const level = st.level;

  const op = getVisualOpacity(settings.opacity);
  const [pr, pg, pb] = getSpectrumPrimaryRgb(settings);
  const [sr, sg, sb] = getSpectrumSecondaryRgb(settings);
  const cx = canvasWidth / 2;
  const cy = canvasHeight / 2;
  const scale = Math.max(0.1, Math.min(adj.scaleX, adj.scaleY));
  const baseR = Math.min(canvasWidth, canvasHeight) * (0.22 + 0.18 * level) * scale;
  const n = bufferData.length;
  const offset = Math.max(1, Math.floor(n * (0.17 + 0.08 * Math.sin(performance.now() / 1200))));
  const wmp = settings.wmpTrailParams ?? { trailLength: 8, trailDecay: 0.86, additive: 1.0 };

  const trail = (drawMode16Lissajous as any)._trail ?? { frames: [] as { offset: number; level: number }[] };
  trail.frames.push({ offset, level });
  const maxTrail = Math.max(2, Math.floor(wmp.trailLength));
  while (trail.frames.length > maxTrail) trail.frames.shift();
  (drawMode16Lissajous as any)._trail = trail;

  const [tcx, tcy] = applyTransform(cx, cy, canvasWidth, canvasHeight, adj);
  const steps = 240;
  for (let h = 0; h < trail.frames.length; h++) {
    const fr = trail.frames[h];
    const age = (h + 1) / trail.frames.length;
    const fade = trailFade(age, wmp.trailDecay);
    const add = Math.max(0.2, wmp.additive);
    for (let i = 0; i < steps; i++) {
      const t = i / steps;
      const idx = Math.floor(t * (n - 1));
      const x0 = (bufferData[idx] - 128) / 128;
      const y0 = (bufferData[(idx + fr.offset) % n] - 128) / 128;
      const x = tcx + x0 * baseR;
      const y = tcy + y0 * baseR;
      drawCircle(ctx, x, y, (1.4 + 2.0 * fr.level) * fade, sr / 255, sg / 255, sb / 255, 0.12 * op * fade * add);
    }
  }
  // core dots (current frame)
  for (let i = 0; i < steps; i++) {
    const t = i / steps;
    const idx = Math.floor(t * (n - 1));
    const x0 = (bufferData[idx] - 128) / 128;
    const y0 = (bufferData[(idx + offset) % n] - 128) / 128;
    const x = tcx + x0 * baseR;
    const y = tcy + y0 * baseR;
    const rr = (pr + (sr - pr) * t) / 255;
    const gg = (pg + (sg - pg) * t) / 255;
    const bb = (pb + (sb - pb) * t) / 255;
    drawCircle(ctx, x, y, 1.1 + 1.7 * level, rr, gg, bb, 0.55 * op);
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
 * 調整パラメータを適用して座標を変換
 * Canvas 2Dのtranslate/scaleと同じ効果を実現
 */
function applyTransform(
  x: number,
  y: number,
  canvasWidth: number,
  canvasHeight: number,
  adj: ModeAdjustments
): [number, number] {
  return applyModeAdjustments(x, y, canvasWidth, canvasHeight, adj);
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
  debugLog('stopWebGLAnimation called', { wasAnimating: isAnimating });
  if (animationFrameId !== null) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
  isAnimating = false;
  renderFrameLastFrameTime = 0;
}

/**
 * WebGLの画像キャッシュをクリア
 */
export function clearWebGLImageCache(): void {
  if (glContext) {
    if (glContext.imageTexture) {
      glContext.gl.deleteTexture(glContext.imageTexture);
      glContext.imageTexture = null;
    }
    glContext.imageCache = {
      image: null,
      width: 0,
      height: 0,
    };
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
  isAnimating = false;
  renderFrameLastFrameTime = 0;

  if (glContext) {
    const { gl, program, textureProgram, positionBuffer, colorBuffer, texCoordBuffer, imageTexture } = glContext;
    gl.deleteProgram(program);
    gl.deleteProgram(textureProgram);
    gl.deleteProgram(glContext.effectProgram);
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
