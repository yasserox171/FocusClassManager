import { useTranslation } from 'react-i18next'
import type { FlexStyle, TextStyle } from 'react-native'

import type { Language } from '../i18n'

/**
 * Arabic is right-to-left. Instead of relying on `I18nManager.forceRTL` - which
 * needs an app restart - every row and text block asks for its direction here,
 * so switching language re-renders instantly.
 */
export function useDirection() {
  const { i18n } = useTranslation()
  const language = (i18n.language === 'ar' ? 'ar' : 'fr') as Language
  const isRTL = language === 'ar'

  return {
    language,
    isRTL,
    /** Horizontal stack that follows the reading order. */
    row: { flexDirection: isRTL ? 'row-reverse' : 'row' } as FlexStyle,
    /** Text aligned to the start of the line. */
    text: { textAlign: isRTL ? 'right' : 'left', writingDirection: isRTL ? 'rtl' : 'ltr' } as TextStyle,
    /** Text aligned to the end of the line. */
    textEnd: { textAlign: isRTL ? 'left' : 'right' } as TextStyle,
    /** Picks the Arabic field when the interface is Arabic, else the French one. */
    pick: (fr: string | undefined | null, ar: string | undefined | null) =>
      (isRTL ? ar || fr : fr || ar) ?? '',
  }
}
