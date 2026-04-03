/**
 * アプリ設定用の Cookie 永続化（4KB 超は分割）。
 * 既存 localStorage にだけ値がある場合は読み込み時に Cookie へ移行する。
 */

const MWV_MAX_AGE_SEC = 60 * 60 * 24 * 365;
/** Base64 文字列をこの長さで分割（%エンコード境界の問題を避ける） */
const CHUNK_SIZE = 3000;

function utf8ToBase64(s: string): string {
  const u8 = new TextEncoder().encode(s);
  let bin = "";
  for (let i = 0; i < u8.length; i++) bin += String.fromCharCode(u8[i]!);
  return btoa(bin);
}

function base64ToUtf8(b64: string): string {
  const bin = atob(b64);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(u8);
}

function keyId(storageKey: string): string {
  try {
    return btoa(unescape(encodeURIComponent(storageKey)))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  } catch {
    return "k" + storageKey.replace(/[^a-zA-Z0-9]/g, "_").slice(0, 48);
  }
}

function prefixFor(storageKey: string): string {
  return `mwv_${keyId(storageKey)}`;
}

function readCookieMap(): Map<string, string> {
  const m = new Map<string, string>();
  if (typeof document === "undefined") return m;
  const parts = document.cookie.split("; ");
  for (const pair of parts) {
    if (!pair) continue;
    const eq = pair.indexOf("=");
    if (eq <= 0) continue;
    const name = pair.slice(0, eq).trim();
    m.set(name, pair.slice(eq + 1));
  }
  return m;
}

function writeCookieRaw(name: string, value: string, maxAgeSec: number): void {
  if (typeof document === "undefined") return;
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAgeSec}; samesite=lax`;
}

function deleteCookieName(name: string): void {
  if (typeof document === "undefined") return;
  document.cookie = `${name}=; path=/; max-age=0; samesite=lax`;
}

function clearChunksForKey(storageKey: string): void {
  const p = prefixFor(storageKey);
  const map = readCookieMap();
  const meta = map.get(`${p}__n`);
  deleteCookieName(`${p}__n`);
  deleteCookieName(p);
  if (meta != null) {
    const n = parseInt(meta, 10);
    if (!isNaN(n) && n > 0) {
      for (let i = 0; i < n; i++) {
        deleteCookieName(`${p}__${i}`);
      }
    }
  }
}

function readFromCookiesOnly(storageKey: string): string | null {
  const p = prefixFor(storageKey);
  const map = readCookieMap();
  const meta = map.get(`${p}__n`);
  if (meta == null) {
    const single = map.get(p);
    if (single == null) return null;
    try {
      return base64ToUtf8(decodeURIComponent(single));
    } catch {
      return null;
    }
  }
  const n = parseInt(meta, 10);
  if (isNaN(n) || n <= 0) return null;
  let acc = "";
  for (let i = 0; i < n; i++) {
    const part = map.get(`${p}__${i}`);
    if (part == null) return null;
    try {
      acc += decodeURIComponent(part);
    } catch {
      return null;
    }
  }
  try {
    return base64ToUtf8(acc);
  } catch {
    return null;
  }
}

function writeToCookiesOnly(storageKey: string, value: string): void {
  clearChunksForKey(storageKey);
  const p = prefixFor(storageKey);
  const b64 = utf8ToBase64(value);
  if (b64.length <= CHUNK_SIZE) {
    writeCookieRaw(p, b64, MWV_MAX_AGE_SEC);
    return;
  }
  const parts: string[] = [];
  for (let i = 0; i < b64.length; i += CHUNK_SIZE) {
    parts.push(b64.slice(i, i + CHUNK_SIZE));
  }
  writeCookieRaw(`${p}__n`, String(parts.length), MWV_MAX_AGE_SEC);
  parts.forEach((chunk, i) => {
    writeCookieRaw(`${p}__${i}`, chunk, MWV_MAX_AGE_SEC);
  });
}

/** Cookie に保存（localStorage は触らない） */
export function mwvSetItem(storageKey: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    writeToCookiesOnly(storageKey, value);
  } catch (e) {
    console.error("mwvSetItem failed:", storageKey, e);
  }
}

/** Cookie を読む。無ければ localStorage から移行して返す */
export function mwvGetItem(storageKey: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    const fromCookie = readFromCookiesOnly(storageKey);
    if (fromCookie != null) return fromCookie;
    const legacy = localStorage.getItem(storageKey);
    if (legacy != null) {
      writeToCookiesOnly(storageKey, legacy);
      localStorage.removeItem(storageKey);
      return legacy;
    }
  } catch (e) {
    console.error("mwvGetItem failed:", storageKey, e);
  }
  return null;
}

export function mwvRemoveItem(storageKey: string): void {
  if (typeof window === "undefined") return;
  try {
    clearChunksForKey(storageKey);
    localStorage.removeItem(storageKey);
  } catch (e) {
    console.error("mwvRemoveItem failed:", storageKey, e);
  }
}
