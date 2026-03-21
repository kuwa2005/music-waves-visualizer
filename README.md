# Music Waves Visualizer (Modified)

A web application that creates audio waveform videos by loading image and music files.

## Demo

https://lil.la/visualizer/

### Screenshot

<a href="./Image.jpg" target="_blank">
  <img src="./Image.jpg" alt="Music Waves Visualizer screenshot" width="600" style="max-width: 100%; height: auto;">
</a>

*Click the image for full size*

## Features

- **File loading**: Drag & drop or button to load image and audio files
- **Auto image scaling**: Loaded images are scaled to recommended resolution (1920×1080, etc.) with aspect ratio preserved
- **Spectrum analyzer**: OFF plus **5 selectable styles** in the UI (frequency bars, circle, symmetric bars, dots, glyco). *Line (mode 1) and symmetric waveform (mode 5) remain in the engine but are hidden from the toolbar; old saved sessions using those modes fall back to frequency bars.*
- **3 resolutions**: 1920×1080, 1080×1920, 1920×1920
- **Display & volume settings**: Scale/position adjustment (saved per layout), target LUFS (YouTube -14, NicoNico -15, custom)
- **Effects**: Space (3 types), vignette, rainbow, curtain, sparkle (きらきら), dust (atmosphere). Shown during preview/recording only. Per-effect strength (weak/medium/strong). Sparkle/dust use compact rendering (no large radial glow halos)
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
npm install && npm run dev
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
3. **Select resolution**: Choose from 3 resolutions
4. **Display & volume (optional)**: Scale, position, target LUFS
5. **Effects (optional)**: Space, vignette, rainbow, curtain, sparkle, dust
6. **Preview**: Play music and view waveform
7. **Generate video**: Output MP4 (do not switch windows during generation)
8. **Clear**: Reset to initial state

See [SPECIFICATION.md](./SPECIFICATION.md) for details.

## Documentation

- **[SPECIFICATION.md](./SPECIFICATION.md)**: Technical spec and feature details
- **[README_DOCKER.md](./README_DOCKER.md)**: Docker usage
- **[SERVER_REQUIREMENTS.md](./SERVER_REQUIREMENTS.md)**: Shared hosting requirements
- **[SERVER_REQUIREMENTS_DOCKER.md](./SERVER_REQUIREMENTS_DOCKER.md)**: Local/Docker requirements
- **[DEVELOPER_MODE.md](./DEVELOPER_MODE.md)**: Developer mode
- **[CHANGELOG.md](./CHANGELOG.md)**: Changelog
- **[USER_TERMS.md](./USER_TERMS.md)**: Terms of Service (EN + 日本語)
- **[PRIVACY_POLICY.md](./PRIVACY_POLICY.md)**: Privacy policy

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
- **スペクトラムアナライザー**: UI では OFF＋5種（周波数バー・円形・上下対称バー・ドット・グライコ風）。折れ線(1)・波形上下対称(5)は描画ロジックのみ残しボタン非表示。旧保存で1/5のときは周波数バーにフォールバック
- **3つの解像度**: 1920×1080、1080×1920、1920×1920
- **表示・音量設定**: 倍率・位置の調整、目標LUFS（YouTube -14、ニコニコ -15、任意値）
- **エフェクト**: 宇宙空間（3種）、ビネット、レインボー、カーテン、きらきら、空気感（ほこり）
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

- [仕様書.md](./仕様書.md): 技術仕様と機能詳細
- [README_DOCKER.md](./README_DOCKER.md): Dockerの使い方
- [サーバー要件.md](./サーバー要件.md): レンタルサーバー用要件
- [サーバー要件(local docker)用.md](./サーバー要件(local%20docker)用.md): ローカル・Docker用
- [DEVELOPER_MODE.md](./DEVELOPER_MODE.md): 開発者モード
- [CHANGELOG.md](./CHANGELOG.md): 変更履歴
- [USER_TERMS.md](./USER_TERMS.md): 利用規約
- [PRIVACY_POLICY.md](./PRIVACY_POLICY.md): プライバシーポリシー
