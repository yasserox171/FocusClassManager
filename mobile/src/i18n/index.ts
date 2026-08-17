import * as Localization from 'expo-localization'
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { I18nManager } from 'react-native'

import ar from './ar.json'
import fr from './fr.json'

export type Language = 'ar' | 'fr'

/**
 * We drive direction ourselves (see `useDirection`) rather than through
 * `I18nManager.forceRTL`, which only takes effect after a full app restart and
 * would make the language switch feel broken.
 */
I18nManager.allowRTL(false)

const deviceLanguage = Localization.getLocales()[0]?.languageCode
const fallback: Language = deviceLanguage === 'ar' ? 'ar' : 'fr'

void i18n.use(initReactI18next).init({
  resources: { fr: { translation: fr }, ar: { translation: ar } },
  lng: fallback,
  fallbackLng: 'fr',
  interpolation: { escapeValue: false },
})

export default i18n
