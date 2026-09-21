import clsx from 'clsx'
import { AlertTriangle, CalendarSearch, CheckCircle2, PhoneCall, Plus, X } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'

import { parseApiError } from '@/services/api'
import { bookingService } from '@/services/bookingService'
import type { BookingPreview, MonthlyMode, RecurrenceType, Room, YearlyDate } from '@/types'
import { formatRange, toDateInput } from '@/utils/format'
import { centerToday } from '@/utils/timezone'

import { Badge, Button, Field, Input, Select } from './ui'

interface AvailabilityCheckerValues {
  room: number
  start_date: string
  end_date: string
  recurrence_type: RecurrenceType
  monthly_mode: MonthlyMode
  nth_week: number
}

/** One time window to check. Several are allowed: e.g. Mon+Wed 08:00-10:00 AND Sat 13:00-15:00. */
interface RecurrenceSlot {
  weekdays: number[]
  monthDays: number[]
  yearlyDates: YearlyDate[]
  startTime: string
  endTime: string
}

interface AvailabilityCheckerProps {
  rooms: Room[]
  onClose: () => void
}

const RECURRENCE_TYPES: RecurrenceType[] = ['none', 'weekly', 'monthly', 'yearly']
const WEEKDAY_INDEXES = [0, 1, 2, 3, 4, 5, 6]
const MONTH_DAY_INDEXES = Array.from({ length: 31 }, (_, index) => index + 1)
const MONTH_INDEXES = Array.from({ length: 12 }, (_, index) => index + 1)
const MULTI_SLOT_TYPES: RecurrenceType[] = ['weekly', 'monthly', 'yearly']

function makeSlot(today: Date): RecurrenceSlot {
  return {
    weekdays: [today.getDay() === 0 ? 6 : today.getDay() - 1],
    monthDays: [today.getDate()],
    yearlyDates: [{ month: today.getMonth() + 1, day: today.getDate() }],
    startTime: '08:00',
    endTime: '10:00',
  }
}

