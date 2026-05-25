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

- **File loading**: Drag & drop or buttons for still images, audio, subtitle files, and a single MP4/video background
- **Multi-image gallery**: Add multiple still images, auto-advance them during playback/recording, and apply transitions such as crossfade, wipe, slide, zoom, checker, and flash
- **Spectrum visualizers**: Frequency and loudness modes including bars, circle, symmetric bars, dots, fill, glyco, loudness pulse, VU meter, pulse ring, center orb, breathing background, particles, geometry morph, oscilloscope, and Lissajous-style curves
- **Title and subtitles**: Canvas title overlay plus SRT subtitle import, styling, animation, and optional hidden subtitle authoring/timing tools from pasted lyrics
- **Video background support**: Use a single MP4 as the background visual, or extract audio/stills from video files where appropriate (see [docs/VIDEO_BACKGROUND.md](./docs/VIDEO_BACKGROUND.md))
- **Resolution and tuning**: Auto/manual layouts (16:9 / 9:16 / 1:1), per-layout scale/position, waveform color/style presets, LUFS normalization, bitrate controls, and Canvas 2D / WebGL renderer selection
- **Effects**: Space, vignette, rainbow, curtain, sparkle, atmosphere, rain, snow, and scanlines with per-effect parameters
- **Clip length limit**: Presets and manual ranges for preview/recording windows, including YouTube, TikTok, and NicoNico-oriented lengths
- **Video generation**: MP4 output plus a fast-generation path when the alternative encoder route is available; normal recording quality is preserved up to 60 fps
- **Settings management**: Export/import settings JSON, persistent saved values, and one-click clear
- **Client persistence**: Most settings are saved in first-party browser cookies, with migration from older localStorage keys on first visit
- **UI extras**: Dark/light mode toggle and bilingual Japanese / English UI

## Quick Start

### WSL / Local development (recommended)

```bash
npm install --legacy-peer-deps
npm run dev
```

Open: `http://localhost:3000`

- Standard development environment: **Windows + Cursor + WSL2 + Node.js**
- Use Git and npm inside WSL
- Use `npm run build` for production build checks

### Static HTML for shared hosting

```bash
npm run build:html
```

- The generated `visualizer/` is a **static HTML build** (Next.js `next export`; CLI may print deprecation / static-export notices — see [docs/BUILD.md](./docs/BUILD.md)).
- Default config uses **`/visualizer` path**. Upload to the server's `visualizer` directory.
  - Example: Place `index.html`, `_next/`, `.htaccess` in `public_html/visualizer/`
- For custom paths, see [docs/HTML_HOSTING.md](./docs/HTML_HOSTING.md).

## Usage

1. **Load media**: Drop/select still images, audio, subtitles, or a single MP4 for video background
2. **Build the scene**: Add more gallery images, choose a spectrum mode, and optionally enable title/subtitle overlays
3. **Tune visuals**: Adjust effects, layout, waveform style, renderer, and clip-length range
4. **Tune audio/output**: Configure target LUFS, bitrate, and output resolution as needed
5. **Preview**: Play the track and confirm transitions, subtitles, and waveform behavior
6. **Generate video**: Export MP4, or use the fast-generation option when available
7. **Save or reset**: Export/import settings JSON, or clear everything to start over

See [docs/SPECIFICATION.md](./docs/SPECIFICATION.md) for details.

## Documentation

- **[docs/README.md](./docs/README.md)**: Documentation hub (build, security, FFmpeg)
- **[docs/BUILD.md](./docs/BUILD.md)**: Install (`--legacy-peer-deps`), FFmpeg copy, env vars, scripts
- **[docs/SECURITY.md](./docs/SECURITY.md)**: Headers, file limits, dependency audits
- **[docs/FFMPEG.md](./docs/FFMPEG.md)**: Self-hosted core, COOP/COEP, vs upstream PR #23
- **[docs/VIDEO_BACKGROUND.md](./docs/VIDEO_BACKGROUND.md)**: MP4 roles (music vs video background), picker / drag-drop rules, and current **MP4-fixed output** policy (no alpha)
- **[docs/SPECIFICATION.md](./docs/SPECIFICATION.md)**: Technical spec and feature details
- **[docs/SERVER_REQUIREMENTS.md](./docs/SERVER_REQUIREMENTS.md)**: Shared hosting requirements
- **[docs/DEVELOPER_MODE.md](./docs/DEVELOPER_MODE.md)**: Developer mode
- **[docs/CHANGELOG.md](./docs/CHANGELOG.md)**: Changelog
- **[docs/USER_TERMS.md](./docs/USER_TERMS.md)**: Terms of Service (EN + 日本語)
- **[docs/PRIVACY_POLICY.md](./docs/PRIVACY_POLICY.md)**: Privacy policy
- **[docs/EU_GDPR_NOTICE.md](./docs/EU_GDPR_NOTICE.md)**: EU/EEA users — GDPR-related summary (non-legal advice)
- **[docs/INSTALL_LOCAL_STATIC.md](./docs/INSTALL_LOCAL_STATIC.md)**: GitHub Release ZIP / hosting `visualizer/` only (paths, headers, MP4 caveats)

