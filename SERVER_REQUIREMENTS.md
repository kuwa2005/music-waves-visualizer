# Server Requirements (Shared Hosting)

Requirements for running Music Waves Visualizer on shared hosting, rental servers, etc.

## Quick Build

```bash
npm install
npm run build:html
```

Upload contents of `visualizer/` to the server's `visualizer` directory. Access at `https://your-domain/visualizer/`.

## Requirements

- **Node.js**: 18.x+ (for build)
- **Static hosting**: Vercel, Netlify, GitHub Pages, or any static file server
- **Storage**: 500MB+ recommended
- **HTTPS**: Recommended (required for SharedArrayBuffer / FFmpeg)

## Deployment Options

- **Vercel**: Recommended for Next.js
- **Netlify**: Static hosting
- **FTP/SFTP**: Upload `visualizer/` to `public_html/visualizer/`

## Limitations

- SharedArrayBuffer requires COOP/COEP headers (see `.htaccess` in `visualizer/`)
- Without these headers, waveform display works but MP4 download may not

See [HTML_HOSTING.md](./HTML_HOSTING.md) for custom deployment paths.

---

## 日本語

詳細は [サーバー要件.md](./サーバー要件.md) を参照してください。
