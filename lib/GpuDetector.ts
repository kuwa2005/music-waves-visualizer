/**
 * GPU検出とハードウェア情報取得
 * Nvidia, Intel, AMD GPUを自動検出
 */

export interface GpuInfo {
  vendor: string;
  renderer: string;
  isWebGLSupported: boolean;
  isWebGL2Supported: boolean;
  isWebGPUSupported: boolean;
  maxTextureSize: number;
  vendorType: 'nvidia' | 'intel' | 'amd' | 'apple' | 'unknown';
}

/**
 * GPU情報を取得
 */
export function getGpuInfo(): GpuInfo {
  const canvas = document.createElement('canvas');
  let vendor = 'Unknown';
  let renderer = 'Unknown';
  let isWebGLSupported = false;
  let isWebGL2Supported = false;
  let maxTextureSize = 0;

  // WebGL 1.0のサポート確認
  const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl') as WebGLRenderingContext | null;
  if (gl && gl instanceof WebGLRenderingContext) {
    isWebGLSupported = true;
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    if (debugInfo) {
      vendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) || 'Unknown';
      renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || 'Unknown';
    }
    maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) || 0;
  }

  // WebGL 2.0のサポート確認
  const gl2 = canvas.getContext('webgl2') as WebGL2RenderingContext | null;
  if (gl2 && gl2 instanceof WebGL2RenderingContext) {
    isWebGL2Supported = true;
    // WebGL2の方が新しい情報を取得できる可能性があるため、こちらも試す
    const debugInfo = gl2.getExtension('WEBGL_debug_renderer_info');
    if (debugInfo) {
      vendor = gl2.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) || vendor;
      renderer = gl2.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || renderer;
    }
    const maxTexSize = gl2.getParameter(gl2.MAX_TEXTURE_SIZE);
    if (maxTexSize > maxTextureSize) {
      maxTextureSize = maxTexSize;
    }
  }

  // WebGPUのサポート確認
  const isWebGPUSupported = 'gpu' in navigator;

  // GPUベンダーを判定
  const vendorType = detectVendorType(vendor, renderer);

  return {
    vendor,
    renderer,
    isWebGLSupported,
    isWebGL2Supported,
    isWebGPUSupported,
    maxTextureSize,
    vendorType,
  };
}

/**
 * GPUベンダータイプを判定
 */
function detectVendorType(vendor: string, renderer: string): 'nvidia' | 'intel' | 'amd' | 'apple' | 'unknown' {
  const vendorLower = vendor.toLowerCase();
  const rendererLower = renderer.toLowerCase();

  if (vendorLower.includes('nvidia') || rendererLower.includes('nvidia') || rendererLower.includes('geforce') || rendererLower.includes('quadro')) {
    return 'nvidia';
  }

  if (vendorLower.includes('intel') || rendererLower.includes('intel') || rendererLower.includes('uhd') || rendererLower.includes('iris')) {
    return 'intel';
  }

  if (vendorLower.includes('amd') || rendererLower.includes('amd') || rendererLower.includes('radeon') || rendererLower.includes('ati')) {
    return 'amd';
  }

  if (vendorLower.includes('apple') || rendererLower.includes('apple') || rendererLower.includes('m1') || rendererLower.includes('m2') || rendererLower.includes('m3')) {
    return 'apple';
  }

  return 'unknown';
}

/**
 * GPU情報を人間が読みやすい形式で取得
 */
export function getGpuDisplayName(info: GpuInfo): string {
  if (!info.isWebGLSupported) {
    return 'GPU情報を取得できません（WebGL非対応）';
  }

  // レンダラー名をクリーンアップ
  let displayName = info.renderer;

  // ANGLE (Direct3D) などのプレフィックスを削除
  displayName = displayName.replace(/^ANGLE \((.+)\)$/, '$1');
  displayName = displayName.replace(/^Google SwiftShader/, 'SwiftShader (ソフトウェア)');

  return displayName;
}

/**
 * 推奨レンダラーを判定
 */
export function getRecommendedRenderer(info: GpuInfo): 'webgl' | 'canvas2d' {
  // WebGL2が使えればWebGLを推奨
  if (info.isWebGL2Supported) {
    return 'webgl';
  }

  // WebGL1しか使えない場合でもNvidia/AMDなら推奨
  if (info.isWebGLSupported && (info.vendorType === 'nvidia' || info.vendorType === 'amd')) {
    return 'webgl';
  }

  // ソフトウェアレンダラーの場合はCanvas 2Dを推奨
  if (info.renderer.toLowerCase().includes('swiftshader') || info.renderer.toLowerCase().includes('llvmpipe')) {
    return 'canvas2d';
  }

  // その他のGPU（Intel統合GPUなど）はWebGLを推奨
  if (info.isWebGLSupported) {
    return 'webgl';
  }

  // WebGL非対応の場合はCanvas 2Dにフォールバック
  return 'canvas2d';
}

/**
 * パフォーマンステスト（簡易版）
 */
export async function benchmarkGpu(): Promise<{ fps: number; renderer: string }> {
  const canvas = document.createElement('canvas');
  canvas.width = 1920;
  canvas.height = 1080;

  const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
  if (!gl) {
    return { fps: 0, renderer: 'none' };
  }

  let frameCount = 0;
  const startTime = performance.now();
  const duration = 1000; // 1秒間測定

  return new Promise((resolve) => {
    function render() {
      if (performance.now() - startTime < duration) {
        // 簡易的な描画テスト
        gl.clearColor(Math.random(), Math.random(), Math.random(), 1.0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        frameCount++;
        requestAnimationFrame(render);
      } else {
        const elapsed = performance.now() - startTime;
        const fps = Math.round((frameCount / elapsed) * 1000);
        resolve({ fps, renderer: 'webgl' });
      }
    }
    render();
  });
}
