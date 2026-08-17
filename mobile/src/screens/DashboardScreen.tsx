import { useTranslation } from 'react-i18next'
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'

import { alertApi, analyticsApi, bookingApi } from '../api/services'
import { Badge, Card, EmptyState, ErrorState, Loading, SectionTitle, Subtitle, Title } from '../components/ui'
import { colors, radius, shadow, spacing } from '../theme'
import type { Alert, Booking, DashboardSummary } from '../types'
import { formatDate, formatSlot, isToday } from '../utils/datetime'
import { useDirection } from '../utils/direction'
import { useAsync } from '../utils/useAsync'

interface Data {
  summary: DashboardSummary
  upcoming: Booking[]
  alerts: Alert[]
}

export function DashboardScreen() {
  const { t } = useTranslation()
  const { row, text, pick, language } = useDirection()

  const { data, loading, error, refreshing, refresh, reload } = useAsync<Data>(async () => {
    const [summary, upcoming, alerts] = await Promise.all([
      analyticsApi.summary(),
      bookingApi.upcoming(8),
      alertApi.list(24),
    ])
    return { summary, upcoming, alerts }
  }, [])

  if (loading) return <Loading />
  if (error || !data) return <ErrorState onRetry={reload} />

  const { summary, upcoming, alerts } = data

  // A KPI row, not a chart: these are single headline values with no shape to plot.
  const tiles = [
    { label: t('dashboard.totalRooms'), value: summary.total_rooms, tone: colors.text },
    { label: t('dashboard.availableNow'), value: summary.available_now, tone: colors.success },
    { label: t('dashboard.occupiedNow'), value: summary.occupied_now, tone: colors.brand },
    { label: t('dashboard.maintenance'), value: summary.maintenance_rooms, tone: colors.warning },
    { label: t('dashboard.bookingsToday'), value: summary.bookings_today, tone: colors.text },
    { label: t('dashboard.bookingsWeek'), value: summary.bookings_next_7_days, tone: colors.text },
    { label: t('dashboard.ongoing'), value: summary.ongoing_bookings, tone: colors.info },
    { label: t('dashboard.openIssues'), value: summary.open_issues, tone: colors.danger },
  ]

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
    >
      <Title>{t('dashboard.title')}</Title>
      <Subtitle>{t('dashboard.subtitle')}</Subtitle>

      <View style={styles.tiles}>
        {tiles.map((tile) => (
          <View key={tile.label} style={styles.tile}>
            <Text style={[styles.tileValue, { color: tile.tone }]}>{tile.value}</Text>
            <Text style={[styles.tileLabel, text]} numberOfLines={2}>
              {tile.label}
            </Text>
          </View>
        ))}
      </View>

      {alerts.length > 0 && (
        <View style={styles.section}>
          <SectionTitle>{t('notifications.title')}</SectionTitle>
          {alerts.slice(0, 5).map((alert) => (
            <Card key={alert.id} style={styles.alertCard}>
              <View style={[styles.alertHead, row]}>
                <Badge label={t(`notifications.categories.${alert.category}`)} tone={alert.level} />
              </View>
              <Text style={[styles.alertText, text]}>
                {pick(alert.message_fr, alert.message_ar)}
              </Text>
            </Card>
          ))}
        </View>
      )}

      <View style={styles.section}>
        <SectionTitle>{t('dashboard.upcomingBookings')}</SectionTitle>
        {upcoming.length === 0 ? (
          <EmptyState message={t('dashboard.noUpcoming')} />
        ) : (
          upcoming.map((booking) => (
            <Card key={booking.id} style={styles.bookingCard}>
              <View style={[styles.bookingHead, row]}>
                <View style={[styles.dot, { backgroundColor: booking.room_detail?.color || colors.brand }]} />
                <Text style={[styles.bookingTitle, text]} numberOfLines={1}>
                  {booking.title}
                </Text>
              </View>
              <Text style={[styles.bookingMeta, text]} numberOfLines={1}>
                {booking.room_detail?.name} · {formatSlot(booking.start_datetime, booking.end_datetime)}
              </Text>
              <Text style={[styles.bookingDate, text]}>
                {isToday(booking.start_datetime)
                  ? t('common.today')
                  : formatDate(booking.start_datetime, language)}
              </Text>
            </Card>
          ))
        )}
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.xs },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: spacing.lg },
  tile: {
    flexGrow: 1,
    flexBasis: '46%',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    ...shadow.card,
  },
  tileValue: { fontSize: 28, fontWeight: '700', marginBottom: 2 },
  tileLabel: { fontSize: 12, color: colors.textMuted },

  section: { marginTop: spacing.xl, gap: spacing.md },
  alertCard: { paddingVertical: spacing.md, gap: spacing.sm },
  alertHead: { alignItems: 'center' },
  alertText: { fontSize: 13, color: colors.text, lineHeight: 19 },

  bookingCard: { paddingVertical: spacing.md, gap: 4 },
  bookingHead: { alignItems: 'center', gap: spacing.sm },
  dot: { width: 10, height: 10, borderRadius: 5 },
  bookingTitle: { fontSize: 15, fontWeight: '600', color: colors.text, flex: 1 },
  bookingMeta: { fontSize: 13, color: colors.textMuted },
  bookingDate: { fontSize: 12, color: colors.textFaint },
})
