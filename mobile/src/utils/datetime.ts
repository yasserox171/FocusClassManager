import dayjs from 'dayjs'
import 'dayjs/locale/ar'
import 'dayjs/locale/fr'
import timezone from 'dayjs/plugin/timezone'
import utc from 'dayjs/plugin/utc'

import { CENTER_TIMEZONE } from '../config'

dayjs.extend(utc)
dayjs.extend(timezone)

/**
 * Every timestamp is rendered at the centre's clock, so a booking at 09:00 in
 * Safi reads 09:00 even when the phone is roaming in another zone.
 */
export function atCenter(value: string | Date) {
  return dayjs(value).tz(CENTER_TIMEZONE)
}

export function formatTime(value: string | Date) {
  return atCenter(value).format('HH:mm')
}

export function formatDate(value: string | Date, language: string) {
  return atCenter(value).locale(language === 'ar' ? 'ar' : 'fr').format('DD MMM YYYY')
}

export function formatDateTime(value: string | Date, language: string) {
  return `${formatDate(value, language)} · ${formatTime(value)}`
}

/** `09:00 → 11:00` for a booking row. */
export function formatSlot(start: string, end: string) {
  return `${formatTime(start)} → ${formatTime(end)}`
}

export function isToday(value: string | Date) {
  return atCenter(value).isSame(dayjs().tz(CENTER_TIMEZONE), 'day')
}

/** ISO string the API expects for `start` / `end` query parameters. */
export function isoAtCenter(value: dayjs.Dayjs) {
  return value.format('YYYY-MM-DDTHH:mm:ss')
}

export { dayjs }
