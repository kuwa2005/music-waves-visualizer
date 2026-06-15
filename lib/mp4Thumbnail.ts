/** MP4 埋め込み用サムネ JPEG（長辺上限・動画解像度に収める） */
export const MP4_THUMB_MAX_LONG_EDGE = 1920;

const THUMB_BG_FILL = "rgba(34, 34, 34, 1.0)";

async function ensureImageElementReady(img: HTMLImageElement): Promise<boolean> {
  if (img.naturalWidth > 0 && img.naturalHeight > 0) return true;
  if (typeof img.decode === "function") {
    try {
      await img.decode();
    } catch {
      return false;
    }
    return img.naturalWidth > 0 && img.naturalHeight > 0;
  }
  if (!img.complete) {
    await new Promise<void>((resolve, reject) => {
      const onLoad = () => {
        cleanup();
        resolve();
      };
      const onError = () => {
        cleanup();
        reject(new Error("image load failed"));
      };
      const cleanup = () => {
        img.removeEventListener("load", onLoad);
        img.removeEventListener("error", onError);
      };
      img.addEventListener("load", onLoad);
      img.addEventListener("error", onError);
    });
  }
  return img.naturalWidth > 0 && img.naturalHeight > 0;
}

function fitLongEdge(width: number, height: number, maxLongEdge: number): { width: number; height: number } {
  const long = Math.max(width, height);
  if (long <= maxLongEdge) {
    return { width, height };
  }
  const scale = maxLongEdge / long;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/** キャンバス背景と同じ cover 配置で静止画のみを描画（エフェクト・glyco なし） */
export async function imageElementToThumbnailJpeg(
  img: HTMLImageElement,
  maxLongEdge: number = MP4_THUMB_MAX_LONG_EDGE,
  videoWidth?: number,
  videoHeight?: number
): Promise<Uint8Array | null> {
  if (!(await ensureImageElementReady(img))) return null;

  const rawW = img.naturalWidth || img.width || 1;
  const rawH = img.naturalHeight || img.height || 1;

  let outW =
    videoWidth != null && videoWidth > 0 && videoHeight != null && videoHeight > 0
      ? videoWidth
      : rawW;
  let outH =
    videoWidth != null && videoWidth > 0 && videoHeight != null && videoHeight > 0
      ? videoHeight
      : rawH;
  ({ width: outW, height: outH } = fitLongEdge(outW, outH, maxLongEdge));

  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.fillStyle = THUMB_BG_FILL;
  ctx.fillRect(0, 0, outW, outH);

  const scale = Math.max(outW / rawW, outH / rawH);
  const drawW = Math.round(rawW * scale);
  const drawH = Math.round(rawH * scale);
  const x = (outW - drawW) / 2;
  const y = (outH - drawH) / 2;
  ctx.drawImage(img, 0, 0, rawW, rawH, x, y, drawW, drawH);

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((b) => resolve(b), "image/jpeg", 0.85);
  });
  if (!blob || blob.size === 0) return null;
  return new Uint8Array(await blob.arrayBuffer());
}
