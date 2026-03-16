レンタルサーバー用 静的ファイル配布パック
==========================================

このディレクトリを丸ごとコピーしてレンタルサーバーにアップロードしてください。

配置方法:
---------
1. この visualizer フォルダの中身を、サーバーの visualizer ディレクトリにアップロード
   例: public_html/visualizer/ に index.html, _next/, .htaccess 等を配置

2. アクセスURL: https://あなたのドメイン/visualizer/
   例: https://hogehoge.com/visualizer/

ビルド方法:
-----------
プロジェクトルートで以下を実行:
  npm run build:html

注意事項:
---------
- .htaccess は SharedArrayBuffer（FFmpeg動画変換）用のヘッダーを設定します
- Apache で mod_headers が有効な場合のみ動作します
- ヘッダーが設定できない環境では、波形表示・再生は動きますが MP4 ダウンロードは利用できません
