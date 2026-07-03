# 変更履歴

## [未リリース]

### 追加

- **字幕の位置オフセット(X)** (`lib/subtitles.ts`, `pages/index.tsx`): 字幕の水平位置オフセットスライダー（0〜10%）を追加。左/中央/右の揃え方向ごとに独立した値を保存。左寄せ・右寄せ時にテキストがキャンバス端からはみ出す問題を防止。

### 修正

- **プレビュー時のフレームレート不安定化** ([#43](https://github.com/kuwa2005/music-waves-visualizer/issues/43)): 通常プレビュー（録画・動画背景なし）で `getTargetFps` が `null` を返し、フレームスロットルが無効化。フレームレートがブラウザのディスプレイリフレッシュレート（例: 120 Hz）に追従し、視覚的に不安定になっていた。`DEFAULT_PREVIEW_FPS`（60）をフォールバックとして返すよう修正。

### 修正（2026-06 — レンダリング・字幕パフォーマンス、PR [#41](https://github.com/kuwa2005/music-waves-visualizer/pull/41)）

- **WebGL背景のスクラッチ**: ギャラリー切替・`screenMotion` で毎フレームキャンバス生成を廃止、`bgTempCanvas` / `texSubImage2D` を再利用（`lib/WebGLRenderer.ts`）。
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
- 残りのパフォーマンスバックログ: `filmGrain` フレームごとの `createImageData`、`mirrorBall` WebGL draw-call数 — [#42](https://github.com/kuwa2005/music-waves-visualizer/issues/42)。

## [1.0.6] - 2026-06-05

### 追加
- **レーザーエフェクト**: `lib/laserEffect.ts` — エッジバーストカラービーム（Canvas 2D + WebGL `drawLine`）；密度のみチューニング；UIタイプ `laser` と i18n `effect.laser`。
- **ファイルピッカーマスク**: `components/FilePickerSplitButton.tsx` + `lib/fileValidation.ts` — スプリットボタン（デフォルト/代替/すべて）で画像（静止画/動画）、音楽（音声/動画）、拡張子フィルタ（`gateImageFile`、`gateAudioFile`、`gateVideoAsMediaFile`）。
- **雨/水滴の音連動感度**: スライダー 0〜10（0.1刻み、0=OFF）；`lib/Effects.ts` で共有エンベロープ（`rainAudioSensitivity`、`waterRippleAudioSensitivity`）。

### 変更
- **音声タブ**: **クリップ長**コントロール（プリセット、開始/長さ、フェード）を**音声**タブに統合（`audioSettings.videoLengthSection`）；専用クリップ長タブを削除。
- **画面タブ — サビ揺れ**: コーラス揺れが瞬間値+ smoothed drive でピーク向上（`SHAKE_EXCESS_CAP`）；音量の大きいヒットに強く反応（`lib/drawStillScreenBackground.ts`）。
- **録画終了時のグレースフル停止**: 早期停止時にGainNodeフェード（`scheduleEarlyStopGainFade`）とオプションの画像アルファフェード（`StopGracefulImageFade`、`resolveCombinedImageFadeAlpha`）をスケジュールし、プレビュー/録画が途中で途切れないよう改善。
- **クリップ/MP4音声フェード**: `resolveAudioFadeSchedule` が**再生区間**にイン/アウトを適用（プラットフォーム最大長と一致する場合のみではない）；FFmpeg経路で `afade` + `-t` トリムを `buildFfmpegAfadeFilter` / `Mp4AudioFadeEncode` で追加（`lib/Ffmpeg.ts`、`lib/clipAudioFade.ts`）。
- **YouTube LUFSエンコードキャリブレーション**: UIは **-14** のまま；`loudnorm` 統合ターゲットを **-13.95**（+0.05）に設定（`lib/Ffmpeg.ts` の `resolveLoudnormIntegratedTarget`）。→ [audio-quality.md](./audio-quality.md)
- **設定**: 「すべてクリア」の下に補足ヒントを追加（`settings.clearAllSupplement` JA/EN）。
- **React hooks**: 再生停止、スペクトラム設定、エンコード経路周辺のコールバック/ref を安定化（exhaustive-deps / stale-closure 修正）。

### ドキュメント
- [SESSION_20260601.md](./SESSION_20260601.md) §2026-06-05、[SPECIFICATION.md](./SPECIFICATION.md)（エフェクト、ファイルピッカー、音声タブ）、[audio-quality.md](./audio-quality.md)（YouTube +0.05メモ）。

## [1.0.5] - 2026-06-02

### 修正（2026-06-02 — i18n復元）
- **UI内のハードコード英語**: スペクトラムモード17〜21、retro EQ（モード6）、画面タブのモーションスライダー、設定の**SRT**トグルが `t()` を使用し、`locales/ja.json` / `locales/en.json` のキーに変更。
- **欠落ロケールキー**: レイアウト改修ブランチ後に生のキーストリングや空白ラベルになっていた約58キー（`waveFamily`、`particleSpectrum`、`radialSpectrum`、`retroEq`、拡張 `screen.*`、`subtitle.author.panelToggle`）を復元。
- **`encode.warning`**: JA/ENコピーを明確化（「動画を生成中は…」）。

### 修正（2026-06-01 — レイアウト復旧フォローアップ）
- **誤った `git checkout HEAD -- pages/index.tsx`**: 進行中の2ペインUI（`desktopTwoPane`、左プレビュー+右コントロール）をロールバック。エージェントトランスクリプトと `visualizer/` / `visualizer.これが最新/` の静的バンドル（ビルド成果物、tracked外）とのdiffから復元。
- **スペクトラム位置スライダー（モード2）**: 水平/垂直オフセットに **`ResettableSlider`** を使用、共有 `handleOffsetSliderChange` / `spectrumOffsetSliderGuideProps`（ダブルクリックリセット、ドラッグ中のガイドドット）。プレビューオーバーレイに `previewCanvasStageRef`、`spaceCenterGuideLayer` / `spectrumOffsetGuideDot`、ガイドドットのポインタードラッグを使用（`lib/spectrumAdjustments.ts` マッピング）。

### 追加（2026-06-01セッション — レンダリング/lib）
- **画面タブ（静止画背景）**: `lib/screenMotion.ts`、`lib/drawStillScreenBackground.ts` — ズーム/パン（軸ごと速度）、クリップタイムライン上の画像フェードイン/アウト、音連動の明るさ/揺れ/コーラスズーム/フラッシュ。動画背景、ギャラリー切替、QuickVideoEncoderは対象外。
- **スペクトラムモード17〜21**: ウェーブファミリー（17〜19）、パーティクル（20）、ラジアル（21）を `lib/Canvas.ts` + `lib/WebGLRenderer.ts` に追加；モード6の **retro EQ glyco** 拡張（`retroEqParams`、`glycoBarRegionBounds` によるリージョン限定背景暗転）。
- **水滴/描画エフェクト**: `waterRipple` にバリアント `ripple` / `heart` / `firework`、ライトモード、アダプティブリング上限（`lib/Effects.ts`）。
- **スペクトラム調整モジュール**: `lib/spectrumAdjustments.ts` — 共有スケール/オフセット、モード2ピボット、オーバーレイパーセント逆マッピング。
- **MP4サムネイルヘルパー**: `lib/mp4Thumbnail.ts`；FFmpeg経路で呼び出し元JPEG vs 最初のエンコードフレームフォールバックをドキュメント化（`lib/Ffmpeg.ts`）。
- **FFmpegアセット**: `scripts/copy-ffmpeg-core.cjs` が `public/ffmpeg` と `public/ffmpeg-core` にコピー；ローダーが両方をプローブ（`lib/Ffmpeg.ts`）。

### 変更（2026-06-01セッション）
- **MP4カバーアート（静止画背景）**: `onRecordMovie` が未処理のギャラリストillを `buildMp4StillThumbnailJpeg` → `thumbnailJpeg` で渡す（最初のエンコード動画フレームではなく）。動画のみ背景や画像なしのフォールバックは変更なし。
- **設定永続化**: `lib/mwvCookieStorage.ts` — **localStorageをプライマリ**に；レガシークッキーは初回読込時に移行後クリア（→ [SESSION_20260601.md](./SESSION_20260601.md)）。
- **パフォーマンス**: モード1と5のスペクトラムスロットル；水滴アダプティブスケール；Canvas/WebGL間の共有ターゲットfpsペーシング。

### ドキュメント（2026-06-01）
- **[SESSION_20260601.md](./SESSION_20260601.md)**: セッションハブ（画面タブ、モード17〜21、リップル、永続化、MP4フレーム0、2ペインUI復旧、スペクトラムオフセットスライダー）。
- **[FFMPEG.md](./FFMPEG.md)**: `attached_pic` vs 未処理スチルの明確化。
- **[SPECIFICATION.md](./SPECIFICATION.md)**: デスクトップ2ペインレイアウト（≥1024px）；スペクトラムオフセット `ResettableSlider` + プレビュー動作。

### 追加
- **ミラーボールエフェクト**: Canvas 2D + WebGLオーバーレイ（`lib/Effects.ts`、`lib/Canvas.ts`、`lib/WebGLRenderer.ts`）。UIピッカーエントリは `pages/index.tsx` の `EFFECT_TYPES_UI_HIDDEN` で**非表示**；タイプが `mirrorBall` の場合、設定はクッキー/エクスポートに残存。
- **クリップフェードイン/アウト**: `lib/clipAudioFade.ts` — クリップウィンドウ用GainNodeスケジューリング；明示的な長さがトリム区間と一致する場合のみフェードアウト。UI: **クリップ長**タブにフェードイン/フェードアウト秒数（3行レイアウト: プリセット、開始+長さ、フェード）。
- **字幕表示タイミング補正**: 字幕タブに±2秒スライダー；プレビュー/録画のみ（`lib/subtitles.ts` の `displayTimingOffsetSec`）、クッキー/エクスポートには**保存しない**。
- **隠しSRT作成パネル**: 設定タブのチェックボックス **SRT**（ビットレート設定の下）で字幕作成ツールを表示；有効な状態で `.srt` を読み込むとエディターにも反映。
- **MP4音声Tier A**: `MediaRecorder` `audioBitsPerSecond`（デフォルト録画 **384 kbps**）；MP4 AAC 最大 **320 kbps**；プリセット **配信用** / **高音質** で LUFS -14、AAC 320、録画 384、映像 **8** / **14 Mbps**。

### 変更
- **SRT作成（隠し機能）**: セクションタイトルを **字幕作成支援（隠し機能）** に変更。Startでプレビュー再生とタイミング記録を開始；Endでプレビュー再生を停止；アクティブ/カレントと次のキュー行を表示維持；タイミング入力と歌詞エディターサイズを調整；カスタム▲/▼ホールドリピートコントロールの初期遅延200ms、繰り返し間隔45ms。
- **SRT作成完了**: 最後の歌詞を終了すると、記録されたキューをプレビュー/内部字幕メモリに適用するか確認。
- **SRTダウンロードファイル名**: `buildDownloadBaseName` / `buildDownloadSrtName` でMP4と同じベース名。
- **フレームペーシング/FPS**: 動画背景プレビューはプレビュー中のみ **30fps** にスロットル。録画/動画生成は **最大60fps** のdrawとCanvas 2D/WebGLの `captureStream` 経路を使用し、通常出力品質を60fpsまで維持。周期的なスタッターを回避するようフレームスロットルを調整；FPS状態更新は開発者モードのみで実行し、冗長なReact更新をスキップ。
- **スペクトラムスロットル（Canvas 2D/WebGL）**: モード1と5はスペクトラム描画のみスキップ；エフェクト/字幕は毎フレーム更新し、両レンダラーが共有ターゲットfpsフレームペーシングを使用。
- **デフォルトをプリセットに揃え**: ターゲット LUFS **-14**、録画音声 **384 kbps**、エクスポート AAC **320 kbps**；配信 **8 Mbps** / 高音質 **14 Mbps** 映像。
- 未使用の `pages/api/hello.ts` サンプルAPIルートを削除。

### ドキュメント
- **[audio-quality.md](./audio-quality.md)**: Tier A/B判断、YouTube/TikTok向け384/320 kbpsの根拠、プリセットテーブル。
- **引継ぎ** [`music-waves-visualizer-引継ぎ20260517.md`](../music-waves-visualizer-引継ぎ20260517.md): 2026-05-23セッション要約。

### ドキュメント（先行未リリース）
- **MP4/動画背景**: 新ハブ [VIDEO_BACKGROUND.md](./VIDEO_BACKGROUND.md)（EN + 日本語サマリ、UIルール、録画MIME、[#34](https://github.com/kuwa2005/music-waves-visualizer/issues/34) / [#35](https://github.com/kuwa2005/music-waves-visualizer/issues/35) / [#36](https://github.com/kuwa2005/music-waves-visualizer/issues/36)へのリンク）。[docs/README.md](./README.md)、[README.md](../README.md)、[SPECIFICATION.md](./SPECIFICATION.md) §8、[仕様書.md](./仕様書.md) §3.1 からインデックス。**リリースZIP**（`scripts/make-release-zip.sh`）に `docs-bundled/docs/VIDEO_BACKGROUND.md` をバンドル。
- **`npm run build:html:lil-la`**: `NEXT_PUBLIC_SITE_URL=https://lil.la` でのワンショット静的ビルド（[lil.la/visualizer](https://lil.la/visualizer/) 向け）。[BUILD.md](./BUILD.md)、[README](./README.md)、[`.env.production.example`](./.env.production.example) でドキュメント化。
- **永続化/クリップ/ビルド**: README、[SPECIFICATION.md](./SPECIFICATION.md)、[仕様書.md](./仕様書.md)、[PRIVACY_POLICY.md](./PRIVACY_POLICY.md)、[EU_GDPR_NOTICE.md](./EU_GDPR_NOTICE.md)、[BUILD.md](./BUILD.md) — 設定用ファーストパーティクッキー；クリップUIセマンティクス；`next export` / 静的エクスポート注意事項。

### 追加（動画背景 — フォーク）
- **MP4の役割分離**: 音楽 vs **単一**背景動画；ドラッグ/ドロップと画像ピッカールール；音楽が `AudioBuffer` の場合のオプション2つ目の `<video>`；`drawVideoCover` + `syncBackgroundOnlyVideo`；動画背景有効時のWebGL → Canvas 2Dフォールバック（[#36](https://github.com/kuwa2005/music-waves-visualizer/issues/36)）。
- **録画ポリシー更新**: 安定性のため、ユーザー向け出力を **MP4固定**（アルファ/透過非対応）に変更。

### 修正
- **画像ピッカー `accept`**: 「画像を選択」に `video/mp4`（および一般的な動画拡張子）を追加し、システムダイアログでMP4を選択可能に。
- **動画背景のチカつき**: 背景 `<video>` が存在するが `readyState` がまだ準備中の場合、`drawBars` が静止画ブランチにフォールスルーしないよう修正；`syncBackgroundOnlyVideo` のシーク閾値を緩和。
- **MP4入力録画開始時のグリッチ**: `HTMLVideoElement` 入力の再生/録画開始順序を安定化し、録画開始時の短い停滞/ドロップを軽減。
- **MP4読み込み後のクリア**: ソース破棄前に動画イベントハンドラをクリアし、誤った「動画読み込み失敗」スナックバーを削除。

### 変更（メンテナンス — クッキー、クリップ、スペクトラム、復元）
- **設定永続化（クッキー）**: 多くのクライアント設定が [`lib/mwvCookieStorage.ts`](./lib/mwvCookieStorage.ts) 経由の**ファーストパーティクッキー**に保存（大容量値はチャンクBase64）。**レガシー `localStorage` エントリは初回読込時に移行**後クリア。**保存しない**: 画像/音楽ファイル内容、**タイトルテキスト**、**SRT本文**；字幕/タイトルの**スタイル**とトグルは**保存**。モードは既存の `mwv_mode` クッキーに維持。
- **クリップ長制限**: YouTube / TikTok / NicoNicoボタンはフィールドに期間を提案するのみ；**開始（秒）+ 期間（秒）**でウィンドウを定義。**空の期間** = **メディア末尾まで再生**（プラットフォーム固定上限なし）。
- **スペクトラム/glycoローバンド**: [`lib/Canvas.ts`](./lib/Canvas.ts) の `GLYCO_LOG_MIN_BIN`、`glycoLowBandGain`、`spectrumLinearBarLowGain` — 低周波のペグインを抑制（モード0、3、4、6；Canvas 2D + WebGL）。
- **スペクトラムスケール/位置復元**: ハイドレーションとJSONインポートで、固定レイアウトキーではなく **`resolveCanvasLayout(savedOrImportedCanvasSize, …)`** を使用して `spectrumSettings_{layout}_{mode}` をロード。
- **タイトルデフォルト**: タイトルアニメーションデフォルト **なし**；タイトルフォントサイズ **最大200px**。
- **ESLint**: `getCanvasDimensions` を `useCallback` で包み、キャンバスサイズの `useLayoutEffect` が `react-hooks/exhaustive-deps` を満たすよう修正。

### 変更
- **タイトルオーバーレイ**: スペクトラムの後に **タイトル** タブを追加 — 複数行テキスト（クッキー非保存）、スタイルは**保存**（位置、揃え、plain/outline/box、フォントサイズ、字間、フォントファミリー、太字/斜体、縁取り、シャドウ、ボックス、イントロアニメーション）。設定**エクスポート**に含む（JSONのオプション `titleText`）/ インポートはセッション中のテキスト適用のみ。タイトル有効時はレンダラーがCanvas 2Dにフォールバック（字幕と同様）。
- **SRT字幕サポート**: `.srt` 読み込み（ファイルピッカー + ドラッグ/ドロップ）と字幕レンダリングカスタマイズを既存の設定UIフローに追加。位置、タイプ（plain/outline/boxed）、色、フォント、装飾、表示アニメーションを調整可能；設定は永続化/エクスポート/インポート。字幕アクティブ時は互換性のためレンダラーが自動でCanvas 2Dにフォールバック。
- **スペクトラムモードボタンの可視性**: モードピッカーから **リサージュボタン（モード16）** を非表示にし、レンダリングロジック/設定の互換性は維持。
- **WMPトレイル調整（モード15〜16）**: **トレイル長/トレイル減衰/加算強度** のUIパラメータを追加（モードごとの永続化、エクスポート/インポート、クリアリセット）。デフォルトをモード別（15 vs 16）に分割；新しいプリセット **WMP classic / Modern** でクイック調整。Canvas 2D + WebGLトレイルレンダリングでこれらの値を使用。
- **モード15〜16（オシロスコープ/リサージュ）**: タイムドメインの2つの高インパクト波形ビジュアルを追加；Canvas 2D + WebGL実装。モードピッカーにツールチップ付きで含む；感度チューニングプリセットを適用。
- **スペクトラムUX + ラウドネス調整**: モードピッカーを **周波数** と **ラウドネス** セクションにグループ化、短縮ラベルとツールチップ説明を追加。ラウドネスモード（8〜14）にモードごとの **プリセット**（Natural / Strong / EDM）と **ゲイン/ガンマ/アタック/リリース** コントロールを追加。
- **モード13パフォーマンスガード**: デバイス性能（`hardwareConcurrency` / `deviceMemory`）に基づく自動パーティクル上限/トレイル簡略化を追加；Canvas 2D + WebGLで低スペックフォールバック。
- **視覚的一致性 + エフェクト干渉**: ハイライトクリッピングを軽減しスライダー感度を揃える共有透過率シェーピィングを追加；スペクトラムアクティブ時の `scanlines` / `rain` / `dust` の自動ダッキングでメインスペクトラムを埋めないよう改善。
- **ラウドネス限定ビジュアル（モード9〜14）**: スペクトラムカテゴリに6つの非FFTビジュアルを追加 — **VUメーター**、**パルスリング**、**センターオーブ**、**ブリージング背景**、**パーティクル密度**、**ジオメトリモーフ** — すべてCanvas 2D + WebGLで実装、同じモードボタンと設定フロー。
- **モード8（ラウドネスパルス）**: スペクトラムカテゴリに全体ラウドネスのみに反応する非スペクトラムビジュアルを追加（センターオーブ + グローパルス）；Canvas 2DとWebGLの新しいモードボタンとして利用可能。
- **モード2（サークル）**: 回転オプション（`common_circleRotationRpm`）を追加 — **OFF / -10..10 rpm**。`1` は約60秒に1回転（1rpm）、負は左（反時計回り）、正は右（時計回り）。**OFF** と **0** は両方回転停止（Canvas 2D + WebGL）。
- **モード3と4（対称バーとドット）**: 水平軸を `glycoBarToFftBin` / `glycoBarRawEnergy` 経由の **対数分布FFTビン** 使用に変更（モード6と同ファミリー）；線形 `i/bufferLength` マッピングによる右カラムのほぼ完全なデッドを修正（Canvas 2D + WebGL）。
- **スペクトラム更新レート（モード1と5）**: 波形の再描画スロットルを **`SPECTRUM_THROTTLE_TARGET_FPS`（60）** に固定（Canvas 2D + WebGL）；**更新レート** スライダーを削除（`SpectrumSettings.fps` 削除）。
- **スペクトラムサイズ（全モード）**: レイアウト/モードの **幅と高さスケール** スライダーと `clampModeAdjustments` を **0.1〜5.0×** に拡大（0.5〜5.0×から）；小型ディスプレイでアナライザーをさらに縮小可能に。
- **モード6（glyco）**: 対数分布ビン（`GLYCO_LOG_BIN_MAX_FRAC`）、右端 **ローカルマックス**（`glycoBarRawEnergy`）。垂直マッピングで共有 **`glycoAdjustedLevel`**（γ≈1.18ピーク圧縮）と **`GLYCO_BAR_VERTICAL_SCALE`** ヘッドルームを使用し、バーがMAXに留まる頻度を削減（Canvas 2D + WebGL）。
- **ギャラリー自動送り**: ギャラリーが1枚から **2枚以上** に移行した場合のみ自動有効化；1枚または0枚の場合は**オフ**。2枚以上に戻しても手動OFFは維持。**`common_galleryAutoSec`** と **`common_galleryAutoEnabled`** を保存（クッキー）。
- **SEO/HTML**: `<meta description>`、キーワード、robots、canonical（`NEXT_PUBLIC_SITE_URL` または `NEXT_PUBLIC_DOMAIN` 時）、Open Graph / Twitterカード、`theme-color`、JSON-LD `WebApplication`、`favicon`/`apple-touch-icon` パスに `assetBasePath` を拡張；`pages/_document.tsx`（`lang="ja"`）と `public/robots.txt` を追加。`NEXT_PUBLIC_SITE_URL` を [BUILD.md](./BUILD.md) でドキュメント化。

## [1.0.3] - 2026-03-29

### 追加
- **Issue #14**: 新スペクトラムモード **7 — スペクトラムフィル**（周波数曲線下の塗りつぶし面 + 上部アウトライン）；Canvas 2D と WebGL；エクスポート/インポートのレイアウト/モード設定キー `7`。
- **Issue #16**: **マルチ画像ギャラリー**: マルチセレクト/ドラッグドロップで複数静止画像、**画像追加**、**前へ/次へ**、プレビュー/録画中の **自動送り**（2〜30秒間隔、クライアントストレージ/クッキーに保存）。最初の画像は引き続きAutoモードのキャンバスレイアウトを設定。
- **Issue #17**: **スキャンライン** オーバーレイエフェクト（CRTスタイル水平線）；Canvas 2D と WebGL；強度プリセット；他のエフェクトと同様に保存。
- **Issue #23**: **ギャラリー画像トランジション**（なし/切替ごとランダム/クロスフェード、ワイプ、アイリス、スライド、ズーム、チェッカー、ベネチアン、斜め、フラッシュ）；`lib/galleryImageTransition.ts` 経由 Canvas 2D + WebGL。**スペクトラルスケール** 0.5〜5× と **オフセット** ±150%（保存/インポートで整数クランプ）。**スペクトラルカラー**: 20カラーパレット（10列グリッド）+ `#RRGGBB`（`common_spectrumColorHex`；レガシープリセット移行）。**共有パレット** を `lib/colorPalette.ts` に追加。**スペース/きらきら/空気感** ティントカラー（`effectTintColor`、パレット + hex）。**スキャンライン** 強度増加。設定エクスポートに `galleryTransitionMode`、パーティクルカラー、`spectrumColorHex` を追加；i18n `gallery.tr*`（ja/en）。

## [1.0.2] - 2026-03-29

### 追加
- **動画品質（Issue #15）**: 設定タブ — 出力キャンバス解像度表示、**録画映像ビットレート**（1〜40 Mbps、対応時 `MediaRecorder` `videoBitsPerSecond`）、FFmpegに渡す **MP4 AACビットレート**（128 / 192 / 256 kbps）。`localStorage` と設定エクスポート/インポートに保存。
- **波形カラーとスタイル（Issue #13）**: スペクトラムタブ — モード0、1、2、5およびレインボーOFF時のモード3と4用の **カラープリセット**（白/シアン/マゼンタ/緑/ゴールド/カスタム `#RRGGBB`）；対称バーとドット（モード3と4）のレインボーグラデーション **トグル**。Canvas 2D と WebGL を揃え。エクスポート/インポートとクリアリセットを含む。

## [1.0.1] - 2026-03-29

### 追加
- **GitHub Releases静的バンドル**: `npm run release:zip` → `dist/music-waves-visualizer-static-v*.zip`（`visualizer/`、ルート **`INSTALL_LOCAL_STATIC.md`**、**`docs-bundled/`**（ライセンス、変更履歴、ホスティング、FFmpeg、nginxサンプル、規約/プライバシー））。ユーザーガイド: [docs/INSTALL_LOCAL_STATIC.md](./docs/INSTALL_LOCAL_STATIC.md)。

### 変更
- ページ `<title>` / `og:title`: **Music Waves Visualizer(改) #MWV**

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

