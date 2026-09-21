import clsx from 'clsx'
import { AlertTriangle, CalendarCheck, CheckCircle2, Plus, Repeat, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'

import { useToast } from '@/context/ToastContext'
import { parseApiError } from '@/services/api'
import { bookingService } from '@/services/bookingService'
import type {
  Booking,
  BookingPayload,
  BookingPreview,
  ConflictPolicy,
  Employee,
  MonthlyMode,
  RecurrenceType,
  ResourceType,
  Room,
  YearlyDate,
} from '@/types'
import { formatRange, toDateInput } from '@/utils/format'
import { centerToday } from '@/utils/timezone'

import { Badge, Button, Field, Input, Select, Textarea } from './ui'

interface BookingFormValues {
  room: number
  title: string
  purpose: string
  notes: string
  expected_attendees: number
  booked_by: string
  start_date: string
  end_date: string
  recurrence_type: RecurrenceType
  interval: number
  monthly_mode: MonthlyMode
  nth_week: number
  conflict_policy: ConflictPolicy
}

/**
 * One time window inside the recurrence. Several are allowed so a series can
 * cover, say, Monday+Wednesday 08:00-10:00 AND Saturday 13:00-15:00 - each
 * slot becomes its own booking series on submit.
 */
interface RecurrenceSlot {
  weekdays: number[]
  monthDays: number[]
  yearlyDates: YearlyDate[]
  startTime: string
  endTime: string
}

interface BookingFormProps {
  rooms: Room[]
  employees: Employee[]
  resourceTypes: ResourceType[]
  initialSlot?: { start: Date; end: Date } | null
  booking?: Booking | null
  onSuccess: (message: string) => void
  onCancel: () => void
}

const RECURRENCE_TYPES: RecurrenceType[] = ['none', 'daily', 'weekly', 'monthly', 'yearly']
const WEEKDAY_INDEXES = [0, 1, 2, 3, 4, 5, 6]
const MONTH_DAY_INDEXES = Array.from({ length: 31 }, (_, index) => index + 1)
const MONTH_INDEXES = Array.from({ length: 12 }, (_, index) => index + 1)
const MULTI_SLOT_TYPES: RecurrenceType[] = ['weekly', 'monthly', 'yearly']

function makeSlot(defaultStart: Date, overrides: Partial<RecurrenceSlot> = {}): RecurrenceSlot {
  return {
    weekdays: [defaultStart.getDay() === 0 ? 6 : defaultStart.getDay() - 1],
    monthDays: [defaultStart.getDate()],
    yearlyDates: [{ month: defaultStart.getMonth() + 1, day: defaultStart.getDate() }],
    startTime: '08:00',
    endTime: '10:00',
    ...overrides,
  }
}

export function BookingForm({
  rooms,
  employees,
  resourceTypes,
  initialSlot,
  booking,
  onSuccess,
  onCancel,
}: BookingFormProps) {
  const { t, i18n } = useTranslation()
  const toast = useToast()

  // Slots picked in the calendar are already on the centre's wall clock.
  const defaultStart = initialSlot?.start ?? centerToday()
  const bookableRooms = useMemo(() => rooms.filter((room) => room.status === 'available'), [rooms])

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<BookingFormValues>({
    defaultValues: {
      room: booking?.room ?? bookableRooms[0]?.id ?? 0,
      title: booking?.title ?? '',
      purpose: booking?.purpose ?? '',
      notes: booking?.notes ?? '',
      expected_attendees: booking?.expected_attendees ?? 1,
      booked_by: booking?.booked_by ? String(booking.booked_by) : '',
      start_date: toDateInput(defaultStart),
      end_date: toDateInput(initialSlot?.end ?? defaultStart),
      recurrence_type: 'none',
      interval: 1,
      monthly_mode: 'day_of_month',
      nth_week: 1,
      conflict_policy: 'strict',
    },
  })

  const [slots, setSlots] = useState<RecurrenceSlot[]>([
    makeSlot(defaultStart, {
      startTime: initialSlot ? formatClock(initialSlot.start) : '08:00',
      endTime: initialSlot ? formatClock(initialSlot.end) : '10:00',
    }),
  ])
  const [selectedResources, setSelectedResources] = useState<number[]>(
    booking?.required_resources ?? [],
  )
  const [preview, setPreview] = useState<BookingPreview | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  const recurrenceType = watch('recurrence_type')
  const monthlyMode = watch('monthly_mode')
  const roomId = Number(watch('room'))
  const selectedRoom = rooms.find((room) => room.id === roomId)

  // Resources the chosen room actually holds in working order.
  const roomResourceIds = useMemo(
    () =>
      new Set(
        (selectedRoom?.resources ?? [])
          .filter((item) => item.condition === 'ok' && item.quantity > 0)
          .map((item) => item.resource_type),
      ),
    [selectedRoom],
  )

  useEffect(() => {
    setSelectedResources((current) => current.filter((id) => roomResourceIds.has(id)))
    setPreview(null)
  }, [roomResourceIds])

  const isRecurring = recurrenceType !== 'none'
  const isMultiSlotType = MULTI_SLOT_TYPES.includes(recurrenceType)
  const effectiveSlots = isMultiSlotType ? slots : slots.slice(0, 1)

  const buildPayloads = (values: BookingFormValues): BookingPayload[] =>
    effectiveSlots.map((slot) => ({
      room: Number(values.room),
      title: values.title,
      purpose: values.purpose,
      notes: values.notes,
      expected_attendees: Number(values.expected_attendees),
      booked_by: values.booked_by ? Number(values.booked_by) : null,
      required_resources: selectedResources,
      recurrence_type: values.recurrence_type,
      interval: Number(values.interval) || 1,
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
      conflict_policy: values.conflict_policy,
    }))

  const runPreview = handleSubmit(async (values) => {
    setPreviewLoading(true)
    setServerError(null)
    try {
      const payloads = buildPayloads(values)
      const results = await Promise.all(payloads.map((payload) => bookingService.preview(payload)))
      const merged: BookingPreview = {
        occurrences_count: results.reduce((sum, item) => sum + item.occurrences_count, 0),
        conflicts_count: results.reduce((sum, item) => sum + item.conflicts_count, 0),
        occurrences: results
          .flatMap((item) => item.occurrences)
          .sort((a, b) => a.start.localeCompare(b.start)),
        conflicts: results.flatMap((item) => item.conflicts),
      }
      setPreview(merged)
    } catch (error) {
      setServerError(parseApiError(error).detail)
    } finally {
      setPreviewLoading(false)
    }
  })

  const onSubmit = handleSubmit(async (values) => {
    setSubmitting(true)
    setServerError(null)
    try {
      const payloads = buildPayloads(values)
      let createdCount = 0
      let skippedCount = 0
      let conflictSlots = 0

      for (const payload of payloads) {
        try {
          const result = await bookingService.create(payload)
          createdCount += result.created_count
          skippedCount += result.skipped_count
        } catch (error) {
          const parsed = parseApiError(error)
          if (parsed.status === 409) {
            conflictSlots += 1
            continue
          }
          throw error
        }
      }

      if (createdCount === 0 && skippedCount === 0) {
        setServerError(t('bookings.conflictMessage'))
        toast.error(t('bookings.conflictDetected'))
        void runPreview()
        return
      }

      const messages = [t('bookings.createdCount', { count: createdCount })]
      if (skippedCount > 0) {
        messages.push(t('bookings.skippedCount', { count: skippedCount }))
      }
      if (conflictSlots > 0) {
        messages.push(t('bookings.slotsConflictCount', { count: conflictSlots }))
      }
      onSuccess(messages.join(' · '))
    } catch (error) {
      setServerError(parseApiError(error).detail)
    } finally {
      setSubmitting(false)
    }
  })

  const addSlot = () => {
    setSlots((current) => [...current, makeSlot(defaultStart)])
    setPreview(null)
  }

  const removeSlot = (index: number) => {
    setSlots((current) => current.filter((_, position) => position !== index))
    setPreview(null)
  }

  const updateSlot = (index: number, patch: Partial<RecurrenceSlot>) => {
    setSlots((current) =>
      current.map((slot, position) => (position === index ? { ...slot, ...patch } : slot)),
    )
    setPreview(null)
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
    setPreview(null)
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
    setPreview(null)
  }

  const addSlotYearlyDate = (index: number) => {
    setSlots((current) =>
      current.map((slot, position) =>
        position === index ? { ...slot, yearlyDates: [...slot.yearlyDates, { month: 1, day: 1 }] } : slot,
      ),
    )
    setPreview(null)
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
    setPreview(null)
  }

  const removeSlotYearlyDate = (index: number, dateIndex: number) => {
    setSlots((current) =>
      current.map((slot, position) =>
        position === index
          ? { ...slot, yearlyDates: slot.yearlyDates.filter((_, itemIndex) => itemIndex !== dateIndex) }
          : slot,
      ),
    )
    setPreview(null)
  }

  const toggleResource = (id: number) => {
    setSelectedResources((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    )
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('rooms.room')} required error={errors.room?.message}>
          <Select {...register('room', { required: t('common.required'), valueAsNumber: true })}>
            {bookableRooms.map((room) => (
              <option key={room.id} value={room.id}>
                {i18n.language.startsWith('ar') && room.name_ar ? room.name_ar : room.name} —{' '}
                {room.capacity} {t('rooms.people')}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label={t('bookings.attendees')}
          required
          error={errors.expected_attendees?.message}
          hint={selectedRoom ? `${t('rooms.capacity')}: ${selectedRoom.capacity}` : undefined}
        >
          <Input
            type="number"
            min={1}
            max={selectedRoom?.capacity}
            {...register('expected_attendees', {
              required: t('common.required'),
              valueAsNumber: true,
              min: { value: 1, message: t('common.required') },
              max: selectedRoom
                ? { value: selectedRoom.capacity, message: t('bookings.validation.capacityExceeded') }
                : undefined,
            })}
          />
        </Field>
      </div>

      <Field label={t('bookings.bookingTitle')} required error={errors.title?.message}>
        <Input {...register('title', { required: t('common.required') })} />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('bookings.purpose')}>
          <Input {...register('purpose')} />
        </Field>
        <Field label={t('bookings.bookedBy')}>
          <Select {...register('booked_by')}>
            <option value="">—</option>
            {employees.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.full_name}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {/* Resources available in the selected room */}
      {resourceTypes.length > 0 && (
        <Field label={t('bookings.requiredResources')}>
          <div className="flex flex-wrap gap-2">
            {resourceTypes
              .filter((resource) => roomResourceIds.has(resource.id))
              .map((resource) => {
                const active = selectedResources.includes(resource.id)
                return (
                  <button
                    key={resource.id}
                    type="button"
                    onClick={() => toggleResource(resource.id)}
                    className={clsx(
                      'rounded-full border px-3 py-1 text-xs font-medium transition',
                      active
                        ? 'border-brand-500 bg-brand-50 text-brand-700'
                        : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50',
                    )}
                  >
                    {i18n.language.startsWith('ar') ? resource.name_ar : resource.name_fr}
                  </button>
                )
              })}
            {selectedRoom && roomResourceIds.size === 0 && (
              <span className="text-xs text-slate-500">{t('rooms.noResources')}</span>
            )}
          </div>
        </Field>
      )}

      {/* Recurrence */}
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
          <Repeat size={16} />
          {t('bookings.recurrence')}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('bookings.recurrenceType')}>
            <Select
              {...register('recurrence_type')}
              onChange={(event) => {
                setValue('recurrence_type', event.target.value as RecurrenceType)
                setPreview(null)
              }}
            >
              {RECURRENCE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {t(`bookings.types.${type}`)}
                </option>
              ))}
            </Select>
          </Field>

          {isRecurring && recurrenceType !== 'yearly' && (
            <Field label={t('bookings.interval')} hint={t('bookings.everyN')}>
              <Input type="number" min={1} max={12} {...register('interval', { valueAsNumber: true })} />
            </Field>
          )}
        </div>

        {recurrenceType === 'monthly' && (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label={t('bookings.monthlyMode')}>
              <Select {...register('monthly_mode')}>
                <option value="day_of_month">{t('bookings.dayOfMonth')}</option>
                <option value="nth_weekday">{t('bookings.nthWeekday')}</option>
              </Select>
            </Field>
            {monthlyMode === 'nth_weekday' && (
              <Field label={t('bookings.nthWeek')}>
                <Select {...register('nth_week', { valueAsNumber: true })}>
                  <option value={1}>1</option>
                  <option value={2}>2</option>
                  <option value={3}>3</option>
                  <option value={4}>4</option>
                  <option value={-1}>-1</option>
                </Select>
              </Field>
            )}
          </div>
        )}

        {!isMultiSlotType ? (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label={t('bookings.startTime')} required>
              <Input
                type="time"
                value={slots[0].startTime}
                onChange={(event) => updateSlot(0, { startTime: event.target.value })}
              />
            </Field>
            <Field label={t('bookings.endTime')} required>
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

      {/* Dates */}
      <div className="grid gap-4 sm:grid-cols-4">
        <Field label={t('bookings.startDate')} required error={errors.start_date?.message}>
          <Input type="date" {...register('start_date', { required: t('common.required') })} />
        </Field>
        {isRecurring && (
          <Field label={t('bookings.endDate')} required error={errors.end_date?.message}>
            <Input type="date" {...register('end_date', { required: t('common.required') })} />
          </Field>
        )}
      </div>

      {isRecurring && (
        <Field label={t('bookings.conflictPolicy')}>
          <Select {...register('conflict_policy')}>
            <option value="strict">{t('bookings.strict')}</option>
            <option value="skip">{t('bookings.skip')}</option>
          </Select>
        </Field>
      )}

      <Field label={t('common.notes')}>
        <Textarea {...register('notes')} />
      </Field>

      {/* Availability preview */}
      {preview && (
        <div
          className={clsx(
            'rounded-lg border p-4',
            preview.conflicts_count > 0
              ? 'border-amber-200 bg-amber-50'
              : 'border-emerald-200 bg-emerald-50',
          )}
        >
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
            {preview.conflicts_count > 0 ? (
              <AlertTriangle size={16} className="text-amber-600" />
            ) : (
              <CheckCircle2 size={16} className="text-emerald-600" />
            )}
            <span className={preview.conflicts_count > 0 ? 'text-amber-800' : 'text-emerald-800'}>
              {t('bookings.occurrencesCount', { count: preview.occurrences_count })}
              {preview.conflicts_count > 0
                ? ` · ${t('bookings.conflictsCount', { count: preview.conflicts_count })}`
                : ` · ${t('bookings.noConflicts')}`}
            </span>
          </div>
          <ul className="max-h-40 space-y-1 overflow-y-auto text-xs">
            {preview.occurrences.slice(0, 40).map((occurrence) => (
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
        </div>
      )}

      {serverError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {serverError}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-end gap-3 border-t border-slate-100 pt-4">
        <Button type="button" variant="ghost" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
        <Button
          type="button"
          variant="secondary"
          loading={previewLoading}
          icon={<CalendarCheck size={16} />}
          onClick={() => void runPreview()}
        >
          {t('bookings.previewButton')}
        </Button>
        <Button type="submit" loading={submitting}>
          {t('common.save')}
        </Button>
      </div>
    </form>
  )
}

function formatClock(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}
