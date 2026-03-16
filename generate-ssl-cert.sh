#!/bin/bash
# 自己署名SSL証明書を生成
# 使い方: ./generate-ssl-cert.sh [IPアドレス]
# 例: ./generate-ssl-cert.sh 192.168.0.234

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SSL_DIR="${SCRIPT_DIR}/ssl"
IP="${1:-$(hostname -I 2>/dev/null | awk '{print $1}')}"

if [ -z "$IP" ]; then
    echo "IPアドレスを指定してください: ./generate-ssl-cert.sh 192.168.0.234"
    echo "サーバーのIP確認: hostname -I | awk '{print \$1}'"
    exit 1
fi

mkdir -p "$SSL_DIR"
cd "$SSL_DIR"

openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout key.pem -out cert.pem \
    -subj "/CN=$IP" \
    -addext "subjectAltName=IP:$IP,IP:127.0.0.1,DNS:localhost"

echo "証明書を生成しました: $SSL_DIR/"
echo "アクセスURL: https://$IP:8443"
echo "※ブラウザで証明書の警告が出たら「詳細」→「安全でないサイトへ」で進んでください"
