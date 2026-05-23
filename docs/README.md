# Documentation index

Central entry point for setup, security, and FFmpeg notes for this fork (**kuwa2005 / KURAGASHI**), based on [komura-c/music-waves-visualizer](https://github.com/komura-c/music-waves-visualizer).

| Document | Description |
|----------|-------------|
| [BUILD.md](./BUILD.md) | Dependencies, `npm install`, local / static builds, FFmpeg asset copy |
| [INSTALL_LOCAL_STATIC.md](./INSTALL_LOCAL_STATIC.md) | GitHub Release ZIP / copy `visualizer/` only: paths, local HTTP, COOP/COEP, MP4 caveats |
| [SECURITY.md](./SECURITY.md) | Headers, file limits, dependency audits |
| [FFMPEG.md](./FFMPEG.md) | Self-hosted `@ffmpeg/core`, COOP/COEP, upstream PR #23 (0.12) vs this fork |
| [VIDEO_BACKGROUND.md](./VIDEO_BACKGROUND.md) | MP4 as music vs background video, UI rules, and MP4-fixed output policy |
| [audio-quality.md](./audio-quality.md) | MP4 Tier A audio/video bitrates, presets, YouTube/TikTok rationale |

## Additional docs

| File | Description |
|------|-------------|
| [../README.md](../README.md) | Overview, quick start |
| [HTML_HOSTING.md](./HTML_HOSTING.md) | Static `visualizer/` deployment |
| [DEVELOPER_MODE.md](./DEVELOPER_MODE.md) | FPS / dev UI flags |
| [SPECIFICATION.md](./SPECIFICATION.md) | Technical specification |
| [CHANGELOG.md](./CHANGELOG.md) | Changelog |
| [PRIVACY_POLICY.md](./PRIVACY_POLICY.md) | Privacy policy |
| [EU_GDPR_NOTICE.md](./EU_GDPR_NOTICE.md) | GDPR-related notice (EU/EEA) |

---

## ドキュメント一覧（日本語）

| 文書 | 内容 |
|------|------|
| [BUILD.md](./BUILD.md) | 依存関係・インストール・ビルド手順 |
| [INSTALL_LOCAL_STATIC.md](./INSTALL_LOCAL_STATIC.md) | リリース ZIP・`visualizer/` 単体利用時のパス・ローカル配信・MP4 用ヘッダ注意 |
| [SECURITY.md](./SECURITY.md) | セキュリティ関連の設定と運用 |
| [FFMPEG.md](./FFMPEG.md) | FFmpeg WASM の配信方式・上流 PR との違い |
| [VIDEO_BACKGROUND.md](./VIDEO_BACKGROUND.md) | MP4 を音楽用／背景動画用に分ける挙動・D&D 規則・MP4固定出力方針 |
| [audio-quality.md](./audio-quality.md) | 録画・MP4 の音声／動画ビットレート、配信・高音質プリセット、未実装 Tier B |

ルートの [README.md](../README.md) と [仕様書.md](./仕様書.md) も併せて参照してください。
