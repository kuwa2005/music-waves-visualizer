/** @type {import('next').NextConfig} */

// レンタルサーバー用静的エクスポート: BUILD_HTML=1 npm run build:html
const isHtmlExport = process.env.BUILD_HTML === '1';

const securityHeaders = [
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
];

const nextConfig = isHtmlExport
  ? {
      output: "export",
      distDir: "out",
      basePath: '/visualizer',
      assetPrefix: '/visualizer',
      reactStrictMode: true,
      trailingSlash: true,
      images: { unoptimized: true },
    }
  : {
      reactStrictMode: true,
      async headers() {
        return [
          {
            source: "/:path*",
            headers: securityHeaders,
          },
        ];
      },
    };

module.exports = nextConfig;
