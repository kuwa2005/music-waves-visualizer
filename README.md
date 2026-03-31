# Music Waves Visualizer (Modified)

A web application that creates audio waveform videos by loading image and music files.

## Demo

https://lil.la/visualizer/

Static build with SEO-friendly absolute URLs for that host: `npm run build:html:lil-la` (or `NEXT_PUBLIC_SITE_URL=https://lil.la npm run build:html`). See [docs/BUILD.md](./docs/BUILD.md) and [`.env.production.example`](./.env.production.example).

### Screenshot

<a href="./Image.jpg" target="_blank">
  <img src="./Image.jpg" alt="Music Waves Visualizer screenshot" width="600" style="max-width: 100%; height: auto;">
</a>

*Click the image for full size*

## Features

- **File loading**: Drag & drop or button to load image and audio files
- **Auto image scaling**: Loaded images are scaled to recommended resolution (1920×1080, etc.) with aspect ratio preserved
- **Spectrum analyzer**: OFF plus **5 selectable styles** in the UI (frequency bars, circle, symmetric bars, dots, glyco). *Line (mode 1) and symmetric waveform (mode 5) remain in the engine but are hidden from the toolbar; old saved sessions using those modes fall back to frequency bars.*
- **Resolution mode**: Manual (1920×1080 / 1080×1920 / 1920×1920) and **Auto** (detect from loaded image aspect ratio as 16:9 / 9:16 / 1:1)
- **Clip length limit (short platforms)**: For preview/recording you can limit playback to a window with presets: **YouTube (60s)**, **TikTok (60s)**, **NicoNico (300s)**. Playback starts at the specified start position and ends after the specified duration.
- **Settings tabs**: Spectrum Analyzer / Effects / Audio / Clip Length / Settings
- **Display & volume settings**: Scale/position adjustment (saved per layout), target LUFS (YouTube -14, NicoNico -15, custom)
- **Effects**: Space (select type 1/2/3 in parameter panel), vignette, rainbow, curtain, sparkle (きらきら), dust (atmosphere), rain, snow. Shown during preview/recording only. Per-effect strength (weak/medium/strong). Sparkle/dust use compact rendering (no large radial glow halos)
- **Preview**: Real-time waveform display while playing music
- **Video generation**: MP4 output
- **Settings management**: Export all settings, import with overwrite of existing keys only
- **Clear**: Reset image/music selection and settings to initial state
- **Bilingual UI**: Japanese / English (auto-detected from browser language)

## Quick Start

### Docker HTTPS (recommended for testing)

```bash
./generate-ssl-cert.sh <server-IP>   # First time only
docker compose -f docker-compose.https.yml up -d --build
```

Access: `https://<server-IP>:8443/visualizer/`

- HTTPS is required for remote access and SharedArrayBuffer (FFmpeg video conversion)
- Self-signed certificate: In browser, choose "Advanced" → "Proceed to site"

### Other run methods

```bash
# Production (Next.js standalone)
docker-compose up --build

# Development
docker-compose -f docker-compose.dev.yml up --build

# Local development (localhost only)
npm install --legacy-peer-deps && npm run dev
```

See [README_DOCKER.md](./README_DOCKER.md) for details.

### Static HTML for shared hosting

```bash
npm run build:html
```

- The generated `visualizer/` is a **static HTML build** (Next.js `next export` output).
- Default config uses **`/visualizer` path**. Upload to the server's `visualizer` directory.
  - Example: Place `index.html`, `_next/`, `.htaccess` in `public_html/visualizer/`
- For custom paths, see [HTML_HOSTING.md](./HTML_HOSTING.md).

## Usage

1. **Load files**: Drag & drop or use buttons to select image and audio
2. **Select spectrum analyzer**: Choose from the visible modes (OFF + five styles)
3. **Settings > Resolution**: Use Auto or manual 3 layouts
4. **Audio (optional)**: Configure target LUFS
5. **Effects (optional)**: Select effect and adjust parameters (collapsible panel)
6. **Preview**: Play music and view waveform
7. **Generate video**: Output MP4 (do not switch windows during generation)
8. **Clear**: Reset to initial state

See [SPECIFICATION.md](./SPECIFICATION.md) for details.

## Documentation

- **[docs/README.md](./docs/README.md)**: Documentation hub (build, security, FFmpeg)
- **[docs/BUILD.md](./docs/BUILD.md)**: Install (`--legacy-peer-deps`), FFmpeg copy, env vars, scripts
- **[docs/SECURITY.md](./docs/SECURITY.md)**: Headers, file limits, Docker, audits
- **[docs/FFMPEG.md](./docs/FFMPEG.md)**: Self-hosted core, COOP/COEP, vs upstream PR #23
- **[SPECIFICATION.md](./SPECIFICATION.md)**: Technical spec and feature details
- **[README_DOCKER.md](./README_DOCKER.md)**: Docker usage
- **[SERVER_REQUIREMENTS.md](./SERVER_REQUIREMENTS.md)**: Shared hosting requirements
- **[SERVER_REQUIREMENTS_DOCKER.md](./SERVER_REQUIREMENTS_DOCKER.md)**: Local/Docker requirements
- **[DEVELOPER_MODE.md](./DEVELOPER_MODE.md)**: Developer mode
- **[CHANGELOG.md](./CHANGELOG.md)**: Changelog
- **[USER_TERMS.md](./USER_TERMS.md)**: Terms of Service (EN + 日本語)
- **[PRIVACY_POLICY.md](./PRIVACY_POLICY.md)**: Privacy policy
- **[EU_GDPR_NOTICE.md](./EU_GDPR_NOTICE.md)**: EU/EEA users — GDPR-related summary (non-legal advice)
- **[docs/INSTALL_LOCAL_STATIC.md](./docs/INSTALL_LOCAL_STATIC.md)**: GitHub Release ZIP / hosting `visualizer/` only (paths, headers, MP4 caveats)

