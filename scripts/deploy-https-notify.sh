#!/usr/bin/env bash
# HTML エクスポート → docker compose down → HTTPS 用 compose で up --build
# 完了・失敗時にデスクトップ通知（notify-send）とターミナルベルで知らせる
# 使い方: npm run deploy:https
#         または: bash scripts/deploy-https-notify.sh

set -o pipefail
cd "$(dirname "$0")/.."

notify_cursor_env() {
  local title="$1"
  local body="$2"
  if command -v notify-send >/dev/null 2>&1; then
    notify-send -a "Music Waves Visualizer" -i dialog-information "$title" "$body" 2>/dev/null || true
  fi
  # Cursor 内蔵ターミナルでベルが有効なら音が鳴る
  printf '\a'
}

if npm run build:html && docker compose down && docker compose -f docker-compose.https.yml up -d --build; then
  notify_cursor_env "デプロイ完了" "build:html と docker-compose.https の起動が終わりました。"
  exit 0
else
  notify_cursor_env "デプロイ失敗" "途中でエラーが出ました。ターミナルのログを確認してください。"
  exit 1
fi
