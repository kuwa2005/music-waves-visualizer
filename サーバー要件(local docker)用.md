# サーバー要件（ローカル・Docker環境用）

## 1. システム要件

### 1.1 ハードウェア要件

#### 最小要件
- **CPU**: 2コア以上（推奨: 4コア以上）
- **メモリ**: 2GB以上（推奨: 4GB以上）
- **ストレージ**: 10GB以上の空き容量
- **ネットワーク**: インターネット接続（FFmpeg WebAssemblyのダウンロード、npmパッケージのインストール）

#### 推奨要件
- **CPU**: 4コア以上
- **メモリ**: 8GB以上
- **ストレージ**: 20GB以上の空き容量（SSD推奨）
- **GPU**: オプション（Canvas描画のGPU加速が利用可能な場合）

### 1.2 オペレーティングシステム

#### 対応OS
- **Linux**: Ubuntu 20.04以降、Debian 11以降、Alpine Linux 3.15以降
- **Windows**: Windows 10以降、Windows Server 2016以降
- **macOS**: macOS 10.15以降

#### Docker対応
- Docker Engine 20.10以降
- Docker Compose 2.0以降（推奨）

## 2. ソフトウェア要件

### 2.1 必須ソフトウェア

#### Node.js
- **バージョン**: Node.js 18.x以上（推奨: 18 LTS）
- **パッケージマネージャー**: npm 8.x以上（Node.jsに同梱）

#### Docker（Docker方式の場合）
- **Docker Engine**: 20.10以降
- **Docker Compose**: 2.0以降
- **プラットフォーム**: Linux（推奨）、Windows（WSL2）、macOS

### 2.2 開発ツール（開発環境のみ）

- **Git**: 2.30以降（ソースコードの取得用）
- **テキストエディタ**: Visual Studio Code、Vim、Emacsなど

## 3. ネットワーク要件

### 3.1 ポート

- **HTTPポート**: 3000（デフォルト）
- **ファイアウォール**: ポート3000へのアクセスを許可

### 3.2 外部通信

- **npmレジストリ**: パッケージのダウンロード
- **FFmpeg WebAssembly**: 動画変換ライブラリのダウンロード
- **CDN**: Material-UIなどの外部リソース（オプション）

## 4. ブラウザ要件（クライアント側）

### 4.1 対応ブラウザ

- **Chrome**: 90以降（推奨）
- **Firefox**: 88以降
- **Edge**: 90以降
- **Safari**: 14以降（動作未確認）

### 4.2 必要な機能

- **Web Audio API**: 音声解析と再生
- **Canvas API**: 波形描画
- **MediaRecorder API**: 動画録画
- **SharedArrayBuffer**: FFmpeg WebAssembly用（COOP/COEPヘッダー必要）

## 5. セットアップ手順

基本的なDockerの使い方は [README_DOCKER.md](./README_DOCKER.md) を参照してください。

### 5.1 ローカル開発環境のセットアップ

#### 5.1.1 前提条件の確認

```bash
# Node.jsのバージョン確認
node --version  # v18.x以上であることを確認

# npmのバージョン確認
npm --version  # 8.x以上であることを確認
```

#### 5.1.2 リポジトリのクローン

```bash
# リポジトリをクローン
git clone https://github.com/kuwa2005/music-waves-visualizer.git
cd music-waves-visualizer
```

#### 5.1.3 依存関係のインストール

```bash
# 依存関係をインストール
npm install
```

#### 5.1.4 環境変数の設定（オプション）

`.env.local`ファイルを作成：

```bash
# 開発者モードを有効化
NEXT_PUBLIC_DEVELOPER_MODE=true
```

#### 5.1.5 開発サーバーの起動

```bash
# 開発サーバーを起動
npm run dev
```

ブラウザで http://localhost:3000 にアクセス

#### 5.1.6 本番ビルド（オプション）

```bash
# 本番ビルド
npm run build

# 本番サーバーを起動
npm start
```

### 5.2 Docker環境のセットアップ

基本的なDockerコマンドは [README_DOCKER.md](./README_DOCKER.md) を参照してください。

#### 5.2.1 前提条件の確認

```bash
# Dockerのバージョン確認
docker --version  # Docker Engine 20.10以降が必要

# Docker Composeのバージョン確認
docker-compose --version  # Docker Compose 2.0以降を推奨
```

#### 5.2.2 環境変数の設定

Docker環境で開発者モードを有効にする場合、`docker-compose.yml`の`environment`セクションを編集：

```yaml
environment:
  - NODE_ENV=production
  - NEXT_TELEMETRY_DISABLED=1
  - NEXT_PUBLIC_DEVELOPER_MODE=true  # 開発時のみ有効化
```

本番環境では`NEXT_PUBLIC_DEVELOPER_MODE=false`に設定してください。

### 5.3 本番環境へのデプロイ

#### 5.3.1 Docker方式でのデプロイ

1. **サーバーへのSSH接続**
   ```bash
   ssh user@your-server
   ```

