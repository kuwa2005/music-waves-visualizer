# MP4 音声・動画品質（Tier A）

本フォーク（kuwa2005）の **録画 → WebM → FFmpeg.wasm → MP4** 経路における、2026-05 セッションで確定した品質方針です。

## 概要

| 項目 | デフォルト / プリセット共通 | 配信用プリセット | 高音質プリセット |
|------|---------------------------|----------------|----------------|
| 目標 LUFS | **-14**（YouTube 等向け） | -14 | -14 |
| 録画音声（WebM） | **384 kbps**（`audioBitsPerSecond`） | 384 kbps | 384 kbps |
| MP4 音声（AAC / loudnorm 時） | **320 kbps** | 320 kbps | 320 kbps |
| 録画ビデオ | スライダー任意 | **8 Mbps** | **14 Mbps** |

実装: `pages/index.tsx`（`clampRecordAudioBitsPerSecond`, プリセットボタン）、`lib/Ffmpeg.ts`（AAC ビットレート引数）。

## Tier A（実装済み）

1. **`MediaRecorder` に `audioBitsPerSecond` を指定**  
   録画時の WebM 音声ビットレート。`recordAudioBitrateKbps` が未設定なら `exportAudioBitrateKbps` に追従。128〜512 kbps にクランプ。

2. **MP4 変換時の AAC**  
   目標 LUFS が有効なとき FFmpeg `loudnorm` パスで再エンコード。選択肢 128 / 192 / 256 / **320** kbps（デフォルト 320）。

3. **LUFS -14 を維持**  
   配信・高音質プリセットとも目標 LUFS は **-14**。ニコニコ向け -15 は従来どおり個別選択可能。

4. **動画ビットレート**  
   プリセットの差は主に **録画ビデオ Mbps**（8 / 14）。UI 文言: `videoQuality.presetSectionHint`（`locales/ja.json`）。

## 意図的に未実装（Tier B 等）

| 案 | 状態 | 理由（要約） |
|----|------|--------------|
| Tier B: 無劣化 WAV を FFmpeg で mux | 未実装 | ブラウザ録画は WebM 前提。WAV 直結は容量・処理時間・UX が重い |
| 録画 512 kbps の自動切替 | 未実装 | YouTube 再エンコード後の実効品質に対し 384→512 の体感差が小さい |
| ミラーボール UI の公開 | 未実装 | 実装・Cookie 保存はあるが `EFFECT_TYPES_UI_HIDDEN` で選択肢から除外 |

## YouTube / TikTok 調査と 384 / 320 kbps 維持の根拠

- **アップロード後の再エンコード**: YouTube 等はアップロード音声を再圧縮する。極端に高いソースでも、配信時の実効ビットレートはプラットフォーム側に依存する。
- **録画 384 kbps**: WebM（Opus 等）段階で十分なヘッドルームを確保し、波形・エフェクト付き動画の録画品質を安定させる。512 kbps へ上げてもファイルサイズとエンコード負荷が増える一方、再アップロード後の差は限定的と判断。
- **AAC 320 kbps**: LUFS 正規化後の再エンコードで、知覚品質とファイルサイズのバランスが良い。128〜256 は帯域制限や配信制約向けの下位オプションとして残す。
- **LUFS -14**: 多数の動画プラットフォーム推奨に合わせ、プリセットの共通ターゲットとする。
- **YouTube 音量表示の補正**: UI は -14 のまま、MP4 変換時の FFmpeg `loudnorm` だけ **-13.95 LUFS**（+0.05）を目標にする。実測: 補正なし ~96%、+0.35〜+0.1 は Content -13.0 / Normalized 89–90% と過大 → +0.05 に段階調整（`lib/Ffmpeg.ts` の表コメント参照）。**最新ビルドで MP4 を再変換してから**再アップロードし、Content loudness ≈ -14.0・Normalized ≈ 100% を確認すること。

詳細な調査メモは会話セッション内。本ファイルは運用・引継ぎ用の決定記録です。

## 関連 UI

- **設定タブ「解像度・品質」**（`settingsTab === 6`）: 配信用 / 高音質ボタン、ビデオ・AAC・録画音声スライダー／セレクト
- **動画長制限タブ**: フェードイン／アウト秒、3 行レイアウト（プリセット行・開始/長さ行・フェード行）— [CHANGELOG](./CHANGELOG.md) Unreleased 参照

## 関連コード

- `pages/index.tsx` — `clampRecordAudioBitsPerSecond`, `recorderOptions.audioBitsPerSecond`
- `lib/Ffmpeg.ts` — `audioBitrateKbps` 引数
- `lib/clipAudioFade.ts` — クリップ区間の Gain フェード（動画長タブ）

---

*最終更新: 2026-06-05（v1.0.6 — YouTube loudnorm +0.05）。仕様変更時は本ファイルと [CHANGELOG.md](./CHANGELOG.md) を更新すること。*
