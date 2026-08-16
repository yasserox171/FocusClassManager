import clsx from 'clsx'
import { Languages } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { LANGUAGE_LABELS, SUPPORTED_LANGUAGES, type Language } from '@/i18n/config'

export function LanguageSwitcher() {
  const { i18n } = useTranslation()
  const current = i18n.language.startsWith('ar') ? 'ar' : 'fr'

  return (
    <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-1">
      <Languages size={16} className="mx-1 text-slate-400" />
      {SUPPORTED_LANGUAGES.map((language: Language) => (
        <button
          key={language}
          type="button"
          onClick={() => void i18n.changeLanguage(language)}
          className={clsx(
            'rounded-md px-2 py-1 text-xs font-medium transition',
            current === language
              ? 'bg-brand-600 text-white'
              : 'text-slate-600 hover:bg-slate-100',
          )}
          aria-pressed={current === language}
        >
          {LANGUAGE_LABELS[language]}
        </button>
      ))}
    </div>
  )
}
