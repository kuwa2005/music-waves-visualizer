# Server Requirements (Local / Docker)

Requirements for running Music Waves Visualizer on local machines or Docker.

## System Requirements

- **CPU**: 2+ cores (4+ recommended)
- **Memory**: 2GB+ (4GB+ recommended)
- **Node.js**: 18.x+
- **Docker**: Engine 20.10+, Compose 2.0+ (if using Docker)

## Ports

- **8443**: Docker HTTPS (recommended for remote testing)
- **3000**: Next.js production/development

> Remote testing over HTTP (3000) does not work due to COOP/COEP. Use Docker HTTPS (8443).

## Quick Setup

```bash
# Local
git clone https://github.com/kuwa2005/music-waves-visualizer.git
cd music-waves-visualizer
npm install
npm run dev
# Access: http://localhost:3000

# Docker HTTPS
./generate-ssl-cert.sh <server-IP>
docker compose -f docker-compose.https.yml up -d --build
# Access: https://<server-IP>:8443/visualizer/
```

See [README_DOCKER.md](./README_DOCKER.md) for Docker commands.

---

## 日本語

詳細は [サーバー要件(local docker)用.md](./サーバー要件(local%20docker)用.md) を参照してください。
