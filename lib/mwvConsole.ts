/**
 * ブラウザコンソール用の軽量ログ。
 * - mwvMilestone: 録画〜エンコードの大まかな段階（本番でも console.info）
 * - mwvLog / mwvWarn: development または NEXT_PUBLIC_MWV_CONSOLE=1 または localStorage.mwv_console=1
 * - mwvError: 常に console.error
 */
/** FFmpeg の内部ログなど、より詳細な出力が必要なときに利用 */
export function mwvVerbose(): boolean {
  return isVerboseEnabled();
}

function isVerboseEnabled(): boolean {
  if (typeof window === "undefined") {
    return process.env.NODE_ENV === "development";
  }
  if (process.env.NEXT_PUBLIC_MWV_CONSOLE === "1") return true;
  try {
    if (window.localStorage?.getItem("mwv_console") === "1") return true;
  } catch {
    /* ignore */
  }
  return process.env.NODE_ENV === "development";
}

/** 本番でも出す高シグナル（1セッションあたり数行程度に抑えること） */
export function mwvMilestone(message: string, detail?: Record<string, unknown>): void {
  if (typeof console === "undefined") return;
  if (detail && Object.keys(detail).length > 0) {
    console.info("[MWV]", message, detail);
  } else {
    console.info("[MWV]", message);
  }
}

export function mwvLog(...args: unknown[]): void {
  if (!isVerboseEnabled() || typeof console === "undefined") return;
  console.log("[MWV]", ...args);
}

export function mwvWarn(...args: unknown[]): void {
  if (!isVerboseEnabled() || typeof console === "undefined") return;
  console.warn("[MWV]", ...args);
}

export function mwvError(...args: unknown[]): void {
  if (typeof console === "undefined") return;
  console.error("[MWV]", ...args);
}