## GitHub Releases

[Releases](https://github.com/kuwa2005/music-waves-visualizer/releases) ship a **static ZIP** (no Node.js needed on the host): `visualizer/` plus **`INSTALL_LOCAL_STATIC.md`** and **`docs-bundled/`** (license, changelog, hosting, FFmpeg, terms/privacy). Maintainer: `npm run release:zip` (runs `npm run build:html` when `visualizer/` is missing).

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

- **ファイル読み込み**: 静止画・音楽・字幕をドラッグ&ドロップまたはボタンから読み込み。単一 MP4 を背景動画として使うことも可能
- **複数画像ギャラリー**: 追加画像の読み込み、自動切替、クロスフェード・ワイプ・ズーム・フラッシュなどのトランジションに対応
- **スペクトラムアナライザー**: 周波数系と音圧系の両方を搭載。バー、円形、対称バー、ドット、面、グライコ、パルス、VU、リング、オーブ、背景ブリージング、粒子、ジオメトリ変形、オシロスコープ、リサージュ系などを選択可能
- **タイトル・字幕**: タイトル文字のオーバーレイ、SRT 字幕の読み込み・装飾・アニメーション、歌詞からの字幕作成/タイミング記録（任意の隠し機能）に対応
- **背景動画対応**: 静止画ギャラリーの代わりに単一 MP4 を背景として使用可能。動画から音声や静止画を取り込む導線もあり（詳細は [docs/VIDEO_BACKGROUND.md](./docs/VIDEO_BACKGROUND.md)）
- **解像度・表示・音量調整**: 自動/手動レイアウト、倍率・位置、波形カラー/スタイル、LUFS 正規化、ビットレート、Canvas 2D / WebGL の切り替えに対応
- **エフェクト**: 宇宙空間、ビネット、レインボー、カーテン、きらきら、空気感、雨、雪、スキャンラインをパラメータ付きで利用可能
- **動画長制限**: YouTube / TikTok / ニコニコ向けの長さプリセットと、開始位置・秒数の手動指定に対応
- **動画生成**: MP4 出力に加えて、条件が合えば高速生成ルートも利用可能。通常録画の品質は最大 60fps まで維持
- **設定管理**: JSON のエクスポート/インポート、保存済み設定の利用、ワンクリッククリア
- **設定保持**: 主要な設定はファーストパーティ Cookie に保存され、初回アクセス時に旧 localStorage から移行
- **UI**: ダーク/ライト切り替えと、日本語/英語のバイリンガル表示

### クイックスタート

```bash
# WSL2 / ローカル開発（標準）
npm install --legacy-peer-deps
npm run dev
# アクセス: http://localhost:3000

# 静的HTML版（レンタルサーバー用）
npm run build:html
# visualizer/ の中身をサーバーにアップロード
```

### ドキュメント（日本語）

- [docs/README.md](./docs/README.md): ドキュメント索引（ビルド・セキュリティ・FFmpeg・動画背景）
- [docs/VIDEO_BACKGROUND.md](./docs/VIDEO_BACKGROUND.md): MP4 の使い分け・UI 規則・録画・関連 Issue
- [docs/仕様書.md](./docs/仕様書.md): 技術仕様と機能詳細
- [docs/サーバー要件.md](./docs/サーバー要件.md): レンタルサーバー用要件
- [docs/DEVELOPER_MODE.md](./docs/DEVELOPER_MODE.md): 開発者モード
- [docs/CHANGELOG.md](./docs/CHANGELOG.md): 変更履歴
- [docs/USER_TERMS.md](./docs/USER_TERMS.md): 利用規約
- [docs/PRIVACY_POLICY.md](./docs/PRIVACY_POLICY.md): プライバシーポリシー
- [docs/EU_GDPR_NOTICE.md](./docs/EU_GDPR_NOTICE.md): EU/EEA 向け GDPR 関連の案内（法的助言ではありません）
- [docs/INSTALL_LOCAL_STATIC.md](./docs/INSTALL_LOCAL_STATIC.md): リリース ZIP・`visualizer/` 単体利用時の手順と注意（パス・ヘッダ・MP4）

### GitHub Releases

[Releases](https://github.com/kuwa2005/music-waves-visualizer/releases) に **静的版 ZIP** を添付しています（配信先に Node.js は不要）。中身は `visualizer/` と **`INSTALL_LOCAL_STATIC.md`**、および **`docs-bundled/`**（ライセンス・変更履歴・ホスティング・FFmpeg・規約類）。メンテ用: `npm run release:zip`（`visualizer/` が無いときは `build:html` を実行）。
