import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import AsyncStorage from "@react-native-async-storage/async-storage";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import localeData from "dayjs/plugin/localeData";
import weekday from "dayjs/plugin/weekday";
import "dayjs/locale/sr";
import "dayjs/locale/en";

import sr from "@/locales/sr.json";
import en from "@/locales/en.json";

dayjs.extend(relativeTime);
dayjs.extend(localeData);
dayjs.extend(weekday);

const STORAGE_KEY = "app.preferredLocale";

const supportedLngs = ["sr", "en"] as const;
export type Locale = (typeof supportedLngs)[number];

i18n.use(initReactI18next).init({
  resources: { sr: { translation: sr }, en: { translation: en } },
  lng: "sr",
  fallbackLng: "sr",
  supportedLngs: [...supportedLngs],
  interpolation: { escapeValue: false },
  compatibilityJSON: "v4",
});

// Keep dayjs locale in sync with i18n so .fromNow(), .format() etc. are localized.
function syncDayjsLocale(lng: string) {
  dayjs.locale(lng === "sr" ? "sr" : "en");
}
syncDayjsLocale(i18n.language);
i18n.on("languageChanged", syncDayjsLocale);

export default i18n;

/**
 * Load stored locale from AsyncStorage and apply it. Call from app root after mount.
 */
export async function loadStoredLocale(): Promise<void> {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    if (stored && (stored === "sr" || stored === "en")) {
      await i18n.changeLanguage(stored);
    }
  } catch {
    // ignore
  }
}

/**
 * Persist chosen locale and optionally return it for API sync.
 *
 * Sets dayjs.locale eagerly *before* awaiting i18n.changeLanguage so any
 * React re-render triggered by the language change reads the updated dayjs
 * locale on first paint. The languageChanged listener still re-syncs as a
 * safety net (e.g. on app start via loadStoredLocale).
 */
export async function setLocale(locale: Locale): Promise<void> {
  syncDayjsLocale(locale);
  await i18n.changeLanguage(locale);
  try {
    await AsyncStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // ignore
  }
}

/**
 * BCP 47 locale for date/number formatting (e.g. toLocaleDateString).
 * Serbian uses the Latin script tag — `sr-RS` resolves to Cyrillic by default
 * on ICU, which doesn't match the rest of the UI.
 */
export function getDateLocale(): string {
  return i18n.language === "en" ? "en-US" : "sr-Latn-RS";
}

/**
 * The decimal separator the current UI language writes — "," in Serbian, "."
 * in English. Used to seed and read number inputs in the notation the person
 * typing actually uses.
 */
export function decimalSeparator(): string {
  return (1.1).toLocaleString(getDateLocale()).replace(/\d/g, "");
}

export { STORAGE_KEY };
