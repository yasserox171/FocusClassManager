import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native'

import { roomApi } from '../api/services'
import { Badge, Card, EmptyState, ErrorState, Loading, Subtitle, Title } from '../components/ui'
import { colors, radius, spacing } from '../theme'
import type { Room } from '../types'
import { useDirection } from '../utils/direction'
import { useAsync } from '../utils/useAsync'

export function RoomsScreen() {
  const { t } = useTranslation()
  const { row, text, isRTL, pick } = useDirection()
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<number | null>(null)

  const { data, loading, error, refreshing, refresh, reload } = useAsync(
    () => roomApi.list({ search: search.trim() || undefined, ordering: 'name' }),
    [search],
  )

  const rooms = data?.results ?? []

  return (
    <View style={styles.flex}>
      <View style={styles.header}>
        <Title>{t('rooms.title')}</Title>
        <Subtitle>{t('rooms.subtitle')}</Subtitle>
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
          data={rooms}
          keyExtractor={(room) => String(room.id)}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
          ListEmptyComponent={<EmptyState message={t('common.noData')} />}
          renderItem={({ item }) => (
            <RoomCard
              room={item}
              open={expanded === item.id}
              onToggle={() => setExpanded(expanded === item.id ? null : item.id)}
            />
          )}
        />
      )}
    </View>
  )
}

function RoomCard({ room, open, onToggle }: { room: Room; open: boolean; onToggle: () => void }) {
  const { t } = useTranslation()
  const { row, text, textEnd, pick } = useDirection()

  const working = room.resources.filter((r) => r.condition === 'ok').length

  return (
    <Card onPress={onToggle} style={styles.card}>
      <View style={[styles.cardHead, row]}>
        <View style={[styles.colorBar, { backgroundColor: room.color || colors.brand }]} />
        <View style={styles.cardTitleBox}>
          <Text style={[styles.roomName, text]} numberOfLines={1}>
            {pick(room.name, room.name_ar)}
          </Text>
          <Text style={[styles.roomMeta, text]} numberOfLines={1}>
            {room.code} · {room.capacity} {t('rooms.people')}
          </Text>
        </View>
        <Badge label={t(`rooms.status.${room.status}`)} tone={room.status} />
      </View>

      {room.location ? (
        <Text style={[styles.location, text]} numberOfLines={1}>
          {room.location}
        </Text>
      ) : null}

      {room.open_issues_count > 0 && (
        <View style={[styles.issueRow, row]}>
          <Badge label={`${room.open_issues_count} ${t('rooms.openIssues')}`} tone="warning" />
        </View>
      )}

      {open && (
        <View style={styles.resources}>
          <Text style={[styles.resourceHeading, text]}>
            {t('rooms.resources')} ({working}/{room.resources.length})
          </Text>
          {room.resources.length === 0 ? (
            <Text style={[styles.resourceEmpty, text]}>{t('common.noData')}</Text>
          ) : (
            room.resources.map((resource) => (
              <View key={resource.id ?? resource.resource_type} style={[styles.resourceRow, row]}>
                <Text style={[styles.resourceName, text]} numberOfLines={1}>
                  {pick(resource.resource_type_detail?.name_fr, resource.resource_type_detail?.name_ar)}
                </Text>
                <Text style={[styles.resourceQty, textEnd]}>
                  {resource.quantity}
                  {resource.condition !== 'ok' ? ` · ${t(`rooms.conditions.${resource.condition}`)}` : ''}
                </Text>
              </View>
            ))
          )}
        </View>
      )}
    </Card>
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
  cardHead: { alignItems: 'center', gap: spacing.md },
  colorBar: { width: 4, height: 36, borderRadius: 2 },
  cardTitleBox: { flex: 1, gap: 2 },
  roomName: { fontSize: 16, fontWeight: '700', color: colors.text },
  roomMeta: { fontSize: 12, color: colors.textMuted },
  location: { fontSize: 12, color: colors.textFaint },
  issueRow: { alignItems: 'center' },

  resources: { marginTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md, gap: spacing.xs },
  resourceHeading: { fontSize: 13, fontWeight: '600', color: colors.textMuted, marginBottom: spacing.xs },
  resourceEmpty: { fontSize: 12, color: colors.textFaint },
  resourceRow: { justifyContent: 'space-between', alignItems: 'center', gap: spacing.md, paddingVertical: 3 },
  resourceName: { fontSize: 13, color: colors.text, flex: 1 },
  resourceQty: { fontSize: 13, color: colors.textMuted, fontWeight: '600' },
})
