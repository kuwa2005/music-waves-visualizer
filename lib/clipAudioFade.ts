import { getPlaybackWindowBounds } from "./srtAuthoring";

export type ResolvedClip = { full: true } | { full: false; start: number; duration: number };

export type ShortOutputLimitPreset = "all" | "youtube" | "niconico" | "custom";

/** 動画長の上限（秒数）が明示されているか。OFF・任意（秒数空欄）は false */
export function isShortOutputMaxLengthSpecified(
  preset: ShortOutputLimitPreset,
  durationStr: string
): boolean {
  if (preset === "all") return false;
  if (preset === "youtube" || preset === "niconico") return true;
  return parseExplicitDurationSec(durationStr) != null;
}

/**
 * 音声フェードアウト・MP4 長さの基準秒数。
 * 上限あり: 切り出し区間の長さ。上限なし: 曲全体（開始オフセット時は開始〜曲末まで）。
 */
export function getEffectiveMaxDurationSec(
  clip: ResolvedClip,
  mediaDurationSec: number,
  maxLengthSpecified: boolean
): number {
  if (!(mediaDurationSec > 0)) return 0;
  if (!maxLengthSpecified) {
    if (clip.full) return mediaDurationSec;
    if (clip.full === false) {
      return Math.max(0, mediaDurationSec - clip.start);
    }
    return 0;
  }
  return getAudibleSegmentSec(clip, mediaDurationSec);
}

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

/** 再生・録画・MP4 の可聴区間長（秒） */
export function getAudibleSegmentSec(clip: ResolvedClip, mediaDurationSec: number): number {
  if (!(mediaDurationSec > 0)) return 0;
  if (clip.full) return mediaDurationSec;
  const win = getPlaybackWindowBounds(clip, mediaDurationSec);
  return Math.max(0, win.endSec - win.startSec);
}

/**
 * 音設定の音声フェード。
 * フェードイン: 区間先頭から fadeIn 秒。
 * フェードアウト: 区間末尾で無音になるよう、st = segmentSec - fadeOut から fadeOut 秒。
 */
export function resolveAudioFadeSchedule(
  segmentSec: number,
  audioFadeInSecRaw: number,
  audioFadeOutSecRaw: number
): ClipFadeSchedule {
  if (!(segmentSec > 0)) {
    return { fadeInSec: 0, fadeOutSec: 0, segmentSec: 0, applyFadeOut: false };
  }
  return {
    fadeInSec: effectiveFadeSec(audioFadeInSecRaw, segmentSec),
    fadeOutSec: effectiveFadeSec(audioFadeOutSecRaw, segmentSec),
    segmentSec,
    applyFadeOut: audioFadeOutSecRaw > 0,
  };
}

/** FFmpeg -af 用（afade in/out をカンマ連結） */
export function buildFfmpegAfadeFilter(
  segmentSec: number,
  audioFadeInSecRaw: number,
  audioFadeOutSecRaw: number
): string | null {
  const { fadeInSec, fadeOutSec, segmentSec: seg } = resolveAudioFadeSchedule(
    segmentSec,
    audioFadeInSecRaw,
    audioFadeOutSecRaw
  );
  if (!(seg > 0)) return null;

  let fadeIn = fadeInSec;
  let fadeOut = fadeOutSec;
  fadeIn = Math.min(fadeIn, seg);
  fadeOut = Math.min(fadeOut, seg);
  if (fadeIn > 0 && fadeOut > 0 && fadeIn + fadeOut > seg) {
    fadeIn = effectiveFadeSec(fadeIn, seg);
    fadeOut = effectiveFadeSec(fadeOut, seg);
  }

  const parts: string[] = [];
  if (fadeIn > 0) {
    parts.push(`afade=t=in:st=0:d=${fadeIn}`);
  }
  if (fadeOut > 0) {
    const d = Math.min(fadeOut, seg);
    const st = Math.max(0, Math.min(seg - d, seg - 1e-3));
    parts.push(`afade=t=out:st=${st}:d=${d}`);
  }
  return parts.length > 0 ? parts.join(",") : null;
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

/**
 * 早期停止: 停止時点のゲインから fadeOutSec かけて 0 へ（自然終了の末尾フェードとは別）。
 */
export function scheduleEarlyStopGainFade(
  gain: GainNode,
  audioCtx: AudioContext,
  fadeOutSecRaw: number
): boolean {
  const fadeOutSec = fadeOutSecRaw > 0 ? fadeOutSecRaw : 0;
  if (!(fadeOutSec > 0)) return false;
  const t = audioCtx.currentTime;
  gain.gain.cancelScheduledValues(t);
  const current = gain.gain.value;
  gain.gain.setValueAtTime(current, t);
  gain.gain.linearRampToValueAtTime(0, t + fadeOutSec);
  return true;
}
