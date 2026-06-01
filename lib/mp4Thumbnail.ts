/** MP4 埋め込み用サムネ JPEG（長辺上限・動画解像度に収める） */
export const MP4_THUMB_MAX_LONG_EDGE = 1920;

export async function imageElementToThumbnailJpeg(
  img: HTMLImageElement,
  maxLongEdge: number = MP4_THUMB_MAX_LONG_EDGE,
  videoWidth?: number,
  videoHeight?: number
): Promise<Uint8Array | null> {
  const nw = img.naturalWidth;
  const nh = img.naturalHeight;
  if (!nw || !nh) return null;

  let w = nw;
  let h = nh;
  const long = Math.max(w, h);
  if (long > maxLongEdge) {
    const scale = maxLongEdge / long;
    w = Math.max(1, Math.round(w * scale));
    h = Math.max(1, Math.round(h * scale));
  }
  if (videoWidth != null && videoHeight != null && videoWidth > 0 && videoHeight > 0) {
    if (w > videoWidth || h > videoHeight) {
      const scale = Math.min(videoWidth / w, videoHeight / h);
      w = Math.max(1, Math.round(w * scale));
      h = Math.max(1, Math.round(h * scale));
    }
  }

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, w, h);

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((b) => resolve(b), "image/jpeg", 0.85);
  });
  if (!blob || blob.size === 0) return null;
  return new Uint8Array(await blob.arrayBuffer());
}
