/**
 * アプリ設定永続化ユーティリティ。
 * 現在は localStorage を正とし、旧 Cookie 保存値は読み込み時に一度だけ移行する。
 */

const MAX_STORAGE_KEY_LENGTH = 128;
const MAX_STORAGE_VALUE_LENGTH = 200_000;

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

function isValidStorageKey(storageKey: string): boolean {
  return storageKey.length > 0 && storageKey.length <= MAX_STORAGE_KEY_LENGTH;
}

function isValidStorageValue(value: string): boolean {
  return value.length <= MAX_STORAGE_VALUE_LENGTH;
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

/**
 * localStorage に保存。
 * 旧Cookieキーが残っている場合はヘッダ肥大化防止のため削除する。
 */
export function mwvSetItem(storageKey: string, value: string): void {
  if (typeof window === "undefined") return;
  if (!isValidStorageKey(storageKey)) {
    console.warn("mwvSetItem skipped: invalid key length", storageKey);
    return;
  }
  if (!isValidStorageValue(value)) {
    console.warn("mwvSetItem skipped: value too large", storageKey, value.length);
    return;
  }
  try {
    localStorage.setItem(storageKey, value);
    clearChunksForKey(storageKey);
  } catch (e) {
    console.error("mwvSetItem failed:", storageKey, e);
  }
}

/**
 * localStorage を優先して読む。
 * localStorage に無く、旧Cookie保存値があれば一度だけ localStorage へ移行し、Cookie は削除する。
 */
export function mwvGetItem(storageKey: string): string | null {
  if (typeof window === "undefined") return null;
  if (!isValidStorageKey(storageKey)) return null;
  try {
    const fromLocalStorage = localStorage.getItem(storageKey);
    if (fromLocalStorage != null) return fromLocalStorage;

    const fromCookie = readFromCookiesOnly(storageKey);
    if (fromCookie != null) {
      if (isValidStorageValue(fromCookie)) {
        localStorage.setItem(storageKey, fromCookie);
      } else {
        console.warn("mwvGetItem migration skipped: cookie value too large", storageKey, fromCookie.length);
      }
      clearChunksForKey(storageKey);
      return fromCookie;
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
