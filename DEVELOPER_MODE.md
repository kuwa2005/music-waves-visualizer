# 開発者モード

開発者モードを有効にすると、各スペクトラムアナライザーモードと解像度の組み合わせごとに表示調整パラメータを保存・読み込みできるようになります。

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

## 機能

### 自動保存

- 表示調整パラメータ（横幅倍率、縦幅倍率、横位置、縦位置）を変更すると、自動的にローカルストレージに保存されます
- 保存キー: `spectrumSettings_{mode}_{canvasSize}`
  - 例: `spectrumSettings_0_1920x1080`, `spectrumSettings_3_1080x1920`

### 自動読み込み

- モードや解像度を変更すると、対応する設定が自動的に読み込まれます
- 初回アクセス時にも保存された設定があれば自動的に読み込まれます

### エクスポート/インポート

- **エクスポート**: すべての保存された設定をJSON形式でクリップボードにコピー
- **インポート**: クリップボードからJSONを読み込んで設定を復元
- **テキストフィールド**: JSONを直接貼り付けて適用

### 設定のクリア

- すべての保存された設定を削除

## 設定の構造

```json
{
  "spectrumSettings_0_1920x1080": {
    "scaleX": 1.0,
    "scaleY": 1.0,
    "offsetX": 0,
    "offsetY": 0
  },
  "spectrumSettings_1_1920x1080": {
    "scaleX": 1.2,
    "scaleY": 0.8,
    "offsetX": 10,
    "offsetY": -20
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

