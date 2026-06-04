# Music Waves Visualizer - Technical Specification

## 1. Overview

Music Waves Visualizer is a web application that creates audio waveform videos by loading image and music files.

### 1.1 Features

- **Image loading**: Still-image gallery or **single MP4** as **background video** (drag & drop supported); rules in [VIDEO_BACKGROUND.md](./VIDEO_BACKGROUND.md)
- **Audio loading**: Waveform analysis source; **MP4** as music (audio track) or combined with same-file reuse when used for both roles
- **Real-time waveform**: Seven internal modes; **five plus OFF** are exposed in the UI (modes 1 and 5 hidden)
- **Resolution**: Manual (1920×1080, 1080×1920, 1920×1920) + **Auto** (detect from loaded image aspect ratio and map to 16:9 / 9:16 / 1:1)
- **Display adjustment**: Scale and position per mode (saved per resolved layout)
- **Clip length limit (short platforms)**: Under the **Audio** tab — **Start (sec)** and **Duration (sec)** define the preview/recording window. Preset buttons only **fill suggested durations**; they do not hard-cap playback. **Empty duration** = play from start **to end of media**. **Fade in/out** apply to the audible segment (preview GainNode + FFmpeg `afade` on MP4 encode).
- **Client persistence**: Most settings use **localStorage** via [`lib/mwvCookieStorage.ts`](../lib/mwvCookieStorage.ts), with one-time migration from legacy **cookies** on first read. **Not persisted**: loaded media files, **title body text**, **SRT file content** (subtitle/title style toggles may be saved).
- **Subtitles**: SRT import, styling, animation, display timing offset, and an optional hidden authoring panel for pasted lyrics and timing recording.
- **Preview**: Real-time waveform while playing
- **Video generation**: Record and output as MP4; drawing/capture is capped at max 60 fps for stable frame pacing.

### 1.2 Demo

https://music-waves-visualizer.vercel.app/

## 2. Tech Stack

- **Framework**: Next.js 13.1.2
- **Language**: TypeScript 4.6.2
- **UI**: Material-UI (MUI) 5.11.4
- **Styling**: SCSS
- **i18n**: i18next (Japanese / English); strings in `locales/ja.json` and `locales/en.json`

### i18n namespaces (UI)

| Namespace / prefix | Used for |
|--------------------|----------|
| `common`, `tabs`, `spectrum`, `effects`, `audio`, `subtitle`, `titleTab`, `clip`, `settings`, `encode`, `videoQuality`, … | Core tabs and shared controls |
| `screen` | **Screen** tab — still-background zoom/pan, fades, audio-reactive brightness/shake/flash |
| `waveFamily` | Spectrum modes **17–19** (height/width/flow/glow sliders) |
| `particleSpectrum` | Mode **20** (pattern, count, size, life, boost) |
| `radialSpectrum` | Mode **21** (bars, center gap, kick scale, rotate) |
| `retroEq` | Mode **6** glyco extensions (CRT/VHS, bars/dots style) |
| `subtitle.author` | Hidden SRT authoring (`panelToggle`, section title, lyrics editor) |

Mode-specific slider labels must exist in both locale files before shipping UI changes in `pages/index.tsx`.

## 3. Spectrum Modes

| Mode | Name | Description |
|------|------|--------------|
| -1 | OFF | No spectrum |
| 0 | Frequency Bars | 128 vertical bars |
| 1 | Line | Waveform line *(UI button hidden; renderer kept)* |
| 2 | Circle | Circular layout |
| 3 | Symmetrical Bars | Up/down symmetric bars |
| 4 | Dots | Dot matrix |
| 5 | Symmetrical Waveform | Up/down symmetric waveform *(UI button hidden; renderer kept)* |
| 6 | Glyco Style | 1980s-style peak hold |

**UI note:** Modes **1** (line) and **5** (symmetrical waveform) are not shown on the toolbar. If `session_mode` was 1 or 5, it resets to 0 (frequency bars).

## 4. Effects

