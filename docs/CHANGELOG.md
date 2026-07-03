# Changelog

## [Unreleased]

### 追加

- **字幕の位置オフセット(X)** (`lib/subtitles.ts`, `pages/index.tsx`): 字幕の水平位置オフセットスライダー（0〜10%）を追加。左/中央/右の揃え方向ごとに独立した値を保存。左寄せ・右寄せ時にテキストがキャンバス端からはみ出す問題を防止。

### 修正

- **プレビュー時のフレームレート不安定化** ([#43](https://github.com/kuwa2005/music-waves-visualizer/issues/43)): 通常プレビュー（録画・動画背景なし）で `getTargetFps` が `null` を返し、フレームスロットルが無効化。フレームレートがブラウザのディスプレイリフレッシュレート（例: 120 Hz）に追従し、視覚的に不安定になっていた。`DEFAULT_PREVIEW_FPS`（60）をフォールバックとして返すよう修正。

### 修正（2026-06 — レンダリング・字幕パフォーマンス、PR [#41](https://github.com/kuwa2005/music-waves-visualizer/pull/41)）

- **WebGL背景のスクラッチ**: ギャラリー切替・`screenMotion` で毎フレームキャンバス生成 Instead、`bgTempCanvas` / `texSubImage2D` を再利用（`lib/WebGLRenderer.ts`）。
- **FFTスクラッチバッファ**: Canvas 2D と WebGL がフレームごとの `Uint8Array` 再利用を共有（`canvasFft*Scratch` / `fft*Scratch`）。
- **水滴WebGL**: `waterRipple` のドロップレット行を `LineBatch` で単一DrawCallにバッチ化（`lib/WebGLRenderer.ts`）。
- **動画背景プレビュー**: 30fps スロットル；モード6 retro EQ がエフェクトOFF時にFFTを2重取得する問題を修正。
- **字幕アーキテクチャ** (`lib/subtitles.ts`, `lib/WebGLRenderer.ts`, `pages/index.tsx`):
  - レイヤーキャッシュ + 次のキューのアイドル**プリフェッチ**；WebGL**デュアルスロット**テクスチャアップロード。
  - **バイナリサーチ** + ヒントによるアクティブキュー検索；大容量SRT向け `parseSrtAsync` ストリーミングyield。
  - `loadSubtitleSeqRef` シーケンスガード（非同期パース / 編集パネル適用）。
  - SRT読み込み時にプレビューアニメーションを不必要に再開しないよう修正。
- **開発者モード指標**: 設定タブで字幕レイヤー構築・プリフェッチ・WebGL字幕/タイトルテクスチャアップロードのミリ秒表示（1秒更新）。→ [DEVELOPER_MODE.md](./DEVELOPER_MODE.md)

### ドキュメント

- [SESSION_20260601.md](./SESSION_20260601.md) §2026-06-13、[DEVELOPER_MODE.md](./DEVELOPER_MODE.md)（字幕/タイトルperf HUD）。

### 既知の問題（未解決）

- [#34](https://github.com/kuwa2005/music-waves-visualizer/issues/34) — 映像/音声MP4の同期ドリフト（変更なし）。
- [#36](https://github.com/kuwa2005/music-waves-visualizer/issues/36) — WebGL動画背景（まだCanvas 2Dフォールバック）。
- Remaining perf backlog: `filmGrain` per-frame `createImageData`, `mirrorBall` WebGL draw-call count — [#42](https://github.com/kuwa2005/music-waves-visualizer/issues/42).

## [1.0.6] - 2026-06-05

### Added
- **Laser effect**: `lib/laserEffect.ts` — edge-burst colored beams (Canvas 2D + WebGL `drawLine`); density-only tuning; UI type `laser` with i18n `effect.laser`.
- **File picker masks**: `components/FilePickerSplitButton.tsx` + `lib/fileValidation.ts` — split button (default / alternate / all) for image (still vs video), music (audio vs video), extension gates (`gateImageFile`, `gateAudioFile`, `gateVideoAsMediaFile`).
- **Rain / water ripple audio sensitivity**: Sliders 0–10 (0.1 step, 0 = off); shared envelope in `lib/Effects.ts` (`rainAudioSensitivity`, `waterRippleAudioSensitivity`).

### Changed
- **Audio tab**: **Clip length** controls (presets, start/duration, fades) merged into **Audio** tab (`audioSettings.videoLengthSection`); dedicated Clip Length tab removed from tab order.
- **Screen tab — sabi shake**: Chorus shake uses instant level + smoothed drive with higher peak (`SHAKE_EXCESS_CAP`); stronger response on loud hits (`lib/drawStillScreenBackground.ts`).
- **Graceful stop on record end**: Early stop schedules GainNode fade (`scheduleEarlyStopGainFade`) and optional image alpha fade (`StopGracefulImageFade`, `resolveCombinedImageFadeAlpha`) so preview/recording does not cut abruptly.
- **Clip / MP4 audio fade**: `resolveAudioFadeSchedule` applies in/out on the **audible segment** (not only when explicit platform max length matches); FFmpeg path adds `afade` + `-t` trim via `buildFfmpegAfadeFilter` / `Mp4AudioFadeEncode` (`lib/Ffmpeg.ts`, `lib/clipAudioFade.ts`).
- **YouTube LUFS encode calibration**: UI stays **-14**; `loudnorm` integrated target **-13.95** (+0.05) when UI is -14 (`resolveLoudnormIntegratedTarget` in `lib/Ffmpeg.ts`). See [audio-quality.md](./audio-quality.md).
- **Settings**: Supplement hint under **Clear all** (`settings.clearAllSupplement` JA/EN).
- **React hooks**: Stabilized callbacks/refs around playback stop, spectrum settings, and encode paths in `pages/index.tsx` (exhaustive-deps / stale-closure fixes).

### Documentation
- [SESSION_20260601.md](./SESSION_20260601.md) §2026-06-05, [SPECIFICATION.md](./SPECIFICATION.md) (effects, file pickers, audio tab), [audio-quality.md](./audio-quality.md) (YouTube +0.05 note).

## [1.0.5] - 2026-06-02

### Fixed (2026-06-02 — i18n restore)
- **Hardcoded English in UI**: Spectrum modes 17–21, retro EQ (mode 6), screen-tab motion sliders, and Settings **SRT** toggle now use `t()` with keys in `locales/ja.json` / `locales/en.json`.
- **Missing locale keys**: Restored ~58 keys (`waveFamily`, `particleSpectrum`, `radialSpectrum`, `retroEq`, extended `screen.*`, `subtitle.author.panelToggle`) that caused raw key strings or blank labels after the layout-overhaul branch.
- **`encode.warning`**: Clarified JA/EN copy (“while generating the **video**” / 動画を生成中は…).

### Fixed (2026-06-01 — layout recovery follow-up)
- **Accidental `git checkout HEAD -- pages/index.tsx`**: Reverted the in-progress 2-pane UI (`desktopTwoPane`, left preview + right controls). Restored from agent transcript + diff against static bundles under `visualizer/` / `visualizer.これが最新/` (build artifacts, not tracked).
- **Spectrum position sliders (mode 2)**: Horizontal/vertical offset use **`ResettableSlider`** with shared `handleOffsetSliderChange` / `spectrumOffsetSliderGuideProps` (double-click reset, guide dot while dragging). Preview overlay uses `previewCanvasStageRef`, `spaceCenterGuideLayer` / `spectrumOffsetGuideDot`, and pointer drag on the guide dot (`lib/spectrumAdjustments.ts` mapping).

### Added (2026-06-01 session — rendering / lib)
- **Screen tab (still background)**: `lib/screenMotion.ts`, `lib/drawStillScreenBackground.ts` — zoom/pan (per-axis speed), image fade in/out on clip timeline, audio-reactive brightness/shake/chorus zoom/flash. Excludes background video, gallery transitions, QuickVideoEncoder.
- **Spectrum modes 17–21**: Wave family (17–19), particle (20), radial (21) in `lib/Canvas.ts` + `lib/WebGLRenderer.ts`; **retro EQ glyco** extensions on mode 6 (`retroEqParams`, region-only background dim via `glycoBarRegionBounds`).
- **Water ripple / 描画 effect**: `waterRipple` with variants `ripple` / `heart` / `firework`, light mode, adaptive ring cap (`lib/Effects.ts`).
- **Spectrum adjustments module**: `lib/spectrumAdjustments.ts` — shared scale/offset, mode-2 pivot, overlay percent inverse mapping.
- **MP4 thumbnail helper**: `lib/mp4Thumbnail.ts`; FFmpeg path documents caller JPEG vs first encoded frame fallback (`lib/Ffmpeg.ts`).
- **FFmpeg assets**: `scripts/copy-ffmpeg-core.cjs` copies to `public/ffmpeg` and `public/ffmpeg-core`; loader probes both (`lib/Ffmpeg.ts`).

### Changed (2026-06-01 session)
- **MP4 cover art (still background)**: `onRecordMovie` passes unprocessed gallery still via `buildMp4StillThumbnailJpeg` → `thumbnailJpeg` (not first encoded video frame). Fallback unchanged for video-only background or no image.
- **Settings persistence**: `lib/mwvCookieStorage.ts` — **localStorage primary**; legacy cookies migrate once then cleared (see [SESSION_20260601.md](./SESSION_20260601.md)).
- **Performance**: Spectrum throttle for modes 1 & 5; water-ripple adaptive scale; shared target-fps pacing in Canvas/WebGL.

### Documentation (2026-06-01)
- **[SESSION_20260601.md](./SESSION_20260601.md)**: Session hub (screen tab, modes 17–21, ripple, persistence, MP4 frame 0, 2-pane UI recovery, spectrum offset sliders).
- **[FFMPEG.md](./FFMPEG.md)**: Clarified `attached_pic` vs unprocessed stills.
- **[SPECIFICATION.md](./SPECIFICATION.md)**: Desktop 2-pane layout (≥1024px); spectrum offset `ResettableSlider` + preview guide behavior.

### Added
- **Mirror ball effect**: Canvas 2D + WebGL overlay (`lib/Effects.ts`, `lib/Canvas.ts`, `lib/WebGLRenderer.ts`). UI picker entry is **hidden** via `EFFECT_TYPES_UI_HIDDEN` in `pages/index.tsx`; settings remain in cookies/export when type is `mirrorBall`.
- **Clip fade in/out**: `lib/clipAudioFade.ts` — GainNode scheduling for clip window; fade-out only when explicit duration matches trimmed segment. UI: fade-in / fade-out seconds on **Clip length** tab (3-row layout: presets, start+duration, fades).
- **Subtitle display timing offset**: ±2 s slider on Subtitle tab; preview/recording only (`displayTimingOffsetSec` in `lib/subtitles.ts`), **not** persisted to cookies or export.
- **Hidden SRT authoring panel**: Settings tab checkbox **SRT** (under bitrate settings) reveals the subtitle authoring tools; loading an `.srt` while enabled also populates the editor.
- **MP4 audio Tier A**: `MediaRecorder` `audioBitsPerSecond` (default record **384 kbps**); MP4 AAC up to **320 kbps**; presets **配信用** / **高音質** set LUFS -14, AAC 320, record 384, video **8** / **14 Mbps**.

### Changed
- **SRT authoring (hidden feature)**: Section title is now **字幕作成支援（隠し機能）** / **Subtitle authoring (hidden feature)**. Start begins preview playback and timing record; End stops preview playback; active/current and next cue rows stay visible; timing inputs and lyric editor sizing were tuned; custom ▲/▼ hold-repeat controls now use a 200 ms initial delay and 45 ms repeat interval.
- **SRT authoring completion**: Finishing the final lyric asks whether to apply the recorded cues to preview/internal subtitle memory.
- **SRT download filename**: Same base name as MP4 via `buildDownloadBaseName` / `buildDownloadSrtName`.
- **Frame pacing / FPS**: Video-background preview is throttled to **30 fps** only during preview. Recording/video generation uses a **max 60 fps** draw and `captureStream` path for Canvas 2D/WebGL, preserving normal output quality up to 60 fps. Frame throttling was adjusted to avoid periodic stutter; FPS state updates run only in developer mode and skip redundant React updates.
- **Spectrum throttle (Canvas 2D/WebGL)**: Modes 1 & 5 skip only spectrum draw; effects/subtitles update every frame, and both renderers share target-fps frame pacing.
- **Defaults aligned with presets**: Target LUFS **-14**, record audio **384 kbps**, export AAC **320 kbps**; distribution **8 Mbps** / hi-fi **14 Mbps** video.
- Removed unused `pages/api/hello.ts` sample API route.

### Documentation
- **[audio-quality.md](./audio-quality.md)**: Tier A/B decisions, YouTube/TikTok rationale for 384/320 kbps, preset table.
- **Handover** [`music-waves-visualizer-引継ぎ20260517.md`](../music-waves-visualizer-引継ぎ20260517.md): 2026-05-23 session summary.

### Documentation (prior unreleased)
- **MP4 / video background**: New hub [VIDEO_BACKGROUND.md](./VIDEO_BACKGROUND.md) (EN + 日本語サマリ, UI rules, recording MIME, links to [#34](https://github.com/kuwa2005/music-waves-visualizer/issues/34) / [#35](https://github.com/kuwa2005/music-waves-visualizer/issues/35) / [#36](https://github.com/kuwa2005/music-waves-visualizer/issues/36)). Indexed from [docs/README.md](./README.md), [README.md](../README.md), [SPECIFICATION.md](./SPECIFICATION.md) §8, [仕様書.md](./仕様書.md) §3.1. **Release ZIP** (`scripts/make-release-zip.sh`) now bundles `docs-bundled/docs/VIDEO_BACKGROUND.md`.
- **`npm run build:html:lil-la`**: One-shot static build with `NEXT_PUBLIC_SITE_URL=https://lil.la` for [lil.la/visualizer](https://lil.la/visualizer/) (canonical / OG). Documented in [BUILD.md](./BUILD.md), [README](./README.md), and [`.env.production.example`](./.env.production.example).
- **Persistence / clip / build**: README, [SPECIFICATION.md](./SPECIFICATION.md), [仕様書.md](./仕様書.md), [PRIVACY_POLICY.md](./PRIVACY_POLICY.md), [EU_GDPR_NOTICE.md](./EU_GDPR_NOTICE.md), [BUILD.md](./BUILD.md) — first-party cookies for settings; clip UI semantics; `next export` / static-export notices.

### Added (video background — fork)
- **Separate roles for MP4**: Music vs **single** background video; drag/drop and image-picker rules; optional second `<video>` when music is `AudioBuffer`; `drawVideoCover` + `syncBackgroundOnlyVideo`; WebGL → Canvas 2D fallback while video background is active ([#36](https://github.com/kuwa2005/music-waves-visualizer/issues/36)).
- **Recording policy update**: user-facing output is now **MP4 fixed** (alpha/transparency not supported) for stability.

### Fixed
- **Image picker `accept`**: “Choose image(s)” includes `video/mp4` (and common video extensions) so MP4 is selectable in the system dialog.
- **Video background flicker**: `drawBars` no longer falls through to the still-image branch when a background `<video>` is present but `readyState` is still warming up; eased `syncBackgroundOnlyVideo` seek threshold.
- **MP4 input recording startup glitch**: mitigated brief stall/drop at recording start by stabilizing play/record start order for `HTMLVideoElement` input.
- **Clear after MP4 load**: removed spurious “video load failed” snackbar by clearing video event handlers before disposing sources.

### Changed (maintenance — cookies, clip, spectrum, restore)
- **Settings persistence (cookies)**: Most client settings persist in **first-party cookies** via [`lib/mwvCookieStorage.ts`](./lib/mwvCookieStorage.ts) (chunked Base64 for large values). **Legacy `localStorage` entries migrate on first read** then clear. **Not stored**: image/music file content, **title text**, **SRT body**; subtitle/title **styles** and toggles **are** stored. Mode remains in existing `mwv_mode` cookie.
- **Clip length limit**: YouTube / TikTok / NicoNico buttons only suggest a duration in the field; **start (sec) + duration (sec)** define the window. **Empty duration** = play **to end of media** (no hard platform max).
- **Spectrum / glyco low band**: `GLYCO_LOG_MIN_BIN`, `glycoLowBandGain`, `spectrumLinearBarLowGain` in [`lib/Canvas.ts`](./lib/Canvas.ts) — less low-frequency pegging (modes 0, 3, 4, 6; Canvas 2D + WebGL).
- **Spectrum scale/position restore**: Hydration and JSON import load `spectrumSettings_{layout}_{mode}` using **`resolveCanvasLayout(savedOrImportedCanvasSize, …)`** instead of a fixed layout key.
- **Title defaults**: Default title animation **none**; title font size **up to 200px**.
- **ESLint**: `getCanvasDimensions` is `useCallback`’d so canvas sizing `useLayoutEffect` satisfies `react-hooks/exhaustive-deps`.

### Changed
- **Title overlay**: **Title** tab after Spectrum — multiline text (not cookie-persisted), styling **is** persisted (position, align, plain/outline/box, font size, letter spacing, font family, bold/italic, stroke, shadow, box, intro animation). Included in settings **export** (optional `titleText` in JSON) / import applies text in-session only. Renderer falls back to Canvas 2D when title is enabled (same as subtitles).
- **SRT subtitle support**: Added `.srt` loading (file picker + drag/drop) and subtitle rendering customization in the existing settings UI flow. Position, type (plain/outline/boxed), color, font, decoration, and show animation are adjustable; settings are persisted/exported/imported. When subtitles are active, renderer auto-falls back to Canvas 2D for compatibility.
- **Spectrum mode button visibility**: Hid the **Lissajous button (mode 16)** from the mode picker while keeping rendering logic/settings compatibility intact.
- **WMP trail tuning (modes 15–16)**: Added UI parameters for **trail length / trail decay / additive intensity** (per-mode persistence, export/import, clear reset). Defaults are now split by mode (15 vs 16), and new presets **WMP classic / Modern** are available for quick tuning. Canvas 2D + WebGL trail rendering uses these values.
- **Modes 15–16 (Oscilloscope / Lissajous)**: Added two high-impact waveform visuals (time-domain) with Canvas 2D + WebGL implementations. Included in mode picker with tooltips; sensitivity tuning presets apply.
- **Spectrum UX + loudness tuning**: Mode picker is grouped into **frequency** and **loudness** sections with shorter labels and tooltip descriptions. Loudness modes (8–14) now support per-mode **presets** (Natural / Strong / EDM) and exposed **gain/gamma/attack/release** controls.
- **Mode 13 performance guard**: Added automatic particle cap/trail simplification based on device capability (`hardwareConcurrency` / `deviceMemory`) with low-spec fallback in Canvas 2D + WebGL.
- **Visual consistency + effect interference**: Added shared opacity shaping to reduce highlight clipping and align slider feel; auto-ducking for `scanlines` / `rain` / `dust` when spectrum is active so visuals do not bury the main spectrum.
- **Loudness-only visuals (modes 9–14)**: Added six non-FFT visuals under the spectrum category — **VU meter**, **pulse ring**, **center orb**, **breathing background**, **particle density**, and **geometry morph** — all implemented for Canvas 2D + WebGL with the same mode buttons and settings flow.
- **Mode 8 (loudness pulse)**: Added a non-spectrum visual in the spectrum category that reacts to overall loudness only (center orb + glow pulse), available as a new mode button in Canvas 2D and WebGL.
- **Mode 2 (circle)**: Added rotation option (`common_circleRotationRpm`) with **OFF / -10..10 rpm**. `1` equals ~1 rotation per 60 seconds (1rpm), negative is left (CCW), positive is right (CW). **OFF** and **0** both stop rotation (Canvas 2D + WebGL).
- **Modes 3 & 4 (symmetric bars & dots)**: Horizontal axis now uses **log-spaced FFT bins** via `glycoBarToFftBin` / `glycoBarRawEnergy` (same family as mode 6), fixing mostly dead right columns from linear `i/bufferLength` mapping (Canvas 2D + WebGL).
- **Spectrum update rate (modes 1 & 5)**: Waveform redraw throttling is fixed at **`SPECTRUM_THROTTLE_TARGET_FPS` (60)** (Canvas 2D + WebGL); the **更新レート** slider is removed (`SpectrumSettings.fps` removed).
- **Spectrum size (all modes)**: Layout/mode **width & height scale** sliders and `clampModeAdjustments` now **0.1–5.0×** (was 0.5–5.0×) so small displays can shrink the analyzer further.
- **Mode 6 (glyco)**: Log-spaced bins (`GLYCO_LOG_BIN_MAX_FRAC`), right-edge **local max** (`glycoBarRawEnergy`). Vertical mapping uses shared **`glycoAdjustedLevel`** (γ≈1.18 peak compression) and **`GLYCO_BAR_VERTICAL_SCALE`** headroom so bars do not sit at MAX as often (Canvas 2D + WebGL).
- **Gallery auto-advance**: Enabled automatically only when the gallery goes from one image to **two or more**; turned **off** when only one or zero images remain. Manual OFF is kept when adding more images without dropping below two. **`common_galleryAutoSec`** and **`common_galleryAutoEnabled`** are persisted (cookies).
- **SEO / HTML**: Expanded `<meta description>`, keywords, robots, canonical (when `NEXT_PUBLIC_SITE_URL` or `NEXT_PUBLIC_DOMAIN`), Open Graph / Twitter cards, `theme-color`, JSON-LD `WebApplication`, `favicon`/`apple-touch-icon` paths with `assetBasePath`; added `pages/_document.tsx` (`lang="ja"`) and `public/robots.txt`. Documented `NEXT_PUBLIC_SITE_URL` in [BUILD.md](./BUILD.md).

## [1.0.3] - 2026-03-29

### Added
- **Issue #14**: New spectrum mode **7 — Spectrum fill** (filled area under frequency curve + top outline); Canvas 2D and WebGL; layout/mode settings key `7` in export/import.
- **Issue #16**: **Multi-image gallery**: multi-select / drag-drop multiple still images, **Add image** append, **Prev/Next**, **auto-advance** during preview/recording (2–30s interval, persisted in client storage / cookies). First image still sets canvas layout for Auto mode.
- **Issue #17**: **Scanlines** overlay effect (CRT-style horizontal lines); Canvas 2D and WebGL; strength presets; saved like other effects.
- **Issue #23**: **Gallery image transitions** (none / random per switch / crossfade, wipes, iris, slides, zoom, checker, venetian, diagonal, flash); Canvas 2D + WebGL via `lib/galleryImageTransition.ts`. **Spectrum scale** 0.5–5× and **offset** ±150% (integer-clamped in save/import). **Spectrum color**: 20-color palette (10-column grid) + `#RRGGBB` (`common_spectrumColorHex`; legacy preset migration). **Shared palette** in `lib/colorPalette.ts`. **Space / sparkle / dust** tint colors (`effectTintColor`, palette + hex). **Scanlines** strength increased. Settings export adds `galleryTransitionMode`, particle colors, `spectrumColorHex`; i18n `gallery.tr*` (ja/en).

## [1.0.2] - 2026-03-29

### Added
- **Video quality (Issue #15)**: Settings tab — output canvas resolution display, **recording video bitrate** (1–40 Mbps, `MediaRecorder` `videoBitsPerSecond` when supported), **MP4 AAC bitrate** (128 / 192 / 256 kbps) passed to FFmpeg on loudnorm path. Persisted in `localStorage` and settings export/import.
- **Waveform color & style (Issue #13)**: Spectrum tab — **color presets** (white / cyan / magenta / green / gold / custom `#RRGGBB`) for modes 0, 1, 2, 5 and for modes 3 & 4 when rainbow is off; **toggle** for rainbow gradient on symmetric bars & dots (modes 3 & 4). Canvas 2D and WebGL aligned. Export/import and clear reset included.

## [1.0.1] - 2026-03-29

### Added
- **GitHub Releases static bundle**: `npm run release:zip` → `dist/music-waves-visualizer-static-v*.zip` with `visualizer/`, root **`INSTALL_LOCAL_STATIC.md`**, and **`docs-bundled/`** (license, changelog, hosting, FFmpeg, nginx sample, terms/privacy). User guide: [docs/INSTALL_LOCAL_STATIC.md](./docs/INSTALL_LOCAL_STATIC.md).

### Changed
- Page `<title>` / `og:title`: **Music Waves Visualizer(改) #MWV**

---

## 日本語（変更履歴の概要）

### [1.0.6] 概要（2026-06-05）

- レーザーエフェクト、ファイルピッカー（静止画/動画/すべて・音声/動画/すべて）、雨・水滴の音連動感度。
- 動画長・フェードを音設定タブに統合。早期停止時の音声・画像フェード。YouTube 向け loudnorm +0.05（UI は -14 のまま）。
- サビ揺れの動的応答、設定「すべてクリア」補足文、hooks 整理。

- バイリンガルUI（日本語/英語）を追加。ブラウザ言語で自動切り替え。
- Reactハイドレーションエラーを修正（英語環境での言語切り替えをuseEffectに移動）。
- ドキュメントを英語メイン＋日本語セクションに統一。
- 利用規約（CPU/GPU/メモリ）・READMEに USER_TERMS / PRIVACY へのリンク。
- スペクトラム: 折れ線・波形上下対称のボタン非表示、仕様書・SPECIFICATION に記載。
- 空気感（ほこり）: 粒サイズ調整・Canvas2D を WebGL に寄せた描画。
- きらきら: ラジアル・重ねグロウを廃止し星形のみ（Canvas/WebGL 揃え）。
- `meta` / `og:description` を日英併記に整理。

## [Original Version]

元のリポジトリ（https://github.com/komura-c/music-waves-visualizer）の機能：
- 画像ファイルの読み込み
- 音楽ファイルの読み込み
- リアルタイム波形可視化（7つの表示モード）
- プレビュー機能
- 動画録画機能（MP4形式で出力）

元記事: https://tech-blog.voicy.jp/entry/2022/12/11/235929

