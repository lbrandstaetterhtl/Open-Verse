import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import Backend from "i18next-http-backend";

i18n
  .use(Backend)
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    fallbackLng: "en",
    supportedLngs: ["en", "de", "it", "es", "fr", "zh"],
    debug: true,

    interpolation: {
      escapeValue: false, // not needed for react as it escapes by default
    },

    ns: ["translation", "tickets", "analytics", "modPerf"],
    defaultNS: "translation",
    backend: {
      loadPath: "/locales/{{lng}}/{{ns}}.json",
    },
  });
