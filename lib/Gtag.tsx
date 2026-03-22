import { useRouter } from "next/router";
import Script from "next/script";
import { FC, useEffect } from "react";
import { parseGoogleAnalyticsId } from "./gaId";

const GA_ID = parseGoogleAnalyticsId(
  process.env.NEXT_PUBLIC_GOOGLE_ANALYTICS_ID
);
const existsGaId = GA_ID != null;

const pageview = (path: string) => {
  if (!GA_ID) return;
  window.gtag("config", GA_ID, {
    page_path: path,
  });
};

export const usePageView = () => {
  const router = useRouter();

  useEffect(() => {
    if (!existsGaId) {
      return;
    }

    const handleRouteChange = (path: string) => {
      pageview(path);
    };

    router.events.on("routeChangeComplete", handleRouteChange);
    return () => {
      router.events.off("routeChangeComplete", handleRouteChange);
    };
  }, [router.events]);
};

export const GoogleAnalytics: FC<{}> = () => (
  <>
    {existsGaId && (
      <>
        <Script
          defer
          src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(
            GA_ID
          )}`}
          strategy="afterInteractive"
        />
        <Script
          id="gtag-script"
          defer
          dangerouslySetInnerHTML={{
            __html: `
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', ${JSON.stringify(GA_ID)}, {
                page_path: window.location.pathname,
              });
            `,
          }}
          strategy="afterInteractive"
        />
      </>
    )}
  </>
);
