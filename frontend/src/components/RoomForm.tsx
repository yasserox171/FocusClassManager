import { Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'

import { parseApiError } from '@/services/api'
import { roomService } from '@/services/roomService'
import type { ResourceCondition, ResourceType, Room, RoomStatus } from '@/types'

import { Button, Field, Input, Select, Textarea } from './ui'

interface RoomFormValues {
  name: string
  name_ar: string
  code: string
  capacity: number
  location: string
  description: string
  status: RoomStatus
  color: string
}

interface ResourceRow {
  resource_type: number
  quantity: number
  condition: ResourceCondition
  notes: string
}

const ROOM_STATUSES: RoomStatus[] = ['available', 'maintenance', 'closed']
const CONDITIONS: ResourceCondition[] = ['ok', 'damaged', 'missing']
const PALETTE = ['#2563eb', '#16a34a', '#db2777', '#f59e0b', '#7c3aed', '#dc2626', '#0891b2', '#65a30d']

export function RoomForm({
  room,
  resourceTypes,
  onSuccess,
  onCancel,
}: {
  room?: Room | null
  resourceTypes: ResourceType[]
  onSuccess: (room: Room) => void
  onCancel: () => void
}) {
  const { t, i18n } = useTranslation()
  const isArabic = i18n.language.startsWith('ar')

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<RoomFormValues>({
    defaultValues: {
      name: room?.name ?? '',
      name_ar: room?.name_ar ?? '',
      code: room?.code ?? '',
      capacity: room?.capacity ?? 20,
      location: room?.location ?? '',
      description: room?.description ?? '',
      status: room?.status ?? 'available',
      color: room?.color ?? PALETTE[0],
    },
  })

  const [resources, setResources] = useState<ResourceRow[]>(
    room?.resources.map((item) => ({
      resource_type: item.resource_type,
      quantity: item.quantity,
      condition: item.condition,
      notes: item.notes,
    })) ?? [],
  )
  const [submitting, setSubmitting] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  const color = watch('color')
  const usedTypes = new Set(resources.map((item) => item.resource_type))
  const availableTypes = resourceTypes.filter((type) => !usedTypes.has(type.id))

  const addResource = () => {
    const next = availableTypes[0]
    if (!next) return
    setResources((current) => [
      ...current,
      { resource_type: next.id, quantity: 1, condition: 'ok', notes: '' },
    ])
  }

  const updateResource = (index: number, patch: Partial<ResourceRow>) => {
    setResources((current) =>
      current.map((item, position) => (position === index ? { ...item, ...patch } : item)),
    )
  }

  const onSubmit = handleSubmit(async (values) => {
    setSubmitting(true)
    setServerError(null)
    try {
      const payload = { ...values, resources } as unknown as Partial<Room>
      const saved = room
        ? await roomService.update(room.id, payload)
        : await roomService.create(payload)
      onSuccess(saved)
    } catch (error) {
      setServerError(parseApiError(error).detail)
    } finally {
      setSubmitting(false)
    }
  })

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('rooms.name')} required error={errors.name?.message}>
          <Input {...register('name', { required: t('common.required') })} />
        </Field>
        <Field label={t('rooms.nameAr')}>
          <Input dir="rtl" {...register('name_ar')} />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label={t('rooms.code')} required error={errors.code?.message}>
          <Input
            {...register('code', {
              required: t('common.required'),
              pattern: { value: /^[-\w]+$/, message: 'a-z, 0-9, -, _' },
            })}
            disabled={Boolean(room)}
          />
        </Field>
        <Field label={t('rooms.capacity')} required error={errors.capacity?.message}>
          <Input
            type="number"
            min={1}
            {...register('capacity', {
              required: t('common.required'),
              valueAsNumber: true,
              min: { value: 1, message: t('common.required') },
            })}
          />
        </Field>
        <Field label={t('common.status')}>
          <Select {...register('status')}>
            {ROOM_STATUSES.map((status) => (
              <option key={status} value={status}>
                {t(`rooms.status.${status}`)}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field label={t('rooms.location')}>
        <Input {...register('location')} />
      </Field>

      <Field label={t('common.description')}>
        <Textarea {...register('description')} />
      </Field>

      <Field label={t('rooms.color')}>
        <div className="flex flex-wrap items-center gap-2">
          {PALETTE.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setValue('color', option)}
              style={{ backgroundColor: option }}
              className={`h-8 w-8 rounded-full transition ${
                color === option ? 'ring-2 ring-slate-900 ring-offset-2' : ''
              }`}
              aria-label={option}
            />
          ))}
          <Input type="text" className="w-28" {...register('color')} />
        </div>
      </Field>

      {/* Resources */}
      <div className="rounded-lg border border-slate-200">
        <header className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <h3 className="text-sm font-semibold text-slate-700">{t('rooms.resources')}</h3>
          <Button
            type="button"
            variant="secondary"
            icon={<Plus size={14} />}
            onClick={addResource}
            disabled={availableTypes.length === 0}
            className="px-3 py-1 text-xs"
          >
            {t('rooms.addResource')}
          </Button>
        </header>
        <div className="space-y-2 p-4">
          {resources.length === 0 && (
            <p className="text-sm text-slate-500">{t('rooms.noResources')}</p>
          )}
          {resources.map((resource, index) => {
            const type = resourceTypes.find((item) => item.id === resource.resource_type)
            return (
              <div key={`${resource.resource_type}-${index}`} className="grid gap-2 sm:grid-cols-12">
                <Select
                  className="sm:col-span-4"
                  value={resource.resource_type}
                  onChange={(event) =>
                    updateResource(index, { resource_type: Number(event.target.value) })
                  }
                >
                  {resourceTypes
                    .filter((item) => item.id === resource.resource_type || !usedTypes.has(item.id))
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {isArabic ? item.name_ar : item.name_fr}
                      </option>
                    ))}
                </Select>
                <Input
                  className="sm:col-span-2"
                  type="number"
                  min={0}
                  value={resource.quantity}
                  disabled={type ? !type.is_countable : false}
                  onChange={(event) =>
                    updateResource(index, { quantity: Number(event.target.value) })
                  }
                />
                <Select
                  className="sm:col-span-3"
                  value={resource.condition}
                  onChange={(event) =>
                    updateResource(index, { condition: event.target.value as ResourceCondition })
                  }
                >
                  {CONDITIONS.map((condition) => (
                    <option key={condition} value={condition}>
                      {t(`rooms.conditions.${condition}`)}
                    </option>
                  ))}
                </Select>
                <Input
                  className="sm:col-span-2"
                  placeholder={t('common.notes')}
                  value={resource.notes}
                  onChange={(event) => updateResource(index, { notes: event.target.value })}
                />
                <button
                  type="button"
                  onClick={() => setResources((current) => current.filter((_, i) => i !== index))}
                  className="rounded-lg p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-600 sm:col-span-1"
                  aria-label={t('common.delete')}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            )
          })}
        </div>
      </div>

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
