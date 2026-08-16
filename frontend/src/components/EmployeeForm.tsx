import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'

import { parseApiError } from '@/services/api'
import { employeeService } from '@/services/employeeService'
import type { Department, Employee, Role, Room } from '@/types'

import { Button, Field, Input, Select, Textarea } from './ui'

interface EmployeeFormValues {
  full_name: string
  email: string
  phone: string
  role: Role
  department: string
  is_active: boolean
  notes: string
}

const ROLES: Role[] = ['admin', 'department_manager', 'room_manager', 'staff']

export function EmployeeForm({
  employee,
  rooms,
  departments,
  onSuccess,
  onCancel,
}: {
  employee?: Employee | null
  rooms: Room[]
  departments: Department[]
  onSuccess: (employee: Employee) => void
  onCancel: () => void
}) {
  const { t, i18n } = useTranslation()
  const isArabic = i18n.language.startsWith('ar')

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<EmployeeFormValues>({
    defaultValues: {
      full_name: employee?.full_name ?? '',
      email: employee?.email ?? '',
      phone: employee?.phone ?? '',
      role: employee?.role ?? 'staff',
      department: employee?.department ? String(employee.department) : '',
      is_active: employee?.is_active ?? true,
      notes: employee?.notes ?? '',
    },
  })

  const [managedRooms, setManagedRooms] = useState<number[]>(employee?.managed_rooms ?? [])
  const [submitting, setSubmitting] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  const role = watch('role')

  const toggleRoom = (id: number) => {
    setManagedRooms((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    )
  }

  const onSubmit = handleSubmit(async (values) => {
    setSubmitting(true)
    setServerError(null)
    try {
      const payload: Partial<Employee> = {
        full_name: values.full_name,
        email: values.email,
        phone: values.phone,
        role: values.role,
        department: values.department ? Number(values.department) : null,
        is_active: values.is_active,
        notes: values.notes,
        managed_rooms: managedRooms,
      }
      const saved = employee
        ? await employeeService.update(employee.id, payload)
        : await employeeService.create(payload)
      onSuccess(saved)
    } catch (error) {
      setServerError(parseApiError(error).detail)
    } finally {
      setSubmitting(false)
    }
  })

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <Field label={t('employees.fullName')} required error={errors.full_name?.message}>
        <Input {...register('full_name', { required: t('common.required') })} />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('employees.email')} error={errors.email?.message}>
          <Input type="email" {...register('email')} />
        </Field>
        <Field label={t('employees.phone')}>
          <Input type="tel" {...register('phone')} />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('employees.role')} hint={t(`employees.permissions.${role}`)}>
          <Select {...register('role')}>
            {ROLES.map((item) => (
              <option key={item} value={item}>
                {t(`employees.roles.${item}`)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('employees.department')}>
          <Select {...register('department')}>
            <option value="">—</option>
            {departments.map((department) => (
              <option key={department.id} value={department.id}>
                {isArabic && department.name_ar ? department.name_ar : department.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field label={t('employees.managedRooms')}>
        <div className="flex flex-wrap gap-2">
          {rooms.map((room) => {
            const active = managedRooms.includes(room.id)
            return (
              <button
                key={room.id}
                type="button"
                onClick={() => toggleRoom(room.id)}
                className={`flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium transition ${
                  active
                    ? 'border-brand-500 bg-brand-50 text-brand-700'
                    : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: room.color }}
                  aria-hidden
                />
                {isArabic && room.name_ar ? room.name_ar : room.name}
              </button>
            )
          })}
        </div>
      </Field>

      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" className="h-4 w-4 rounded border-slate-300" {...register('is_active')} />
        {t('employees.active')}
      </label>

      <Field label={t('common.notes')}>
        <Textarea {...register('notes')} />
      </Field>

      {serverError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {serverError}
        </div>
      )}

      <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
        <Button type="button" variant="ghost" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" loading={submitting}>
          {t('common.save')}
        </Button>
      </div>
    </form>
  )
}
