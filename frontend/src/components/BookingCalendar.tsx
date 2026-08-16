import { format, getDay, parse, startOfWeek } from 'date-fns'
import { arMA, fr } from 'date-fns/locale'
import { useMemo } from 'react'
import { Calendar, dateFnsLocalizer, Views, type View } from 'react-big-calendar'
import { useTranslation } from 'react-i18next'

import type { Booking } from '@/types'
import { toCenterWallClock } from '@/utils/timezone'

import 'react-big-calendar/lib/css/react-big-calendar.css'

const locales = { fr, ar: arMA }

const localizer = dateFnsLocalizer({
  format,
  parse,
  // The week starts on Monday in both locales used by the centre.
  startOfWeek: (date: Date, options?: Parameters<typeof startOfWeek>[1]) =>
    startOfWeek(date, { ...options, weekStartsOn: 1 }),
  getDay,
  locales,
})

export interface CalendarEvent {
  id: number
  title: string
  start: Date
  end: Date
  resource: Booking
}

interface BookingCalendarProps {
  bookings: Booking[]
  view: View
  date: Date
  onViewChange: (view: View) => void
  onDateChange: (date: Date) => void
  onSelectEvent?: (booking: Booking) => void
  onSelectSlot?: (start: Date, end: Date) => void
  height?: number
}

export function BookingCalendar({
  bookings,
  view,
  date,
  onViewChange,
  onDateChange,
  onSelectEvent,
  onSelectSlot,
  height = 640,
}: BookingCalendarProps) {
  const { t, i18n } = useTranslation()
  const isArabic = i18n.language.startsWith('ar')

  const events = useMemo<CalendarEvent[]>(
    () =>
      bookings.map((booking) => ({
        id: booking.id,
        title: `${booking.title} · ${booking.room_detail.name}`,
        // The grid is laid out on the centre's wall clock, so a slot booked at
        // 08:00 in Safi sits at 08:00 whatever the viewer's own timezone is.
        start: toCenterWallClock(booking.start_datetime),
        end: toCenterWallClock(booking.end_datetime),
        resource: booking,
      })),
    [bookings],
  )

  const messages = useMemo(
    () => ({
      today: t('common.today'),
      previous: t('common.previous'),
      next: t('common.next'),
      month: t('common.month'),
      week: t('common.week'),
      day: t('common.day'),
      agenda: t('common.agenda'),
      date: t('common.date'),
      time: t('common.time'),
      event: t('bookings.booking'),
      noEventsInRange: t('common.noData'),
      showMore: (count: number) => `+${count}`,
    }),
    [t],
  )

  return (
    <div dir={isArabic ? 'rtl' : 'ltr'} className="faas-calendar">
      <Calendar<CalendarEvent>
        localizer={localizer}
        culture={isArabic ? 'ar' : 'fr'}
        events={events}
        startAccessor="start"
        endAccessor="end"
        style={{ height }}
        view={view}
        date={date}
        onView={onViewChange}
        onNavigate={onDateChange}
        views={[Views.MONTH, Views.WEEK, Views.DAY, Views.AGENDA]}
        messages={messages}
        rtl={isArabic}
        selectable={Boolean(onSelectSlot)}
        popup
        onSelectEvent={(event) => onSelectEvent?.(event.resource)}
        onSelectSlot={(slot) => onSelectSlot?.(slot.start as Date, slot.end as Date)}
        eventPropGetter={(event) => ({
          style: {
            backgroundColor: event.resource.room_detail.color,
            borderColor: event.resource.room_detail.color,
            opacity: event.resource.status === 'cancelled' ? 0.45 : 1,
            textDecoration: event.resource.status === 'cancelled' ? 'line-through' : undefined,
            borderRadius: '6px',
            fontSize: '0.75rem',
          },
        })}
        min={new Date(1970, 0, 1, 7, 0)}
        max={new Date(1970, 0, 1, 22, 0)}
      />
    </div>
  )
}
