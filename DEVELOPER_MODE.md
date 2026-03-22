# Developer Mode

When enabled, developer mode provides FPS display and other dev features.

Settings save, export, and import are available **without** developer mode.

## Enabling

Set one of these environment variables:

### Local

Create `.env.local`:

```bash
NEXT_PUBLIC_DEVELOPER_MODE=true
# or
NEXT_PUBLIC_DEV_MODE=true
```

### Docker

**Next.js standalone image (`Dockerfile`)**  
Developer mode is **disabled by default**. Enable at **build time**:

```bash
docker build --build-arg NEXT_PUBLIC_DEVELOPER_MODE=true -t your-tag .
```

For `docker-compose.yml`, pass `build.args` if your compose file builds this image:

```yaml
services:
  app:
    build:
      context: .
      args:
        NEXT_PUBLIC_DEVELOPER_MODE: "true"
```

**Note:** `environment:` at runtime does not rebuild client bundles; use **build args** for the standalone production image.

**Dev compose** (`docker-compose.dev.yml`) may still use runtime `environment` if it mounts source / runs `next dev`—see that file for the intended workflow.

## Settings Export/Import (no developer mode required)

- **Export**: Download all settings as JSON
- **Import**: Overwrite existing keys only (backward compatible)
- **Clear**: Delete all saved settings

## Release

Disable for production:

```bash
NEXT_PUBLIC_DEVELOPER_MODE=false
# or omit the variable
```

---

## 日本語

### 有効化

- **ローカル**: `.env.local` に `NEXT_PUBLIC_DEVELOPER_MODE=true`
- **本番用 `Dockerfile` ビルド**: 既定は OFF。`docker build --build-arg NEXT_PUBLIC_DEVELOPER_MODE=true ...` で有効化（クライアントバンドルに焼き付くためビルド時指定が必要）

### 設定の保存・エクスポート/インポート

開発者モードなしでも利用可能です。エクスポートは全設定をJSONで出力、インポートは存在する項目のみ上書きします。
