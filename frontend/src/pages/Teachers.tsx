import type { ColumnDef } from '@tanstack/react-table'
import { CalendarDays, GraduationCap, Pencil, Plus, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'

import { DataTable } from '@/components/DataTable'
import { TeacherForm } from '@/components/TeacherForm'
import {
  Badge,
  Button,
  Card,
  ErrorState,
  Field,
  Input,
  Modal,
  PageHeader,
} from '@/components/ui'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/context/ToastContext'
import { useAsync, useDebounced } from '@/hooks/useAsync'
import { parseApiError } from '@/services/api'
import { employeeService } from '@/services/employeeService'
import type { Employee } from '@/types'

export function Teachers() {
  const { t } = useTranslation()
  const toast = useToast()
  const { isAdmin } = useAuth()
  const navigate = useNavigate()

  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounced(search)
  const [page, setPage] = useState(1)
  const [refreshKey, setRefreshKey] = useState(0)

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Employee | null>(null)
  const [deleting, setDeleting] = useState<Employee | null>(null)
  const [busy, setBusy] = useState(false)

  const teachers = useAsync(
    () => employeeService.list({ role: 'teacher', search: debouncedSearch, page }),
    [debouncedSearch, page, refreshKey],
  )
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
        header: t('teachers.fullName'),
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600">
              <GraduationCap size={15} />
            </span>
            <div>
              <p className="font-medium text-slate-800">{row.original.full_name}</p>
              {row.original.department_name && (
                <p className="text-xs text-slate-500">{row.original.department_name}</p>
              )}
            </div>
          </div>
        ),
      },
      {
        accessorKey: 'phone',
        header: t('teachers.phone'),
        cell: ({ row }) => (
          <span dir="ltr" className="text-slate-700">
            {row.original.phone || '—'}
          </span>
        ),
      },
      {
        accessorKey: 'email',
        header: t('teachers.email'),
        cell: ({ row }) => (
          <span dir="ltr" className="text-slate-700">
            {row.original.email || '—'}
          </span>
        ),
      },
      {
        accessorKey: 'is_active',
        header: t('common.status'),
        cell: ({ row }) => (
          <Badge tone={row.original.is_active ? 'green' : 'slate'}>
            {row.original.is_active ? t('teachers.active') : t('teachers.inactive')}
          </Badge>
        ),
      },
      {
        id: 'actions',
        header: t('common.actions'),
        cell: ({ row }) => (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => navigate(`/?teacher=${row.original.id}`)}
              className="rounded-lg p-1.5 text-slate-400 transition hover:bg-brand-50 hover:text-brand-600"
              aria-label={t('teachers.viewBookings')}
              title={t('teachers.viewBookings')}
            >
              <CalendarDays size={15} />
            </button>
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
    [t, isAdmin],
  )

  return (
    <div>
      <PageHeader
        title={t('teachers.title')}
        subtitle={t('teachers.subtitle')}
        action={
          isAdmin ? (
            <Button
              icon={<Plus size={16} />}
              onClick={() => {
                setEditing(null)
                setFormOpen(true)
              }}
            >
              {t('teachers.addTeacher')}
            </Button>
          ) : undefined
        }
      />

      {!isAdmin && (
        <p className="mb-4 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500">
          {t('teachers.loginToManage')}
        </p>
      )}

      <Card className="mb-4" bodyClassName="p-4">
        <Field label={t('common.search')} className="sm:max-w-sm">
          <Input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value)
              setPage(1)
            }}
            placeholder={t('teachers.searchPlaceholder')}
          />
        </Field>
      </Card>

      <Card bodyClassName="p-0">
        {teachers.error && (
          <div className="p-5">
            <ErrorState message={teachers.error} />
          </div>
        )}
        <DataTable
          columns={columns}
          data={teachers.data?.results ?? []}
          loading={teachers.loading}
          emptyMessage={t('teachers.empty')}
          page={page}
          total={teachers.data?.count}
          onPageChange={setPage}
        />
      </Card>

      <Modal
        open={formOpen}
        title={editing ? t('teachers.editTeacher') : t('teachers.addTeacher')}
        onClose={() => setFormOpen(false)}
      >
        <TeacherForm
          teacher={editing}
          departments={departments.data ?? []}
          onSuccess={() => {
            toast.success(t('common.success'))
            setFormOpen(false)
            refresh()
          }}
          onCancel={() => setFormOpen(false)}
        />
      </Modal>

      <Modal
        open={Boolean(deleting)}
        title={t('common.delete')}
        size="sm"
        onClose={() => setDeleting(null)}
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            {t('teachers.deleteConfirm', { name: deleting?.full_name ?? '' })}
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
