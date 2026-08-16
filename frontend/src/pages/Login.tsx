import { LogIn } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'

import { LanguageSwitcher } from '@/components/LanguageSwitcher'
import { Button, Field, Input } from '@/components/ui'
import { useAuth } from '@/context/AuthContext'
import { parseApiError } from '@/services/api'

interface LoginValues {
  username: string
  password: string
}

export function Login() {
  const { t } = useTranslation()
  const { login, user, loading } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginValues>({ defaultValues: { username: '', password: '' } })

  if (!loading && user) {
    const from = (location.state as { from?: string } | null)?.from ?? '/'
    return <Navigate to={from} replace />
  }

  const onSubmit = handleSubmit(async (values) => {
    setSubmitting(true)
    setError(null)
    try {
      await login(values.username, values.password)
      navigate('/', { replace: true })
    } catch (caught) {
      const parsed = parseApiError(caught)
      setError(parsed.status === 401 ? t('auth.invalidCredentials') : parsed.detail)
    } finally {
      setSubmitting(false)
    }
  })

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-50 via-slate-50 to-slate-100 px-4">
      <div className="w-full max-w-md">
        <div className="mb-6 flex justify-end">
          <LanguageSwitcher />
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-card">
          <div className="mb-6 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-600 text-xl font-bold text-white">
              F
            </div>
            <h1 className="text-xl font-bold text-slate-900">{t('app.fullName')}</h1>
            <p className="mt-1 text-sm text-slate-500">{t('app.center')}</p>
          </div>

          <form onSubmit={onSubmit} className="space-y-4">
            <Field label={t('auth.username')} required error={errors.username?.message}>
              <Input
                autoComplete="username"
                autoFocus
                {...register('username', { required: t('common.required') })}
              />
            </Field>
            <Field label={t('auth.password')} required error={errors.password?.message}>
              <Input
                type="password"
                autoComplete="current-password"
                {...register('password', { required: t('common.required') })}
              />
            </Field>

            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <Button type="submit" loading={submitting} icon={<LogIn size={16} />} className="w-full">
              {submitting ? t('auth.signingIn') : t('auth.signIn')}
            </Button>
          </form>
        </div>

        <p className="mt-4 text-center text-xs text-slate-400">{t('auth.subtitle')}</p>
      </div>
    </div>
  )
}
