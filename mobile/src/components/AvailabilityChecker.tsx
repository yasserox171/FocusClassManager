import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'

import { parseApiError } from '../api/client'
import { bookingApi, roomApi } from '../api/services'
import { colors, radius, spacing } from '../theme'
import type { BookingPreview, MonthlyMode, RecurrenceType, YearlyDate } from '../types'
import { atCenter, formatSlot } from '../utils/datetime'
import { useDirection } from '../utils/direction'
import { useAsync } from '../utils/useAsync'
import { Badge, Button, Loading, SectionTitle, Subtitle, Title } from './ui'

interface AvailabilityCheckerProps {
  visible: boolean
  onClose: () => void
}

const RECURRENCE_TYPES: RecurrenceType[] = ['none', 'weekly', 'monthly', 'yearly']
const WEEKDAY_INDEXES = [0, 1, 2, 3, 4, 5, 6]
const MONTH_DAY_INDEXES = Array.from({ length: 31 }, (_, index) => index + 1)

export function AvailabilityChecker({ visible, onClose }: AvailabilityCheckerProps) {
  const { t } = useTranslation()
  const { row, text, isRTL, pick } = useDirection()

  const today = atCenter(new Date())
  const todayWeekday = (today.day() + 6) % 7 // dayjs: 0=Sunday -> app convention: 0=Monday

  const { data: roomsData, loading: roomsLoading } = useAsync(
    () => roomApi.list({ page_size: 100, ordering: 'name' }),
    [visible],
  )
  const bookableRooms = (roomsData?.results ?? []).filter((room) => room.status === 'available')

  const [roomId, setRoomId] = useState<number | null>(null)
  const [recurrenceType, setRecurrenceType] = useState<RecurrenceType>('none')
  const [weekdays, setWeekdays] = useState<number[]>([todayWeekday])
  const [monthlyMode, setMonthlyMode] = useState<MonthlyMode>('day_of_month')
  const [monthDays, setMonthDays] = useState<number[]>([today.date()])
  const [nthWeek, setNthWeek] = useState(1)
  const [yearlyDates, setYearlyDates] = useState<YearlyDate[]>([
    { month: today.month() + 1, day: today.date() },
  ])
  const [startDate, setStartDate] = useState(today.format('YYYY-MM-DD'))
  const [endDate, setEndDate] = useState(today.format('YYYY-MM-DD'))
  const [startTime, setStartTime] = useState('08:00')
  const [endTime, setEndTime] = useState('10:00')

  const [result, setResult] = useState<BookingPreview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const selectedRoom = roomId ?? bookableRooms[0]?.id ?? null
  const isRecurring = recurrenceType !== 'none'

  const toggleWeekday = (index: number) => {
    setWeekdays((current) =>
      current.includes(index) ? current.filter((day) => day !== index) : [...current, index].sort(),
    )
    setResult(null)
  }

  const toggleMonthDay = (day: number) => {
    setMonthDays((current) =>
      current.includes(day) ? current.filter((item) => item !== day) : [...current, day].sort((a, b) => a - b),
    )
    setResult(null)
  }

  const addYearlyDate = () => {
    setYearlyDates((current) => [...current, { month: 1, day: 1 }])
    setResult(null)
  }

  const updateYearlyDate = (index: number, patch: Partial<YearlyDate>) => {
    setYearlyDates((current) =>
      current.map((item, position) => (position === index ? { ...item, ...patch } : item)),
    )
    setResult(null)
  }

  const removeYearlyDate = (index: number) => {
    setYearlyDates((current) => current.filter((_, position) => position !== index))
    setResult(null)
  }

  const runCheck = async () => {
    if (!selectedRoom) return
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const data = await bookingApi.preview({
        room: selectedRoom,
        recurrence_type: recurrenceType,
        interval: 1,
        weekdays:
          recurrenceType === 'weekly' || (recurrenceType === 'monthly' && monthlyMode === 'nth_weekday')
            ? weekdays
            : [],
        monthly_mode: monthlyMode,
        month_days: recurrenceType === 'monthly' && monthlyMode === 'day_of_month' ? monthDays : [],
        nth_week: monthlyMode === 'nth_weekday' ? nthWeek : null,
        yearly_dates: recurrenceType === 'yearly' ? yearlyDates : [],
        start_date: startDate,
        end_date: recurrenceType === 'none' ? startDate : endDate,
        start_time: startTime,
        end_time: endTime,
      })
      setResult(data)
    } catch (caught) {
      setError(t(parseApiError(caught).detail))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content}>
          <Title>{t('bookings.checkAvailabilityTitle')}</Title>
          <Subtitle>{t('bookings.checkAvailabilityHint')}</Subtitle>

          <SectionTitle>{t('rooms.room')}</SectionTitle>
          {roomsLoading ? (
            <Loading />
          ) : (
            <View style={[styles.chips, row]}>
              {bookableRooms.map((r) => {
                const active = selectedRoom === r.id
                return (
                  <Pressable
                    key={r.id}
                    onPress={() => {
                      setRoomId(r.id)
                      setResult(null)
                    }}
                    style={[styles.chip, active && styles.chipActive]}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>
                      {pick(r.name, r.name_ar)}
                    </Text>
                  </Pressable>
                )
              })}
            </View>
          )}

          <SectionTitle>{t('bookings.recurrenceType')}</SectionTitle>
          <View style={[styles.chips, row]}>
            {RECURRENCE_TYPES.map((type) => {
              const active = recurrenceType === type
              return (
                <Pressable
                  key={type}
                  onPress={() => {
                    setRecurrenceType(type)
                    setResult(null)
                  }}
                  style={[styles.chip, active && styles.chipActive]}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>
                    {t(`bookings.types.${type}`)}
                  </Text>
                </Pressable>
              )
            })}
          </View>

          {(recurrenceType === 'weekly' ||
            (recurrenceType === 'monthly' && monthlyMode === 'nth_weekday')) && (
            <>
              <SectionTitle>{t('bookings.weekdays')}</SectionTitle>
              <View style={[styles.chips, row]}>
                {WEEKDAY_INDEXES.map((index) => {
                  const active = weekdays.includes(index)
                  return (
                    <Pressable
                      key={index}
                      onPress={() => toggleWeekday(index)}
                      style={[styles.chip, active && styles.chipActive]}
                    >
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>
                        {t(`weekdaysShort.${index}`)}
                      </Text>
                    </Pressable>
                  )
                })}
              </View>
            </>
          )}

          {recurrenceType === 'monthly' && (
            <>
              <SectionTitle>{t('bookings.monthlyMode')}</SectionTitle>
              <View style={[styles.chips, row]}>
                {(['day_of_month', 'nth_weekday'] as MonthlyMode[]).map((mode) => {
                  const active = monthlyMode === mode
                  return (
                    <Pressable
                      key={mode}
                      onPress={() => {
                        setMonthlyMode(mode)
                        setResult(null)
                      }}
                      style={[styles.chip, active && styles.chipActive]}
                    >
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>
                        {t(`bookings.${mode === 'day_of_month' ? 'dayOfMonth' : 'nthWeekday'}`)}
                      </Text>
                    </Pressable>
                  )
                })}
              </View>
              {monthlyMode === 'day_of_month' ? (
                <>
                  <SectionTitle>{t('bookings.dayOfMonth')}</SectionTitle>
                  <View style={[styles.chips, row]}>
                    {MONTH_DAY_INDEXES.map((day) => {
                      const active = monthDays.includes(day)
                      return (
                        <Pressable
                          key={day}
                          onPress={() => toggleMonthDay(day)}
                          style={[styles.dayChip, active && styles.chipActive]}
                        >
                          <Text style={[styles.chipText, active && styles.chipTextActive]}>{day}</Text>
                        </Pressable>
                      )
                    })}
                  </View>
                </>
              ) : (
                <View style={[styles.chips, row]}>
                  {[1, 2, 3, 4, -1].map((week) => {
                    const active = nthWeek === week
                    return (
                      <Pressable
                        key={week}
                        onPress={() => {
                          setNthWeek(week)
                          setResult(null)
                        }}
                        style={[styles.chip, active && styles.chipActive]}
                      >
                        <Text style={[styles.chipText, active && styles.chipTextActive]}>{week}</Text>
                      </Pressable>
                    )
                  })}
                </View>
              )}
            </>
          )}

          {recurrenceType === 'yearly' && (
            <>
              <View style={[styles.sectionHeader, row]}>
                <SectionTitle>{t('bookings.yearlyDates')}</SectionTitle>
                <Pressable onPress={addYearlyDate}>
                  <Text style={styles.addLink}>+ {t('bookings.addDate')}</Text>
                </Pressable>
              </View>
              {yearlyDates.map((entry, index) => (
                <View key={index} style={[styles.yearlyRow, row]}>
                  <TextInput
                    value={String(entry.month)}
                    onChangeText={(value) => updateYearlyDate(index, { month: Number(value) || 1 })}
                    keyboardType="number-pad"
                    placeholder={t('bookings.month')}
                    placeholderTextColor={colors.textFaint}
                    style={[styles.input, styles.yearlyInput, text]}
                  />
                  <TextInput
                    value={String(entry.day)}
                    onChangeText={(value) => updateYearlyDate(index, { day: Number(value) || 1 })}
                    keyboardType="number-pad"
                    placeholder={t('bookings.dayOfMonth')}
                    placeholderTextColor={colors.textFaint}
                    style={[styles.input, styles.yearlyInput, text]}
                  />
                  {yearlyDates.length > 1 && (
                    <Pressable onPress={() => removeYearlyDate(index)} style={styles.removeButton}>
                      <Text style={styles.removeText}>×</Text>
                    </Pressable>
                  )}
                </View>
              ))}
            </>
          )}

          <Field label={t('bookings.startDate')}>
            <TextInput
              value={startDate}
              onChangeText={(value) => {
                setStartDate(value)
                setResult(null)
              }}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={colors.textFaint}
              style={[styles.input, text]}
            />
          </Field>

          {isRecurring && (
            <Field label={t('bookings.endDate')}>
              <TextInput
                value={endDate}
                onChangeText={(value) => {
                  setEndDate(value)
                  setResult(null)
                }}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={colors.textFaint}
                style={[styles.input, text]}
              />
            </Field>
          )}

          <View style={[styles.row2, row]}>
            <Field label={t('bookings.startTime')} style={styles.half}>
              <TextInput
                value={startTime}
                onChangeText={(value) => {
                  setStartTime(value)
                  setResult(null)
                }}
                placeholder="HH:MM"
                placeholderTextColor={colors.textFaint}
                style={[styles.input, text]}
              />
            </Field>
            <Field label={t('bookings.endTime')} style={styles.half}>
              <TextInput
                value={endTime}
                onChangeText={(value) => {
                  setEndTime(value)
                  setResult(null)
                }}
                placeholder="HH:MM"
                placeholderTextColor={colors.textFaint}
                style={[styles.input, text]}
              />
            </Field>
          </View>

          {result && (
            <View
              style={[
                styles.result,
                { backgroundColor: result.conflicts_count > 0 ? colors.warningSoft : colors.successSoft },
              ]}
            >
              <Text
                style={[
                  styles.resultHead,
                  { color: result.conflicts_count > 0 ? colors.warning : colors.success },
                  text,
                ]}
              >
                {t('bookings.occurrencesCount', { count: result.occurrences_count })}
                {result.conflicts_count > 0
                  ? ` · ${t('bookings.conflictsCount', { count: result.conflicts_count })}`
                  : ` · ${t('bookings.noConflicts')}`}
              </Text>
              {result.occurrences.slice(0, 40).map((occurrence) => (
                <View key={occurrence.start} style={[styles.occurrence, row]}>
                  <Text style={[styles.occurrenceText, text]}>
                    {formatSlot(occurrence.start, occurrence.end)}
                  </Text>
                  {occurrence.has_conflict && (
                    <Badge label={t('bookings.conflictDetected')} tone="critical" />
                  )}
                </View>
              ))}
              <Text style={[styles.contactNotice, text]}>{t('bookings.contactAdminNotice')}</Text>
            </View>
          )}

          {error && <Text style={[styles.error, text]}>{error}</Text>}
        </ScrollView>

        <View style={[styles.footer, row]}>
          <Button label={t('common.cancel')} variant="ghost" onPress={onClose} />
          <Button
            label={t('bookings.previewButton')}
            onPress={() => void runCheck()}
            loading={loading}
            disabled={!selectedRoom}
          />
        </View>
      </View>
    </Modal>
  )
}

