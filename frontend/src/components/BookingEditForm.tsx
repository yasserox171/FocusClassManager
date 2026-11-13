import clsx from 'clsx'
import { AlertTriangle, CheckCircle2, Repeat } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'

import { parseApiError } from '@/services/api'
import { bookingService } from '@/services/bookingService'
import type {
  Booking,
  BookingCategory,
  ConflictingBooking,
  ConflictPolicy,
  EditScope,
  Employee,
  Room,
} from '@/types'
import { formatRange, toDateInput } from '@/utils/format'
import { toCenterWallClock } from '@/utils/timezone'

import { Badge, Button, Field, Input, Select, Textarea } from './ui'

const CATEGORIES: BookingCategory[] = [
  'study',
  'training',
  'meeting',
  'exam',
  'activity',
  'other',
]
/** Sentinel of the owner selector: "someone who is not registered". */
const FREE_TEXT_OWNER = '__free__'

interface EditFormValues {
  room: number
  title: string
  category: BookingCategory
  purpose: string
  notes: string
  expected_attendees: number
  booked_by: string
  booked_by_name: string
  date: string
  start_time: string
  end_time: string
  conflict_policy: ConflictPolicy
}

interface CheckState {
  conflicts: ConflictingBooking[]
  affected: number
  checked: boolean
}

