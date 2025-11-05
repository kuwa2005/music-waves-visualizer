# Music Waves Visualizer

Music Waves Visualizer is a web page to create audio waveforms and movie by loading image and music.

## Demo

The demo is here: https://music-waves-visualizer.vercel.app/

## Features

### 基本的な機能

- **画像ファイルの読み込み**: 背景画像として使用
- **音楽ファイルの読み込み**: 音声波形の分析対象
- **リアルタイム波形可視化**: 7つの表示モードで音声波形を可視化
- **プレビュー機能**: 音楽を再生しながら波形をリアルタイム表示
- **動画録画機能**: 音声と波形を動画として録画し、MP4形式で出力

### スペクトラムアナライザーモード

1. **周波数バー**: 周波数スペクトルを縦バーで表示
2. **折れ線**: 波形データを折れ線グラフで表示
3. **円形**: 円形に配置された周波数バー
4. **上下対称バー**: 中央から上下に広がるカラフルなバー
5. **ドット表示**: 32×16のドットマトリクス表示
6. **波形（上下対称）**: 波形を上下対称に表示
7. **3D風バー**: 奥行きのある3D風バー

### Canvasサイズ選択

- **1920×1080** (横長): 一般的な動画サイズ
- **1080×1920** (縦長): 縦型動画用
- **1920×1920** (正方形): 正方形動画用

### 表示調整機能

各モードごとに以下のパラメータを調整可能：

- **横幅倍率**: 0.1〜3.0
- **縦幅倍率**: 0.1〜3.0
- **横位置**: -150%〜150%（Canvasサイズに対するパーセンテージ）
- **縦位置**: -150%〜150%（Canvasサイズに対するパーセンテージ）

### パフォーマンス最適化

- **GPU加速**: Canvas描画にGPU加速を適用
- **非同期レンダリング**: スムーズなアニメーション
- **プレビューサイズ**: 最大480px幅で表示（録画サイズには影響なし）

### 開発者モード（オプション）

環境変数 `NEXT_PUBLIC_DEVELOPER_MODE=true` を設定すると、以下の機能が利用可能：

- 各モード×解像度の組み合わせごとに設定を自動保存
- 設定のエクスポート/インポート
- 設定のクリア

詳細は [DEVELOPER_MODE.md](./DEVELOPER_MODE.md) を参照してください。

## 技術スタック

- **Next.js** 13.1.2
- **TypeScript** 4.6.2
- **Material-UI (MUI)** 5.11.4
- **Web Audio API**: 音声解析と再生
- **Canvas API**: 波形描画と画像表示
- **MediaRecorder API**: 動画録画
- **FFmpeg (WebAssembly)**: 動画変換（WebM → MP4）

## セットアップ

### ローカル開発

```bash
npm install
npm run dev
```

### Docker

```bash
# 本番モード
docker-compose up --build

# 開発モード
docker-compose -f docker-compose.dev.yml up --build
```

詳細は [README_DOCKER.md](./README_DOCKER.md) を参照してください。

### 開発者モードの有効化

`.env.local` ファイルを作成して以下を追加：

```bash
NEXT_PUBLIC_DEVELOPER_MODE=true
```

## 使用方法

### 基本的な使い方

1. **ファイルの読み込み**:
   - **ドラッグ&ドロップ**: 複数ファイルをドロップすると自動判定されます
   - **ボタンから選択**: 「画像ファイルを選ぶ」「音楽ファイルを選ぶ」ボタンから選択
   - 拡張子により自動判定されます（MP4はデフォルトで音楽ファイルとして扱われます）
2. **スペクトラムアナライザーを選択**: 7つのモードからボタンで選択
3. **解像度を選択**: 3つの解像度からボタンで選択
4. **表示調整（オプション）**: 倍率や位置を調整（開発者モードで自動保存）
5. **プレビュー**: 音楽を再生しながら波形を確認
6. **動画を録画**: MP4形式で動画を出力

### MP4ファイルの扱い

- **ドラッグ&ドロップ**: 音楽ファイルとして自動判定
- **音楽ボタンから選択**: 音声トラックを抽出して音楽として使用
- **画像ボタンから選択**: 最初のフレームを静止画として抽出

## 注意事項

- iOS、Androidは動作未確認です
- 動画はmp4形式で出力されます
- 録画サイズは選択したCanvasサイズになります（プレビュー表示サイズとは無関係）
- 大きな音楽ファイルや画像ファイルは処理に時間がかかる可能性があります

## Credits

This project is based on [komura-c/music-waves-visualizer](https://github.com/komura-c/music-waves-visualizer).

Original article: [オーディオ波形動画を生成するWebぺージの作り方](https://tech-blog.voicy.jp/entry/2022/12/11/235929)

## License

See the original repository for license information.

## Changelog

See [CHANGELOG.md](./CHANGELOG.md) for detailed changes.
