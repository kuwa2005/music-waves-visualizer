# Security notes (fork)

This document summarizes **hardening choices** in this fork. It is not a formal penetration test or certification.

## HTTP headers

- **Next.js** (`next.config.js`): `Cross-Origin-Opener-Policy`, `Cross-Origin-Embedder-Policy` (required for SharedArrayBuffer / FFmpeg WASM), plus `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`.
- **Apache** (`htaccess-for-export` → copied to `visualizer/.htaccess`): same when `mod_headers` is enabled.
- **Other static servers**: configure the same headers if you serve `visualizer/` from nginx or another web server.

A **Content Security Policy (CSP)** is not enabled globally yet because it must be tuned around any third-party assets you add.

## User-supplied files (client-side)

`lib/fileValidation.ts` enforces:

- **Size limits** (images vs audio/video) to reduce memory exhaustion in the tab.
- **MIME type checks** in addition to extension checks (with pragmatic allowances for empty or `application/octet-stream` types).

Settings JSON import is limited to **2 MB**.

## Dependencies

Run periodically:

```bash
npm audit --legacy-peer-deps
```

Some **Next.js** advisories may only clear after a **major** upgrade (e.g. to Next 15/16). Track separately; upgrading requires full regression testing (especially FFmpeg and static export).

## Reporting issues

Use **GitHub Issues** on this fork for fork-specific security or hardening questions. For upstream-only bugs, consider [komura-c/music-waves-visualizer](https://github.com/komura-c/music-waves-visualizer).

---

## 日本語（要約）

- **ヘッダー**: COOP/COEP に加え、nosniff・フレーム制限・Referrer を Next / Apache / 任意の静的サーバーで設定
- **ファイル**: サイズ上限・MIME 補助・設定 JSON のサイズ上限
- **依存関係**: `npm audit` は定期実行。Next の重大指摘はメジャーアップでしか解消しない場合あり