function clock(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

/**
 * Edits an existing booking.
 *
 * A one-off booking is edited as itself. A recurring one asks first what the
 * change applies to: this session alone, the upcoming ones, or the whole
 * series - the three levels the centre reasons in (daily, weekly, yearly...).
 * Either way the new slot is checked against the other bookings before it is
 * written.
 */
export function BookingEditForm({
  booking,
  rooms,
  employees,
  onSuccess,
  onCancel,
}: {
  booking: Booking
  rooms: Room[]
  employees: Employee[]
  onSuccess: (message: string) => void
  onCancel: () => void
}) {
  const { t, i18n } = useTranslation()
  const isArabic = i18n.language.startsWith('ar')

  const start = toCenterWallClock(booking.start_datetime)
  const end = toCenterWallClock(booking.end_datetime)

  const [scope, setScope] = useState<EditScope>('occurrence')
  const [check, setCheck] = useState<CheckState | null>(null)
  const [checking, setChecking] = useState(false)
  const [saving, setSaving] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<EditFormValues>({
    defaultValues: {
      room: booking.room,
      title: booking.title,
      category: booking.category,
      purpose: booking.purpose,
      notes: booking.notes,
      expected_attendees: booking.expected_attendees,
      booked_by: booking.booked_by
        ? String(booking.booked_by)
        : booking.booked_by_name
          ? FREE_TEXT_OWNER
          : '',
      booked_by_name: booking.booked_by ? '' : booking.booked_by_name,
      date: toDateInput(start),
      start_time: clock(start),
      end_time: clock(end),
      conflict_policy: 'strict',
    },
  })

  const bookableRooms = useMemo(
    () => rooms.filter((room) => room.status === 'available' || room.id === booking.room),
    [rooms, booking.room],
  )
  const teacherOptions = useMemo(
    () => employees.filter((employee) => employee.role === 'teacher'),
    [employees],
  )
  const otherStaff = useMemo(
    () => employees.filter((employee) => employee.role !== 'teacher'),
    [employees],
  )

  const ownerIsFreeText = watch('booked_by') === FREE_TEXT_OWNER
  const roomId = Number(watch('room'))
  const selectedRoom = rooms.find((room) => room.id === roomId)
  const isSeriesScope = scope !== 'occurrence'

  /** Any change invalidates a previous conflict check. */
  const invalidate = () => setCheck(null)

  const buildSeriesPayload = (values: EditFormValues, dryRun: boolean) => ({
    scope: (scope === 'all' ? 'all' : 'future') as 'all' | 'future',
    dry_run: dryRun,
    conflict_policy: values.conflict_policy,
    room: Number(values.room),
    title: values.title,
    category: values.category,
    purpose: values.purpose,
    notes: values.notes,
    expected_attendees: Number(values.expected_attendees),
    booked_by:
      values.booked_by && values.booked_by !== FREE_TEXT_OWNER ? Number(values.booked_by) : null,
    booked_by_name:
      values.booked_by === FREE_TEXT_OWNER ? values.booked_by_name.trim() : '',
    start_time: values.start_time,
    end_time: values.end_time,
  })

  const runCheck = handleSubmit(async (values) => {
    setChecking(true)
    setServerError(null)
    try {
      if (isSeriesScope && booking.series) {
        const report = await bookingService.rescheduleSeries(
          booking.series,
          buildSeriesPayload(values, true),
        )
        setCheck({
          conflicts: report.conflicts.flatMap((item) => item.conflicts),
          affected: report.moved_count,
          checked: true,
        })
      } else {
        const result = await bookingService.checkCollision(
          Number(values.room),
          `${values.date}T${values.start_time}:00`,
          `${values.date}T${values.end_time}:00`,
          booking.id,
        )
        setCheck({
          conflicts: result.conflicts,
          affected: result.has_conflict ? 0 : 1,
          checked: true,
        })
      }
    } catch (error) {
      setServerError(parseApiError(error).detail)
    } finally {
      setChecking(false)
    }
  })

  const onSubmit = handleSubmit(async (values) => {
    setSaving(true)
    setServerError(null)
    try {
      if (isSeriesScope && booking.series) {
        const report = await bookingService.rescheduleSeries(
          booking.series,
          buildSeriesPayload(values, false),
        )
        const parts = [t('bookings.edit.savedSeries', { count: report.moved_count })]
        if (report.conflicts_count > 0) {
          parts.push(t('bookings.edit.skippedSeries', { count: report.conflicts_count }))
        }
        onSuccess(parts.join(' · '))
      } else {
        await bookingService.update(booking.id, {
          room: Number(values.room),
          title: values.title,
          category: values.category,
          purpose: values.purpose,
          notes: values.notes,
          expected_attendees: Number(values.expected_attendees),
          booked_by:
            values.booked_by && values.booked_by !== FREE_TEXT_OWNER
              ? Number(values.booked_by)
              : null,
          booked_by_name:
            values.booked_by === FREE_TEXT_OWNER ? values.booked_by_name.trim() : '',
          start_datetime: `${values.date}T${values.start_time}:00`,
          end_datetime: `${values.date}T${values.end_time}:00`,
        })
        onSuccess(t('bookings.edit.savedOccurrence'))
      }
    } catch (error) {
      const parsed = parseApiError(error)
      setServerError(parsed.detail)
      if (parsed.status === 409) void runCheck()
    } finally {
      setSaving(false)
    }
  })

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      {/* What does this edit apply to? */}
      {booking.is_recurring && (
        <div className="rounded-lg border border-violet-200 bg-violet-50 p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-violet-800">
            <Repeat size={16} />
            {t('bookings.edit.scopeHint', {
              type: t(`bookings.types.${booking.recurrence_type}`),
            })}
          </div>
          <Field label={t('bookings.edit.scope')}>
            <Select
              value={scope}
              onChange={(event) => {
                setScope(event.target.value as EditScope)
                invalidate()
              }}
            >
              <option value="occurrence">{t('bookings.edit.scopeOccurrence')}</option>
              <option value="future">{t('bookings.edit.scopeFuture')}</option>
              <option value="all">{t('bookings.edit.scopeAll')}</option>
            </Select>
          </Field>
          {isSeriesScope && (
            <p className="mt-2 text-xs text-violet-700">{t('bookings.edit.seriesTimeOnly')}</p>
          )}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('rooms.room')} required>
          <Select
            {...register('room', { required: true, valueAsNumber: true, onChange: invalidate })}
          >
            {bookableRooms.map((room) => (
              <option key={room.id} value={room.id}>
                {isArabic && room.name_ar ? room.name_ar : room.name} — {room.capacity}{' '}
                {t('rooms.people')}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label={t('bookings.attendees')}
          error={errors.expected_attendees?.message}
          hint={selectedRoom ? `${t('rooms.capacity')}: ${selectedRoom.capacity}` : undefined}
        >
          <Input
            type="number"
            min={1}
            max={selectedRoom?.capacity}
            {...register('expected_attendees', {
              valueAsNumber: true,
              min: { value: 1, message: t('common.required') },
              max: selectedRoom
                ? {
                    value: selectedRoom.capacity,
                    message: t('bookings.validation.capacityExceeded'),
                  }
                : undefined,
            })}
          />
        </Field>
      </div>

      <Field label={t('bookings.bookingTitle')} required error={errors.title?.message}>
        <Input {...register('title', { required: t('common.required') })} />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('bookings.category')}>
          <Select {...register('category')}>
            {CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {t(`bookings.categories.${category}`)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('bookings.purpose')}>
          <Input {...register('purpose')} />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('bookings.bookedBy')}>
          <Select {...register('booked_by')}>
            <option value="">{t('bookings.noTeacher')}</option>
            {teacherOptions.length > 0 && (
              <optgroup label={t('bookings.ownerRegistered')}>
                {teacherOptions.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.full_name}
                  </option>
                ))}
              </optgroup>
            )}
            {otherStaff.length > 0 && (
              <optgroup label={t('bookings.ownerOtherStaff')}>
                {otherStaff.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.full_name}
                  </option>
                ))}
              </optgroup>
            )}
            <option value={FREE_TEXT_OWNER}>{t('bookings.ownerFreeText')}</option>
          </Select>
        </Field>
        {ownerIsFreeText && (
          <Field label={t('bookings.ownerFreeTextLabel')} hint={t('bookings.ownerFreeTextHint')}>
            <Input {...register('booked_by_name')} />
          </Field>
        )}
      </div>

      {/* Date is per-occurrence; a series keeps its own recurrence dates. */}
      <div className="grid gap-4 sm:grid-cols-3">
        {!isSeriesScope && (
          <Field label={t('common.date')} required>
            <Input type="date" {...register('date', { required: true, onChange: invalidate })} />
          </Field>
        )}
        <Field label={t('bookings.startTime')} required>
          <Input
            type="time"
            {...register('start_time', { required: true, onChange: invalidate })}
          />
        </Field>
        <Field label={t('bookings.endTime')} required>
          <Input type="time" {...register('end_time', { required: true, onChange: invalidate })} />
        </Field>
      </div>

      {isSeriesScope && (
        <Field label={t('bookings.edit.conflictPolicy')}>
          <Select {...register('conflict_policy')}>
            <option value="strict">{t('bookings.edit.policyStrict')}</option>
            <option value="skip">{t('bookings.edit.policySkip')}</option>
          </Select>
        </Field>
      )}

      <Field label={t('common.notes')}>
        <Textarea {...register('notes')} />
      </Field>

      {/* Conflict report */}
      {check?.checked && (
        <div
          className={clsx(
            'rounded-lg border p-4',
            check.conflicts.length > 0
              ? 'border-amber-200 bg-amber-50'
              : 'border-emerald-200 bg-emerald-50',
          )}
        >
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
            {check.conflicts.length > 0 ? (
              <>
                <AlertTriangle size={16} className="text-amber-600" />
                <span className="text-amber-800">
                  {t('bookings.edit.conflictFound', { count: check.conflicts.length })}
                </span>
              </>
            ) : (
              <>
                <CheckCircle2 size={16} className="text-emerald-600" />
                <span className="text-emerald-800">
                  {t('bookings.edit.noConflict')}
                  {isSeriesScope
                    ? ` · ${t('bookings.edit.willMove', { count: check.affected })}`
                    : ''}
                </span>
              </>
            )}
          </div>
          {check.conflicts.length > 0 && (
            <ul className="max-h-40 space-y-1 overflow-y-auto text-xs">
              {check.conflicts.slice(0, 20).map((conflict) => (
                <li
                  key={`${conflict.id}-${conflict.start}`}
                  className="flex items-center justify-between gap-2 rounded bg-white/70 px-2 py-1 text-slate-700"
                >
                  <span className="truncate">
                    {conflict.title} · {conflict.room}
                  </span>
                  <Badge tone="red">{formatRange(conflict.start, conflict.end, i18n.language)}</Badge>
                </li>
              ))}
            </ul>
          )}
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
          loading={checking}
          icon={<CheckCircle2 size={16} />}
          onClick={() => void runCheck()}
        >
          {t('bookings.edit.checkButton')}
        </Button>
        <Button type="submit" loading={saving}>
          {t('common.save')}
        </Button>
      </div>
    </form>
  )
}
