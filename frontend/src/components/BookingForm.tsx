import clsx from 'clsx'
import { AlertTriangle, CalendarCheck, CheckCircle2, Repeat } from 'lucide-react'
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
  start_time: string
  end_time: string
  recurrence_type: RecurrenceType
  interval: number
  monthly_mode: MonthlyMode
  month_day: number
  nth_week: number
  conflict_policy: ConflictPolicy
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
      start_time: initialSlot ? formatClock(initialSlot.start) : '08:00',
      end_time: initialSlot ? formatClock(initialSlot.end) : '10:00',
      recurrence_type: 'none',
      interval: 1,
      monthly_mode: 'day_of_month',
      month_day: defaultStart.getDate(),
      nth_week: 1,
      conflict_policy: 'strict',
    },
  })

  const [weekdays, setWeekdays] = useState<number[]>([defaultStart.getDay() === 0 ? 6 : defaultStart.getDay() - 1])
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

  const buildPayload = (values: BookingFormValues): BookingPayload => ({
    room: Number(values.room),
    title: values.title,
    purpose: values.purpose,
    notes: values.notes,
    expected_attendees: Number(values.expected_attendees),
    booked_by: values.booked_by ? Number(values.booked_by) : null,
    required_resources: selectedResources,
    recurrence_type: values.recurrence_type,
    interval: Number(values.interval) || 1,
    weekdays: values.recurrence_type === 'weekly' || values.monthly_mode === 'nth_weekday' ? weekdays : [],
    monthly_mode: values.monthly_mode,
    month_day: values.monthly_mode === 'day_of_month' ? Number(values.month_day) : null,
    nth_week: values.monthly_mode === 'nth_weekday' ? Number(values.nth_week) : null,
    start_date: values.start_date,
    end_date: values.recurrence_type === 'none' ? values.start_date : values.end_date,
    start_time: values.start_time,
    end_time: values.end_time,
    conflict_policy: values.conflict_policy,
  })

  const runPreview = handleSubmit(async (values) => {
    setPreviewLoading(true)
    setServerError(null)
    try {
      const payload = buildPayload(values)
      const result = await bookingService.preview(payload)
      setPreview(result)
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
      const payload = buildPayload(values)
      const result = await bookingService.create(payload)
      const messages = [t('bookings.createdCount', { count: result.created_count })]
      if (result.skipped_count > 0) {
        messages.push(t('bookings.skippedCount', { count: result.skipped_count }))
      }
      onSuccess(messages.join(' · '))
    } catch (error) {
      const parsed = parseApiError(error)
      if (parsed.status === 409) {
        setServerError(t('bookings.conflictMessage'))
        toast.error(t('bookings.conflictDetected'))
        // Show exactly which dates clash so the user can switch to "skip".
        void runPreview()
      } else {
        setServerError(parsed.detail)
      }
    } finally {
      setSubmitting(false)
    }
  })

  const toggleWeekday = (index: number) => {
    setWeekdays((current) =>
      current.includes(index) ? current.filter((day) => day !== index) : [...current, index].sort(),
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

        {(recurrenceType === 'weekly' ||
          (recurrenceType === 'monthly' && monthlyMode === 'nth_weekday')) && (
          <Field label={t('bookings.weekdays')} className="mt-4">
            <div className="flex flex-wrap gap-2">
              {WEEKDAY_INDEXES.map((index) => (
                <button
                  key={index}
                  type="button"
                  onClick={() => toggleWeekday(index)}
                  className={clsx(
                    'rounded-lg border px-3 py-1.5 text-xs font-medium transition',
                    weekdays.includes(index)
                      ? 'border-brand-500 bg-brand-600 text-white'
                      : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50',
                  )}
                >
                  {t(`weekdaysShort.${index}`)}
                </button>
              ))}
            </div>
          </Field>
        )}

        {recurrenceType === 'monthly' && (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label={t('bookings.monthlyMode')}>
              <Select {...register('monthly_mode')}>
                <option value="day_of_month">{t('bookings.dayOfMonth')}</option>
                <option value="nth_weekday">{t('bookings.nthWeekday')}</option>
              </Select>
            </Field>
            {monthlyMode === 'day_of_month' ? (
              <Field label={t('bookings.dayOfMonth')}>
                <Input type="number" min={1} max={31} {...register('month_day', { valueAsNumber: true })} />
              </Field>
            ) : (
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
      </div>

      {/* Dates and times */}
      <div className="grid gap-4 sm:grid-cols-4">
        <Field label={t('bookings.startDate')} required error={errors.start_date?.message}>
          <Input type="date" {...register('start_date', { required: t('common.required') })} />
        </Field>
        {isRecurring && (
          <Field label={t('bookings.endDate')} required error={errors.end_date?.message}>
            <Input type="date" {...register('end_date', { required: t('common.required') })} />
          </Field>
        )}
        <Field label={t('bookings.startTime')} required error={errors.start_time?.message}>
          <Input type="time" {...register('start_time', { required: t('common.required') })} />
        </Field>
        <Field label={t('bookings.endTime')} required error={errors.end_time?.message}>
          <Input type="time" {...register('end_time', { required: t('common.required') })} />
        </Field>
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
