# Developer Mode

When enabled, developer mode provides FPS display and other dev features.

Settings save, export, and import are available **without** developer mode.

## Enabling

Set one of these environment variables:

### Local

Create `.env.local`:

```bash
NEXT_PUBLIC_DEVELOPER_MODE=true
# or
NEXT_PUBLIC_DEV_MODE=true
```

## Settings Export/Import (no developer mode required)

- **Export**: Download all settings as JSON
- **Import**: Overwrite existing keys only (backward compatible)
- **Clear**: Delete all saved settings

## On-screen metrics (Settings tab)

When developer mode is on, the **Settings** tab shows a small HUD (refreshed every 1 s):

| Metric | Source | Notes |
|--------|--------|-------|
| **FPS** | `getFPS()` / `getFPSWebGL()` | Green ≥55, orange ≥30, red below |
| **字幕レイヤー生成** | `getSubtitlePerfMetrics().layerBuildMs` | Last on-demand Canvas2D layer build for active cue |
| **字幕プリフェッチ** | `getSubtitlePerfMetrics().prefetchBuildMs` | Last idle prefetch of the *next* cue layer |
| **字幕テクスチャUP** | `getSubtitleTextureUploadMs()` | WebGL only — last `texImage2D` / `texSubImage2D` for subtitle slot |
| **タイトルテクスチャUP** | `getTitleTextureUploadMs()` | WebGL only — same for title overlay |

Implementation: `pages/index.tsx` (`useEffect` interval), `lib/subtitles.ts`, `lib/WebGLRenderer.ts`.

Use these to verify subtitle cue switches and WebGL texture upload cost after SRT or style changes. Set `DEBUG_SUBTITLES` / `DEBUG_WEBGL` in lib sources for console detail.

## Release

Disable for production:

```bash
NEXT_PUBLIC_DEVELOPER_MODE=false
# or omit the variable
```

---

## 日本語

### 有効化

- **ローカル**: `.env.local` に `NEXT_PUBLIC_DEVELOPER_MODE=true`

### 設定の保存・エクスポート/インポート

開発者モードなしでも利用可能です。エクスポートは全設定をJSONで出力、インポートは存在する項目のみ上書きします。

### 画面上の計測（設定タブ）

開発者モード ON 時、**設定**タブに FPS と字幕まわりの ms 表示があります（1 秒ごと更新）。

- **字幕レイヤー生成** — 現在キューの Canvas2D レイヤー構築時間
- **字幕プリフェッチ** — 次キューを `requestIdleCallback` で先行構築した時間
- **字幕 / タイトルテクスチャUP** — WebGL 選択時のみ。テクスチャアップロードの直近 ms

詳細は英語セクション **On-screen metrics** を参照。
