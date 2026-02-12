import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

// Eager-load all namespace JSONs (Vite glob import)
const localeModules = import.meta.glob("../locales/**/*.json", { eager: true }) as Record<
  string,
  { default: Record<string, string> }
>;

// Build resources object from glob: { en: { common: {...}, landing: {...} }, ja: {...}, ... }
const resources: Record<string, Record<string, Record<string, string>>> = {};
for (const path in localeModules) {
  const match = path.match(/\/locales\/(\w+)\/(\w+)\.json$/);
  if (!match) continue;
  const [, lang, ns] = match;
  resources[lang] ??= {};
  resources[lang][ns] = localeModules[path].default ?? (localeModules[path] as unknown as Record<string, string>);
}

export const supportedLanguages = [
  { code: "en", name: "English", native: "English" },
  { code: "ja", name: "Japanese", native: "日本語" },
  { code: "zh", name: "Chinese", native: "中文" },
  { code: "hi", name: "Hindi", native: "हिन्दी" },
  { code: "es", name: "Spanish", native: "Español" },
  { code: "fr", name: "French", native: "Français" },
  { code: "ar", name: "Arabic", native: "العربية" },
] as const;

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: "en",
    ns: ["common", "landing", "docs", "fold", "errors"],
    defaultNS: "common",
    interpolation: { escapeValue: false },
    detection: {
      order: ["localStorage", "navigator"],
      lookupLocalStorage: "eywa-language",
      caches: ["localStorage"],
    },
  });

export default i18n;
