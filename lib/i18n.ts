import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import ja from "../locales/ja.json";
import en from "../locales/en.json";

const resources = {
  ja: { translation: ja },
  en: { translation: en },
};

i18n.use(initReactI18next).init({
  resources,
  lng: "ja",
  fallbackLng: "en",
  interpolation: {
    escapeValue: false, // React already escapes
  },
});

export default i18n;
