# Security notes (fork)

This document summarizes **hardening choices** in this fork. It is not a formal penetration test or certification.

## HTTP headers

- **Next.js (standalone)** (`next.config.js`): `Cross-Origin-Opener-Policy`, `Cross-Origin-Embedder-Policy` (required for SharedArrayBuffer / FFmpeg WASM), plus `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`.
- **nginx** (`nginx-static-https.conf`): same set for static HTTPS deployment.
- **Apache** (`htaccess-for-export` → copied to `visualizer/.htaccess`): same when `mod_headers` is enabled.

A **Content Security Policy (CSP)** is not enabled globally yet because it must be tuned around Google Analytics and any third-party assets.

## Google Analytics

`NEXT_PUBLIC_GOOGLE_ANALYTICS_ID` is validated (`lib/gaId.ts`): only **GA4** `G-…` or legacy **UA** `UA-…` patterns are accepted. Invalid values disable GA loading. Inline bootstrap uses `JSON.stringify` for the measurement ID.

## User-supplied files (client-side)

`lib/fileValidation.ts` enforces:

- **Size limits** (images vs audio/video) to reduce memory exhaustion in the tab.
- **MIME type checks** in addition to extension checks (with pragmatic allowances for empty or `application/octet-stream` types).

Settings JSON import is limited to **2 MB**.

## Docker

- **`Dockerfile`**: `NEXT_PUBLIC_DEVELOPER_MODE` defaults to **`false`** via `ARG`. Pass `--build-arg NEXT_PUBLIC_DEVELOPER_MODE=true` only for intentional dev builds.
- **`npm ci --legacy-peer-deps`**: required for consistent installs (peer dependency constraints).

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

- **ヘッダー**: COOP/COEP に加え、nosniff・フレーム制限・Referrer を nginx / Apache / Next 本番に設定
- **GA**: 測定 ID はホワイトリスト検証。不正なら読み込まない
- **ファイル**: サイズ上限・MIME 補助・設定 JSON のサイズ上限
- **Docker**: 本番イメージでは開発者モード既定 OFF（`ARG`）
- **依存関係**: `npm audit` は定期実行。Next の重大指摘はメジャーアップでしか解消しない場合あり
