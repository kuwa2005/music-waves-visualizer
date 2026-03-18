レンタルサーバー用 静的ファイル配布パック（/visualizer 前提）
===============================================

このディレクトリは **Next.js の静的エクスポート結果（完全な静的HTML版）** です。
ビルド時の設定で **`/visualizer` パスに固定** されているため、
そのまま使う場合は必ずサーバールート直下の `visualizer` ディレクトリに配置してください。

配置方法:
---------
1. この visualizer フォルダの中身を、サーバーの visualizer ディレクトリにアップロード
   例: public_html/visualizer/ に index.html, _next/, .htaccess 等をすべて配置

2. アクセスURL: https://あなたのドメイン/visualizer/
   例: https://hogehoge.com/visualizer/

※ `/visualizer` 以外のパス（/mwv など）で公開したい場合は、そのままでは動きません。  
　`next.config.js` の `basePath` / `assetPrefix` を変更して `npm run build:html` し直す必要があります。  
　詳しくはリポジトリの `HTML_HOSTING.md` を参照してください。

ビルド方法:
-----------
プロジェクトルートで以下を実行:
  npm run build:html

注意事項:
---------
- .htaccess は SharedArrayBuffer（FFmpeg動画変換）用のヘッダーを設定します
- Apache で mod_headers が有効な場合のみ動作します
- ヘッダーが設定できない環境では、波形表示・再生は動きますが MP4 ダウンロードは利用できません
