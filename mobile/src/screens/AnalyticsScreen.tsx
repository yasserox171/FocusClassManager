import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'

import { analyticsApi } from '../api/services'
import { BarList, ColumnChart, LineChart, type Datum } from '../components/charts'
import { Card, EmptyState, ErrorState, Loading, SectionTitle, Subtitle, Title } from '../components/ui'
import { colors, radius, spacing } from '../theme'
import type { ResourceUsageResponse, RoomUsageResponse, TimelineResponse, UsageStats } from '../types'
import { dayjs } from '../utils/datetime'
import { useDirection } from '../utils/direction'
import { useAsync } from '../utils/useAsync'

type Range = 7 | 30 | 90

interface Data {
  usage: RoomUsageResponse
  peak: UsageStats
  timeline: TimelineResponse
  resources: ResourceUsageResponse
}

export function AnalyticsScreen() {
  const { t } = useTranslation()
  const { row, text, pick, language } = useDirection()
  const [range, setRange] = useState<Range>(30)

  const { data, loading, error, refreshing, refresh, reload } = useAsync<Data>(async () => {
    const start = dayjs().subtract(range, 'day').format('YYYY-MM-DD')
    const end = dayjs().format('YYYY-MM-DD')
    const params = { start_date: start, end_date: end }
    const [usage, peak, timeline, resources] = await Promise.all([
      analyticsApi.roomUsage(params),
      analyticsApi.peakHours(params),
      analyticsApi.timeline(params),
      analyticsApi.resources(params),
    ])
    return { usage, peak, timeline, resources }
  }, [range])

  const ranges: { value: Range; key: string }[] = [
    { value: 7, key: 'analytics.last7' },
    { value: 30, key: 'analytics.last30' },
    { value: 90, key: 'analytics.last90' },
  ]

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
    >
      <Title>{t('analytics.title')}</Title>
      <Subtitle>{t('analytics.subtitle')}</Subtitle>

      {/* Filters sit in one row above the charts. */}
      <View style={[styles.tabs, row]}>
        {ranges.map((option) => {
          const active = option.value === range
          return (
            <Pressable
              key={option.value}
              onPress={() => setRange(option.value)}
              style={[styles.tab, active && styles.tabActive]}
            >
              <Text style={[styles.tabText, active && styles.tabTextActive]}>{t(option.key)}</Text>
            </Pressable>
          )
        })}
      </View>

      {loading && !data ? (
        <Loading />
      ) : error || !data ? (
        <ErrorState onRetry={reload} />
      ) : (
        <>
          <Card style={styles.card}>
            <SectionTitle>{t('analytics.occupancyRate')}</SectionTitle>
            {data.usage.rooms.length === 0 ? (
              <EmptyState message={t('common.noData')} />
            ) : (
              <BarList
                max={100}
                data={data.usage.rooms
                  .slice()
                  .sort((a, b) => b.occupancy_rate - a.occupancy_rate)
                  .map<Datum>((room) => ({
                    label: room.room_name,
                    value: room.occupancy_rate,
                    accent: room.color,
                    display: `${Math.round(room.occupancy_rate)}%`,
                  }))}
              />
            )}
          </Card>

          <Card style={styles.card}>
            <SectionTitle>{t('analytics.peakHours')}</SectionTitle>
            {(() => {
              const hours = data.peak.hour_histogram ?? []
              if (!hours.length) return <EmptyState message={t('common.noData')} />
              return (
                <ColumnChart
                  data={hours.map<Datum>((slot) => ({
                    label: `${String(slot.hour).padStart(2, '0')}h`,
                    value: slot.hours_booked,
                  }))}
                />
              )
            })()}
          </Card>

          <Card style={styles.card}>
            <SectionTitle>{t('analytics.weekdayDistribution')}</SectionTitle>
            {(() => {
              const week = data.peak.weekday_histogram ?? []
              if (!week.length) return <EmptyState message={t('common.noData')} />
              return (
                <ColumnChart
                  data={week.map<Datum>((day) => ({
                    label: t(`weekdaysShort.${day.weekday}`, String(day.weekday)),
                    value: day.bookings,
                  }))}
                />
              )
            })()}
          </Card>

          <Card style={styles.card}>
            <SectionTitle>{t('analytics.bookingsOverTime')}</SectionTitle>
            {data.timeline.months.length === 0 ? (
              <EmptyState message={t('common.noData')} />
            ) : (
              <LineChart
                data={data.timeline.months.map<Datum>((month) => ({
                  label: dayjs(month.month).locale(language === 'ar' ? 'ar' : 'fr').format('MMM'),
                  value: month.bookings,
                }))}
              />
            )}
          </Card>

          <Card style={styles.card}>
            <SectionTitle>{t('analytics.resourceUsage')}</SectionTitle>
            {data.resources.resources.length === 0 ? (
              <EmptyState message={t('common.noData')} />
            ) : (
              <BarList
                data={data.resources.resources
                  .slice()
                  .sort((a, b) => b.bookings - a.bookings)
                  .slice(0, 8)
                  .map<Datum>((resource) => ({
                    label: pick(resource.name_fr, resource.name_ar),
                    value: resource.bookings,
                  }))}
              />
            )}
          </Card>
        </>
      )}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.xs },
  tabs: { gap: spacing.sm, marginTop: spacing.md, marginBottom: spacing.md },
  tab: {
    paddingHorizontal: spacing.lg,
    paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tabActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  tabText: { fontSize: 13, fontWeight: '600', color: colors.textMuted },
  tabTextActive: { color: '#ffffff' },
  card: { marginBottom: spacing.md, gap: spacing.sm },
})