2. **リポジトリのクローン**
   ```bash
   git clone https://github.com/kuwa2005/music-waves-visualizer.git
   cd music-waves-visualizer
   ```

3. **環境変数の設定**
   `docker-compose.yml`の`environment`セクションを編集：
   ```yaml
   environment:
     - NODE_ENV=production
     - NEXT_TELEMETRY_DISABLED=1
     - NEXT_PUBLIC_DEVELOPER_MODE=false  # 本番環境ではfalse
   ```

4. **コンテナの起動**
   ```bash
   docker-compose up -d --build
   ```

5. **リバースプロキシの設定（Nginx例）**
   ```nginx
   server {
       listen 80;
       server_name your-domain.com;

       location / {
           proxy_pass http://localhost:3000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
       }
   }
   ```

#### 5.3.2 ローカルNode.js方式でのデプロイ

1. **サーバーへのSSH接続**
   ```bash
   ssh user@your-server
   ```

2. **Node.jsのインストール（必要に応じて）**
   ```bash
   # Node.js 18 LTSをインストール（例: Ubuntu）
   curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
   sudo apt-get install -y nodejs
   ```

3. **リポジトリのクローン**
   ```bash
   git clone https://github.com/kuwa2005/music-waves-visualizer.git
   cd music-waves-visualizer
   ```

4. **依存関係のインストール**
   ```bash
   npm install
   ```

5. **本番ビルド**
   ```bash
   npm run build
   ```

6. **プロセスマネージャーの設定（PM2例）**
   ```bash
   # PM2をインストール
   npm install -g pm2

   # アプリケーションを起動
   pm2 start npm --name "music-waves-visualizer" -- start

   # 自動起動を有効化
   pm2 startup
   pm2 save
   ```

## 6. トラブルシューティング

### 6.1 ポートが既に使用されている場合

```bash
# 使用中のポートを確認（Linux/macOS）
lsof -i :3000

# ポートを変更（docker-compose.yml）
ports:
  - "3001:3000"  # ホスト側のポートを変更
```

### 6.2 メモリ不足エラー

```bash
# Dockerのメモリ制限を確認
docker stats

# メモリ制限を増やす（docker-compose.yml）
services:
  app:
    deploy:
      resources:
        limits:
          memory: 2G
```

### 6.3 ビルドエラー

```bash
# キャッシュをクリアして再ビルド
docker-compose build --no-cache

# または、ローカルの場合
rm -rf node_modules .next
npm install
npm run build
```

### 6.4 ログの確認

```bash
# Dockerコンテナのログを確認
docker-compose logs -f

# 特定のコンテナのログ
docker-compose logs app
```

## 7. パフォーマンス最適化

### 7.1 推奨設定

- **Node.js**: `NODE_OPTIONS=--max-old-space-size=4096`（メモリ制限を4GBに設定）
- **Docker**: メモリ制限を4GB以上に設定
- **ネットワーク**: 帯域幅の確保（FFmpeg WebAssemblyのダウンロード用）

### 7.2 本番環境での推奨事項

- **リバースプロキシ**: NginxまたはApacheを使用
- **HTTPS**: Let's EncryptなどでSSL証明書を取得
- **ログローテーション**: ログファイルの管理
- **監視**: リソース使用状況の監視

## 8. セキュリティ要件

### 8.1 環境変数

- **NEXT_TELEMETRY_DISABLED**: `1`（本番環境では必須）
- **NEXT_PUBLIC_DEVELOPER_MODE**: `false`（本番環境では非推奨）

### 8.2 HTTPヘッダー

- **Cross-Origin-Opener-Policy**: `same-origin`
- **Cross-Origin-Embedder-Policy**: `require-corp`

### 8.3 ファイアウォール

- 必要なポートのみを開放
- 管理ポートへのアクセスを制限

## 9. バックアップと復旧

### 9.1 バックアップ対象

- **ソースコード**: Gitリポジトリ
- **設定ファイル**: `.env.local`、`docker-compose.yml`
- **データ**: ユーザーが生成した動画ファイル（ローカルストレージに保存される場合）

### 9.2 復旧手順

1. リポジトリをクローン
2. 設定ファイルを復元
3. 依存関係をインストール
4. アプリケーションを起動

## 10. 参考資料

### 公式ドキュメント

- [Next.js公式ドキュメント](https://nextjs.org/docs)
- [Docker公式ドキュメント](https://docs.docker.com/)

### プロジェクト内ドキュメント

- [README.md](./README.md) - プロジェクト概要とクイックスタート
- [README_DOCKER.md](./README_DOCKER.md) - Dockerの基本的な使い方
- [仕様書.md](./仕様書.md) - 技術仕様と機能詳細
- [DEVELOPER_MODE.md](./DEVELOPER_MODE.md) - 開発者モードの説明
- [サーバー要件.md](./サーバー要件.md) - レンタルサーバー・共有ホスティング用の要件

