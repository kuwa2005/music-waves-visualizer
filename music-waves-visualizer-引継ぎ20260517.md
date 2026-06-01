# music-waves-visualizer 引継ぎ資料（2026-05-17）

リポジトリ: `/home/ubuntu/00_develop/music-waves-visualizer`  
フォーク: [kuwa2005/music-waves-visualizer](https://github.com/kuwa2005/music-waves-visualizer)（元: [komura-c/music-waves-visualizer](https://github.com/komura-c/music-waves-visualizer)）  
作成時点のローカルブランチ: **`main`**（2026-05-23 更新: 本セッション分をコミット予定）

**2026-06-01 セッション追記** — 詳細は [docs/SESSION_20260601.md](docs/SESSION_20260601.md)、[docs/CHANGELOG.md](docs/CHANGELOG.md) Unreleased。

| 領域 | 内容 |
|------|------|
| 画面タブ | `screenMotion.ts` / `drawStillScreenBackground.ts` — ズーム・パン・画像フェード・音連動演出 |
| スペクトラム | モード 17–19 波形、20 パーティクル、21 放射状、6 レトロEQ＋バー領域のみ暗転 |
| エフェクト | `waterRipple`（ripple / heart / firework）、軽量モード・適応リング数 |
| 永続化 | localStorage 正、旧 Cookie 初回移行（`mwvCookieStorage.ts`） |
| MP4 サムネ | **静止画背景**時は原画 JPEG；それ以外は合成の先頭フレーム — [SESSION_20260601.md](docs/SESSION_20260601.md) |
| 新規 lib | `spectrumAdjustments.ts`, `mp4Thumbnail.ts`, `public/ffmpeg` コピー先追加 |
| **2ペイン UI** | `≥1024px` 左プレビュー＋右タブ。誤 `checkout HEAD` 後に transcript / 静的 bundle 照合で復元（`a68ec07`） |
| **offset スライダー** | `ResettableSlider` + モード2プレビューガイド●（ドラッグ可） |

**2026-05-23 セッション追記** — 詳細は [docs/audio-quality.md](docs/audio-quality.md)、[docs/CHANGELOG.md](docs/CHANGELOG.md) Unreleased。

| 領域 | 内容 |
|------|------|
| ミラーボール | Canvas/WebGL 実装済み。UI は `EFFECT_TYPES_UI_HIDDEN` で非表示（コード・Cookie・export は維持） |
| 動画長制限 | フェードイン/アウト秒、`lib/clipAudioFade.ts`、UI 3 行（プリセット／開始+秒数／フェード） |
| SRT 作成支援 | Space: keydown=開始（未再生なら再生）、keyup=終了（終了時に再生トグル廃止）。記録 Switch は Space 対象外 |
| 字幕表示補正 | ±2 秒スライダー。プレビュー・録画のみ。Cookie/エクスポート非保存 |
| SRT DL 名 | MP4 と同じベース名（`buildDownloadBaseName`） |
| MP4 音声 Tier A | `audioBitsPerSecond`、録画 384k デフォルト、AAC 320k、LUFS -14。プリセット: 配信 8Mbps / 高音質 14Mbps |
| 未実装 | Tier B WAV mux、512k 自動、ミラーボール UI 公開 |

---

## 1. このプロジェクトの目的

**Music Waves Visualizer（改）** は、静止画・音楽（および字幕・動画背景）を読み込み、ブラウザ上で音声波形アニメーション付き **MP4 動画** を生成する Web アプリです。

| 項目 | 内容 |
|------|------|
| 開発環境 | **WSL2 + Node.js**（Docker ワークフローは廃止済み） |
| 日常の確認 | `npm run dev` / `npm run build` |
| レンタルサーバー向け静的配布 | `npm run build:html` → **`visualizer/`**（gitignore、再生成物） |
| 上流 | komura-c/music-waves-visualizer のフォーク |
| デフォルトブランチ | **`main`**（旧 `master` は統合・削除済み） |
| バージョン（package.json） | **1.0.3** |
| デモ | https://lil.la/visualizer/ |

---

## 2. 変更済みファイル

調査日: 2026-05-17（`git status` / `git log` / `gh pr view 39` / `origin/main`）

### 2.1 main にマージ済み（`origin/main`）

| コミット / PR | 概要 | 主な変更ファイル |
|---------------|------|------------------|
| `e3895e7` 付近 | Docker 廃止、WSL 開発標準化 | `Dockerfile*` / `docker-compose*` / `README_DOCKER.md` 等 **削除**、`README.md`、`docs/BUILD.md`、`.cursor/rules/deployment.mdc` |
| `c4973fb` | `master` → **`main` 統合** | ブランチ整理 |
| `be9b74a` | ローカルバックアップルールを ignore | `.gitignore`（`.cursor/rules/backup-location.mdc`） |
| `064d897` | README 現行 UI 向け更新 | `README.md` |
| `94e6afa` | **docs を `docs/` に集約**、**動画高速生成 UI を非表示** | `docs/*` へ移動、`pages/index.tsx`（ボタン削除）、`README.md`、`scripts/make-release-zip.sh` 等 |
| `4d1704e` | **「画像を追加」ボタン非表示** | `pages/index.tsx` |
| `f83bad7` | USER_TERMS FAQ 拡充（クレジット・共有） | `docs/USER_TERMS.md` |
| **PR #39**（マージコミット `d39e9c0`, 2026-05-14） | SRT 作成支援 UX、設定タブ「SRT」チェックでパネル表示 | `pages/index.tsx`, `locales/ja.json`, `locales/en.json` |
| リリース **v1.0.3** | 静的 ZIP 等 | GitHub Releases |
| `03ddd1e` | 個人用引継ぎメモを ignore | `.gitignore`（`docs/引継ぎ資料_Windows_Cursor.md`） |
| 上流 PR #29 | komura-c 向け PR は **クローズ済み**（フォーク独自運用） | — |

**PR #39 の実装要点（マージ済み）**

- 字幕タブ: SRT 作成支援パネル（歌詞貼り付け → タイミング → 書き出し）
- UX: キュー一覧のスクロール追従、**開始**でプレビュー再生、**終了**で再生停止
- 設定タブ: チェックボックスラベルは **`SRT` のみ**（`common_srtAuthorPanelEnabled` Cookie で永続化）
- ロケール: セクションタイトルを「字幕作成支援（隠し機能）」系に整理

### 2.2 ブランチ `cursor/srt-author-ux-and-hidden-panel`（ローカル作業ブランチ）

- コミット `ae9ab46` = PR #39 の作業コミット（**GitHub 上は `main` に squash マージ済み** `d39e9c0`）
- ローカル **`main` ブランチが `f83bad7` のまま**の場合 → `git checkout main && git pull origin main` で `d39e9c0` を取得すること

### 2.3 本セッション（2026-05-23、コミット対象）

| ファイル | 概要 |
|----------|------|
| `lib/Effects.ts`, `lib/Canvas.ts`, `lib/WebGLRenderer.ts` | ミラーボール描画、スペクトラム間引きとエフェクト毎フレーム描画の分離 |
| `lib/clipAudioFade.ts` | クリップ区間フェード（新規） |
| `lib/subtitles.ts` | `displayTimingOffsetSec` |
| `pages/index.tsx` | 上記 UI・音質 Tier A・SRT Space・DL 名・`EFFECT_TYPES_UI_HIDDEN` |
| `locales/ja.json`, `locales/en.json` | ミラーボール・フェード・音質プリセット・表示補正文言 |
| `pages/api/hello.ts` | **削除**（未使用サンプル） |
| `docs/audio-quality.md` | 音質方針・YouTube/TikTok 根拠（新規） |
| `docs/CHANGELOG.md`, `docs/README.md` | Unreleased・索引 |
| **本ファイル** | セッション追記 |

**コミットしない**: `.api.bak/`、`visualizer/`、`node_modules/` 等（従来どおり）。

### 2.4 ローカルのみ / 生成物（通常コミットしない）

| パス | 備考 |
|------|------|
| `visualizer/` | `npm run build:html` の出力。`.gitignore` |
| `out/`, `.next/`, `node_modules/` | ビルド・依存 |
| `public/ffmpeg-core/` | `postinstall` / `scripts/copy-ffmpeg-core.cjs` で生成 |
| `.cursor/rules/backup-location.mdc` | ローカル運用ルール（gitignore） |
| `docs/引継ぎ資料_Windows_Cursor.md` | 個人用メモ（gitignore） |
| **`music-waves-visualizer-引継ぎ20260517.md`** | 本ファイル（ルート MD。コミットはユーザー指示時のみ） |

---

## 3. まだ未解決の問題

### 動画高速生成（`動画高速生成` / QuickVideoEncoder）

- **UI ボタンは意図的に非表示**（`94e6afa`）。`onQuickEncodeMovie` 等のコードは残存
- 既知: 動画入力時はスナックバーで非対応、出力品質・同期など **バグあり**。修正前に UI を復活させないこと
- 進行中 UI（`isQuickEncoding` + プログレスバー）はコード上残るが、通常ユーザーからは到達不可

### SRT 作成支援（設定「SRT」で表示）

- 設定タブ **「SRT」** チェックで字幕タブにパネル表示（Cookie: `common_srtAuthorPanelEnabled`）
- **タイミング記録（2026-05-23）**: Space **keydown** = 行開始（未再生なら `onPlaySound`）、**keyup** = 行終了（終了時の再生停止トグルは廃止）。歌詞 TextField 等の入力中のみ Space 無視（記録モード Switch の checkbox は無視対象外）
- **表示タイミング補正**: 字幕タブ ±2 s。プレビュー/録画のみ。SRT ファイル本体・Cookie には書かない
- **SRT ダウンロード名**: 音源ファイル名ベースで MP4 と揃える（`buildDownloadSrtName`）
- 結合テスト推奨: 上記 Space 挙動、スクロール追従、グローバルオフセット、DL 名、設定 JSON エクスポート/インポート

### ミラーボール（UI 非公開）

- `effect.type === "mirrorBall"` で描画可能。エフェクト種別の `<Select>` からは **`EFFECT_TYPES_UI_HIDDEN` で除外**
- Cookie `common_mirrorBall`、設定 export にパラメータあり。UI 再公開は別タスク

### 動画品質・クリップ（2026-05-23）

- 詳細: [docs/audio-quality.md](docs/audio-quality.md)
- クリップタブ: フェードイン/アウト（`lib/clipAudioFade.ts`）。明示的な「秒数」で切った区間のみフェードアウト適用

### ブランチ / リモートの同期

- **PR #39 は GitHub 上 MERGED**（ドラフトではない）。ローカル `main` が古いだけの可能性大
- 作業ブランチ `cursor/srt-author-ux-and-hidden-panel` は `origin` と同期済みだが、今後は `main` で開発するのが自然

### ビルド警告（`npm run build` 実施 2026-05-17）

```
Critical dependency: the request of a dependency is an expression
  → @ffmpeg/ffmpeg worker（既知・多くの場合無害）
```

- **`useLayoutEffect` と SSR**: Cookie 読み込み・キャンバスサイズ・SRT スクロール追従で使用。意図的にクライアント専用処理。ハイドレーション不一致を避けるため初期 state は固定値

### Git ローカル設定

- この環境では **`git config user.name` / `user.email` が未設定**の可能性
- 過去コミットは環境変数等で作者情報を付与した記録あり。恒久利用時はユーザー自身が `git config` を設定すること（エージェントは `git config` を変更しない方針）

---

## 4. 重要な設計方針

### 開発・検証

| コマンド | 用途 |
|----------|------|
| `npm run dev` | 開発サーバー（`http://localhost:3000`） |
| `npm run build` | 本番ビルド・型・Lint 確認 |
| `npm run build:html` | 静的 export → **`visualizer/`** 再生成 |
| `npm run build:html:lil-la` | `NEXT_PUBLIC_SITE_URL=https://lil.la` 付き静的ビルド |
| `npm run release:zip` | Releases 用 ZIP（`visualizer/` 無ければ `build:html` 実行） |

詳細: `.cursor/rules/deployment.mdc`、`docs/BUILD.md`

### ドキュメント配置

- ルートの Markdown は **`README.md` のみ**（運用ルール）
- その他は **`docs/`**（CHANGELOG, USER_TERMS, BUILD, HTML_HOSTING 等）

### 配布・Git 運用

- **`visualizer/`** = レンタルサーバー用成果物。リポジトリには含めない
- **Docker なし**。upstream（komura-c）への push は **意図があるときのみ**
- **コミット / push / PR 作成はユーザー指示時のみ**（Cursor ルール）
- `.cursor/rules/backup-location.mdc` は gitignore（バックアップは `bak/` 配下へ — ルールファイル参照）

### SRT 作成支援パネル

- Cookie キー: **`common_srtAuthorPanelEnabled`**（`"1"` / `"0"`）
- 設定タブ: ラベル **`SRT`** のみ（説明文なし）
- 字幕タブ: `srtAuthorPanelEnabled === true` のとき Accordion 表示
- ロジック: `lib/srtAuthoring.ts` + `pages/index.tsx` 内ハンドラ

### レンダラー

- 起動時デフォルト: **Canvas 2D**（互換性優先）
- **動画背景使用時は WebGL ではなく Canvas 2D にフォールバック**（仕様）

### 設定永続化

- 大半の UI 設定: **`lib/mwvCookieStorage.ts`**（Cookie、大きい値は分割 Base64）
- レガシー `localStorage` は初回読み込みで移行
- **保存しない例**: 画像/音楽ファイル本体、タイトル文言、SRT 本文（スタイル・トグルは保存）

---

## 5. 次にやるべき作業

1. **手動テスト（2026-05-23 変更分）**  
   - 配信/高音質プリセット → 録画 → MP4（LUFS・ビットレート）  
   - クリップ + フェードイン/アウト  
   - SRT 記録 Space、表示補正、DL ファイル名  
   - （任意）開発者モードで `mirrorBall` を effect 種別に設定して描画確認

2. **（任意）リリース ZIP**  
   `npm run build:html` → `npm run release:zip` → GitHub Release（ユーザー指示時）

3. **動画高速生成**  
   バグ修正完了まで UI 復活禁止

4. **未実装の検討**  
   Tier B WAV mux、512k 自動、ミラーボール UI 公開 — [docs/audio-quality.md](docs/audio-quality.md) 参照

5. **git user.name / user.email**  
   ローカル開発マシンで恒久設定を推奨

---

## 6. 絶対に壊してはいけない仕様

### FFmpeg.wasm（SharedArrayBuffer）

- **開発**: `next.config.js` の `Cross-Origin-Opener-Policy` / `Cross-Origin-Embedder-Policy` ヘッダ
- **静的配信**: `visualizer/.htaccess`（`htaccess-for-export` からコピー）

```apache
Header set Cross-Origin-Opener-Policy "same-origin"
Header set Cross-Origin-Embedder-Policy "require-corp"
```

### 通常の動画生成（「動画を生成」）

- フロー: `onRecordMovie` → 録画 → **`generateMp4Video`**（`lib/Ffmpeg.ts`）
- MP4 出力パス・進捗 UI・キャンセル処理を変更する場合は回帰テスト必須

### 静的 export の basePath

- `BUILD_HTML=1` 時: **`basePath` / `assetPrefix` = `/visualizer`**（`next.config.js`）
- 別パスでホストする場合はソース側で変更後 **`npm run build:html` を再実行**

### 動画高速生成

- **バグ修正完了まで UI を再表示しない**（意図的に hidden）

### Cookie 永続化

- `mwvCookieStorage` による設定保存・移行ロジックを壊さない（キー名変更は既存ユーザー設定を失う）

### 動画背景 + レンダラー

- 動画背景アクティブ時は **Canvas 2D 強制**（WebGL との描画不整合を避ける）

---

## 付録: 主要パス・リモート

```
origin    → https://github.com/kuwa2005/music-waves-visualizer.git
pages/    → メイン UI（index.tsx）
lib/      → Canvas, WebGL, Effects (mirrorBall), clipAudioFade, Ffmpeg, QuickVideoEncoder, mwvCookieStorage, srtAuthoring, subtitles
locales/  → ja.json, en.json
docs/     → 仕様・ビルド・規約
visualizer/ → 静的配布（gitignore）
```

**関連 URL**

- PR #39: https://github.com/kuwa2005/music-waves-visualizer/pull/39 （MERGED）
- Release v1.0.3: https://github.com/kuwa2005/music-waves-visualizer/releases/tag/v1.0.3

---

*本資料は 2026-05-17 初版、**2026-05-23** にセッション分を追記。以降のマージ・リリースで内容が変わる場合は更新すること。*
