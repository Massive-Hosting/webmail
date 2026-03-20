import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import en from './locales/en.json';
import no from './locales/no.json';
import de from './locales/de.json';

export const LANGUAGES = [
  { code: 'en', label: '\u{1F1EC}\u{1F1E7} English' },
  { code: 'no', label: '\u{1F1F3}\u{1F1F4} Norsk' },
  { code: 'de', label: '\u{1F1E9}\u{1F1EA} Deutsch' },
] as const;

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      no: { translation: no },
      de: { translation: de },
    },
    fallbackLng: 'en',
    interpolation: { escapeValue: true },
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'language',
      caches: ['localStorage'],
    },
  });

export default i18n;
