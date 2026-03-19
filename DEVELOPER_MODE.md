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

Add to `docker-compose.yml`:

```yaml
environment:
  - NEXT_PUBLIC_DEVELOPER_MODE=true
```

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

`.env.local` または Docker の環境変数に `NEXT_PUBLIC_DEVELOPER_MODE=true` を設定してください。

### 設定の保存・エクスポート/インポート

開発者モードなしでも利用可能です。エクスポートは全設定をJSONで出力、インポートは存在する項目のみ上書きします。
