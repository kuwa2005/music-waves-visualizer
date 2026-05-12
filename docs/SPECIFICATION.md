# Music Waves Visualizer - Technical Specification

## 1. Overview

Music Waves Visualizer is a web application that creates audio waveform videos by loading image and music files.

### 1.1 Features

- **Image loading**: Still-image gallery or **single MP4** as **background video** (drag & drop supported); rules in [VIDEO_BACKGROUND.md](./VIDEO_BACKGROUND.md)
- **Audio loading**: Waveform analysis source; **MP4** as music (audio track) or combined with same-file reuse when used for both roles
- **Real-time waveform**: Seven internal modes; **five plus OFF** are exposed in the UI (modes 1 and 5 hidden)
- **Resolution**: Manual (1920×1080, 1080×1920, 1920×1920) + **Auto** (detect from loaded image aspect ratio and map to 16:9 / 9:16 / 1:1)
- **Display adjustment**: Scale and position per mode (saved per resolved layout)
- **Clip length limit (short platforms)**: When enabled, **Start (sec)** and **Duration (sec)** define the preview/recording window. Preset buttons only **fill suggested durations**; they do not hard-cap playback. **Empty duration** = play from start **to end of media**.
- **Client persistence**: Most settings use **first-party cookies** (`SameSite=Lax`), with one-time migration from legacy **localStorage** keys. **Not persisted**: loaded media files, **title body text**, **SRT file content** (subtitle/title style toggles may be saved).
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

- Tab order: **Spectrum Analyzer / Effects / Audio / Subtitles / Title / Clip Length / Settings** (labels depend on locale)
- Spectrum and effect adjustment sections are collapsible (default collapsed)
- Resolution controls are located in **Settings** tab; the chosen preset (including **Auto** resolved to 16:9 / 9:16 / 1:1) is persisted

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
- **Recording**: `recordMimePreference` (auto / VP9 / VP8 / H.264-in-WebM); recorded `Blob` type matches `MediaRecorder.mimeType`. FFmpeg / alpha follow-up: [#35](https://github.com/kuwa2005/music-waves-visualizer/issues/35).
- **Sync**: Separate-file drift reduction: [#34](https://github.com/kuwa2005/music-waves-visualizer/issues/34).

---

## 日本語

- スペクトラムは内部で7モードあるが、**UI では OFF＋5種**（折れ線・波形上下対称のボタンは非表示。描画は残す）。
- **きらきら**はラジアルグロウなし（星形のみ）。**空気感（ほこり）**は単色の小さな円で表現（Canvas/WebGL で方針を揃えた記述は上記）。
- **設定の保存**は第一党 Cookie が主。クリップは開始＋長さで区間指定（長さ空欄＝末尾まで）。
- **MP4 の音楽／背景動画の分離**は [VIDEO_BACKGROUND.md](./VIDEO_BACKGROUND.md) と [仕様書.md](./仕様書.md) §3.1 を参照。
