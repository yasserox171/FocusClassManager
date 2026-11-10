import clsx from 'clsx'
import { addDays, isSameDay, startOfDay } from 'date-fns'
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Layers } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { Booking } from '@/types'
import { centerToday, toCenterWallClock } from '@/utils/timezone'

/** Grid bounds - the centre never books outside of these. */
const DAY_START_HOUR = 7
const DAY_END_HOUR = 23
const ROW_HEIGHT = 58
/** Below this, a gesture is a tap, not a swipe. */
const SWIPE_THRESHOLD = 40

export interface AgendaLayoutEvent {
  booking: Booking
  startMinutes: number
  endMinutes: number
  column: number
  columnCount: number
}

interface BookingAgendaProps {
  bookings: Booking[]
  anchorDate: Date
  onAnchorDateChange: (date: Date) => void
  daysVisible: number
  onDaysVisibleChange?: (days: number) => void
  hoursVisible?: number
  onSelectBooking?: (booking: Booking) => void
  onSelectSlot?: (start: Date, end: Date) => void
}

/**
 * Lays out the events of one day in side-by-side columns.
 *
 * Two sessions can share a slot as soon as they sit in different rooms, and
 * the centre needs to see that at a glance. Overlapping events are grouped
 * into clusters; inside a cluster every event gets the first column that is
 * free at its start, and they all share the width equally.
 */
export function layoutDay(events: Omit<AgendaLayoutEvent, 'column' | 'columnCount'>[]) {
  const sorted = [...events].sort(
    (a, b) => a.startMinutes - b.startMinutes || b.endMinutes - a.endMinutes,
  )
  const laid: AgendaLayoutEvent[] = []

  let cluster: AgendaLayoutEvent[] = []
  let clusterEnd = Number.NEGATIVE_INFINITY
  let columnEnds: number[] = []

  const flush = () => {
    for (const event of cluster) event.columnCount = columnEnds.length || 1
    laid.push(...cluster)
    cluster = []
    columnEnds = []
    clusterEnd = Number.NEGATIVE_INFINITY
  }

  for (const event of sorted) {
    if (cluster.length > 0 && event.startMinutes >= clusterEnd) flush()

    let column = columnEnds.findIndex((end) => end <= event.startMinutes)
    if (column === -1) {
      column = columnEnds.length
      columnEnds.push(event.endMinutes)
    } else {
      columnEnds[column] = event.endMinutes
    }

    cluster.push({ ...event, column, columnCount: 1 })
    clusterEnd = Math.max(clusterEnd, event.endMinutes)
  }
  if (cluster.length > 0) flush()

  return laid
}

function minutesOfDay(date: Date): number {
  return date.getHours() * 60 + date.getMinutes()
}

