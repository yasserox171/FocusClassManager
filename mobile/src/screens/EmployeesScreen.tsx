import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FlatList, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native'

import { employeeApi } from '../api/services'
import { Badge, Card, EmptyState, ErrorState, Loading, Subtitle, Title } from '../components/ui'
import { colors, radius, spacing } from '../theme'
import { useDirection } from '../utils/direction'
import { useAsync } from '../utils/useAsync'

export function EmployeesScreen() {
  const { t } = useTranslation()
  const { row, text, isRTL } = useDirection()
  const [search, setSearch] = useState('')

  const { data, loading, error, refreshing, refresh, reload } = useAsync(
    () => employeeApi.list({ search: search.trim() || undefined, ordering: 'full_name' }),
    [search],
  )

  return (
    <View style={styles.flex}>
      <View style={styles.header}>
        <Title>{t('employees.title')}</Title>
        <Subtitle>{t('employees.subtitle')}</Subtitle>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder={t('common.search')}
          placeholderTextColor={colors.textFaint}
          style={[styles.search, { textAlign: isRTL ? 'right' : 'left' }]}
        />
      </View>

      {loading && !data ? (
        <Loading />
      ) : error ? (
        <ErrorState onRetry={reload} />
      ) : (
        <FlatList
          data={data?.results ?? []}
          keyExtractor={(employee) => String(employee.id)}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
          ListEmptyComponent={<EmptyState message={t('common.noData')} />}
          renderItem={({ item }) => (
            <Card style={styles.card}>
              <View style={[styles.head, row]}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>
                    {(item.full_name || '?').trim().charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View style={styles.nameBox}>
                  <Text style={[styles.name, text]} numberOfLines={1}>
                    {item.full_name}
                  </Text>
                  <Text style={[styles.role, text]} numberOfLines={1}>
                    {item.role_display || t(`employees.roles.${item.role}`)}
                  </Text>
                </View>
                {!item.is_active && <Badge label={t('employees.inactive')} tone="closed" />}
              </View>

              {item.department_name ? (
                <Text style={[styles.meta, text]} numberOfLines={1}>
                  {t('employees.department')}: {item.department_name}
                </Text>
              ) : null}

              {item.managed_rooms_detail?.length > 0 && (
                <View style={[styles.rooms, row]}>
                  {item.managed_rooms_detail.map((room) => (
                    <View key={room.id} style={[styles.roomChip, row]}>
                      <View style={[styles.dot, { backgroundColor: room.color || colors.brand }]} />
                      <Text style={styles.roomChipText} numberOfLines={1}>
                        {room.name}
                      </Text>
                    </View>
                  ))}
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
  search: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    marginTop: spacing.md,
    fontSize: 14,
    color: colors.text,
    minHeight: 44,
  },
  list: { padding: spacing.lg, paddingTop: 0, gap: spacing.md },
  card: { gap: spacing.sm },
  head: { alignItems: 'center', gap: spacing.md },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: colors.brand, fontSize: 16, fontWeight: '700' },
  nameBox: { flex: 1, gap: 2 },
  name: { fontSize: 15, fontWeight: '700', color: colors.text },
  role: { fontSize: 12, color: colors.textMuted },
  meta: { fontSize: 12, color: colors.textFaint },
  rooms: { flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs },
  roomChip: {
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.bg,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  roomChipText: { fontSize: 11, color: colors.textMuted, maxWidth: 120 },
})
