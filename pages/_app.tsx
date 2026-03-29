import Head from "next/head";
import type { AppProps } from "next/app";
import React, { useEffect, useMemo } from "react";
import getConfig from "next/config";
import "../styles/globals.scss";
import i18n from "../lib/i18n";

const { publicRuntimeConfig } = getConfig();
const assetBasePath: string = publicRuntimeConfig?.assetBasePath ?? "";
const basePathNorm =
  assetBasePath === "" ? "" : assetBasePath.endsWith("/") ? assetBasePath.slice(0, -1) : assetBasePath;

const rawSite =
  (process.env.NEXT_PUBLIC_SITE_URL ?? "").trim() ||
  (process.env.NEXT_PUBLIC_DOMAIN ?? "").trim();
const siteUrl = rawSite.replace(/\/$/, "");

const META_TITLE = "Music Waves Visualizer(改) #MWV";
/** 検索結果向け: 日本語中心＋英語短句（全角・半角含めおおよそ320字以内） */
const META_DESCRIPTION =
  "ブラウザ上で音楽と背景画像から、スペクトラムアナライザー（周波数バー・波形・円形など）付きの映像を作成。複数枚の画像自動切替・トランジション、雨・雪・スキャンライン等のエフェクト、MP4書き出しまで対応。Create spectrum-style music visualizer videos in the browser with multi-image gallery and MP4 export.";

const META_KEYWORDS =
  "music visualizer,audio spectrum,スペクトラムアナライザー,波形動画,MP4,音楽ビジュアライザー,Web Audio,ブラウザ";

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

  const canonicalUrl = siteUrl !== "" ? `${siteUrl}${basePathNorm}/` : "";
  const ogImageUrl =
    siteUrl !== "" ? `${siteUrl}${basePathNorm}/waves.png` : `${basePathNorm || ""}/waves.png`;

  const jsonLd = useMemo(
    () =>
      JSON.stringify({
        "@context": "https://schema.org",
        "@type": "WebApplication",
        name: META_TITLE,
        description: META_DESCRIPTION,
        url: canonicalUrl || undefined,
        applicationCategory: "MultimediaApplication",
        operatingSystem: "Any",
        browserRequirements: "Requires JavaScript. Modern browser with Web Audio and WebGL or Canvas.",
        offers: {
          "@type": "Offer",
          price: "0",
          priceCurrency: "USD",
        },
      }),
    [canonicalUrl]
  );

  return (
    <>
      <Head>
        <title>{META_TITLE}</title>
        <meta name="description" content={META_DESCRIPTION} />
        <meta name="keywords" content={META_KEYWORDS} />
        <meta name="author" content="Music Waves Visualizer contributors" />
        <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1" />
        <meta name="googlebot" content="index, follow" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <meta name="theme-color" content="#1a1a1a" />
        <meta name="color-scheme" content="dark light" />
        <meta name="format-detection" content="telephone=no, email=no, address=no" />

        {canonicalUrl !== "" && <link rel="canonical" href={canonicalUrl} />}

        <meta property="og:title" content={META_TITLE} />
        <meta property="og:description" content={META_DESCRIPTION} />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="Music Waves Visualizer" />
        <meta property="og:locale" content="ja_JP" />
        <meta property="og:locale:alternate" content="en_US" />
        {canonicalUrl !== "" && <meta property="og:url" content={canonicalUrl} />}
        <meta property="og:image" content={ogImageUrl} />
        <meta property="og:image:alt" content="Music Waves Visualizer — spectrum-style audio visualizer" />

        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={META_TITLE} />
        <meta name="twitter:description" content={META_DESCRIPTION} />
        <meta name="twitter:image" content={ogImageUrl} />
        <meta name="twitter:site" content="@komura_c" />
        <meta name="twitter:creator" content="@komura_c" />

        <link rel="icon" href={`${basePathNorm}/favicon.ico`} />
        <link rel="apple-touch-icon" href={`${basePathNorm}/waves.png`} />

        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />
      </Head>

      <Component {...pageProps} />
    </>
  );
};

export default App;
