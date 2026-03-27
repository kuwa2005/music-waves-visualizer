# Music Waves Visualizer - Technical Specification

## 1. Overview

Music Waves Visualizer is a web application that creates audio waveform videos by loading image and music files.

### 1.1 Features

- **Image loading**: Background image (drag & drop supported)
- **Audio loading**: Waveform analysis source (MP4 supported)
- **Real-time waveform**: Seven internal modes; **five plus OFF** are exposed in the UI (modes 1 and 5 hidden)
- **Resolution**: Manual (1920×1080, 1080×1920, 1920×1920) + **Auto** (detect from loaded image aspect ratio and map to 16:9 / 9:16 / 1:1)
- **Display adjustment**: Scale and position per mode (saved per resolved layout)
- **Clip length limit (short platforms)**: Preview/recording can be limited to a time window with presets: **YouTube (60s)**, **TikTok (60s)**, **NicoNico (300s)**.
- **Preview**: Real-time waveform while playing
- **Video generation**: Record and output as MP4

### 1.2 Demo

https://music-waves-visualizer.vercel.app/

## 2. Tech Stack

- **Framework**: Next.js 13.1.2
- **Language**: TypeScript 4.6.2
- **UI**: Material-UI (MUI) 5.11.4
- **Styling**: SCSS
- **i18n**: i18next (Japanese / English)

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
- **Rain / Snow**: Weather-style particles with adjustable angle, amount, and color

Effects are shown during preview/recording only. Strength: weak / medium / strong per effect.

## 4. Settings UI

- Tab order: **Spectrum Analyzer / Effects / Audio / Clip Length / Settings**
- Spectrum and effect adjustment sections are collapsible (default collapsed)
- Resolution controls are located in **Settings** tab

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

---

## 日本語

- スペクトラムは内部で7モードあるが、**UI では OFF＋5種**（折れ線・波形上下対称のボタンは非表示。描画は残す）。
- **きらきら**はラジアルグロウなし（星形のみ）。**空気感（ほこり）**は単色の小さな円で表現（Canvas/WebGL で方針を揃えた記述は上記）。
- 詳細は [仕様書.md](./仕様書.md) を参照。
