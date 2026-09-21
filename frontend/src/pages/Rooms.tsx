import type { ColumnDef } from '@tanstack/react-table'
import { AlertTriangle, Pencil, Plus, Trash2, Wrench } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { DataTable } from '@/components/DataTable'
import { RoomForm } from '@/components/RoomForm'
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
  Textarea,
} from '@/components/ui'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/context/ToastContext'
import { useAsync, useDebounced } from '@/hooks/useAsync'
import { parseApiError } from '@/services/api'
import { roomService } from '@/services/roomService'
import type { Room, RoomStatus } from '@/types'

const STATUS_TONES: Record<RoomStatus, 'green' | 'amber' | 'red'> = {
  available: 'green',
  maintenance: 'amber',
  closed: 'red',
}

export function Rooms() {
  const { t, i18n } = useTranslation()
  const toast = useToast()
  const { isAdmin } = useAuth()
  const isArabic = i18n.language.startsWith('ar')

  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounced(search)
  const [statusFilter, setStatusFilter] = useState('')
  const [minCapacity, setMinCapacity] = useState('')
  const [page, setPage] = useState(1)
  const [refreshKey, setRefreshKey] = useState(0)

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Room | null>(null)
  const [deleting, setDeleting] = useState<Room | null>(null)
  const [issueRoom, setIssueRoom] = useState<Room | null>(null)
  const [issueText, setIssueText] = useState('')
  const [busy, setBusy] = useState(false)

  const rooms = useAsync(
    () =>
      roomService.list({
        search: debouncedSearch,
        status: statusFilter || undefined,
        min_capacity: minCapacity ? Number(minCapacity) : undefined,
        page,
      }),
    [debouncedSearch, statusFilter, minCapacity, page, refreshKey],
  )
  const resourceTypes = useAsync(() => roomService.resourceTypes(), [])

  const refresh = () => setRefreshKey((value) => value + 1)

  const handleDelete = async () => {
    if (!deleting) return
    setBusy(true)
    try {
      await roomService.remove(deleting.id)
      toast.success(t('common.success'))
      setDeleting(null)
      refresh()
    } catch (error) {
      toast.error(parseApiError(error).detail)
    } finally {
      setBusy(false)
    }
  }

  const submitIssue = async () => {
    if (!issueRoom || !issueText.trim()) return
    setBusy(true)
    try {
      await roomService.reportIssue({ room: issueRoom.id, description: issueText.trim() })
      toast.success(t('common.success'))
      setIssueRoom(null)
      setIssueText('')
      refresh()
    } catch (error) {
      toast.error(parseApiError(error).detail)
    } finally {
      setBusy(false)
    }
  }

  const columns = useMemo<ColumnDef<Room, unknown>[]>(
    () => [
      {
        accessorKey: 'name',
        header: t('rooms.name'),
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <span
              className="h-3 w-3 shrink-0 rounded-full"
              style={{ backgroundColor: row.original.color }}
              aria-hidden
            />
            <div>
              <p className="font-medium text-slate-800">
                {isArabic && row.original.name_ar ? row.original.name_ar : row.original.name}
              </p>
              <p className="text-xs text-slate-500">{row.original.code}</p>
            </div>
          </div>
        ),
      },
      {
        accessorKey: 'capacity',
        header: t('rooms.capacity'),
        cell: ({ row }) => `${row.original.capacity} ${t('rooms.people')}`,
      },
      {
        accessorKey: 'location',
        header: t('rooms.location'),
        cell: ({ row }) => row.original.location || '—',
      },
      {
        id: 'resources',
        header: t('rooms.resources'),
        cell: ({ row }) => (
          <div className="flex max-w-xs flex-wrap gap-1">
            {row.original.resources.slice(0, 4).map((resource) => (
              <Badge key={resource.id} tone={resource.condition === 'ok' ? 'slate' : 'amber'}>
                {isArabic
                  ? resource.resource_type_detail?.name_ar
                  : resource.resource_type_detail?.name_fr}
                {resource.resource_type_detail?.is_countable ? ` ×${resource.quantity}` : ''}
              </Badge>
            ))}
            {row.original.resources.length > 4 && (
              <Badge tone="slate">+{row.original.resources.length - 4}</Badge>
            )}
          </div>
        ),
      },
      {
        accessorKey: 'status',
        header: t('common.status'),
        cell: ({ row }) => (
          <div className="flex flex-col gap-1">
            <Badge tone={STATUS_TONES[row.original.status]}>
              {t(`rooms.status.${row.original.status}`)}
            </Badge>
            {row.original.open_issues_count > 0 && (
              <span className="inline-flex items-center gap-1 text-xs text-amber-700">
                <AlertTriangle size={11} />
                {row.original.open_issues_count} {t('rooms.openIssues')}
              </span>
            )}
          </div>
        ),
      },
      {
        id: 'actions',
        header: t('common.actions'),
        cell: ({ row }) => (
          <div className="flex items-center gap-1">
            {isAdmin && (
              <button
                type="button"
                onClick={() => setIssueRoom(row.original)}
                className="rounded-lg p-1.5 text-slate-400 transition hover:bg-amber-50 hover:text-amber-600"
                aria-label={t('rooms.issues.report')}
                title={t('rooms.issues.report')}
              >
                <Wrench size={15} />
              </button>
            )}
            {isAdmin && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setEditing(row.original)
                    setFormOpen(true)
                  }}
                  className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                  aria-label={t('common.edit')}
                >
                  <Pencil size={15} />
                </button>
                <button
                  type="button"
                  onClick={() => setDeleting(row.original)}
                  className="rounded-lg p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                  aria-label={t('common.delete')}
                >
                  <Trash2 size={15} />
                </button>
              </>
            )}
          </div>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, isArabic, isAdmin],
  )

  return (
    <div>
      <PageHeader
        title={t('rooms.title')}
        subtitle={t('rooms.subtitle')}
        action={
          isAdmin && (
            <Button
              icon={<Plus size={16} />}
              onClick={() => {
                setEditing(null)
                setFormOpen(true)
              }}
            >
              {t('rooms.addRoom')}
            </Button>
          )
        }
      />

      <Card className="mb-4" bodyClassName="p-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label={t('common.search')}>
            <Input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value)
                setPage(1)
              }}
              placeholder={t('rooms.filters.searchPlaceholder')}
            />
          </Field>
          <Field label={t('common.status')}>
            <Select
              value={statusFilter}
              onChange={(event) => {
                setStatusFilter(event.target.value)
                setPage(1)
              }}
            >
              <option value="">{t('common.all')}</option>
              <option value="available">{t('rooms.status.available')}</option>
              <option value="maintenance">{t('rooms.status.maintenance')}</option>
              <option value="closed">{t('rooms.status.closed')}</option>
            </Select>
          </Field>
          <Field label={t('rooms.filters.minCapacity')}>
            <Input
              type="number"
              min={0}
              value={minCapacity}
              onChange={(event) => {
                setMinCapacity(event.target.value)
                setPage(1)
              }}
            />
          </Field>
        </div>
      </Card>

      <Card bodyClassName="p-0">
        {rooms.error && <div className="p-5"><ErrorState message={rooms.error} /></div>}
        <DataTable
          columns={columns}
          data={rooms.data?.results ?? []}
          loading={rooms.loading}
          page={page}
          total={rooms.data?.count}
          onPageChange={setPage}
        />
      </Card>

      <Modal
        open={formOpen}
        title={editing ? t('rooms.editRoom') : t('rooms.addRoom')}
        size="lg"
        onClose={() => setFormOpen(false)}
      >
        {resourceTypes.data && (
          <RoomForm
            room={editing}
            resourceTypes={resourceTypes.data}
            onSuccess={() => {
              toast.success(t('common.success'))
              setFormOpen(false)
              refresh()
            }}
            onCancel={() => setFormOpen(false)}
          />
        )}
      </Modal>

      <Modal
        open={Boolean(deleting)}
        title={t('rooms.deleteRoom')}
        size="sm"
        onClose={() => setDeleting(null)}
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            {t('rooms.deleteConfirm', { name: deleting?.name ?? '' })}
          </p>
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setDeleting(null)}>
              {t('common.cancel')}
            </Button>
            <Button variant="danger" loading={busy} onClick={() => void handleDelete()}>
              {t('common.confirm')}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={Boolean(issueRoom)}
        title={t('rooms.issues.report')}
        size="sm"
        onClose={() => setIssueRoom(null)}
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">{issueRoom?.name}</p>
          <Field label={t('rooms.issues.description')} required>
            <Textarea value={issueText} onChange={(event) => setIssueText(event.target.value)} />
          </Field>
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setIssueRoom(null)}>
              {t('common.cancel')}
            </Button>
            <Button loading={busy} disabled={!issueText.trim()} onClick={() => void submitIssue()}>
              {t('common.save')}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
