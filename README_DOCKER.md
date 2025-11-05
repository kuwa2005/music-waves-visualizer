# Dockerセットアップガイド

このプロジェクトをDockerで実行する方法です。

詳細な要件とトラブルシューティングは [サーバー要件(local docker)用.md](./サーバー要件(local%20docker)用.md) を参照してください。

## 前提条件

- Docker Desktop（またはDocker Engine + Docker Compose）がインストールされていること

## クイックスタート

### 本番モード

```bash
docker-compose up --build
```

### 開発モード

```bash
docker-compose -f docker-compose.dev.yml up --build
```

ブラウザで http://localhost:3000 にアクセス

## 基本的なコマンド

### 起動

```bash
# 本番モード（バックグラウンド）
docker-compose up -d --build

# 開発モード（バックグラウンド）
docker-compose -f docker-compose.dev.yml up -d --build
```

### 停止

```bash
# 本番モード
docker-compose down

# 開発モード
docker-compose -f docker-compose.dev.yml down
```

### ログ確認

```bash
docker-compose logs -f
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

### コンテナ内でコマンドを実行

```bash
docker-compose exec app sh
```

## 注意事項

- 開発モードでは、コードの変更が自動的に反映されます（ホットリロード）
- 本番モードでは、変更を反映するには再ビルドが必要です
- 詳細な設定やトラブルシューティングは [サーバー要件(local docker)用.md](./サーバー要件(local%20docker)用.md) を参照してください

