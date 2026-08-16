import i18n from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import { initReactI18next } from 'react-i18next'

import ar from './ar.json'
import fr from './fr.json'

export const SUPPORTED_LANGUAGES = ['fr', 'ar'] as const
export type Language = (typeof SUPPORTED_LANGUAGES)[number]

export const LANGUAGE_LABELS: Record<Language, string> = {
  fr: 'Français',
  ar: 'العربية',
}

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      fr: { translation: fr },
      ar: { translation: ar },
    },
    fallbackLng: 'fr',
    supportedLngs: SUPPORTED_LANGUAGES as unknown as string[],
    interpolation: { escapeValue: false },
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'faas.language',
      caches: ['localStorage'],
    },
  })

/** Keeps `dir`, `lang` and the font in sync with the active language. */
export function applyDirection(language: string): void {
  const isArabic = language.startsWith('ar')
  const root = document.documentElement
  root.setAttribute('dir', isArabic ? 'rtl' : 'ltr')
  root.setAttribute('lang', isArabic ? 'ar' : 'fr')
  root.classList.toggle('font-arabic', isArabic)
}

applyDirection(i18n.language)
i18n.on('languageChanged', applyDirection)

export default i18n
