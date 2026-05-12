# Build and dependencies

## Requirements

- **Node.js 20+**
- **npm** 9+ recommended

## Install

This repo pins versions that can conflict on **peer dependencies** (`i18next` vs `react-i18next`). Use:

```bash
npm install --legacy-peer-deps
```

## FFmpeg core assets (postinstall)

`@ffmpeg/core` is listed in `package.json`. After install, **`scripts/copy-ffmpeg-core.cjs`** copies WASM/JS from `node_modules/@ffmpeg/core/dist` into **`public/ffmpeg-core/`** (ignored by git).

- Triggered by **`postinstall`** and **`prebuild`**
- **`build:html`** runs the copy script before `next build` so static export includes `/visualizer/ffmpeg-core/…`

If MP4 conversion fails with missing core files, run:

```bash
node scripts/copy-ffmpeg-core.cjs
```

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Next.js dev server (localhost) |
| `npm run build` | Production build check |
| `npm run build:html` | Static export → `visualizer/` for Apache/nginx hosting |

`next export` may print **deprecation / “Static Export”** notices depending on Next.js version; the script remains the supported path for this repo. If the build warns about **Browserslist** being outdated, run `npx update-browserslist-db@latest` (optional; see [browserslist.dev](https://github.com/browserslist/update-db#readme)).
| `npm run build:html:lil-la` | Same as `build:html` + `NEXT_PUBLIC_SITE_URL=https://lil.la`（[lil.la/visualizer](https://lil.la/visualizer/) 向け SEO メタ用） |
| `npm run start` | Run production server after `npm run build` |
| `npm run lint` | ESLint |

## Environment variables (build-time / public)

| Variable | Effect |
|----------|--------|
| `BUILD_HTML=1` | Enables `/visualizer` base path (see `next.config.js`) |
| `NEXT_PUBLIC_DEVELOPER_MODE` / `NEXT_PUBLIC_DEV_MODE` | Enables FPS panel etc. (see [DEVELOPER_MODE.md](./DEVELOPER_MODE.md)) |
| `NEXT_PUBLIC_SITE_URL` | **推奨** 本番のサイト基点 URL（末尾スラッシュなし）。`canonical`・`og:url`・`og:image` の**絶対 URL**に使用 |
| `NEXT_PUBLIC_DOMAIN` | 互換用。未設定時は `NEXT_PUBLIC_SITE_URL` と同等として扱えます（OG・SEO用） |

### 本番ホスト例（`https://lil.la/visualizer/`）

このフォークの公開先の一例です（[Music Waves Visualizer(改)](https://lil.la/visualizer/)）。静的出力時は **ビルド時** に次のように **`NEXT_PUBLIC_SITE_URL`** を渡すと、SNS・検索向けメタの URL が `https://lil.la/visualizer/` 系になります。

```bash
npm run build:html:lil-la
```

（上記は `NEXT_PUBLIC_SITE_URL=https://lil.la` を付けたうえで `build:html` と同じ処理です。手書きするなら `NEXT_PUBLIC_SITE_URL=https://lil.la npm run build:html` でも同じ結果です。）

テンプレートはリポジトリ直下の [`.env.production.example`](../.env.production.example) を参照してください。

---

## 日本語

### インストール

```bash
npm install --legacy-peer-deps
```

### FFmpeg のファイル

`npm install` 後に `public/ffmpeg-core/` が生成されます（Git には含めません）。消した場合は `node scripts/copy-ffmpeg-core.cjs` を実行してください。

### ビルド

- 静的配信: `npm run build:html` → `visualizer/` をサーバーに配置
- 本番確認: `npm run build`
