# 静的HTML版（`visualizer/`）を自前サーバーでホストする方法

## 1. これは何か

- `npm run build:html` で生成される `visualizer/` ディレクトリは、**完全な静的HTML版**です。
- 中身は Next.js の `next export` の成果物で、`index.html` と `_next/` 以下の JS / CSS などから構成されています。
- ビルド時の設定で **URL パス `/visualizer` に固定** されており、そのまま使う場合は **サーバー上の `/visualizer` に配置する前提** になっています。

---

## 2. 一番簡単な使い方（`/visualizer` に置く）

1. プロジェクトルートでビルド

   ```bash
   npm install
   npm run build:html
   ```

2. 生成された `visualizer/` ディレクトリの中身を、そのままサーバーの `visualizer` ディレクトリにアップロードします。

   - 例: `public_html/visualizer/` 配下に `index.html`, `_next/`, `.htaccess`, `README.txt` などをすべて配置

3. ブラウザから次のURLにアクセスします。

   ```text
   https://あなたのドメイン/visualizer/
   ```

> **よくあるエラー**  
> `_buildManifest.js` / `_ssgManifest.js` / `index-XXXX.js` などが 404 になる場合、ほぼ確実に  
> - `visualizer` 以外の場所に置いている  
> - `_next/` 以下のファイルをアップロードし忘れている  
> のどちらかです。

---

## 3. `/visualizer` 以外のパスで公開したい場合

Next.js の静的エクスポートは、**ビルド時にURLパスを埋め込む仕組み**のため、  
「相対パスで、どこに置いても自動で動く」という運用はできません。

別のパスで公開したい場合は、次のように **自分の環境でビルドし直す必要があります**。

### 3-1. 例: `/mwv` で公開したい

1. `next.config.js` を編集

   ```js
   // レンタルサーバー用静的エクスポート: BUILD_HTML=1 npm run build:html
   const isHtmlExport = process.env.BUILD_HTML === '1';

   const nextConfig = isHtmlExport
     ? {
         basePath: '/mwv',      // ★ 公開したいパスに合わせて変更
         assetPrefix: '/mwv',   // ★ 上と同じ値にする
         reactStrictMode: true,
         trailingSlash: true,
         images: { unoptimized: true },
       }
     : {
         reactStrictMode: true,
         output: 'standalone',
         // （以下略）
       };

   module.exports = nextConfig;
   ```

2. 再ビルド

   ```bash
   npm install   # 初回のみ
   npm run build:html
   ```

3. 生成された `visualizer/` の中身を、サーバーの `/mwv` ディレクトリにアップロード

   - 例: `public_html/mwv/` に `index.html`, `_next/`, `.htaccess` などをすべて配置

4. ブラウザから `https://あなたのドメイン/mwv/` にアクセス

> **ポイント**  
> - `basePath` / `assetPrefix` は「実際に公開したいURLパス」に合わせる必要があります。  
> - 値を変えたら、必ず **`npm run build:html` をやり直してください**。  
>   既に生成済みの `visualizer/` をそのまま別パスに移動しても動きません。

---

## 4. `.htaccess` と MP4 生成について

- `visualizer/` 直下の `.htaccess` は **SharedArrayBuffer（FFmpeg WASM）用ヘッダー** を付与するためのものです。
- このヘッダーが設定できない環境では、波形表示やプレビュー再生は動きますが、**MP4 動画のダウンロードは利用できません**。
- Apache 以外のサーバーや、独自のリバースプロキシ構成を使う場合は、同等のヘッダーをサーバー側設定で付与してください。

---

## 5. 典型的なトラブルとチェックポイント

- `_buildManifest.js` / `_ssgManifest.js` / `index-XXXX.js` が 404 になる
  - → `index.html` は見えているが、`_next/` 配下が正しいパスに無いか、アップロード漏れがあります。
  - → `next.config.js` の `basePath` と、実際に公開しているパス（`/visualizer`, `/mwv` など）が一致しているか確認してください。

- ローカルでは動くのにサーバーだけエラーになる
  - → `.htaccess` が無視されている、またはヘッダー付与ができていない可能性があります（MP4 生成まわり）。

