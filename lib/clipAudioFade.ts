import { getPlaybackWindowBounds } from "./srtAuthoring";

export type ResolvedClip = { full: true } | { full: false; start: number; duration: number };

export function parseFadeSecStr(value: string): number {
  const n = parseFloat(String(value).replace(",", "."));
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

/** 秒数欄が空でなければユーザー指定の長さ（秒） */
export function parseExplicitDurationSec(durationStr: string): number | null {
  if (!durationStr.trim()) return null;
  const n = parseFloat(durationStr.replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

/**
 * 実際の区間長がユーザー指定の動画長と一致し、メディア末尾より前で切り詰めているときのみフェードアウト
 */
export function shouldApplyClipFadeOut(
  clip: ResolvedClip,
  mediaDurationSec: number,
  explicitDurationSec: number | null
): boolean {
  if (clip.full || explicitDurationSec == null || !(explicitDurationSec > 0)) {
    return false;
  }
  if (!(mediaDurationSec > 0)) return false;
  const win = getPlaybackWindowBounds(clip, mediaDurationSec);
  const segLen = win.endSec - win.startSec;
  return Math.abs(segLen - explicitDurationSec) < 0.02;
}

export function effectiveFadeSec(fadeSec: number, segmentSec: number): number {
  if (!(fadeSec > 0) || !(segmentSec > 0)) return 0;
  return Math.min(fadeSec, segmentSec / 2);
}

export type ClipFadeSchedule = {
  fadeInSec: number;
  fadeOutSec: number;
  segmentSec: number;
  applyFadeOut: boolean;
};

export function resolveClipFadeSchedule(
  clip: ResolvedClip,
  mediaDurationSec: number,
  fadeInSecRaw: number,
  fadeOutSecRaw: number,
  explicitDurationSec: number | null
): ClipFadeSchedule {
  if (clip.full || !(mediaDurationSec > 0)) {
    return { fadeInSec: 0, fadeOutSec: 0, segmentSec: 0, applyFadeOut: false };
  }
  const win = getPlaybackWindowBounds(clip, mediaDurationSec);
  const segmentSec = win.endSec - win.startSec;
  if (!(segmentSec > 0)) {
    return { fadeInSec: 0, fadeOutSec: 0, segmentSec: 0, applyFadeOut: false };
  }
  const applyFadeOut = shouldApplyClipFadeOut(clip, mediaDurationSec, explicitDurationSec);
  return {
    fadeInSec: effectiveFadeSec(fadeInSecRaw, segmentSec),
    fadeOutSec: applyFadeOut ? effectiveFadeSec(fadeOutSecRaw, segmentSec) : 0,
    segmentSec,
    applyFadeOut,
  };
}

export function resetClipGain(gain: GainNode, audioCtx: AudioContext): void {
  const t = audioCtx.currentTime;
  gain.gain.cancelScheduledValues(t);
  gain.gain.setValueAtTime(1, t);
}

export function scheduleClipGainFade(
  gain: GainNode,
  audioCtx: AudioContext,
  schedule: ClipFadeSchedule,
  playbackStartTime: number
): void {
  const { fadeInSec, fadeOutSec, segmentSec, applyFadeOut } = schedule;
  if (!(segmentSec > 0) || (fadeInSec <= 0 && fadeOutSec <= 0)) {
    resetClipGain(gain, audioCtx);
    return;
  }

  const t0 = playbackStartTime;
  gain.gain.cancelScheduledValues(t0);

  if (fadeInSec > 0) {
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(1, t0 + fadeInSec);
  } else {
    gain.gain.setValueAtTime(1, t0);
  }

  if (applyFadeOut && fadeOutSec > 0) {
    const fadeOutStart = t0 + segmentSec - fadeOutSec;
    if (fadeOutStart > t0 + fadeInSec) {
      gain.gain.setValueAtTime(1, fadeOutStart);
    }
    gain.gain.linearRampToValueAtTime(0, t0 + segmentSec);
  }
}
