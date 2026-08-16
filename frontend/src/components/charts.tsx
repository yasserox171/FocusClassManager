import { useTranslation } from 'react-i18next'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import type { ResourceUsageResponse, RoomUsageRow, TimelineResponse, UsageStats } from '@/types'

const AXIS_STYLE = { fontSize: 11, fill: '#64748b' }
const GRID_COLOR = '#e2e8f0'

/** Occupancy rate per room, each bar painted with the room's calendar colour. */
export function RoomUsageChart({ rows, height = 280 }: { rows: RoomUsageRow[]; height?: number }) {
  const { t } = useTranslation()
  const data = rows.map((row) => ({
    name: row.room_code,
    fullName: row.room_name,
    occupancy: row.occupancy_rate,
    hours: row.booked_hours,
    color: row.color,
  }))

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: -16 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} vertical={false} />
        <XAxis dataKey="name" tick={AXIS_STYLE} tickLine={false} axisLine={{ stroke: GRID_COLOR }} />
        <YAxis tick={AXIS_STYLE} tickLine={false} axisLine={false} unit="%" />
        <Tooltip
          formatter={(value: number, key: string) =>
            key === 'occupancy'
              ? [`${value}%`, t('analytics.occupancyRate')]
              : [value, t('analytics.bookedHours')]
          }
          labelFormatter={(label: string) =>
            data.find((item) => item.name === label)?.fullName ?? label
          }
        />
        <Bar dataKey="occupancy" radius={[6, 6, 0, 0]}>
          {data.map((entry) => (
            <Cell key={entry.name} fill={entry.color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

/** Bookings and attendees month by month. */
export function TimelineChart({ data, height = 280 }: { data: TimelineResponse; height?: number }) {
  const { t } = useTranslation()

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data.months} margin={{ top: 8, right: 8, bottom: 8, left: -16 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} vertical={false} />
        <XAxis dataKey="month" tick={AXIS_STYLE} tickLine={false} axisLine={{ stroke: GRID_COLOR }} />
        <YAxis tick={AXIS_STYLE} tickLine={false} axisLine={false} />
        <Tooltip />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Line
          type="monotone"
          dataKey="bookings"
          name={t('analytics.bookingsCount')}
          stroke="#2563eb"
          strokeWidth={2}
          dot={{ r: 3 }}
        />
        <Line
          type="monotone"
          dataKey="attendees"
          name={t('bookings.attendees')}
          stroke="#16a34a"
          strokeWidth={2}
          dot={{ r: 3 }}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}

/** Booked hours per hour of the day - the "peak hours" view. */
export function PeakHoursChart({ stats, height = 260 }: { stats: UsageStats; height?: number }) {
  const { t } = useTranslation()
  const data = stats.hour_histogram.map((item) => ({
    hour: `${String(item.hour).padStart(2, '0')}h`,
    hours: item.hours_booked,
  }))

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: -16 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} vertical={false} />
        <XAxis dataKey="hour" tick={AXIS_STYLE} tickLine={false} axisLine={{ stroke: GRID_COLOR }} />
        <YAxis tick={AXIS_STYLE} tickLine={false} axisLine={false} />
        <Tooltip formatter={(value: number) => [value, t('analytics.bookedHours')]} />
        <Bar dataKey="hours" fill="#7c3aed" radius={[6, 6, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

/** Bookings per weekday. */
export function WeekdayChart({ stats, height = 260 }: { stats: UsageStats; height?: number }) {
  const { t } = useTranslation()
  const data = stats.weekday_histogram.map((item) => ({
    day: t(`weekdaysShort.${item.weekday}`),
    bookings: item.bookings,
  }))

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: -16 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} vertical={false} />
        <XAxis dataKey="day" tick={AXIS_STYLE} tickLine={false} axisLine={{ stroke: GRID_COLOR }} />
        <YAxis tick={AXIS_STYLE} tickLine={false} axisLine={false} allowDecimals={false} />
        <Tooltip formatter={(value: number) => [value, t('analytics.bookingsCount')]} />
        <Bar dataKey="bookings" fill="#0891b2" radius={[6, 6, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

/** Most requested resources. */
export function ResourceUsageChart({
  data,
  height = 260,
}: {
  data: ResourceUsageResponse
  height?: number
}) {
  const { t, i18n } = useTranslation()
  const isArabic = i18n.language.startsWith('ar')
  const rows = data.resources
    .slice(0, 8)
    .map((item) => ({ name: isArabic ? item.name_ar : item.name_fr, bookings: item.bookings }))

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={rows} layout="vertical" margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} horizontal={false} />
        <XAxis type="number" tick={AXIS_STYLE} tickLine={false} axisLine={false} allowDecimals={false} />
        <YAxis
          type="category"
          dataKey="name"
          tick={AXIS_STYLE}
          tickLine={false}
          axisLine={false}
          width={110}
        />
        <Tooltip formatter={(value: number) => [value, t('analytics.bookingsCount')]} />
        <Bar dataKey="bookings" fill="#f59e0b" radius={[0, 6, 6, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}
