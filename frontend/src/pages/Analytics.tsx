import { format, startOfYear, subDays } from 'date-fns'
import { CalendarRange, Clock, Percent, TrendingUp } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  PeakHoursChart,
  ResourceUsageChart,
  RoomUsageChart,
  TimelineChart,
  WeekdayChart,
} from '@/components/charts'
import { StatCard } from '@/components/StatCard'
import {
  Badge,
  Card,
  EmptyState,
  ErrorState,
  Field,
  PageHeader,
  Select,
  Spinner,
} from '@/components/ui'
import { useAsync } from '@/hooks/useAsync'
import { analyticsService } from '@/services/analyticsService'
import { hoursLabel, percentLabel } from '@/utils/format'
import { centerToday } from '@/utils/timezone'

type Preset = '7' | '30' | '90' | 'year'

export function Analytics() {
  const { t, i18n } = useTranslation()
  const [preset, setPreset] = useState<Preset>('30')

  const range = useMemo(() => {
    const today = centerToday()
    const start = preset === 'year' ? startOfYear(today) : subDays(today, Number(preset))
    return {
      start_date: format(start, 'yyyy-MM-dd'),
      end_date: format(today, 'yyyy-MM-dd'),
    }
  }, [preset])

  const usage = useAsync(() => analyticsService.roomUsage(range), [range])
  const peak = useAsync(() => analyticsService.peakHours(range), [range])
  const timeline = useAsync(() => analyticsService.timeline(12), [])
  const resources = useAsync(() => analyticsService.resourceUsage(range), [range])

  const totals = useMemo(() => {
    if (!usage.data) return null
    const rows = usage.data.rooms
    const bookings = rows.reduce((sum, row) => sum + row.bookings_count, 0)
    const hours = rows.reduce((sum, row) => sum + row.booked_hours, 0)
    const average =
      rows.length > 0 ? rows.reduce((sum, row) => sum + row.occupancy_rate, 0) / rows.length : 0
    return { bookings, hours, average }
  }, [usage.data])

  return (
    <div>
      <PageHeader
        title={t('analytics.title')}
        subtitle={t('analytics.subtitle')}
        action={
          <Field label={t('analytics.period')} className="w-48">
            <Select value={preset} onChange={(event) => setPreset(event.target.value as Preset)}>
              <option value="7">{t('analytics.last7')}</option>
              <option value="30">{t('analytics.last30')}</option>
              <option value="90">{t('analytics.last90')}</option>
              <option value="year">{t('analytics.thisYear')}</option>
            </Select>
          </Field>
        }
      />

      {usage.loading && <Spinner />}
      {usage.error && <ErrorState message={usage.error} />}

      {totals && (
        <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label={t('analytics.bookingsCount')}
            value={totals.bookings}
            icon={CalendarRange}
            tone="blue"
          />
          <StatCard
            label={t('analytics.bookedHours')}
            value={hoursLabel(totals.hours, i18n.language)}
            icon={Clock}
            tone="violet"
          />
          <StatCard
            label={t('analytics.occupancyRate')}
            value={percentLabel(totals.average)}
            icon={Percent}
            tone="green"
          />
          <StatCard
            label={t('analytics.mostBooked')}
            value={usage.data?.most_booked?.room_name ?? '—'}
            icon={TrendingUp}
            tone="amber"
            hint={
              usage.data?.most_booked
                ? hoursLabel(usage.data.most_booked.booked_hours, i18n.language)
                : undefined
            }
          />
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-2">
        <Card title={t('analytics.usageByRoom')}>
          {usage.data &&
            (usage.data.rooms.length === 0 ? (
              <EmptyState message={t('analytics.noDataPeriod')} />
            ) : (
              <RoomUsageChart rows={usage.data.rooms} />
            ))}
        </Card>

        <Card title={t('analytics.bookingsOverTime')}>
          {timeline.loading && <Spinner />}
          {timeline.data && <TimelineChart data={timeline.data} />}
        </Card>

        <Card title={t('analytics.peakHours')}>
          {peak.loading && <Spinner />}
          {peak.data && <PeakHoursChart stats={peak.data} />}
        </Card>

        <Card title={t('analytics.weekdayDistribution')}>
          {peak.data && <WeekdayChart stats={peak.data} />}
        </Card>

        <Card title={t('analytics.resourceUsage')}>
          {resources.loading && <Spinner />}
          {resources.data &&
            (resources.data.resources.length === 0 ? (
              <EmptyState message={t('analytics.noDataPeriod')} />
            ) : (
              <ResourceUsageChart data={resources.data} />
            ))}
        </Card>

        <Card title={t('analytics.usageByRoom')} bodyClassName="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3 text-start font-semibold">{t('rooms.room')}</th>
                  <th className="px-4 py-3 text-start font-semibold">
                    {t('analytics.bookingsCount')}
                  </th>
                  <th className="px-4 py-3 text-start font-semibold">
                    {t('analytics.bookedHours')}
                  </th>
                  <th className="px-4 py-3 text-start font-semibold">
                    {t('analytics.occupancyRate')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(usage.data?.rooms ?? []).map((row) => (
                  <tr key={row.room_id}>
                    <td className="px-4 py-2.5">
                      <span className="flex items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: row.color }}
                          aria-hidden
                        />
                        {row.room_name}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">{row.bookings_count}</td>
                    <td className="px-4 py-2.5">{hoursLabel(row.booked_hours, i18n.language)}</td>
                    <td className="px-4 py-2.5">
                      <Badge
                        tone={
                          row.occupancy_rate > 60
                            ? 'red'
                            : row.occupancy_rate > 30
                              ? 'amber'
                              : 'green'
                        }
                      >
                        {percentLabel(row.occupancy_rate)}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  )
}
