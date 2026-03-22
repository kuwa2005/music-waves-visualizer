/**
 * NEXT_PUBLIC_GOOGLE_ANALYTICS_ID のホワイトリスト検証。
 * 不正な値は無視し、インラインスクリプトへの埋め込み事故を防ぐ。
 */
export function parseGoogleAnalyticsId(raw: string | undefined): string | null {
  if (raw == null) return null;
  const s = raw.trim();
  if (!s) return null;
  if (/^G-[A-Z0-9]{1,20}$/i.test(s)) return s;
  if (/^UA-\d{1,10}-\d{1,5}$/.test(s)) return s;
  return null;
}
