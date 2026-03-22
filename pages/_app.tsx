import Head from "next/head";
import type { AppProps } from "next/app";
import React, { useEffect } from "react";
import "../styles/globals.scss";
import i18n from "../lib/i18n";

const baseURL = process.env.NEXT_PUBLIC_DOMAIN ?? "";

/** クローラ・SNS用。クライアントの言語切り替え前でも日英が伝わるよう併記 */
const META_DESCRIPTION =
  "画像と音楽で音声波形動画を作成しMP4で出力。Load image and music to create audio waveform videos; export MP4. — Music Waves Visualizer";

// ハイドレーション完了後にブラウザ言語で切り替え（サーバー/クライアント不一致を防ぐ）
const useBrowserLanguage = () => {
  useEffect(() => {
    const browserLang = navigator.language?.toLowerCase() ?? "";
    if (!browserLang.startsWith("ja")) {
      i18n.changeLanguage("en");
    }
  }, []);
};

const App = ({ Component, pageProps }: AppProps) => {
  useBrowserLanguage();

  return (
    <>
      <Head>
        <title>Music Waves Visualizer</title>
        <meta name="description" content={META_DESCRIPTION} />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <meta
          name="format-detection"
          content="telephone=no, email=no, address=no"
        />
        <meta property="og:title" content="Music Waves Visualizer" />
        <meta property="og:description" content={META_DESCRIPTION} />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={baseURL} />
        <meta property="og:image" content={baseURL + "waves.png"} />
        <meta name="twitter:card" content="summary" />
        <meta name="twitter:site" content="@komura_c" />
        <meta name="twitter:creator" content="@komura_c" />
        <link rel="apple-touch-icon" href={baseURL + "waves.png"} />
        <link rel="shortcut icon" href={baseURL + "favicon.ico"} />
      </Head>

      <Component {...pageProps} />
    </>
  );
};

export default App;