## GitHub Releases

[Releases](https://github.com/kuwa2005/music-waves-visualizer/releases) ship a **static ZIP** (no Node.js needed on the host): `visualizer/` plus **`INSTALL_LOCAL_STATIC.md`** and **`docs-bundled/`** (license, changelog, hosting, FFmpeg, nginx sample, terms/privacy). Maintainer: `npm run release:zip` (runs `npm run build:html` when `visualizer/` is missing).

## Credits

Based on [komura-c/music-waves-visualizer](https://github.com/komura-c/music-waves-visualizer).

Original article: [Creating a Web Page for Audio Waveform Videos](https://tech-blog.voicy.jp/entry/2022/12/11/235929)

## License

MIT License. See [LICENSE](./LICENSE). Dependencies: [NOTICE](./NOTICE).

- Original: Copyright (c) 2023 komura-c
- Modified: Copyright (c) 2022-2026 KURAGASHI (kuwa2005)

---

## 日本語

### 概要

画像と音楽ファイルを読み込んで、音声波形を可視化した動画を作成するWebアプリケーションです。

### 主な機能

- **ファイル読み込み**: ドラッグ&ドロップまたはボタンから画像・音楽ファイルを読み込み
- **画像の自動スケーリング**: 読み込んだ画像を推奨解像度に自動拡大・縮小
- **スペクトラムアナライザー**: UI では周波数系（OFF・周波数バー・円形・上下対称バー・ドット・面塗り・グライコ・オシロ）＋音圧系（パルス・VU・リング・オーブ・背景・粒子・ジオメトリ）。リサージュ(16)・折れ線(1)・波形上下対称(5)は描画ロジックのみ残しボタン非表示
- **解像度モード**: 手動3種（1920×1080、1080×1920、1920×1920）＋**自動**（画像比率から16:9/9:16/1:1を判定）
- **表示・音量設定**: 倍率・位置の調整、目標LUFS（YouTube -14、ニコニコ -15、任意値）
- **字幕（SRT）**: スペアナ/エフェクトの設定パネルから `.srt` を読み込み。位置・種類（プレーン/縁取り/ボックス）・色・フォント・装飾（太字/斜体/縁取り）・表示アニメーション（フェード/スライド/ポップ）を調整可能
- **タイトル**: 「タイトル」タブでテキスト入力。フォントサイズ・字間・揃え・縁取り/ボックス・影・再生時の表示アニメなどを調整可能（Canvas 2D で描画）
- **設定タブ**: スペアナ / エフェクト / 音設定 / 動画長 / 設定
- **エフェクト**: 宇宙空間（タイプ1/2/3はパラメータで選択）、ビネット、レインボー、カーテン、きらきら、空気感（ほこり）、雨、雪
- **プレビュー・動画生成・設定管理・クリア**
- **バイリンガルUI**: ブラウザ言語に応じて日本語/英語を自動切り替え

### クイックスタート

```bash
# Docker HTTPS版（推奨）
./generate-ssl-cert.sh <サーバーIP>
docker compose -f docker-compose.https.yml up -d --build
# アクセス: https://<サーバーIP>:8443/visualizer/

# 静的HTML版（レンタルサーバー用）
npm run build:html
# visualizer/ の中身をサーバーにアップロード
```

### ドキュメント（日本語）

- [docs/README.md](./docs/README.md): ドキュメント索引（ビルド・セキュリティ・FFmpeg）
- [仕様書.md](./仕様書.md): 技術仕様と機能詳細
- [README_DOCKER.md](./README_DOCKER.md): Dockerの使い方
- [サーバー要件.md](./サーバー要件.md): レンタルサーバー用要件
- [サーバー要件(local docker)用.md](./サーバー要件(local%20docker)用.md): ローカル・Docker用
- [DEVELOPER_MODE.md](./DEVELOPER_MODE.md): 開発者モード
- [CHANGELOG.md](./CHANGELOG.md): 変更履歴
- [USER_TERMS.md](./USER_TERMS.md): 利用規約
- [PRIVACY_POLICY.md](./PRIVACY_POLICY.md): プライバシーポリシー
- [EU_GDPR_NOTICE.md](./EU_GDPR_NOTICE.md): EU/EEA 向け GDPR 関連の案内（法的助言ではありません）
- [docs/INSTALL_LOCAL_STATIC.md](./docs/INSTALL_LOCAL_STATIC.md): リリース ZIP・`visualizer/` 単体利用時の手順と注意（パス・ヘッダ・MP4）

### GitHub Releases

[Releases](https://github.com/kuwa2005/music-waves-visualizer/releases) に **静的版 ZIP** を添付しています（配信先に Node.js は不要）。中身は `visualizer/` と **`INSTALL_LOCAL_STATIC.md`**、および **`docs-bundled/`**（ライセンス・変更履歴・ホスティング・FFmpeg・nginx サンプル・規約類）。メンテ用: `npm run release:zip`（`visualizer/` が無いときは `build:html` を実行）。
