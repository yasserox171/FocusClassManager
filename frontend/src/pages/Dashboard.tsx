import { addDays, startOfMonth, subDays } from 'date-fns'
import {
  AlertTriangle,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  DoorOpen,
  Plus,
  Wrench,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import type { View } from 'react-big-calendar'
import { Views } from 'react-big-calendar'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'

import { BookingCalendar } from '@/components/BookingCalendar'
import { RoomUsageChart } from '@/components/charts'
import { StatCard } from '@/components/StatCard'
import { Badge, Button, Card, EmptyState, ErrorState, PageHeader, Spinner } from '@/components/ui'
import { useAsync } from '@/hooks/useAsync'
import { analyticsService, notificationService } from '@/services/analyticsService'
import { bookingService } from '@/services/bookingService'
import type { Booking } from '@/types'
import { formatRange, relativeTime } from '@/utils/format'

export function Dashboard() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const isArabic = i18n.language.startsWith('ar')

  const [calendarDate, setCalendarDate] = useState(new Date())
  const [calendarView, setCalendarView] = useState<View>(Views.WEEK)

  const summary = useAsync(() => analyticsService.summary(), [])
  const upcoming = useAsync(() => bookingService.upcoming(7, 8), [])
  const alerts = useAsync(() => notificationService.alerts(24), [])

  const { start, end } = useMemo(() => {
    const anchor = startOfMonth(calendarDate)
    return {
      start: subDays(anchor, 7).toISOString(),
      end: addDays(anchor, 45).toISOString(),
    }
  }, [calendarDate])

  const calendar = useAsync(() => bookingService.calendar(start, end), [start, end])
  const usage = useAsync(() => analyticsService.roomUsage(), [])

  const openBooking = (booking: Booking) => navigate(`/bookings?booking=${booking.id}`)

  return (
    <div>
      <PageHeader
        title={t('dashboard.title')}
        subtitle={t('dashboard.subtitle')}
        action={
          <Button icon={<Plus size={16} />} onClick={() => navigate('/bookings?new=1')}>
            {t('dashboard.newBooking')}
          </Button>
        }
      />

      {summary.loading && <Spinner />}
      {summary.error && <ErrorState message={summary.error} />}

      {summary.data && (
        <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label={t('dashboard.totalRooms')}
            value={summary.data.total_rooms}
            icon={DoorOpen}
            tone="blue"
          />
          <StatCard
            label={t('dashboard.availableNow')}
            value={summary.data.available_now}
            icon={CheckCircle2}
            tone="green"
            hint={`${summary.data.occupied_now} ${t('dashboard.occupiedNow').toLowerCase()}`}
          />
          <StatCard
            label={t('dashboard.bookingsToday')}
            value={summary.data.bookings_today}
            icon={CalendarDays}
            tone="violet"
            hint={`${summary.data.bookings_next_7_days} ${t('dashboard.bookingsWeek').toLowerCase()}`}
          />
          <StatCard
            label={t('dashboard.maintenance')}
            value={summary.data.maintenance_rooms}
            icon={Wrench}
            tone="amber"
            hint={`${summary.data.open_issues} ${t('dashboard.openIssues').toLowerCase()}`}
          />
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-3">
        <Card
          title={t('dashboard.calendar')}
          className="self-start xl:col-span-2"
          bodyClassName="p-3 sm:p-5"
          action={
            <Link to="/bookings" className="text-xs font-medium text-brand-600 hover:underline">
              {t('dashboard.viewAll')}
            </Link>
          }
        >
          {calendar.loading && <Spinner />}
          {calendar.error && <ErrorState message={calendar.error} />}
          {calendar.data && (
            <BookingCalendar
              bookings={calendar.data}
              view={calendarView}
              date={calendarDate}
              onViewChange={setCalendarView}
              onDateChange={setCalendarDate}
              onSelectEvent={openBooking}
              height={520}
            />
          )}
        </Card>

        <div className="space-y-6">
          <Card title={t('dashboard.upcomingBookings')} bodyClassName="p-0">
            {upcoming.loading && <Spinner />}
            {upcoming.error && <div className="p-5"><ErrorState message={upcoming.error} /></div>}
            {upcoming.data && upcoming.data.results.length === 0 && (
              <EmptyState message={t('dashboard.noUpcoming')} icon={<CalendarClock size={22} />} />
            )}
            {upcoming.data && upcoming.data.results.length > 0 && (
              <ul className="divide-y divide-slate-100">
                {upcoming.data.results.map((booking) => (
                  <li key={booking.id}>
                    <button
                      type="button"
                      onClick={() => openBooking(booking)}
                      className="flex w-full items-start gap-3 px-5 py-3 text-start transition hover:bg-slate-50"
                    >
                      <span
                        className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: booking.room_detail.color }}
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-slate-800">
                          {booking.title}
                        </span>
                        <span className="block truncate text-xs text-slate-500">
                          {booking.room_detail.name} · {formatRange(
                            booking.start_datetime,
                            booking.end_datetime,
                            i18n.language,
                          )}
                        </span>
                        {booking.booked_by_display && (
                          <span className="block truncate text-xs text-slate-400">
                            {booking.booked_by_display}
                          </span>
                        )}
                      </span>
                      {booking.is_recurring && <Badge tone="violet">{t('bookings.recurring')}</Badge>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title={t('dashboard.alerts')} bodyClassName="p-0">
            {alerts.loading && <Spinner />}
            {alerts.data && alerts.data.length === 0 && (
              <EmptyState message={t('dashboard.noAlerts')} icon={<CheckCircle2 size={22} />} />
            )}
            {alerts.data && alerts.data.length > 0 && (
              <ul className="max-h-72 divide-y divide-slate-100 overflow-y-auto">
                {alerts.data.slice(0, 10).map((alert) => (
                  <li key={alert.id} className="flex gap-3 px-5 py-3">
                    <AlertTriangle
                      size={16}
                      className={
                        alert.level === 'critical'
                          ? 'mt-0.5 shrink-0 text-red-500'
                          : alert.level === 'warning'
                            ? 'mt-0.5 shrink-0 text-amber-500'
                            : 'mt-0.5 shrink-0 text-brand-500'
                      }
                    />
                    <div className="min-w-0">
                      <p className="text-sm text-slate-700">
                        {isArabic ? alert.message_ar : alert.message_fr}
                      </p>
                      <p className="text-xs text-slate-400">
                        {relativeTime(alert.created_at, i18n.language)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      <Card title={t('dashboard.usageByRoom')} className="mt-6">
        {usage.loading && <Spinner />}
        {usage.error && <ErrorState message={usage.error} />}
        {usage.data &&
          (usage.data.rooms.length === 0 ? (
            <EmptyState message={t('analytics.noDataPeriod')} />
          ) : (
            <RoomUsageChart rows={usage.data.rooms} />
          ))}
      </Card>
    </div>
  )
}