function Field({
  label,
  children,
  style,
}: {
  label: string
  children: React.ReactNode
  style?: object
}) {
  const { text } = useDirection()
  return (
    <View style={[styles.field, style]}>
      <Text style={[styles.fieldLabel, text]}>{label}</Text>
      {children}
    </View>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, gap: spacing.sm, paddingBottom: spacing.xxl },

  chips: { flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  chip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  chipText: { fontSize: 13, fontWeight: '600', color: colors.textMuted },
  chipTextActive: { color: '#ffffff' },
  dayChip: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },

  field: { marginBottom: spacing.md },
  fieldLabel: { fontSize: 12, fontWeight: '600', color: colors.textMuted, marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  row2: { gap: spacing.md },
  half: { flex: 1 },

  sectionHeader: { justifyContent: 'space-between', alignItems: 'center' },
  addLink: { fontSize: 13, fontWeight: '600', color: colors.brand },
  yearlyRow: { gap: spacing.sm, marginBottom: spacing.md, alignItems: 'center' },
  yearlyInput: { flex: 1 },
  removeButton: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
    backgroundColor: colors.dangerSoft,
  },
  removeText: { color: colors.danger, fontSize: 16, fontWeight: '700', lineHeight: 18 },

  result: { borderRadius: radius.md, padding: spacing.lg, marginTop: spacing.sm, gap: spacing.xs },
  resultHead: { fontSize: 13, fontWeight: '700', marginBottom: spacing.xs },
  occurrence: {
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  occurrenceText: { fontSize: 12, color: colors.text },
  contactNotice: { fontSize: 12, color: colors.textMuted, marginTop: spacing.sm },

  error: { color: colors.danger, fontSize: 13, marginTop: spacing.sm },

  footer: {
    padding: spacing.lg,
    gap: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
})
