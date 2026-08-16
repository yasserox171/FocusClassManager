import { format, formatDistanceToNow, parseISO } from 'date-fns'
import { arMA, fr } from 'date-fns/locale'

import { toCenterWallClock } from './timezone'

export function dateLocale(language: string) {
  return language.startsWith('ar') ? arMA : fr
}

/** All display helpers render the centre's wall clock, not the browser's. */
export function formatDate(value: string | Date, language: string, pattern = 'dd/MM/yyyy'): string {
  return format(toCenterWallClock(value), pattern, { locale: dateLocale(language) })
}

export function formatTime(value: string | Date, language: string): string {
  return formatDate(value, language, 'HH:mm')
}

export function formatDateTime(value: string | Date, language: string): string {
  return formatDate(value, language, 'dd/MM/yyyy HH:mm')
}

/** "12/03/2025, 08:00 - 10:00" - the range display used in every list. */
export function formatRange(start: string, end: string, language: string): string {
  const startDate = toCenterWallClock(start)
  const endDate = toCenterWallClock(end)
  const locale = dateLocale(language)
  const sameDay = startDate.toDateString() === endDate.toDateString()
  const day = format(startDate, 'dd/MM/yyyy', { locale })
  const startTime = format(startDate, 'HH:mm', { locale })
  const endTime = format(endDate, 'HH:mm', { locale })
  return sameDay
    ? `${day}, ${startTime} - ${endTime}`
    : `${day} ${startTime} → ${format(endDate, 'dd/MM/yyyy', { locale })} ${endTime}`
}

/** Relative wording ("il y a 2 heures") works on the real instant. */
export function relativeTime(value: string, language: string): string {
  return formatDistanceToNow(parseISO(value), { addSuffix: true, locale: dateLocale(language) })
}

/** `2025-03-31` for an <input type="date">. */
export function toDateInput(value: Date): string {
  return format(value, 'yyyy-MM-dd')
}

export function toTimeInput(value: Date): string {
  return format(value, 'HH:mm')
}

export function hoursLabel(value: number, language: string): string {
  const rounded = Math.round(value * 10) / 10
  return language.startsWith('ar') ? `${rounded} س` : `${rounded} h`
}

export function percentLabel(value: number): string {
  return `${Math.round(value * 10) / 10}%`
}