- **Space**: Warp-style stardust (type 1/2/3 selectable in the effect parameter panel)
- **Vignette**: Darken edges
- **Rainbow**: Hue-shifting overlay
- **Curtain**: Flowing curtain
- **Sparkle** (きらきら): White +/X/* star shapes with twinkle; **no radial glow** (Canvas 2D and WebGL both draw star strokes + core only)
- **Dust** (空気感 / atmosphere): Low-contrast drifting particles; Canvas uses solid circles + `lighter` blend; WebGL uses additive circles (no large soft bloom)
- **Rain / Snow**: Weather-style particles with adjustable angle, amount, and color; **rain** supports **audio sensitivity** 0–10 (spawn rate, streak alpha/length)
- **Water ripple** (`waterRipple`): Variants ripple / heart / firework; **audio sensitivity** 0–10 (spawn rate, ring strength)
- **Laser**: Multi-color edge bursts; Canvas 2D and WebGL; density weak / medium / strong (`lib/laserEffect.ts`)

Effects are shown during preview/recording only. Strength: weak / medium / strong per effect.

### File pickers (split button)

- **Choose image(s)**: Default still images (`FILE_PICKER_ACCEPT_IMAGE`); menu alternate **video (MP4, etc.)** or **all files** (`components/FilePickerSplitButton.tsx`, `lib/fileValidation.ts`)
- **Choose music**: Default audio; alternate **video (MP4, etc.)** or all; gates by extension + MIME + size caps

## 4. Settings UI

- Tab order: **Spectrum Analyzer / Effects / Audio / Subtitles / Title / Settings** — **clip length** (presets, start/duration, audio fades) lives under the **Audio** tab (`audioSettings.videoLengthSection`)
- Spectrum and effect adjustment sections are collapsible (default collapsed)
- Resolution controls are located in **Settings** tab; the chosen preset (including **Auto** resolved to 16:9 / 9:16 / 1:1) is persisted
- Hidden SRT authoring is toggled from the **SRT** checkbox in the Settings tab under bitrate settings. When enabled, the Subtitle tab shows **Subtitle authoring (hidden feature)** / **字幕作成支援（隠し機能）**.
- **Desktop layout (≥1024px)**: Two-pane grid (`desktopTwoPane`) — **left**: file drop zone + sticky live preview canvas; **right**: tabbed controls (`pages/index.tsx`, `styles/Home.module.scss`). Below 1024px the layout stacks in a single column.
- **Spectrum position (all modes)**: Per-layout/mode **offsetX** / **offsetY** sliders are **±150%** of canvas size (integer %). Implemented as **`ResettableSlider`** (double-click or reset control → defaults). **Mode 2 (circle)**: while adjusting offset sliders, a guide dot overlays the preview (`previewCanvasStageRef`); the dot can be dragged to update offset via `spectrumAdjustments` inverse mapping.

## 5. Settings Export/Import

- **Export**: All settings as JSON
- **Import**: Overwrite existing keys only (backward compatible)
- **Common**: Volume (target LUFS), effect type, effect strengths
- **Per layout**: Scale/position per resolution × mode

## 6. Browser Compatibility

- Chrome, Firefox, Edge (latest)
- SharedArrayBuffer requires COOP/COEP headers (HTTPS recommended)

## 7. File Structure

```
├── pages/          # Next.js pages
├── components/     # React components
├── lib/            # Canvas, FFmpeg, i18n, etc.
├── locales/        # ja.json, en.json
└── styles/        # SCSS
```

## 8. Background media (stills vs MP4 video)

- **Still gallery**: Multiple images, transitions, auto-advance during preview/recording (see changelog 1.0.3).
- **Video background**: One `<video>` element (either **reused** from the music MP4 or a **second** element when music is `AudioBuffer` / different file). Canvas draws with `drawVideoCover` (`lib/drawVideoCover.ts`) after optional `syncBackgroundOnlyVideo` (`pages/index.tsx`).
- **UI constraints**: No still+MP4 in the same **Choose image** selection; no multiple MP4s for background; **Add image** is stills only and blocked during video-background mode. See [VIDEO_BACKGROUND.md](./VIDEO_BACKGROUND.md).
- **Renderer**: Video background forces **Canvas 2D** for the spectrum loop until WebGL gains a video texture path ([#36](https://github.com/kuwa2005/music-waves-visualizer/issues/36)).
- **Preview FPS**: Video-background preview is throttled to **30 fps** to reduce UI load. This preview-only throttle does not reduce recording quality.
- **Recording**: Browser capture and renderer draw pacing are capped at max **60 fps** (`captureStream(60)` path) before FFmpeg converts the temporary recording to MP4. FFmpeg / alpha follow-up: [#35](https://github.com/kuwa2005/music-waves-visualizer/issues/35).
- **Sync**: Separate-file drift reduction: [#34](https://github.com/kuwa2005/music-waves-visualizer/issues/34).

---

## 日本語

- スペクトラムは内部で7モードあるが、**UI では OFF＋5種**（折れ線・波形上下対称のボタンは非表示。描画は残す）。
- **きらきら**はラジアルグロウなし（星形のみ）。**空気感（ほこり）**は単色の小さな円で表現（Canvas/WebGL で方針を揃えた記述は上記）。
- **設定の保存**は **localStorage** が正（旧 Cookie は初回移行）。クリップは開始＋長さで区間指定（長さ空欄＝末尾まで）。
- **デスクトップ（1024px以上）**は左プレビュー＋右タブの2ペイン。スペクトラム位置は **ResettableSlider**（±150%）、モード2はプレビュー上のガイド●で調整可。
- **SRT 作成支援**は設定タブの **SRT** チェックで表示する隠し機能。プレビュー時の動画背景は 30fps に間引くが、録画品質は最大 60fps まで維持する。
- **MP4 の音楽／背景動画の分離**は [VIDEO_BACKGROUND.md](./VIDEO_BACKGROUND.md) と [仕様書.md](./仕様書.md) §3.1 を参照。
