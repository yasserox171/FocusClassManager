import type { ColumnDef } from '@tanstack/react-table'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { DataTable } from '@/components/DataTable'
import { EmployeeForm } from '@/components/EmployeeForm'
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
} from '@/components/ui'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/context/ToastContext'
import { useAsync, useDebounced } from '@/hooks/useAsync'
import { parseApiError } from '@/services/api'
import { employeeService } from '@/services/employeeService'
import { roomService } from '@/services/roomService'
import type { Employee, Role } from '@/types'

const ROLE_TONES: Record<Role, 'violet' | 'blue' | 'amber' | 'slate'> = {
  admin: 'violet',
  department_manager: 'blue',
  room_manager: 'amber',
  staff: 'slate',
}

export function Employees() {
  const { t } = useTranslation()
  const toast = useToast()
  const { isAdmin } = useAuth()

  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounced(search)
  const [roleFilter, setRoleFilter] = useState('')
  const [page, setPage] = useState(1)
  const [refreshKey, setRefreshKey] = useState(0)

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Employee | null>(null)
  const [deleting, setDeleting] = useState<Employee | null>(null)
  const [busy, setBusy] = useState(false)

  const employees = useAsync(
    () =>
      employeeService.list({
        search: debouncedSearch,
        role: roleFilter || undefined,
        page,
      }),
    [debouncedSearch, roleFilter, page, refreshKey],
  )
  const rooms = useAsync(() => roomService.all(), [])
  const departments = useAsync(() => employeeService.departments(), [])

  const refresh = () => setRefreshKey((value) => value + 1)

  const handleDelete = async () => {
    if (!deleting) return
    setBusy(true)
    try {
      await employeeService.remove(deleting.id)
      toast.success(t('common.success'))
      setDeleting(null)
      refresh()
    } catch (error) {
      toast.error(parseApiError(error).detail)
    } finally {
      setBusy(false)
    }
  }

  const columns = useMemo<ColumnDef<Employee, unknown>[]>(
    () => [
      {
        accessorKey: 'full_name',
        header: t('employees.fullName'),
        cell: ({ row }) => (
          <div>
            <p className="font-medium text-slate-800">{row.original.full_name}</p>
            {row.original.username && (
              <p className="text-xs text-slate-500">@{row.original.username}</p>
            )}
          </div>
        ),
      },
      {
        accessorKey: 'email',
        header: t('employees.email'),
        cell: ({ row }) => row.original.email || '—',
      },
      {
        accessorKey: 'phone',
        header: t('employees.phone'),
        cell: ({ row }) => row.original.phone || '—',
      },
      {
        accessorKey: 'role',
        header: t('employees.role'),
        cell: ({ row }) => (
          <Badge tone={ROLE_TONES[row.original.role]}>
            {t(`employees.roles.${row.original.role}`)}
          </Badge>
        ),
      },
      {
        id: 'rooms',
        header: t('employees.managedRooms'),
        cell: ({ row }) => (
          <div className="flex max-w-xs flex-wrap gap-1">
            {row.original.managed_rooms_detail.length === 0 && <span>—</span>}
            {row.original.managed_rooms_detail.map((room) => (
              <Badge key={room.id} tone="slate">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: room.color }}
                  aria-hidden
                />
                {room.name}
              </Badge>
            ))}
          </div>
        ),
      },
      {
        accessorKey: 'is_active',
        header: t('common.status'),
        cell: ({ row }) => (
          <Badge tone={row.original.is_active ? 'green' : 'slate'}>
            {row.original.is_active ? t('employees.active') : t('employees.inactive')}
          </Badge>
        ),
      },
      {
        id: 'actions',
        header: t('common.actions'),
        cell: ({ row }) =>
          isAdmin ? (
            <div className="flex items-center gap-1">
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
            </div>
          ) : null,
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, isAdmin],
  )

  return (
    <div>
      <PageHeader
        title={t('employees.title')}
        subtitle={t('employees.subtitle')}
        action={
          isAdmin && (
            <Button
              icon={<Plus size={16} />}
              onClick={() => {
                setEditing(null)
                setFormOpen(true)
              }}
            >
              {t('employees.addEmployee')}
            </Button>
          )
        }
      />

      <Card className="mb-4" bodyClassName="p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('common.search')}>
            <Input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value)
                setPage(1)
              }}
            />
          </Field>
          <Field label={t('employees.role')}>
            <Select
              value={roleFilter}
              onChange={(event) => {
                setRoleFilter(event.target.value)
                setPage(1)
              }}
            >
              <option value="">{t('common.all')}</option>
              <option value="admin">{t('employees.roles.admin')}</option>
              <option value="department_manager">{t('employees.roles.department_manager')}</option>
              <option value="room_manager">{t('employees.roles.room_manager')}</option>
              <option value="staff">{t('employees.roles.staff')}</option>
            </Select>
          </Field>
        </div>
      </Card>

      <Card bodyClassName="p-0">
        {employees.error && <div className="p-5"><ErrorState message={employees.error} /></div>}
        <DataTable
          columns={columns}
          data={employees.data?.results ?? []}
          loading={employees.loading}
          page={page}
          total={employees.data?.count}
          onPageChange={setPage}
        />
      </Card>

      <Modal
        open={formOpen}
        title={editing ? t('employees.editEmployee') : t('employees.addEmployee')}
        onClose={() => setFormOpen(false)}
      >
        {rooms.data && departments.data && (
          <EmployeeForm
            employee={editing}
            rooms={rooms.data}
            departments={departments.data}
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
        title={t('common.delete')}
        size="sm"
        onClose={() => setDeleting(null)}
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            {t('employees.deleteConfirm', { name: deleting?.full_name ?? '' })}
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
    </div>
  )
}