export function AvailabilityChecker({ rooms, onClose }: AvailabilityCheckerProps) {
  const { t, i18n } = useTranslation()
  const today = centerToday()
  const bookableRooms = rooms.filter((room) => room.status === 'available')

  const { register, handleSubmit, watch, setValue } = useForm<AvailabilityCheckerValues>({
    defaultValues: {
      room: bookableRooms[0]?.id ?? 0,
      start_date: toDateInput(today),
      end_date: toDateInput(today),
      recurrence_type: 'none',
      monthly_mode: 'day_of_month',
      nth_week: 1,
    },
  })

  const [slots, setSlots] = useState<RecurrenceSlot[]>([makeSlot(today)])
  const [result, setResult] = useState<BookingPreview | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const recurrenceType = watch('recurrence_type')
  const monthlyMode = watch('monthly_mode')
  const isRecurring = recurrenceType !== 'none'
  const isMultiSlotType = MULTI_SLOT_TYPES.includes(recurrenceType)
  const effectiveSlots = isMultiSlotType ? slots : slots.slice(0, 1)

  const runCheck = handleSubmit(async (values) => {
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const results = await Promise.all(
        effectiveSlots.map((slot) =>
          bookingService.preview({
            room: Number(values.room),
            recurrence_type: values.recurrence_type,
            interval: 1,
            weekdays:
              values.recurrence_type === 'weekly' ||
              (values.recurrence_type === 'monthly' && values.monthly_mode === 'nth_weekday')
                ? slot.weekdays
                : [],
            monthly_mode: values.monthly_mode,
            month_days:
              values.recurrence_type === 'monthly' && values.monthly_mode === 'day_of_month'
                ? slot.monthDays
                : [],
            nth_week: values.monthly_mode === 'nth_weekday' ? Number(values.nth_week) : null,
            yearly_dates: values.recurrence_type === 'yearly' ? slot.yearlyDates : [],
            start_date: values.start_date,
            end_date: values.recurrence_type === 'none' ? values.start_date : values.end_date,
            start_time: slot.startTime,
            end_time: slot.endTime,
          }),
        ),
      )
      const merged: BookingPreview = {
        occurrences_count: results.reduce((sum, item) => sum + item.occurrences_count, 0),
        conflicts_count: results.reduce((sum, item) => sum + item.conflicts_count, 0),
        occurrences: results
          .flatMap((item) => item.occurrences)
          .sort((a, b) => a.start.localeCompare(b.start)),
        conflicts: results.flatMap((item) => item.conflicts),
      }
      setResult(merged)
    } catch (submitError) {
      setError(parseApiError(submitError).detail)
    } finally {
      setLoading(false)
    }
  })

  const addSlot = () => {
    setSlots((current) => [...current, makeSlot(today)])
    setResult(null)
  }

  const removeSlot = (index: number) => {
    setSlots((current) => current.filter((_, position) => position !== index))
    setResult(null)
  }

  const updateSlot = (index: number, patch: Partial<RecurrenceSlot>) => {
    setSlots((current) =>
      current.map((slot, position) => (position === index ? { ...slot, ...patch } : slot)),
    )
    setResult(null)
  }

  const toggleSlotWeekday = (index: number, day: number) => {
    setSlots((current) =>
      current.map((slot, position) =>
        position === index
          ? {
              ...slot,
              weekdays: slot.weekdays.includes(day)
                ? slot.weekdays.filter((item) => item !== day)
                : [...slot.weekdays, day].sort(),
            }
          : slot,
      ),
    )
    setResult(null)
  }

  const toggleSlotMonthDay = (index: number, day: number) => {
    setSlots((current) =>
      current.map((slot, position) =>
        position === index
          ? {
              ...slot,
              monthDays: slot.monthDays.includes(day)
                ? slot.monthDays.filter((item) => item !== day)
                : [...slot.monthDays, day].sort((a, b) => a - b),
            }
          : slot,
      ),
    )
    setResult(null)
  }

  const addSlotYearlyDate = (index: number) => {
    setSlots((current) =>
      current.map((slot, position) =>
        position === index ? { ...slot, yearlyDates: [...slot.yearlyDates, { month: 1, day: 1 }] } : slot,
      ),
    )
    setResult(null)
  }

  const updateSlotYearlyDate = (index: number, dateIndex: number, patch: Partial<YearlyDate>) => {
    setSlots((current) =>
      current.map((slot, position) =>
        position === index
          ? {
              ...slot,
              yearlyDates: slot.yearlyDates.map((item, itemIndex) =>
                itemIndex === dateIndex ? { ...item, ...patch } : item,
              ),
            }
          : slot,
      ),
    )
    setResult(null)
  }

  const removeSlotYearlyDate = (index: number, dateIndex: number) => {
    setSlots((current) =>
      current.map((slot, position) =>
        position === index
          ? { ...slot, yearlyDates: slot.yearlyDates.filter((_, itemIndex) => itemIndex !== dateIndex) }
          : slot,
      ),
    )
    setResult(null)
  }

  return (
    <form onSubmit={runCheck} className="space-y-5">
      <p className="text-sm text-slate-600">{t('bookings.checkAvailabilityHint')}</p>

      <Field label={t('rooms.room')}>
        <Select {...register('room', { valueAsNumber: true })}>
          {bookableRooms.map((room) => (
            <option key={room.id} value={room.id}>
              {i18n.language.startsWith('ar') && room.name_ar ? room.name_ar : room.name} —{' '}
              {room.capacity} {t('rooms.people')}
            </option>
          ))}
        </Select>
      </Field>

      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('bookings.recurrenceType')}>
            <Select
              {...register('recurrence_type')}
              onChange={(event) => {
                setValue('recurrence_type', event.target.value as RecurrenceType)
                setResult(null)
              }}
            >
              {RECURRENCE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {t(`bookings.types.${type}`)}
                </option>
              ))}
            </Select>
          </Field>

          {recurrenceType === 'monthly' && (
            <Field label={t('bookings.monthlyMode')}>
              <Select {...register('monthly_mode')}>
                <option value="day_of_month">{t('bookings.dayOfMonth')}</option>
                <option value="nth_weekday">{t('bookings.nthWeekday')}</option>
              </Select>
            </Field>
          )}
        </div>

        {recurrenceType === 'monthly' && monthlyMode === 'nth_weekday' && (
          <Field label={t('bookings.nthWeek')} className="mt-4">
            <Select {...register('nth_week', { valueAsNumber: true })}>
              <option value={1}>1</option>
              <option value={2}>2</option>
              <option value={3}>3</option>
              <option value={4}>4</option>
              <option value={-1}>-1</option>
            </Select>
          </Field>
        )}

        {!isMultiSlotType ? (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label={t('bookings.startTime')}>
              <Input
                type="time"
                value={slots[0].startTime}
                onChange={(event) => updateSlot(0, { startTime: event.target.value })}
              />
            </Field>
            <Field label={t('bookings.endTime')}>
              <Input
                type="time"
                value={slots[0].endTime}
                onChange={(event) => updateSlot(0, { endTime: event.target.value })}
              />
            </Field>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-slate-700">{t('bookings.timeSlots')}</span>
              <button
                type="button"
                onClick={addSlot}
                className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline"
              >
                <Plus size={13} />
                {t('bookings.addSlot')}
              </button>
            </div>

            {slots.map((slot, index) => (
              <div key={index} className="rounded-lg border border-slate-200 bg-white p-3">
                {(recurrenceType === 'weekly' ||
                  (recurrenceType === 'monthly' && monthlyMode === 'nth_weekday')) && (
                  <div className="mb-3 flex flex-wrap gap-2">
                    {WEEKDAY_INDEXES.map((day) => (
                      <button
                        key={day}
                        type="button"
                        onClick={() => toggleSlotWeekday(index, day)}
                        className={clsx(
                          'rounded-lg border px-3 py-1.5 text-xs font-medium transition',
                          slot.weekdays.includes(day)
                            ? 'border-brand-500 bg-brand-600 text-white'
                            : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50',
                        )}
                      >
                        {t(`weekdaysShort.${day}`)}
                      </button>
                    ))}
                  </div>
                )}

                {recurrenceType === 'monthly' && monthlyMode === 'day_of_month' && (
                  <div className="mb-3 flex flex-wrap gap-2">
                    {MONTH_DAY_INDEXES.map((day) => (
                      <button
                        key={day}
                        type="button"
                        onClick={() => toggleSlotMonthDay(index, day)}
                        className={clsx(
                          'flex h-8 w-8 items-center justify-center rounded-lg border text-xs font-medium transition',
                          slot.monthDays.includes(day)
                            ? 'border-brand-500 bg-brand-600 text-white'
                            : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50',
                        )}
                      >
                        {day}
                      </button>
                    ))}
                  </div>
                )}

                {recurrenceType === 'yearly' && (
                  <div className="mb-3 space-y-2">
                    {slot.yearlyDates.map((entry, dateIndex) => (
                      <div key={dateIndex} className="flex items-center gap-2">
                        <Select
                          value={entry.month}
                          onChange={(event) =>
                            updateSlotYearlyDate(index, dateIndex, { month: Number(event.target.value) })
                          }
                          className="flex-1"
                        >
                          {MONTH_INDEXES.map((month) => (
                            <option key={month} value={month}>
                              {t(`months.${month}`)}
                            </option>
                          ))}
                        </Select>
                        <Input
                          type="number"
                          min={1}
                          max={31}
                          value={entry.day}
                          onChange={(event) =>
                            updateSlotYearlyDate(index, dateIndex, { day: Number(event.target.value) })
                          }
                          className="w-20"
                        />
                        {slot.yearlyDates.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeSlotYearlyDate(index, dateIndex)}
                            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                            aria-label={t('common.delete')}
                          >
                            <X size={14} />
                          </button>
                        )}
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => addSlotYearlyDate(index)}
                      className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline"
                    >
                      <Plus size={13} />
                      {t('bookings.addDate')}
                    </button>
                  </div>
                )}

                <div className="flex items-end gap-2">
                  <Field label={t('bookings.startTime')} className="flex-1">
                    <Input
                      type="time"
                      value={slot.startTime}
                      onChange={(event) => updateSlot(index, { startTime: event.target.value })}
                    />
                  </Field>
                  <Field label={t('bookings.endTime')} className="flex-1">
                    <Input
                      type="time"
                      value={slot.endTime}
                      onChange={(event) => updateSlot(index, { endTime: event.target.value })}
                    />
                  </Field>
                  {slots.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeSlot(index)}
                      className="mb-0.5 rounded-lg p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                      aria-label={t('common.delete')}
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('bookings.startDate')}>
          <Input type="date" {...register('start_date')} />
        </Field>
        {isRecurring && (
          <Field label={t('bookings.endDate')}>
            <Input type="date" {...register('end_date')} />
          </Field>
        )}
      </div>

      {result && (
        <div
          className={clsx(
            'rounded-lg border p-4',
            result.conflicts_count > 0
              ? 'border-amber-200 bg-amber-50'
              : 'border-emerald-200 bg-emerald-50',
          )}
        >
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
            {result.conflicts_count > 0 ? (
              <AlertTriangle size={16} className="text-amber-600" />
            ) : (
              <CheckCircle2 size={16} className="text-emerald-600" />
            )}
            <span className={result.conflicts_count > 0 ? 'text-amber-800' : 'text-emerald-800'}>
              {t('bookings.occurrencesCount', { count: result.occurrences_count })}
              {result.conflicts_count > 0
                ? ` · ${t('bookings.conflictsCount', { count: result.conflicts_count })}`
                : ` · ${t('bookings.noConflicts')}`}
            </span>
          </div>
          <ul className="max-h-40 space-y-1 overflow-y-auto text-xs">
            {result.occurrences.slice(0, 40).map((occurrence) => (
              <li
                key={occurrence.start}
                className={clsx(
                  'flex items-center justify-between rounded px-2 py-1',
                  occurrence.has_conflict ? 'bg-red-100 text-red-800' : 'bg-white/70 text-slate-700',
                )}
              >
                <span>{formatRange(occurrence.start, occurrence.end, i18n.language)}</span>
                {occurrence.has_conflict && (
                  <Badge tone="red">{t('bookings.conflictDetected')}</Badge>
                )}
              </li>
            ))}
          </ul>

          <div className="mt-3 flex items-start gap-2 border-t border-white/60 pt-3 text-xs text-slate-600">
            <PhoneCall size={14} className="mt-0.5 shrink-0" />
            <span>{t('bookings.contactAdminNotice')}</span>
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-end gap-3 border-t border-slate-100 pt-4">
        <Button type="button" variant="ghost" onClick={onClose}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" loading={loading} icon={<CalendarSearch size={16} />}>
          {t('bookings.previewButton')}
        </Button>
      </div>
    </form>
  )
}
