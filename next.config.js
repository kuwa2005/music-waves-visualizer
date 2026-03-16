/** @type {import('next').NextConfig} */

// レンタルサーバー用静的エクスポート: BUILD_HTML=1 npm run build:html
const isHtmlExport = process.env.BUILD_HTML === '1';

const nextConfig = isHtmlExport
  ? {
      basePath: '/visualizer',
      assetPrefix: '/visualizer',
      reactStrictMode: true,
      trailingSlash: true,
      images: { unoptimized: true },
    }
  : {
      reactStrictMode: true,
      output: 'standalone', // Docker用
      async headers() {
        return [
          {
            source: "/:path*",
            headers: [
              { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
              { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
            ],
          },
        ];
      },
    };

module.exports = nextConfig;
