/** オフライン映像のフレーム数・タイムスタンプ（音声サンプル数ベース） */

export type OfflineVideoTiming = {
  audioDurationSec: number;
  audioDurationUs: number;
  totalFrames: number;
  frameDurationSec: number;
};

export function computeOfflineVideoTiming(
  audioBuffer: AudioBuffer,
  frameRate: number
): OfflineVideoTiming {
  const sampleRate = audioBuffer.sampleRate;
  const audioDurationSec = audioBuffer.length / sampleRate;
  const frameDurationSec = 1 / frameRate;
  const totalFrames = Math.max(1, Math.ceil(audioDurationSec * frameRate - 1e-9));
  const audioDurationUs = Math.round((audioBuffer.length / sampleRate) * 1_000_000);
  return { audioDurationSec, audioDurationUs, totalFrames, frameDurationSec };
}

export function offlineVideoFrameTimestampUs(
  frameIdx: number,
  frameDurationSec: number
): number {
  return Math.round(frameIdx * frameDurationSec * 1_000_000);
}

export function offlineVideoFrameDurationUs(
  frameIdx: number,
  totalFrames: number,
  frameDurationSec: number,
  audioDurationUs: number
): number {
  const timestampUs = offlineVideoFrameTimestampUs(frameIdx, frameDurationSec);
  if (frameIdx === totalFrames - 1) {
    return Math.max(1, audioDurationUs - timestampUs);
  }
  return Math.round(frameDurationSec * 1_000_000);
}
