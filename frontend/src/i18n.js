import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import en from './locales/en.json';
import ja from './locales/ja.json';
const resources = { en: { translation: en }, ja: { translation: ja } };

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'bbox_lang',
    },
  });

export function __t(key, opts) {
  if (!key) return undefined;
  const result = i18n.t(key, opts);
  return result === key ? undefined : result;
}

export default i18n;
