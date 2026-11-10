import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'

import { parseApiError } from '@/services/api'
import { employeeService } from '@/services/employeeService'
import type { Department, Employee } from '@/types'

import { Button, Field, Input, Select, Textarea } from './ui'

interface TeacherFormValues {
  full_name: string
  email: string
  phone: string
  department: string
  is_active: boolean
  notes: string
}

/**
 * A teacher is an ``Employee`` whose role is ``teacher``; the role is set here
 * rather than asked for, so the page stays a simple "add a teacher" form.
 */
export function TeacherForm({
  teacher,
  departments,
  onSuccess,
  onCancel,
}: {
  teacher?: Employee | null
  departments: Department[]
  onSuccess: (teacher: Employee) => void
  onCancel: () => void
}) {
  const { t, i18n } = useTranslation()
  const isArabic = i18n.language.startsWith('ar')

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<TeacherFormValues>({
    defaultValues: {
      full_name: teacher?.full_name ?? '',
      email: teacher?.email ?? '',
      phone: teacher?.phone ?? '',
      department: teacher?.department ? String(teacher.department) : '',
      is_active: teacher?.is_active ?? true,
      notes: teacher?.notes ?? '',
    },
  })

  const [submitting, setSubmitting] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  const onSubmit = handleSubmit(async (values) => {
    setSubmitting(true)
    setServerError(null)
    try {
      const payload: Partial<Employee> = {
        full_name: values.full_name,
        email: values.email,
        phone: values.phone,
        role: 'teacher',
        department: values.department ? Number(values.department) : null,
        is_active: values.is_active,
        notes: values.notes,
      }
      const saved = teacher
        ? await employeeService.update(teacher.id, payload)
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
      <Field label={t('teachers.fullName')} required error={errors.full_name?.message}>
        <Input autoFocus {...register('full_name', { required: t('common.required') })} />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('teachers.phone')}>
          <Input type="tel" dir="ltr" {...register('phone')} />
        </Field>
        <Field label={t('teachers.email')}>
          <Input type="email" dir="ltr" {...register('email')} />
        </Field>
      </div>

      <Field label={t('teachers.department')} hint={t('teachers.subject')}>
        <Select {...register('department')}>
          <option value="">—</option>
          {departments.map((department) => (
            <option key={department.id} value={department.id}>
              {isArabic && department.name_ar ? department.name_ar : department.name}
            </option>
          ))}
        </Select>
      </Field>

      <Field label={t('common.notes')}>
        <Textarea {...register('notes')} />
      </Field>

      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" className="h-4 w-4 rounded border-slate-300" {...register('is_active')} />
        {t('teachers.active')}
      </label>

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
