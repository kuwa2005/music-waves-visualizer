# Static package: local run & GitHub Release bundle

**Music Waves Visualizer (改)** — static HTML build (`visualizer/`) and how to run it locally or on a server.

---

## English

### 1. What you have

**GitHub Release ZIP** (or equivalent folder) usually contains:

| Item | Purpose |
|------|---------|
| `visualizer/` | **Complete static site** — `index.html`, `_next/`, `ffmpeg-core/`, `.htaccess`, `README.txt`. This is the same output as `npm run build:html` in the full repository. |
| `INSTALL_LOCAL_STATIC.md` | This guide (copy at ZIP root). |
| `docs-bundled/` | License, changelog, hosting notes, FFmpeg/headers, nginx sample, build hints, terms/privacy (copies for offline reading). |

**You do not need Node.js on the machine that only hosts the static files** — any static file server (or Apache/nginx) is enough.

### 2. “Can I just copy `visualizer/` and open it?”

**Almost — with two important rules:**

1. **Do not use `file://`**  
   Open the app only via **`http://` or `https://`**. Browsers block modules and WASM reliably only in a normal HTTP context.

2. **URL path must be `/visualizer/`**  
   This build is configured with Next.js `basePath` / `assetPrefix` **`/visualizer`**. Assets load from `/visualizer/_next/...` and `/visualizer/ffmpeg-core/...`.  
   So the folder on disk should be named `visualizer` under your web root, and you must open:

   `https://your-host/visualizer/`  
   (trailing slash recommended.)

   If you need another path (e.g. `/mwv`), you must change `next.config.js` in the **source repo** and run `npm run build:html` again. See `docs-bundled/HTML_HOSTING.md`.

### 3. Minimal local folder layout

```
parent/
  visualizer/
    index.html
    _next/
    ffmpeg-core/
    .htaccess
    README.txt
```

Serve **`parent`** as the web root (not `visualizer` itself as the root site).

### 4. Quick local HTTP (limitations)

From `parent/`:

```bash
python3 -m http.server 8080
```

Then open: **`http://127.0.0.1:8080/visualizer/`**

**Caution:** Python’s built-in server does **not** send:

- `Cross-Origin-Opener-Policy: same-origin`
- `Cross-Origin-Embedder-Policy: require-corp`

Without these, **SharedArrayBuffer** may be unavailable and **MP4 export (FFmpeg.wasm) can fail**, even if the waveform **preview** seems fine.

For full functionality locally, use **Apache** (with `.htaccess` + `mod_headers`), **nginx** with the same headers, or the project’s **Docker HTTPS** setup (clone the full repo). See `docs-bundled/nginx-static-https.conf` and `docs-bundled/docs/FFMPEG.md`.

### 5. Apache (shared hosting)

Upload **everything inside** `visualizer/` to e.g. `public_html/visualizer/`.

- `.htaccess` sets COOP/COEP **when `mod_headers` is enabled**.
- If MP4 fails, ask your host to enable `mod_headers` or set the same headers in the control panel.

### 6. nginx / Docker HTTPS (recommended for LAN testing)

From a **full clone** of the repository (not only this ZIP):

```bash
./generate-ssl-cert.sh <server-IP>    # first time only
docker compose -f docker-compose.https.yml up -d --build
```

Access: `https://<server-IP>:8443/visualizer/`

Self-signed certificate: use the browser “Advanced” → proceed once.

### 7. Common mistakes

| Symptom | Likely cause |
|---------|----------------|
| Blank page or 404 for `/_next/...` | Served at wrong path (not under `/visualizer/`) or missing `_next/` upload |
| Preview OK, MP4 fails | Missing COOP/COEP headers (see §4) |
| Works on HTTPS but not HTTP on remote host | Some browsers require **secure context** for certain APIs; prefer HTTPS for remote access |

### 8. Rebuild from source

To regenerate `visualizer/` yourself:

```bash
npm install --legacy-peer-deps
npm run build:html
```

See `docs-bundled/docs/BUILD.md`.

---

## 日本語

### 1. 同梱物の目安

| 項目 | 内容 |
|------|------|
| `visualizer/` | **静的サイト一式**（`npm run build:html` の出力と同じ）。レンタルサーバやローカル配信用。 |
| `INSTALL_LOCAL_STATIC.md` | 本手順書（ZIP ルートに配置）。 |
| `docs-bundled/` | ライセンス、変更履歴、ホスティング・FFmpeg・nginx サンプル、ビルド手順、利用規約・プライバシーなどのコピー。 |

**静的配信だけなら Node.js は不要**です。

### 2. 「`visualizer` をコピーするだけで動く？」

**原則は Yes** ですが、次の 2 点に注意してください。

1. **`file://` で開かない** — 必ず **`http://` または `https://`** でアクセスする。  
2. **URL は `/visualizer/` 配下** — ビルドは **`/visualizer` ベース**です。Web ルート直下の `visualizer` フォルダに中身を置き、  
   `https://ドメイン/visualizer/` で開いてください。  
   別パスにしたい場合はリポジトリ側で `next.config.js` を変えてから `npm run build:html` が必要です（`docs-bundled/HTML_HOSTING.md`）。

### 3. ローカルでの最短手順

`visualizer` の**ひとつ上**のディレクトリをドキュメントルートにして HTTP サーバを立て、`http://127.0.0.1:ポート/visualizer/` を開きます。

**注意:** `python3 -m http.server` だけでは **COOP/COEP ヘッダが付きません**。プレビューは動いても **MP4 出力が失敗することがあります**。本番同等の動作には Apache（`.htaccess` + `mod_headers`）、nginx、またはリポジトリの Docker HTTPS を推奨します。

### 4. よくあるつまずき

- **`_next` が 404** → パスが `/visualizer/` になっていない、または `_next` をアップし忘れ。  
- **MP4 だけ失敗** → クロスオリジン分離用ヘッダ不足（上記）。  
- **リモートで HTTP だけ** → ブラウザの制約で HTTPS の方が安全です。

### 5. ソースから再ビルド

```bash
npm install --legacy-peer-deps
npm run build:html
```

詳細は `docs-bundled/docs/BUILD.md` を参照してください。

---

## License / ライセンス

See `docs-bundled/LICENSE` and `docs-bundled/NOTICE`.  
MIT. Based on [komura-c/music-waves-visualizer](https://github.com/komura-c/music-waves-visualizer).
