# Music Waves Visualizer - Technical Specification

## 1. Overview

Music Waves Visualizer is a web application that creates audio waveform videos by loading image and music files.

### 1.1 Features

- **Image loading**: Background image (drag & drop supported)
- **Audio loading**: Waveform analysis source (MP4 supported)
- **Real-time waveform**: 7 display modes
- **Resolution**: 1920×1080, 1080×1920, 1920×1920
- **Display adjustment**: Scale and position per mode
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
| 1 | Line | Waveform line |
| 2 | Circle | Circular layout |
| 3 | Symmetrical Bars | Up/down symmetric bars |
| 4 | Dots | Dot matrix |
| 5 | Symmetrical Waveform | Up/down symmetric waveform |
| 6 | Glyco Style | 1980s-style peak hold |

## 4. Effects

- **Space** (3 types): Warp-style stardust
- **Vignette**: Darken edges
- **Rainbow**: Hue-shifting overlay
- **Curtain**: Flowing curtain

Effects are shown during preview/recording only. Strength: weak / medium / strong per effect.

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

詳細な技術仕様は [仕様書.md](./仕様書.md) を参照してください。