export function BookingAgenda({
  bookings,
  anchorDate,
  onAnchorDateChange,
  daysVisible,
  onDaysVisibleChange,
  hoursVisible = 8,
  onSelectBooking,
  onSelectSlot,
}: BookingAgendaProps) {
  const { t, i18n } = useTranslation()
  const isRtl = i18n.language.startsWith('ar')
  const intlLocale = isRtl ? 'ar-MA' : 'fr-FR'

  const [startHour, setStartHour] = useState(8)
  const touchRef = useRef<{ x: number; y: number } | null>(null)
  const [now, setNow] = useState(() => centerToday())

  useEffect(() => {
    const timer = window.setInterval(() => setNow(centerToday()), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  const maxStartHour = Math.max(DAY_START_HOUR, DAY_END_HOUR - hoursVisible)
  const windowStart = startHour * 60
  const windowEnd = (startHour + hoursVisible) * 60

  const days = useMemo(
    () => Array.from({ length: daysVisible }, (_, index) => addDays(startOfDay(anchorDate), index)),
    [anchorDate, daysVisible],
  )

  /** Bookings split per day, then laid out, plus what falls outside the window. */
  const columns = useMemo(() => {
    return days.map((day) => {
      const visible: Omit<AgendaLayoutEvent, 'column' | 'columnCount'>[] = []
      let earlier = 0
      let later = 0

      for (const booking of bookings) {
        const start = toCenterWallClock(booking.start_datetime)
        const end = toCenterWallClock(booking.end_datetime)
        if (!isSameDay(start, day)) continue

        const startMinutes = minutesOfDay(start)
        // An overnight slot ends past midnight: clamp it to the end of the day.
        const rawEnd = isSameDay(end, day) ? minutesOfDay(end) : 24 * 60
        const endMinutes = Math.max(rawEnd, startMinutes + 15)

        if (endMinutes <= windowStart) {
          earlier += 1
        } else if (startMinutes >= windowEnd) {
          later += 1
        } else {
          visible.push({ booking, startMinutes, endMinutes })
        }
      }

      const laid = layoutDay(visible)
      return {
        day,
        events: laid,
        earlier,
        later,
        hasOverlap: laid.some((event) => event.columnCount > 1),
      }
    })
  }, [bookings, days, windowStart, windowEnd])

  const hours = Array.from({ length: hoursVisible }, (_, index) => startHour + index)
  const totalOverlaps = columns.filter((column) => column.hasOverlap).length

  // -- navigation --------------------------------------------------------
  const shiftDays = (direction: number) => onAnchorDateChange(addDays(anchorDate, direction * daysVisible))
  const shiftHours = (direction: number) =>
    setStartHour((current) => Math.min(maxStartHour, Math.max(DAY_START_HOUR, current + direction)))

  const handleTouchStart = (event: React.TouchEvent) => {
    const touch = event.touches[0]
    touchRef.current = { x: touch.clientX, y: touch.clientY }
  }

  const handleTouchEnd = (event: React.TouchEvent) => {
    const origin = touchRef.current
    touchRef.current = null
    if (!origin) return

    const touch = event.changedTouches[0]
    const dx = touch.clientX - origin.x
    const dy = touch.clientY - origin.y

    if (Math.abs(dx) < SWIPE_THRESHOLD && Math.abs(dy) < SWIPE_THRESHOLD) return

    if (Math.abs(dx) >= Math.abs(dy)) {
      // Dragging the grid to the right reveals what sits before it: that is
      // the past in a left-to-right reading, the future in Arabic.
      const backwards = isRtl ? dx < 0 : dx > 0
      shiftDays(backwards ? -1 : 1)
    } else {
      shiftHours(dy > 0 ? -1 : 1)
    }
  }

  const rangeLabel = useMemo(() => {
    const first = days[0]
    const last = days[days.length - 1]
    const formatter = new Intl.DateTimeFormat(intlLocale, { day: 'numeric', month: 'short' })
    if (days.length === 1) return formatter.format(first)
    return `${formatter.format(first)} – ${formatter.format(last)}`
  }, [days, intlLocale])

  const PreviousIcon = isRtl ? ChevronRight : ChevronLeft
  const NextIcon = isRtl ? ChevronLeft : ChevronRight
  const gridTemplate = `3.25rem repeat(${daysVisible}, minmax(0, 1fr))`

  return (
    <div className="select-none">
      {/* Toolbar */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => shiftDays(-1)}
            className="rounded-lg border border-slate-300 bg-white p-1.5 text-slate-600 transition hover:bg-slate-50"
            aria-label={t('bookings.previousDays')}
          >
            <PreviousIcon size={16} />
          </button>
          <button
            type="button"
            onClick={() => onAnchorDateChange(centerToday())}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
          >
            {t('common.today')}
          </button>
          <button
            type="button"
            onClick={() => shiftDays(1)}
            className="rounded-lg border border-slate-300 bg-white p-1.5 text-slate-600 transition hover:bg-slate-50"
            aria-label={t('bookings.nextDays')}
          >
            <NextIcon size={16} />
          </button>
          <span className="ms-2 text-sm font-semibold text-slate-800">{rangeLabel}</span>
        </div>

        <div className="flex items-center gap-2">
          {totalOverlaps > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-600/20">
              <Layers size={12} />
              {t('bookings.overlapping')}
            </span>
          )}
          {onDaysVisibleChange && (
            <div className="flex rounded-lg border border-slate-300 bg-white p-0.5">
              {[1, 4, 7].map((count) => (
                <button
                  key={count}
                  type="button"
                  onClick={() => onDaysVisibleChange(count)}
                  className={clsx(
                    'rounded-md px-2 py-1 text-xs font-medium transition',
                    daysVisible === count ? 'bg-brand-600 text-white' : 'text-slate-600',
                  )}
                >
                  {count}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Day headers */}
      <div className="grid gap-px" style={{ gridTemplateColumns: gridTemplate }}>
        <div />
        {columns.map(({ day, earlier }) => {
          const isToday = isSameDay(day, now)
          return (
            <div
              key={day.toISOString()}
              className={clsx(
                'rounded-t-lg px-1 py-2 text-center',
                isToday ? 'bg-brand-50' : 'bg-slate-50',
              )}
            >
              <p
                className={clsx(
                  'text-[11px] font-medium uppercase',
                  isToday ? 'text-brand-700' : 'text-slate-500',
                )}
              >
                {new Intl.DateTimeFormat(intlLocale, { weekday: 'short' }).format(day)}
              </p>
              <p
                className={clsx(
                  'text-sm font-bold',
                  isToday ? 'text-brand-700' : 'text-slate-800',
                )}
              >
                {new Intl.DateTimeFormat(intlLocale, { day: 'numeric' }).format(day)}
              </p>
              {earlier > 0 && (
                <p className="text-[10px] text-slate-400">
                  {t('bookings.earlierBookings', { count: earlier })}
                </p>
              )}
            </div>
          )
        })}
      </div>

      {/* Hour window + grid */}
      <div className="flex items-stretch gap-1">
        <div className="flex flex-col justify-between py-1">
          <button
            type="button"
            onClick={() => shiftHours(-1)}
            disabled={startHour <= DAY_START_HOUR}
            className="rounded-lg border border-slate-300 bg-white p-1 text-slate-600 transition hover:bg-slate-50 disabled:opacity-30"
            aria-label={t('bookings.earlierHours')}
          >
            <ChevronUp size={14} />
          </button>
          <button
            type="button"
            onClick={() => shiftHours(1)}
            disabled={startHour >= maxStartHour}
            className="rounded-lg border border-slate-300 bg-white p-1 text-slate-600 transition hover:bg-slate-50 disabled:opacity-30"
            aria-label={t('bookings.laterHours')}
          >
            <ChevronDown size={14} />
          </button>
        </div>

        <div
          className="grid flex-1 gap-px overflow-hidden rounded-lg border border-slate-200 bg-slate-200"
          style={{ gridTemplateColumns: gridTemplate, touchAction: 'none' }}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          {/* Time gutter */}
          <div className="bg-white">
            {hours.map((hour) => (
              <div
                key={hour}
                className="relative border-b border-slate-100 pe-1 text-end"
                style={{ height: ROW_HEIGHT }}
              >
                <span className="absolute top-0.5 end-1 bg-white px-0.5 text-[11px] font-medium text-slate-400">
                  {String(hour).padStart(2, '0')}:00
                </span>
              </div>
            ))}
          </div>

          {/* One column per day */}
          {columns.map(({ day, events, later }) => {
            const isToday = isSameDay(day, now)
            const nowMinutes = minutesOfDay(now)
            const showNowLine = isToday && nowMinutes >= windowStart && nowMinutes <= windowEnd

            return (
              <div
                key={day.toISOString()}
                className="relative bg-white"
                style={{ height: ROW_HEIGHT * hoursVisible }}
              >
                {/* Hour lines, clickable to start a booking */}
                {hours.map((hour) => (
                  <button
                    key={hour}
                    type="button"
                    tabIndex={-1}
                    onClick={() => {
                      if (!onSelectSlot) return
                      const start = new Date(day)
                      start.setHours(hour, 0, 0, 0)
                      const end = new Date(start)
                      end.setHours(hour + 2, 0, 0, 0)
                      onSelectSlot(start, end)
                    }}
                    className={clsx(
                      'block w-full border-b border-slate-100 transition',
                      onSelectSlot && 'hover:bg-brand-50/60',
                    )}
                    style={{ height: ROW_HEIGHT }}
                    aria-hidden
                  />
                ))}

                {showNowLine && (
                  <div
                    className="pointer-events-none absolute inset-x-0 z-20 border-t-2 border-red-500"
                    style={{ top: ((nowMinutes - windowStart) / 60) * ROW_HEIGHT }}
                  >
                    <span className="absolute -top-1 start-0 h-2 w-2 rounded-full bg-red-500" />
                  </div>
                )}

                {events.map(({ booking, startMinutes, endMinutes, column, columnCount }) => {
                  const clippedTop = startMinutes < windowStart
                  const clippedBottom = endMinutes > windowEnd
                  const top = ((Math.max(startMinutes, windowStart) - windowStart) / 60) * ROW_HEIGHT
                  const height =
                    ((Math.min(endMinutes, windowEnd) - Math.max(startMinutes, windowStart)) / 60) *
                    ROW_HEIGHT
                  const width = 100 / columnCount
                  const cancelled = booking.status === 'cancelled'
                  const compact = height < 44

                  return (
                    <button
                      key={booking.id}
                      type="button"
                      onClick={() => onSelectBooking?.(booking)}
                      title={`${booking.title} · ${booking.room_detail.name}`}
                      className={clsx(
                        'absolute z-10 overflow-hidden rounded-md px-1.5 py-0.5 text-start text-white shadow-sm ring-1 ring-white/40 transition hover:z-30 hover:brightness-110',
                        cancelled && 'opacity-50 line-through',
                      )}
                      style={{
                        top,
                        height: Math.max(height - 2, 16),
                        insetInlineStart: `calc(${column * width}% + 1px)`,
                        width: `calc(${width}% - 2px)`,
                        backgroundColor: booking.room_detail.color,
                      }}
                    >
                      {clippedTop && <span className="block text-[9px] leading-none">▲</span>}
                      <span className="block truncate text-[10px] font-semibold leading-tight">
                        {booking.title}
                      </span>
                      {!compact && (
                        <>
                          <span className="block truncate text-[9px] leading-tight opacity-90">
                            {booking.room_detail.name}
                          </span>
                          {booking.booked_by_display && (
                            <span className="block truncate text-[9px] leading-tight opacity-80">
                              {booking.booked_by_display}
                            </span>
                          )}
                        </>
                      )}
                      {clippedBottom && (
                        <span className="absolute bottom-0 start-1 text-[9px] leading-none">▼</span>
                      )}
                    </button>
                  )
                })}

                {later > 0 && (
                  <span className="pointer-events-none absolute bottom-0.5 end-1 z-20 rounded bg-slate-100 px-1 text-[10px] text-slate-500">
                    {t('bookings.laterBookings', { count: later })}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      </div>

      <p className="mt-2 text-center text-[11px] text-slate-400 lg:hidden">
        {t('bookings.swipeHint')}
      </p>
      {columns.every((column) => column.events.length === 0) && (
        <p className="mt-3 text-center text-sm text-slate-500">
          {t('bookings.noBookingsInWindow')}
        </p>
      )}
    </div>
  )
}
