Static HTML deployment pack for shared hosting (/visualizer)
===========================================================

This directory is the **Next.js static export output** (complete static HTML build).
It is configured for the **/visualizer** path. Place contents in the server's
`visualizer` directory.

Deployment:
-----------
1. Upload contents of this visualizer folder to the server's visualizer directory
   Example: public_html/visualizer/ with index.html, _next/, .htaccess, etc.

2. Access URL: https://your-domain/visualizer/
   Example: https://example.com/visualizer/

※ For a different path (e.g. /mwv), edit basePath/assetPrefix in next.config.js
   and run `npm run build:html` again. See HTML_HOSTING.md in the repository.

Build:
------
From project root:
  npm run build:html

Notes:
------
- .htaccess sets headers for SharedArrayBuffer (FFmpeg video conversion)
- Requires Apache mod_headers. Without these headers, waveform display works
  but MP4 download may not be available.

---

日本語
------
このディレクトリは Next.js の静的エクスポート結果です。`/visualizer` パス用です。
サーバーの visualizer ディレクトリに配置してください。

配置: public_html/visualizer/ に index.html, _next/, .htaccess 等をすべて配置
アクセス: https://あなたのドメイン/visualizer/

別パスで公開する場合は next.config.js の basePath/assetPrefix を変更して
`npm run build:html` を再実行してください。リポジトリの HTML_HOSTING.md を参照。
