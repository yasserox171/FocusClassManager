import { useTranslation } from 'react-i18next'
import { Link, Route, Routes } from 'react-router-dom'
import type { ReactElement } from 'react'

import { Layout } from '@/components/Layout'
import { Spinner } from '@/components/ui'
import { useAuth } from '@/context/AuthContext'
import { Analytics } from '@/pages/Analytics'
import { Bookings } from '@/pages/Bookings'
import { Dashboard } from '@/pages/Dashboard'
import { Employees } from '@/pages/Employees'
import { Login } from '@/pages/Login'
import { Rooms } from '@/pages/Rooms'

/**
 * The centre's data is public in read-only, so no route requires an account.
 * We still wait for the session bootstrap to settle before rendering, otherwise
 * an administrator would see the page flash without its action buttons while
 * the stored token is being verified.
 */
function AppShell({ children }: { children: ReactElement }) {
  const { loading } = useAuth()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner />
      </div>
    )
  }
  return children
}

function NotFound() {
  const { t } = useTranslation()
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
      <p className="text-5xl font-bold text-slate-300">404</p>
      <p className="text-slate-600">{t('errors.pageNotFound')}</p>
      <Link to="/" className="text-sm font-medium text-brand-600 hover:underline">
        {t('errors.backHome')}
      </Link>
    </div>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        element={
          <AppShell>
            <Layout />
          </AppShell>
        }
      >
        <Route path="/" element={<Dashboard />} />
        <Route path="/bookings" element={<Bookings />} />
        <Route path="/rooms" element={<Rooms />} />
        <Route path="/employees" element={<Employees />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}
