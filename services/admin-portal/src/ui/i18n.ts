import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import HttpBackend from 'i18next-http-backend'

import en from './locales/en/translation.json'
import he from './locales/he/translation.json'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const apiBase = ((import.meta as any).env?.VITE_EDGE_API_URL as string | undefined)?.trim() || 'http://localhost:8000'

i18n
  .use(HttpBackend)
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: {
        translation: en,
      },
      he: {
        translation: he,
      },
    },
    backend: {
      loadPath: `${apiBase}/v1/translations/bundle/{{lng}}/{{ns}}`,
    },
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false, // react already safes from xss
    },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
    },
  })

export default i18n
