import clsx from 'clsx'
import type { LucideIcon } from 'lucide-react'

type Tone = 'blue' | 'green' | 'amber' | 'red' | 'violet' | 'slate'

const TONES: Record<Tone, string> = {
  blue: 'bg-brand-50 text-brand-600',
  green: 'bg-emerald-50 text-emerald-600',
  amber: 'bg-amber-50 text-amber-600',
  red: 'bg-red-50 text-red-600',
  violet: 'bg-violet-50 text-violet-600',
  slate: 'bg-slate-100 text-slate-600',
}

export function StatCard({
  label,
  value,
  icon: Icon,
  tone = 'blue',
  hint,
}: {
  label: string
  value: number | string
  icon: LucideIcon
  tone?: Tone
  hint?: string
}) {
  return (
    <div className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-card">
      <span className={clsx('flex h-11 w-11 shrink-0 items-center justify-center rounded-lg', TONES[tone])}>
        <Icon size={20} />
      </span>
      <div className="min-w-0">
        <p className="truncate text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
        <p className="text-2xl font-bold text-slate-900">{value}</p>
        {hint && <p className="truncate text-xs text-slate-400">{hint}</p>}
      </div>
    </div>
  )
}
