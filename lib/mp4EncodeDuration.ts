function sanitizePositiveSec(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value) || value <= 0) return null;
  return value;
}

export type RecordStopReason =
  | "user_early"
  | "playback_ended"
  | "clip_window"
  | "video_ended"
  | "unknown";

/** 録画停止時点のスナップショット（finalize で再生時刻が消える前に保存） */
export type RecordEncodeSnapshot = {
  stopReason: RecordStopReason;
  playbackEndSec: number;
  fadeTailSec: number;
};

/** 再生位置ベースの録画尺（停止位置 + グレースフル停止のフェード尾） */
export function playbackSpanRecordedSec(
  snapshot: RecordEncodeSnapshot | null | undefined,
  playbackAnchorSec: number | null | undefined
): number | null {
  if (!snapshot || !Number.isFinite(snapshot.playbackEndSec)) return null;
  const anchor = Number.isFinite(playbackAnchorSec) ? Math.max(0, playbackAnchorSec) : 0;
  const tail = sanitizePositiveSec(snapshot.fadeTailSec) ?? 0;
  const span = Math.max(0, snapshot.playbackEndSec - anchor) + tail;
  return span > 0 ? span : null;
}

/**
 * WebM に載った実尺の推定（秒）。
 * recorder の wall 時計と「再生停止位置+フェード尾」の短い方（長い方は afade がストリーム外になる）。
 */
export function estimateActualRecordedSec(
  wallRecordedSec: number | null | undefined,
  snapshot: RecordEncodeSnapshot | null | undefined,
  playbackAnchorSec: number | null | undefined
): number | null {
  const caps: number[] = [];
  const wall = sanitizePositiveSec(wallRecordedSec);
  const fromPlayback = playbackSpanRecordedSec(snapshot, playbackAnchorSec);
  if (wall != null) caps.push(wall);
  if (fromPlayback != null) caps.push(fromPlayback);
  if (caps.length === 0) return null;
  return Math.min(...caps);
}

/**
 * MP4 の -t / afade 用秒数。計画長・実録画・WebM プローブのうち有効な最小値。
 */
export function resolveMp4EncodeDurationSec(
  plannedSec: number,
  actualRecordingSec?: number | null,
  webmProbeSec?: number | null
): number {
  const caps: number[] = [];
  const planned = sanitizePositiveSec(plannedSec);
  const actual = sanitizePositiveSec(actualRecordingSec);
  const probed = sanitizePositiveSec(webmProbeSec);
  if (planned != null) caps.push(planned);
  if (actual != null) caps.push(actual);
  if (probed != null) caps.push(probed);
  if (caps.length === 0) return 0;
  return Math.min(...caps);
}

/** ffmpeg ログの `Duration: HH:MM:SS.xx` を秒に変換 */
export function parseFfmpegDurationFromLogs(logText: string): number | null {
  const m = logText.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  const sec = Number(m[3]);
  if (![h, min, sec].every(Number.isFinite)) return null;
  const total = h * 3600 + min * 60 + sec;
  return total > 0 ? total : null;
}
