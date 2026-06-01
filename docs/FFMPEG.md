# FFmpeg.wasm in this fork

## What runs in the browser

MP4 generation uses **`@ffmpeg/ffmpeg` (0.10.x API)** with **`@ffmpeg/core@0.10.0`**.

### Why self-hosted core files?

Core scripts and WASM are **copied into `public/ffmpeg-core/`** at install/build time (`scripts/copy-ffmpeg-core.cjs`) and loaded from the **same origin** as the app. This avoids runtime dependency on a public CDN (e.g. unpkg) for the FFmpeg core.

The app builds `corePath` using `next/config` `publicRuntimeConfig.assetBasePath` so it works for:

- Default Next.js (path `/ffmpeg-core/…`)
- Static export under **`/visualizer`** (`/visualizer/ffmpeg-core/…`)

### Cross-origin isolation

SharedArrayBuffer requires **cross-origin isolation**:

- `Cross-Origin-Opener-Policy: same-origin`
- `Cross-Origin-Embedder-Policy: require-corp`

These are set in `next.config.js`, `htaccess-for-export`, or any equivalent static server configuration you use for deployment.

### Logging

FFmpeg verbose logging is enabled only when `NODE_ENV === "development"`.

### MP4 cover art (`attached_pic`)

After WebM → MP4 remux (and optional loudnorm), the encoder may embed a JPEG as **`attached_pic`**:

1. **Caller JPEG** — optional `thumbnailJpeg` argument to `generateMp4Video` (from `lib/mp4Thumbnail.ts` rasterizing the active gallery `HTMLImageElement`). This is a **still image only** (resize to long edge ≤ 1920 and optional fit within export resolution; JPEG encode). **No** spectrum, screen-motion, or fade baked into the thumbnail.
2. **Fallback** — if no JPEG was supplied (no still background, video-only background, or encode failed), ffmpeg.wasm runs `extractVideoFrameThumbnailJpeg` on the finished MP4: **frame 0 of the encoded video** (scaled, long edge ≤ 1920). That frame is the **recorded canvas output** (background + spectrum + effects), not an unprocessed source file.
3. **Mux** — second pass: `-map 0 -map 1 -c copy -c:v:1 mjpeg -disposition:v:1 attached_pic` (with a copy-only fallback if `mjpeg` is unavailable).

**Standard UI** (`pages/index.tsx` `onRecordMovie`): when `backgroundMediaMode === "stills"` and a gallery image is loaded, `buildMp4StillThumbnailJpeg` passes the **unprocessed still** before FFmpeg remux.

**QuickVideoEncoder** (`lib/QuickVideoEncoder.ts`, UI hidden): uses the same `buildMp4StillThumbnailJpeg` path when stills are active; otherwise first-frame fallback.

If attachment fails, export still succeeds; a warning is logged. Some SNS apps ignore embedded cover art and use their own first-frame preview.

See also [SESSION_20260601.md](./SESSION_20260601.md) (MP4 frame 0 table, JA).

---

## Upstream PR #23 (`update_ffmpeg_wasm`)

The upstream repository has an open PR proposal to move to **`@ffmpeg/ffmpeg` ^0.12** and **`@ffmpeg/core` 0.12.10**, loading from **jsDelivr** via `toBlobURL`.

**This fork does not merge that PR as-is.** Differences:

| Topic | Upstream PR #23 | This fork |
|-------|-----------------|-----------|
| Package line | 0.12.x + `@ffmpeg/util` | 0.10.x |
| API | `new FFmpeg()` | `createFFmpeg()` |
| Core delivery | jsDelivr CDN | Same-origin `public/ffmpeg-core` |
| Extras | Simpler encode path in diff | loudnorm / progress callbacks kept |

If you adopt 0.12 later, plan to:

1. Port `lib/Ffmpeg.ts` to the new API.
2. Either keep jsDelivr **or** copy **0.12 UMD** artifacts into `public/` and point `toBlobURL` / load URLs at your origin (recommended for supply-chain parity with this fork’s approach).

---

## 日本語

- **コア WASM** は CDN ではなく **`public/ffmpeg-core`** から同一オリジン配信
- **COOP/COEP** が無いと SharedArrayBuffer が使えず MP4 変換が失敗し得る
- **上流 PR #23** は 0.12 系＋ jsDelivr 方向。本フォークは 0.10 系＋自前配信で別方針
- **サムネ埋め込み**: 静止画背景＋ギャラリー画像あり時は **原画の JPEG**（リサイズのみ）。それ以外は **エンコード済み MP4 の先頭フレーム**（合成映像）。`attached_pic` が wasm で使えない場合は MP4 本体のみ出力（失敗扱いにしない）
