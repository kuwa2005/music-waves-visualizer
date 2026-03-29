import { Html, Head, Main, NextScript } from "next/document";

/**
 * 既定言語は日本語（クライアントでブラウザに合わせ en 切替）。
 * SEO・スクリーンリーダー向けに html lang を付与。
 */
export default function Document() {
  return (
    <Html lang="ja">
      <Head />
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
