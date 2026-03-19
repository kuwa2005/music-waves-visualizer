# Docker Setup Guide

How to run this project with Docker.

For detailed requirements and troubleshooting, see [SERVER_REQUIREMENTS_DOCKER.md](./SERVER_REQUIREMENTS_DOCKER.md).

## Prerequisites

- Docker Desktop (or Docker Engine + Docker Compose)

## Quick Start

### Docker HTTPS (recommended for testing)

```bash
# 1. Generate certificate (first time only)
./generate-ssl-cert.sh 192.168.0.234

# 2. Start container (builds visualizer, serves via nginx)
docker compose -f docker-compose.https.yml up -d --build
```

- Access: `https://<server-IP>:8443/visualizer/` (e.g. https://192.168.0.234:8443/visualizer/)
- Serves static HTML from `visualizer/` via nginx
- HTTPS required for remote access and SharedArrayBuffer (FFmpeg)
- Self-signed cert: In browser, choose "Advanced" → "Proceed to site"
- **Important**: Certificate is bound to the IP used at generation. Regenerate with `./generate-ssl-cert.sh <correct-IP>` if the server IP changes

> **Note**: Remote testing over HTTP (port 3000) does not work due to COOP/COEP. Use Docker HTTPS for verification.

### Production (Next.js standalone)

```bash
docker-compose up --build
```

### Development

```bash
docker-compose -f docker-compose.dev.yml up --build
```

## Commands

### Start

```bash
docker-compose up -d --build
docker-compose -f docker-compose.dev.yml up -d --build  # dev
```

### Stop

```bash
docker-compose down
docker compose -f docker-compose.https.yml down  # HTTPS
```

### Logs

```bash
docker-compose logs -f
```

## Troubleshooting

### Port in use

Edit `ports` in `docker-compose.yml`:

```yaml
ports:
  - "3001:3000"
```

### Rebuild without cache

```bash
docker-compose build --no-cache
```

### Run command in container

```bash
docker-compose exec app sh
```

---

## 日本語

### Docker HTTPS版（推奨）

```bash
./generate-ssl-cert.sh <サーバーIP>   # 初回のみ
docker compose -f docker-compose.https.yml up -d --build
```

アクセス: `https://<サーバーIP>:8443/visualizer/`

### 本番・開発モード

```bash
docker-compose up --build              # 本番
docker-compose -f docker-compose.dev.yml up --build  # 開発
```

詳細は [サーバー要件(local docker)用.md](./サーバー要件(local%20docker)用.md) を参照してください。
