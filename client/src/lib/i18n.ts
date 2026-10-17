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
    debug: import.meta.env.DEV,

    interpolation: {
      escapeValue: false, // not needed for react as it escapes by default
    },

    ns: ["translation", "tickets", "analytics", "modPerf", "server"],
    defaultNS: "translation",
    backend: {
      loadPath: "/locales/{{lng}}/{{ns}}.json",
    },
  });

// Keep <html lang> in sync with the UI language (screen readers, hyphenation, spell checking)
const setDocumentLanguage = (lng: string) => {
  if (typeof document !== "undefined" && lng) document.documentElement.lang = lng.split("-")[0];
};
i18n.on("languageChanged", setDocumentLanguage);
if (i18n.language) setDocumentLanguage(i18n.language);

export default i18n;
