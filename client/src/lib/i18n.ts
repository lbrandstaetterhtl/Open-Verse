import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import Backend from "i18next-http-backend";

/**
 * Translations of the admin/owner area. They are not loaded for anyone else (client/src/lib/staff.tsx loads
 * them together with the staff code) and the server answers them with 404 for non-staff
 * (server/staff-assets.ts). Keys there are used as "staff:admin.x", "analytics:x", "modPerf:x".
 * staffServer: error texts that only the admin API sends (looked up like "server", see lib/server-messages.ts).
 */
export const STAFF_NAMESPACES = ["staff", "analytics", "modPerf", "staffServer"] as const;

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

    ns: ["translation", "tickets", "server"],
    defaultNS: "translation",
    backend: {
      // ?v= changes whenever a translation file changes (see vite.config.ts), so browsers never use stale texts
      loadPath: `/locales/{{lng}}/{{ns}}.json?v=${__LOCALES_VERSION__}`,
    },
  });

// Keep <html lang> in sync with the UI language (screen readers, hyphenation, spell checking)
const setDocumentLanguage = (lng: string) => {
  if (typeof document !== "undefined" && lng) document.documentElement.lang = lng.split("-")[0];
};
i18n.on("languageChanged", setDocumentLanguage);
if (i18n.language) setDocumentLanguage(i18n.language);

export default i18n;
