# Dockerセットアップガイド

このプロジェクトをDockerで実行する方法です。

## 前提条件

- Docker Desktop（またはDocker Engine + Docker Compose）がインストールされていること

## 本番モードで実行

ビルドして本番モードで実行：

```bash
# イメージをビルドして起動
docker-compose up --build

# バックグラウンドで実行
docker-compose up -d --build

# 停止
docker-compose down
```

ブラウザで http://localhost:3000 にアクセス

## 開発モードで実行

ホットリロード対応の開発モード：

```bash
# 開発モードで起動
docker-compose -f docker-compose.dev.yml up --build

# バックグラウンドで実行
docker-compose -f docker-compose.dev.yml up -d --build

# 停止
docker-compose -f docker-compose.dev.yml down
```

## 個別コマンド

### イメージのビルド

```bash
# 本番用
docker build -t music-waves-visualizer .

# 開発用
docker build -f Dockerfile.dev -t music-waves-visualizer-dev .
```

### コンテナの実行

```bash
# 本番用
docker run -p 3000:3000 music-waves-visualizer

# 開発用
docker run -p 3000:3000 -v $(pwd):/app -v /app/node_modules music-waves-visualizer-dev
```

## トラブルシューティング

### ポートが既に使用されている場合

`docker-compose.yml`の`ports`セクションを変更：

```yaml
ports:
  - "3001:3000"  # ホスト側のポートを変更
```

### キャッシュをクリアして再ビルド

```bash
docker-compose build --no-cache
```

### ログの確認

```bash
docker-compose logs -f
```

### コンテナ内でコマンドを実行

```bash
docker-compose exec app sh
```

## 注意事項

- 開発モードでは、コードの変更が自動的に反映されます（ホットリロード）
- 本番モードでは、変更を反映するには再ビルドが必要です
- `.env`ファイルがある場合は、`docker-compose.yml`の`environment`セクションに追加してください

