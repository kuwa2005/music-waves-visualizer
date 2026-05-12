import type { SubtitleCue } from "./subtitles";

/** Suno 等の `[tag]` を除去（ネストした `[[...]]` も繰り返し除去）してトリム */
export function stripSunoControlTags(line: string): string {
  let s = line.trimEnd();
  let prev = "";
  while (s !== prev) {
    prev = s;
    s = s.replace(/\[[^\]]*\]/g, "");
  }
  return s.trim();
}

/**
 * 歌詞テキストから行配列へ。空行スキップ、`[]` タグ除去後に空ならスキップ。
 */
export function parseLyricsLinesFromSuno(raw: string): string[] {
  const lines = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const out: string[] = [];
  for (const line of lines) {
    const cleaned = stripSunoControlTags(line);
    if (cleaned.length > 0) out.push(cleaned);
  }
  return out;
}

export type PlaybackWindow = { startSec: number; endSec: number };

/**
 * クリップ設定に応じたタイムライン区間 [startSec, endSec]（メディア絶対秒）
 */
export function getPlaybackWindowBounds(
  clip: { full: true } | { full: false; start: number; duration: number },
  mediaDurationSec: number
): PlaybackWindow {
  if (!(mediaDurationSec > 0)) {
    return { startSec: 0, endSec: 0 };
  }
  if (clip.full === true) {
    return { startSec: 0, endSec: mediaDurationSec };
  }
  const start = Math.max(0, Math.min(clip.start, mediaDurationSec));
  const end = Math.max(start, Math.min(clip.start + clip.duration, mediaDurationSec));
  return { startSec: start, endSec: end };
}

/**
 * 区間を行数で均等分割（プレビュー用の下書き）
 */
export function evenSplitCuesInWindow(lines: string[], win: PlaybackWindow): SubtitleCue[] {
  const n = lines.length;
  if (n === 0) return [];
  const span = win.endSec - win.startSec;
  if (!(span > 0)) {
    return lines.map((text) => ({
      startSec: win.startSec,
      endSec: Math.min(win.endSec, win.startSec + 0.5),
      text,
    }));
  }
  const cues: SubtitleCue[] = [];
  for (let i = 0; i < n; i++) {
    const s = win.startSec + (span * i) / n;
    const e = i === n - 1 ? win.endSec : win.startSec + (span * (i + 1)) / n;
    const endSec = Math.max(s + 0.02, e);
    cues.push({ startSec: s, endSec, text: lines[i] });
  }
  return cues;
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function formatSrtTimestamp(sec: number): string {
  if (!Number.isFinite(sec)) sec = 0;
  const ms = Math.round(sec * 1000);
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const z = ms % 1000;
  return `${pad2(h)}:${pad2(m)}:${pad2(s)},${String(z).padStart(3, "0")}`;
}

/** SubtitleCue[] を標準 SRT テキストへ */
export function formatSrtFromCues(cues: SubtitleCue[]): string {
  const sorted = [...cues].sort((a, b) => a.startSec - b.startSec);
  const blocks: string[] = [];
  let idx = 1;
  for (const c of sorted) {
    if (!c.text.trim()) continue;
    if (!(c.endSec > c.startSec)) continue;
    blocks.push(
      `${idx}\n${formatSrtTimestamp(c.startSec)} --> ${formatSrtTimestamp(c.endSec)}\n${c.text.trim()}\n`
    );
    idx++;
  }
  return blocks.join("\n");
}

/** 全キューの開始・終了に秒差分を加算（クリップ後も絶対タイムライン上でシフト） */
export function shiftCuesBySeconds(cues: SubtitleCue[], deltaSec: number): SubtitleCue[] {
  return cues.map((c) => ({
    ...c,
    startSec: Math.max(0, c.startSec + deltaSec),
    endSec: Math.max(0, c.endSec + deltaSec),
  }));
}
