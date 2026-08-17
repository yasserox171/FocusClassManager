import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Alert as RNAlert, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native'

import { parseApiError } from '../api/client'
import { bookingApi } from '../api/services'
import { Badge, Button, Card, EmptyState, ErrorState, Loading, Subtitle, Title } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { colors, radius, spacing } from '../theme'
import type { Booking } from '../types'
import { formatDate, formatSlot } from '../utils/datetime'
import { useDirection } from '../utils/direction'
import { useAsync } from '../utils/useAsync'

type Period = 'upcoming' | 'past' | 'all'

const periodLabels: Record<Period, string> = {
  upcoming: 'bookings.upcoming',
  past: 'bookings.past',
  all: 'common.all',
}

export function BookingsScreen() {
  const { t } = useTranslation()
  const { row, text, language } = useDirection()
  const { isAdmin } = useAuth()
  const [period, setPeriod] = useState<Period>('upcoming')

  const { data, loading, error, refreshing, refresh, reload } = useAsync(
    () =>
      bookingApi.list({
        period: period === 'all' ? undefined : period,
        page_size: 50,
        ordering: period === 'past' ? '-start_datetime' : 'start_datetime',
      }),
    [period],
  )

  const cancel = (booking: Booking) => {
    RNAlert.alert(t('bookings.deleteConfirm'), booking.title, [
      { text: t('common.close'), style: 'cancel' },
      {
        text: t('common.confirm'),
        style: 'destructive',
        onPress: async () => {
          try {
            await bookingApi.cancel(booking.id, booking.series ? 'occurrence' : 'occurrence')
            reload()
          } catch (caught) {
            RNAlert.alert(t('errors.generic'), t(parseApiError(caught).detail))
          }
        },
      },
    ])
  }

  const periods: Period[] = ['upcoming', 'past', 'all']

  return (
    <View style={styles.flex}>
      <View style={styles.header}>
        <Title>{t('bookings.title')}</Title>
        <Subtitle>{t('bookings.subtitle')}</Subtitle>

        <View style={[styles.tabs, row]}>
          {periods.map((value) => {
            const active = value === period
            return (
              <Pressable
                key={value}
                onPress={() => setPeriod(value)}
                style={[styles.tab, active && styles.tabActive]}
              >
                <Text style={[styles.tabText, active && styles.tabTextActive]}>
                  {t(periodLabels[value])}
                </Text>
              </Pressable>
            )
          })}
        </View>
      </View>

      {loading && !data ? (
        <Loading />
      ) : error ? (
        <ErrorState onRetry={reload} />
      ) : (
        <FlatList
          data={data?.results ?? []}
          keyExtractor={(booking) => String(booking.id)}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
          ListEmptyComponent={<EmptyState message={t('dashboard.noUpcoming')} />}
          renderItem={({ item }) => (
            <Card style={styles.card}>
              <View style={[styles.cardHead, row]}>
                <View style={[styles.dot, { backgroundColor: item.room_detail?.color || colors.brand }]} />
                <Text style={[styles.title, text]} numberOfLines={1}>
                  {item.title}
                </Text>
                {item.status === 'cancelled' && (
                  <Badge label={t('bookings.status.cancelled')} tone="cancelled" />
                )}
              </View>

              <Text style={[styles.meta, text]} numberOfLines={1}>
                {item.room_detail?.name} · {formatSlot(item.start_datetime, item.end_datetime)}
              </Text>
              <Text style={[styles.date, text]}>{formatDate(item.start_datetime, language)}</Text>

              {item.booked_by_display ? (
                <Text style={[styles.date, text]} numberOfLines={1}>
                  {t('bookings.bookedBy')}: {item.booked_by_display}
                </Text>
              ) : null}

              {item.is_recurring && (
                <View style={[styles.recurring, row]}>
                  <Badge label={t(`bookings.types.${item.recurrence_type}`)} tone="info" />
                </View>
              )}

              {isAdmin && item.status === 'confirmed' && (
                <View style={styles.actions}>
                  <Button label={t('common.delete')} variant="danger" onPress={() => cancel(item)} />
                </View>
              )}
            </Card>
          )}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  header: { padding: spacing.lg, paddingBottom: spacing.md, gap: spacing.xs },
  tabs: { gap: spacing.sm, marginTop: spacing.md },
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

  list: { padding: spacing.lg, paddingTop: 0, gap: spacing.md },
  card: { gap: 4 },
  cardHead: { alignItems: 'center', gap: spacing.sm },
  dot: { width: 10, height: 10, borderRadius: 5 },
  title: { fontSize: 15, fontWeight: '700', color: colors.text, flex: 1 },
  meta: { fontSize: 13, color: colors.textMuted },
  date: { fontSize: 12, color: colors.textFaint },
  recurring: { marginTop: spacing.xs },
  actions: { marginTop: spacing.md },
})
