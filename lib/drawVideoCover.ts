/**
 * 動画フレームをキャンバス全体に cover で描画（静止画背景と同じ幾何）。
 */
export function drawVideoCover(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  canvasWidth: number,
  canvasHeight: number
): void {
  const rawW = video.videoWidth || 1;
  const rawH = video.videoHeight || 1;
  const scale = Math.max(canvasWidth / rawW, canvasHeight / rawH);
  const drawW = Math.round(rawW * scale);
  const drawH = Math.round(rawH * scale);
  const x = (canvasWidth - drawW) / 2;
  const y = (canvasHeight - drawH) / 2;
  ctx.drawImage(video, 0, 0, rawW, rawH, x, y, drawW, drawH);
}
