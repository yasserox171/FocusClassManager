import type { ColumnDef } from '@tanstack/react-table'
import { addDays, startOfMonth, subDays } from 'date-fns'
import { CalendarDays, List, Plus, Repeat, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { View } from 'react-big-calendar'
import { Views } from 'react-big-calendar'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'

import { BookingCalendar } from '@/components/BookingCalendar'
import { BookingForm } from '@/components/BookingForm'
import { DataTable } from '@/components/DataTable'
import {
  Badge,
  Button,
  Card,
  ErrorState,
  Field,
  Input,
  Modal,
  PageHeader,
  Select,
  Spinner,
} from '@/components/ui'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/context/ToastContext'
import { useAsync, useDebounced } from '@/hooks/useAsync'
import { parseApiError } from '@/services/api'
import { bookingService, type DeleteScope } from '@/services/bookingService'
import { employeeService } from '@/services/employeeService'
import { roomService } from '@/services/roomService'
import type { Booking } from '@/types'
import { formatDateTime, formatRange } from '@/utils/format'

type ViewMode = 'calendar' | 'list'

export function Bookings() {
  const { t, i18n } = useTranslation()
  const toast = useToast()
  const { isAdmin } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()

  const [mode, setMode] = useState<ViewMode>('calendar')
  const [calendarDate, setCalendarDate] = useState(new Date())
  const [calendarView, setCalendarView] = useState<View>(Views.WEEK)

  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounced(search)
  const [roomFilter, setRoomFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [periodFilter, setPeriodFilter] = useState('')
  const [page, setPage] = useState(1)

  const [formOpen, setFormOpen] = useState(searchParams.get('new') === '1')
  const [initialSlot, setInitialSlot] = useState<{ start: Date; end: Date } | null>(null)
  const [selected, setSelected] = useState<Booking | null>(null)
  const [deleting, setDeleting] = useState<Booking | null>(null)
  const [deleteScope, setDeleteScope] = useState<DeleteScope>('occurrence')
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  const rooms = useAsync(() => roomService.all(), [])
  const employees = useAsync(
    () => (isAdmin ? employeeService.all() : Promise.resolve([])),
    [isAdmin],
  )
  const resourceTypes = useAsync(() => roomService.resourceTypes(), [])

  const { rangeStart, rangeEnd } = useMemo(() => {
    const anchor = startOfMonth(calendarDate)
    return {
      rangeStart: subDays(anchor, 7).toISOString(),
      rangeEnd: addDays(anchor, 45).toISOString(),
    }
  }, [calendarDate])

  const calendarBookings = useAsync(
    () =>
      mode === 'calendar'
        ? bookingService.calendar(
            rangeStart,
            rangeEnd,
            roomFilter ? [Number(roomFilter)] : undefined,
          )
        : Promise.resolve([]),
    [mode, rangeStart, rangeEnd, roomFilter, refreshKey],
  )

  const listBookings = useAsync(
    () =>
      mode === 'list'
        ? bookingService.list({
            search: debouncedSearch,
            room: roomFilter ? Number(roomFilter) : undefined,
            status: statusFilter || undefined,
            period: (periodFilter || undefined) as 'upcoming' | 'past' | 'today' | undefined,
            page,
            ordering: '-start_datetime',
          })
        : Promise.resolve(null),
    [mode, debouncedSearch, roomFilter, statusFilter, periodFilter, page, refreshKey],
  )

  // Deep link: /bookings?booking=42 opens the detail modal.
  useEffect(() => {
    const bookingId = searchParams.get('booking')
    if (!bookingId) return
    void bookingService
      .get(Number(bookingId))
      .then(setSelected)
      .catch(() => toast.error(t('errors.notFound')))
    searchParams.delete('booking')
    setSearchParams(searchParams, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  const refresh = () => setRefreshKey((value) => value + 1)

  // Writing is reserved to administrators, so this mirrors the API exactly.
  const canEdit = (_booking: Booking) => isAdmin

  const openCreate = (slot?: { start: Date; end: Date }) => {
    setInitialSlot(slot ?? null)
    setFormOpen(true)
  }

  const confirmDelete = async () => {
    if (!deleting) return
    setDeleteBusy(true)
    try {
      await bookingService.remove(deleting.id, deleteScope)
      toast.success(t('common.success'))
      setDeleting(null)
      setSelected(null)
      refresh()
    } catch (error) {
      toast.error(parseApiError(error).detail)
    } finally {
      setDeleteBusy(false)
    }
  }

  const columns = useMemo<ColumnDef<Booking, unknown>[]>(
    () => [
      {
        accessorKey: 'title',
        header: t('bookings.bookingTitle'),
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: row.original.room_detail.color }}
              aria-hidden
            />
            <div>
              <p className="font-medium text-slate-800">{row.original.title}</p>
              {row.original.purpose && (
                <p className="text-xs text-slate-500">{row.original.purpose}</p>
              )}
            </div>
          </div>
        ),
      },
      {
        accessorKey: 'room_detail.name',
        header: t('rooms.room'),
        cell: ({ row }) => row.original.room_detail.name,
      },
      {
        accessorKey: 'start_datetime',
        header: t('common.date'),
        cell: ({ row }) =>
          formatRange(row.original.start_datetime, row.original.end_datetime, i18n.language),
      },
      {
        accessorKey: 'booked_by_display',
        header: t('bookings.bookedBy'),
        cell: ({ row }) => row.original.booked_by_display || '—',
      },
      {
        id: 'type',
        header: t('bookings.recurrence'),
        cell: ({ row }) =>
          row.original.is_recurring ? (
            <Badge tone="violet">
              <Repeat size={11} />
              {t(`bookings.types.${row.original.recurrence_type}`)}
            </Badge>
          ) : (
            <Badge tone="slate">{t('bookings.oneOff')}</Badge>
          ),
      },
      {
        accessorKey: 'status',
        header: t('common.status'),
        cell: ({ row }) => (
          <Badge tone={row.original.status === 'confirmed' ? 'green' : 'red'}>
            {t(`bookings.status.${row.original.status}`)}
          </Badge>
        ),
      },
      {
        id: 'actions',
        header: t('common.actions'),
        cell: ({ row }) => (
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              className="px-2 py-1 text-xs"
              onClick={() => setSelected(row.original)}
            >
              {t('common.details')}
            </Button>
            {canEdit(row.original) && row.original.status === 'confirmed' && (
              <button
                type="button"
                onClick={() => {
                  setDeleting(row.original)
                  setDeleteScope('occurrence')
                }}
                className="rounded-lg p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                aria-label={t('common.delete')}
              >
                <Trash2 size={15} />
              </button>
            )}
          </div>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, i18n.language, isAdmin],
  )

  return (
    <div>
      <PageHeader
        title={t('bookings.title')}
        subtitle={t('bookings.subtitle')}
        action={
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border border-slate-300 bg-white p-1">
              <button
                type="button"
                onClick={() => setMode('calendar')}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition ${
                  mode === 'calendar' ? 'bg-brand-600 text-white' : 'text-slate-600'
                }`}
              >
                <CalendarDays size={14} />
                {t('bookings.calendarView')}
              </button>
              <button
                type="button"
                onClick={() => setMode('list')}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition ${
                  mode === 'list' ? 'bg-brand-600 text-white' : 'text-slate-600'
                }`}
              >
                <List size={14} />
                {t('bookings.listView')}
              </button>
            </div>
            <Button icon={<Plus size={16} />} onClick={() => openCreate()}>
              {t('bookings.newBooking')}
            </Button>
          </div>
        }
      />

      <Card className="mb-4" bodyClassName="p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {mode === 'list' && (
            <Field label={t('common.search')}>
              <Input
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value)
                  setPage(1)
                }}
                placeholder={t('bookings.filters.searchPlaceholder')}
              />
            </Field>
          )}
          <Field label={t('rooms.room')}>
            <Select
              value={roomFilter}
              onChange={(event) => {
                setRoomFilter(event.target.value)
                setPage(1)
              }}
            >
              <option value="">{t('bookings.filters.allRooms')}</option>
              {(rooms.data ?? []).map((room) => (
                <option key={room.id} value={room.id}>
                  {room.name}
                </option>
              ))}
            </Select>
          </Field>
          {mode === 'list' && (
            <>
              <Field label={t('common.status')}>
                <Select
                  value={statusFilter}
                  onChange={(event) => {
                    setStatusFilter(event.target.value)
                    setPage(1)
                  }}
                >
                  <option value="">{t('bookings.filters.allStatus')}</option>
                  <option value="confirmed">{t('bookings.status.confirmed')}</option>
                  <option value="cancelled">{t('bookings.status.cancelled')}</option>
                </Select>
              </Field>
              <Field label={t('bookings.filters.period')}>
                <Select
                  value={periodFilter}
                  onChange={(event) => {
                    setPeriodFilter(event.target.value)
                    setPage(1)
                  }}
                >
                  <option value="">{t('common.all')}</option>
                  <option value="today">{t('common.today')}</option>
                  <option value="upcoming">{t('bookings.upcoming')}</option>
                  <option value="past">{t('bookings.past')}</option>
                </Select>
              </Field>
            </>
          )}
        </div>
      </Card>

      <Card bodyClassName={mode === 'list' ? 'p-0' : 'p-3 sm:p-5'}>
        {mode === 'calendar' ? (
          <>
            {calendarBookings.loading && <Spinner />}
            {calendarBookings.error && <ErrorState message={calendarBookings.error} />}
            {calendarBookings.data && (
              <BookingCalendar
                bookings={calendarBookings.data}
                view={calendarView}
                date={calendarDate}
                onViewChange={setCalendarView}
                onDateChange={setCalendarDate}
                onSelectEvent={setSelected}
                onSelectSlot={(start, end) => openCreate({ start, end })}
                height={680}
              />
            )}
          </>
        ) : (
          <>
            {listBookings.error && <div className="p-5"><ErrorState message={listBookings.error} /></div>}
            <DataTable
              columns={columns}
              data={listBookings.data?.results ?? []}
              loading={listBookings.loading}
              page={page}
              total={listBookings.data?.count}
              onPageChange={setPage}
            />
          </>
        )}
      </Card>

      {/* Create */}
      <Modal
        open={formOpen}
        title={t('bookings.newBooking')}
        size="lg"
        onClose={() => setFormOpen(false)}
      >
        {rooms.data && resourceTypes.data ? (
          <BookingForm
            rooms={rooms.data}
            employees={employees.data ?? []}
            resourceTypes={resourceTypes.data}
            initialSlot={initialSlot}
            onSuccess={(message) => {
              toast.success(message)
              setFormOpen(false)
              refresh()
            }}
            onCancel={() => setFormOpen(false)}
          />
        ) : (
          <Spinner />
        )}
      </Modal>

      {/* Detail */}
      <Modal
        open={Boolean(selected)}
        title={selected?.title ?? ''}
        onClose={() => setSelected(null)}
      >
        {selected && (
          <div className="space-y-4 text-sm">
            <dl className="grid gap-3 sm:grid-cols-2">
              <Detail label={t('rooms.room')} value={selected.room_detail.name} />
              <Detail
                label={t('common.date')}
                value={formatRange(selected.start_datetime, selected.end_datetime, i18n.language)}
              />
              <Detail label={t('bookings.bookedBy')} value={selected.booked_by_display || '—'} />
              <Detail label={t('bookings.attendees')} value={String(selected.expected_attendees)} />
              <Detail label={t('bookings.purpose')} value={selected.purpose || '—'} />
              <Detail
                label={t('common.status')}
                value={t(`bookings.status.${selected.status}`)}
              />
              <Detail
                label={t('bookings.recurrence')}
                value={
                  selected.is_recurring
                    ? t(`bookings.types.${selected.recurrence_type}`)
                    : t('bookings.oneOff')
                }
              />
              <Detail
                label={t('common.createdBy')}
                value={formatDateTime(selected.created_at, i18n.language)}
              />
            </dl>

            {selected.required_resources_detail.length > 0 && (
              <div>
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">
                  {t('bookings.requiredResources')}
                </p>
                <div className="flex flex-wrap gap-2">
                  {selected.required_resources_detail.map((resource) => (
                    <Badge key={resource.id} tone="blue">
                      {i18n.language.startsWith('ar') ? resource.name_ar : resource.name_fr}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {selected.notes && (
              <div>
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">
                  {t('common.notes')}
                </p>
                <p className="text-slate-700">{selected.notes}</p>
              </div>
            )}

            {canEdit(selected) && selected.status === 'confirmed' && (
              <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
                <Button
                  variant="danger"
                  icon={<Trash2 size={15} />}
                  onClick={() => {
                    setDeleting(selected)
                    setDeleteScope('occurrence')
                  }}
                >
                  {t('common.delete')}
                </Button>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Delete */}
      <Modal
        open={Boolean(deleting)}
        title={t('common.delete')}
        size="sm"
        onClose={() => setDeleting(null)}
      >
        {deleting && (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">{t('bookings.deleteConfirm')}</p>
            {deleting.is_recurring && (
              <Field label={t('bookings.deleteScope')}>
                <Select
                  value={deleteScope}
                  onChange={(event) => setDeleteScope(event.target.value as DeleteScope)}
                >
                  <option value="occurrence">{t('bookings.deleteOccurrence')}</option>
                  <option value="future">{t('bookings.deleteFuture')}</option>
                  <option value="series">{t('bookings.deleteSeries')}</option>
                </Select>
              </Field>
            )}
            <div className="flex justify-end gap-3">
              <Button variant="ghost" onClick={() => setDeleting(null)}>
                {t('common.cancel')}
              </Button>
              <Button variant="danger" loading={deleteBusy} onClick={() => void confirmDelete()}>
                {t('common.confirm')}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="text-slate-800">{value}</dd>
    </div>
  )
}
