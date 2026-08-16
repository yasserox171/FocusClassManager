import clsx from 'clsx'
import { AlertTriangle, Bell, CalendarClock, Wrench } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { notificationService } from '@/services/analyticsService'
import type { Alert, NotificationCategory, NotificationLevel } from '@/types'
import { relativeTime } from '@/utils/format'

const CATEGORY_ICONS: Record<NotificationCategory, typeof Bell> = {
  booking_created: CalendarClock,
  booking_cancelled: CalendarClock,
  booking_conflict: AlertTriangle,
  booking_reminder: CalendarClock,
  room_maintenance: Wrench,
  resource_issue: AlertTriangle,
}

const LEVEL_STYLES: Record<NotificationLevel, string> = {
  info: 'text-brand-600 bg-brand-50',
  warning: 'text-amber-600 bg-amber-50',
  critical: 'text-red-600 bg-red-50',
}

/** Polls the live alerts endpoint every two minutes. */
export function NotificationBell() {
  const { t, i18n } = useTranslation()
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let active = true

    const load = async () => {
      try {
        const data = await notificationService.alerts()
        if (active) setAlerts(data)
      } catch {
        // A failing bell must never break the page.
      }
    }

    void load()
    const timer = window.setInterval(load, 120_000)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    const handler = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const critical = alerts.filter((alert) => alert.level !== 'info').length
  const isArabic = i18n.language.startsWith('ar')

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="relative rounded-lg p-2 text-slate-600 transition hover:bg-slate-100"
        aria-label={t('notifications.title')}
      >
        <Bell size={20} />
        {alerts.length > 0 && (
          <span
            className={clsx(
              'absolute -top-0.5 end-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold text-white',
              critical > 0 ? 'bg-red-500' : 'bg-brand-500',
            )}
          >
            {alerts.length > 9 ? '9+' : alerts.length}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute end-0 z-30 mt-2 w-80 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl sm:w-96">
          <header className="border-b border-slate-100 px-4 py-3">
            <h3 className="text-sm font-semibold text-slate-800">{t('notifications.title')}</h3>
          </header>
          <div className="max-h-96 overflow-y-auto">
            {alerts.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-slate-500">
                {t('notifications.empty')}
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {alerts.map((alert) => {
                  const Icon = CATEGORY_ICONS[alert.category] ?? Bell
                  return (
                    <li key={alert.id} className="flex gap-3 px-4 py-3">
                      <span
                        className={clsx(
                          'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
                          LEVEL_STYLES[alert.level],
                        )}
                      >
                        <Icon size={16} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                          {t(`notifications.categories.${alert.category}`)}
                        </p>
                        <p className="text-sm text-slate-700">
                          {isArabic ? alert.message_ar : alert.message_fr}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-400">
                          {relativeTime(alert.created_at, i18n.language)}
                        </p>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
