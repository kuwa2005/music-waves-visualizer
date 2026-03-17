# 開発者モード

開発者モードを有効にすると、FPS表示などの開発用機能が有効になります。

設定の保存・エクスポート/インポートは開発者モードなしでも利用可能です。

## 有効化方法

環境変数を設定して開発者モードを有効化します。

### ローカル開発環境

`.env.local`ファイルを作成して以下のいずれかを設定：

```bash
NEXT_PUBLIC_DEVELOPER_MODE=true
# または
NEXT_PUBLIC_DEV_MODE=true
```

### Docker環境

`docker-compose.yml`の環境変数セクションに追加：

```yaml
environment:
  - NODE_ENV=production
  - NEXT_TELEMETRY_DISABLED=1
  - NEXT_PUBLIC_DEVELOPER_MODE=true
```

## 設定の保存・エクスポート/インポート（開発者モード不要）

### 保存対象

- **共通設定**: 音量調整（目標LUFS）、エフェクト種類、各エフェクトの強度
- **レイアウト別**: 縦（1080×1920）/横（1920×1080）/正方形（1920×1920）ごとの各スペアナモードの倍率・位置

### エクスポート/インポート

- **エクスポート**: 共通設定とレイアウト別スペアナ設定をJSON形式でダウンロード
- **インポート**: JSONを貼り付けて設定を復元（旧形式にも対応）
- **クリア**: すべての保存された設定を削除

### 設定の構造

```json
{
  "common": {
    "targetLufs": -14,
    "effectType": "space",
    "effectDensities": {
      "space": 2,
      "spaceConstant": 2,
      "vignette": 1,
      "rainbow": 2,
      "curtain": 2
    }
  },
  "spectrumSettings": {
    "1920x1080": {
      "0": { "scaleX": 1.0, "scaleY": 1.0, "offsetX": 0, "offsetY": 0 },
      "1": { "scaleX": 1.2, "scaleY": 0.8, "offsetX": 10, "offsetY": -20 }
    },
    "1080x1920": { ... },
    "1920x1920": { ... }
  }
}
```

## デフォルト値への取り込み方法

1. 開発者モードで各モード・解像度の組み合わせごとに最適な設定を調整
2. 「エクスポート」ボタンで設定をJSONとして取得
3. エクスポートしたJSONをコードに組み込む（例: 定数として定義）
4. リリース時は開発者モードを無効化（環境変数を削除または`false`に設定）

## リリース時の対応

リリース時は環境変数を設定しないか、`false`に設定することで、開発者用機能は完全に非表示になります。

```bash
# リリース時（開発者モード無効）
NEXT_PUBLIC_DEVELOPER_MODE=false
# または環境変数を設定しない
```

