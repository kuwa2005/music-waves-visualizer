# Video background & MP4 (music vs picture)

This fork ([kuwa2005/music-waves-visualizer](https://github.com/kuwa2005/music-waves-visualizer)) treats **MP4** in two roles:

1. **Music / audio source** — pick under **Music** (or drag & drop as the only video when there are no stills). Audio is decoded via `HTMLVideoElement` + Web Audio (`MediaElementAudioSourceNode`), or you can use WAV/MP3/etc. as `AudioBuffer`.
2. **Background video** — a **single** MP4 used only as the canvas background (cover fit), synced to the **active audio timeline**.

For drag & drop rules in the UI, see [locales](../locales/) copy under `dropZone.caption` (ja/en).

---

## User-facing rules

| Action | Behaviour |
|--------|-----------|
| **Choose image(s)** (replace) | Still images only, **or** **one** MP4 alone — not both in the same file dialog selection. The file input uses `accept` including `video/mp4` and common extensions so OS pickers offer MP4 (behaviour varies by browser). |
| **Choose image(s)** + already **2+ gallery stills** + user picks **one** MP4 | Confirmation dialog: gallery is cleared, then that MP4 loads as background video. |
| **Add image** | **Still images only.** Blocked while **video background** mode is active (clear or switch first). |
| **Drag & drop** | Mixing stills and MP4 in one drop shows an error (neither is applied from that conflict). Multiple MP4s in one drop without stills: error for “video as music” side; see app logic. |
| **Music** load | Video file → audio source (existing behaviour). Loading a non-video **music** file clears video-audio element and standalone background video state. |

**Clip length:** Preview/recording length follows the **audio** timeline. If the background video is shorter, the last decoded frame typically remains visible (browser `drawImage` behaviour); fine-tuning is tracked in GitHub issues below.

**Renderer:** While **video background** is active, the app **switches to Canvas 2D** (WebGL path does not sample `HTMLVideoElement` into the GL background yet). See [issue #36](https://github.com/kuwa2005/music-waves-visualizer/issues/36). Recent perf work on this branch (PR [#41](https://github.com/kuwa2005/music-waves-visualizer/pull/41)) improved **preview** pacing (30 fps throttle) and removed redundant FFT reads in mode 6; it does **not** implement WebGL video backgrounds.

**Audio-only MP4** (no decodable video size): Background can be **cleared transparent** for compositing in another NLE (`clearBackgroundTransparent` in `lib/Canvas.ts`).

---

## Frame pacing / FPS policy

- **Preview only**: video-background preview is throttled to **30 fps** to keep the UI responsive.
- **Recording / generation**: draw pacing and `canvas.captureStream()` are capped at **max 60 fps** for Canvas 2D and WebGL paths.
- The 30 fps preview throttle does **not** reduce normal video generation quality; recordings are preserved up to 60 fps.

---

## Recording (MP4 fixed output)

- User-facing output is fixed to **MP4 only**.
- Alpha/transparency is intentionally **not supported**.
- Internally the browser records to WebM first (`MediaRecorder`, max 60 fps capture) and then converts to MP4 via FFmpeg in the app.
- Recording codec selection UI was removed to keep the conversion path stable.

---

## Related code (quick map)

| Area | Files |
|------|--------|
| Background draw order | `lib/Canvas.ts` (`drawBars`, `drawVideoCover`, gallery transition) |
| Cover helper | `lib/drawVideoCover.ts` |
| Page logic | `pages/index.tsx` (`loadVideoAsAudioSource`, `applyBackgroundMp4File`, `spectrumVideoBackground`, dialogs) |

---

## GitHub issues (this fork)

| Issue | Topic |
|-------|--------|
| [#34](https://github.com/kuwa2005/music-waves-visualizer/issues/34) | Sync / drift when audio and background are **different** MP4s |
| [#35](https://github.com/kuwa2005/music-waves-visualizer/issues/35) | Recording codec / transparency vs **FFmpeg** path |
| [#36](https://github.com/kuwa2005/music-waves-visualizer/issues/36) | **WebGL** background pipeline for MP4 (optional fallback UX) |

---

## 日本語サマリ

- **音楽用 MP4**: 「音楽を選ぶ」や D&D で、静止画と混ざっていなければ従来どおり **音声**として利用。
- **背景動画用 MP4**: 「画像を選ぶ」で **1 本だけ**（同一選択に静止画を混在させない）。ギャラリーが複数枚のときは **確認ダイアログ**の後に静止画を捨てて動画背景へ。
- **画像を追加**: **静止画のみ**。動画背景モード中は追加不可。
- **FPS 方針**: 動画背景プレビューのみ 30fps に間引き、録画・生成は最大 60fps まで維持。
- **同期・ドリフト**: 別ファイルの音声と映像の同期改善は **#34**（ベストエフォートの現状維持、長時間ドリフトは未解決）。録画コーデック・透過・FFmpeg は **#35**（クローズ）。WebGL での動画背景は **#36**（未実装、プレビュー 30fps 等の周辺 perf のみ PR #41）。

詳細な文言は UI の `locales/ja.json` / `en.json` を参照してください。
