import { useTranslation } from "react-i18next";
import type { Locale } from "date-fns";
import { de, enUS, es, fr, it, zhCN } from "date-fns/locale";

const LOCALES: Record<string, Locale> = { en: enUS, de, es, fr, it, zh: zhCN };

/** date-fns locale for an i18next language code such as "de" or "de-AT". */
export function dateLocaleFor(language: string | undefined): Locale {
  return LOCALES[(language ?? "en").split("-")[0]] ?? enUS;
}

/**
 * date-fns locale of the current UI language, for `format(date, "PPP", { locale })` and
 * `formatDistanceToNow(date, { addSuffix: true, locale })`.
 */
export function useDateLocale(): Locale {
  const { i18n } = useTranslation();
  return dateLocaleFor(i18n.resolvedLanguage ?? i18n.language);
}
