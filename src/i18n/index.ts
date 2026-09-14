import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';

import { en } from './locales/en';
import { bg } from './locales/bg';

export type AppLanguage = 'en' | 'bg';

// English is a safe synchronous default so nothing renders untranslated
// before SettingsContext resolves the persisted/detected language.
void i18next.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    bg: { translation: bg },
  },
  lng: 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  returnNull: false,
});

export default i18next;
