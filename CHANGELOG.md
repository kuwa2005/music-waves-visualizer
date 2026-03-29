# Changelog

## [Unreleased]

### Documentation
- **`npm run build:html:lil-la`**: One-shot static build with `NEXT_PUBLIC_SITE_URL=https://lil.la` for [lil.la/visualizer](https://lil.la/visualizer/) (canonical / OG). Documented in [docs/BUILD.md](./docs/BUILD.md), [README](./README.md), and [`.env.production.example`](./.env.production.example).

### Changed
- **Mode 6 (glyco)**: Log-spaced bins (`GLYCO_LOG_BIN_MAX_FRAC`), right-edge **local max** (`glycoBarRawEnergy`). Vertical mapping uses shared **`glycoAdjustedLevel`** (γ≈1.18 peak compression) and **`GLYCO_BAR_VERTICAL_SCALE`** headroom so bars do not sit at MAX as often (Canvas 2D + WebGL).
- **Gallery auto-advance**: Enabled automatically only when the gallery goes from one image to **two or more**; turned **off** when only one or zero images remain. Manual OFF is kept when adding more images without dropping below two. Interval `common_galleryAutoSec` remains saved; `common_galleryAutoEnabled` is no longer persisted (removed on load).
- **SEO / HTML**: Expanded `<meta description>`, keywords, robots, canonical (when `NEXT_PUBLIC_SITE_URL` or `NEXT_PUBLIC_DOMAIN`), Open Graph / Twitter cards, `theme-color`, JSON-LD `WebApplication`, `favicon`/`apple-touch-icon` paths with `assetBasePath`; added `pages/_document.tsx` (`lang="ja"`) and `public/robots.txt`. Documented `NEXT_PUBLIC_SITE_URL` in [docs/BUILD.md](./docs/BUILD.md).

## [1.0.3] - 2026-03-29

### Added
- **Issue #14**: New spectrum mode **7 — Spectrum fill** (filled area under frequency curve + top outline); Canvas 2D and WebGL; layout/mode settings key `7` in export/import.
- **Issue #16**: **Multi-image gallery**: multi-select / drag-drop multiple still images, **Add image** append, **Prev/Next**, **auto-advance** during preview/recording (2–30s interval, persisted in `localStorage`). First image still sets canvas layout for Auto mode.
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

## [Unreleased]

### Added
- **Clip length limit (short platforms)**: Added a **clip window** for preview/recording with presets for **YouTube (60s)**, **TikTok (60s)**, **NicoNico (300s)**. Playback starts at the specified start position and ends after the specified duration.
- **Resolution auto mode**: Added `Auto` under Settings > Resolution. It detects loaded image aspect ratio and maps to **16:9 / 9:16 / 1:1**.

### Changed
- **Settings tab order**: Reordered to **Spectrum Analyzer / Effects / Audio / Clip Length / Settings**.
- **Effects UI**: Unified Space 1/2/3 into a single **Space** entry; type selection moved into the effect parameter panel.
- **Effects parameters**: Effect parameter section is now collapsible (default collapsed), matching spectrum parameters.
- **Color input UI**: Replaced native color picker with **16-color palette + #RRGGBB text input** (with validation) for weather colors.

### Fixed
- **Auto-orientation initial render**: Fixed issue where image aspect ratio could appear incorrect immediately after load in auto orientation mode (correct after preview). Background draw now uses intrinsic image size (`naturalWidth`/`naturalHeight`) in both Canvas 2D and WebGL paths.

### Removed
- **Google Analytics**: removed `lib/Gtag.tsx`, `lib/gaId.ts`, app integration, and `@types/gtag.js`. No client-side analytics or tracking cookies in this fork.

### Documentation
- Aligned **PRIVACY_POLICY.md**, **EU_GDPR_NOTICE.md**, **docs/BUILD.md**, **docs/SECURITY.md**, **README.md**, **docs/README.md**, **仕様書.md** with the above (no GA / no tracking cookies).

### Security / maintenance (fork)
- Same-origin **FFmpeg core** (`@ffmpeg/core` 0.10.x) via `scripts/copy-ffmpeg-core.cjs`; HTTP security headers (nosniff, frame, referrer); client-side file size / MIME checks; Docker `NEXT_PUBLIC_DEVELOPER_MODE` default off via `ARG`; Next.js bumped toward 13.5.x; `npm audit fix` where non-breaking (`--legacy-peer-deps`)

### Added
- **Documentation hub** under `docs/`: [docs/README.md](./docs/README.md), [BUILD.md](./docs/BUILD.md), [SECURITY.md](./docs/SECURITY.md), [FFMPEG.md](./docs/FFMPEG.md); README / README_DOCKER / DEVELOPER_MODE / HTML_HOSTING cross-links updated
- Bilingual UI (Japanese / English) via i18next. Language auto-detected from browser.
- `USER_TERMS.md`: clause on CPU/GPU/memory use; link from app header to terms on GitHub
- README / SPECIFICATION: links to `USER_TERMS.md`, `PRIVACY_POLICY.md`; spectrum UI vs engine documented
- ライセンス対応: 元作者 (komura-c) が MIT License を付与したため、本リポジトリに LICENSE（MIT）を追加し、README / NOTICE を更新
- 設定の保存・エクスポート/インポートを新仕様に変更
  - 共通設定: 音量調整、各エフェクトの強度（エフェクトごとに個別保存）
  - レイアウト別: 縦/横/正方形ごとの各スペアナモードの倍率・位置
  - エクスポート: 全設定を一括出力
  - インポート: 存在する項目のみ上書き（旧形式にも対応）
- エフェクト機能（宇宙空間：ワープ風スターダスト、プレビュー/録画中のみ表示、密度3段階）
- 宇宙空間（等速）・宇宙空間（音源連動）エフェクト
- ビネット・レインボー・カーテンエフェクト（音源連動、強度3段階）
- 音量設定（目標LUFS）：YouTube等(-14)、ニコニコ動画(-15)、任意値の指定、MP4変換時にloudnorm適用
- 動画生成・変換中の注意喚起バナー（「生成中はウィンドウを切り替えたり閉じないでください」）
- クリアボタン（ページロード時の状態に戻す）
- Docker HTTPS版（他PCからアクセス可能、nginx + 自己署名証明書）
- レンタルサーバー用静的HTML配布（`npm run build:html`、basePath: /visualizer）
- 証明書生成スクリプト（`generate-ssl-cert.sh`）
- ドラッグ&ドロップ対応（複数ファイル対応、拡張子による自動判定）
- MP4ファイル対応（音楽ファイルとして扱う、または静止画として抽出）
- ファイル名表示機能
- スペクトラムアナライザーをボタン化
- 解像度選択をボタン化
- プレビューと録画ボタンを横並びに配置
- 9:16解像度時のプレビューサイズを半分に調整
- GPU加速による描画性能向上
- 開発者モード機能（設定の保存・読み込み、エクスポート/インポート）

### Changed
- **Dust (atmosphere) effect**: particle sizes biased toward smaller circles; max size scaled; Canvas 2D draws solid circles with `lighter` blend to match WebGL (no radial glow)
- **Sparkle (きらきら) effect**: removed radial / layered soft glow; Canvas 2D and WebGL draw star shape (+/X/*) and core only, aligned between renderers
- **Spectrum UI**: line mode (1) and symmetric waveform (5) buttons hidden; saved `session_mode` 1/5 falls back to 0
- **Meta tags (`_app.tsx`)**: `description` / `og:description` bilingual (JA + EN) for crawlers and sharing
- モード6を3D風バーからグライコ風（1980年代コンポ風ピークホールド）に変更
  - ピークレベルを「-」ダッシュでホールド、約350ms保持後にゆっくり減衰
  - アンバー色のVUメーター風表示
- 検証方法を Docker HTTPS 版に統一: ポート3000でのリモート検証は COOP/COEP 制約により廃止
- Docker HTTPS版を整理: `visualizer/` 静的HTMLのみを nginx で配信するシンプル構成に変更
  - `html/` フォルダを廃止、`visualizer/` を開発の正とする
  - `Dockerfile.static` + `nginx-static-https.conf` で 8443 ポート HTTPS 配信
  - アクセス: `https://<サーバーIP>:8443/visualizer/`
- エフェクト強度を強化（弱・中・強の見た目を明確化）
- フィルムグレイン・グリッチエフェクトをUIから非表示に変更
- 「表示調整」を「表示・音量設定」に名称変更（音量設定欄を追加）
- ヘッダーを洗練されたデザインに変更（横幅を活用、上下の高さを節約）
- ドラッグ&ドロップエリア内にファイル選択ボタンを配置
- 解像度ラベルの表示形式を変更（「横長 1920×1080 (16:9)」形式）
- プレビューウィンドウを1/4サイズに変更（9:16の場合はさらに半分）
- レイアウトをレスポンシブに改善（横幅フル使用）

### Fixed
- React hydration errors (#418, #423, #425) when browser language is English (language switch moved to useEffect after hydration)
- **Resolution switch initial render**: When changing resolution after loading an image, the canvas could appear black or distorted until preview started. Re-render now occurs immediately on resolution change.
- スペクトラムアナライザーをプレビュー/録画中のみ描画するよう変更（エフェクトと同様の動作）
- Canvas 2D: モード3（上下対称バー）・モード4（ドット表示）・モード6（3D風バー）で getByteFrequencyData が呼ばれていなかった問題を修正
- Docker HTTPS版: nginx に mime.types を追加し、CSS が正しい Content-Type で配信されるよう修正
- レイアウト崩れを修正（メインコンテナ幅制限、メディアクエリの grid/flex 不整合を解消）
- Reactハイドレーションエラー（#418, #423）を修正（localStorageをuseEffectで読み込み、初期レンダリングをサーバー・クライアントで一致）
- 曲終了時にプレビューが自動停止するように修正
- 画像スケーリングをcoverに変更（アスペクト比が推奨サイズと異なる場合、隙間なしで最大表示、はみ出しは中央でトリミング）
- 音声の二重接続による音割れ（AudioBufferSourceNodeの重複接続を削除）
- 2回目以降の動画生成でスペクトラムアナライザーが表示されない問題
- MP4ファイルの音声抽出処理
- 録画時の動画ファイル処理
- 画像がキャンバスより小さい場合に拡大されない問題（推奨解像度に自動スケーリング）
- faviconのbaseURL未設定時の404エラー（`undefinedfavicon.ico`）

### Documentation
- README / SPECIFICATION / 仕様書: sparkle & dust effects and rendering policy (no radial glow for sparkle; dust particle notes)
- Documentation unified: English main + Japanese section for all docs
- README.mdを更新（新機能の説明を追加）
- DEVELOPER_MODE.mdを追加（開発者モード機能の説明）
- フッターに元記事へのリンクを追加

---

## 日本語（変更履歴の概要）

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

