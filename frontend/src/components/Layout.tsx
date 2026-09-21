import clsx from 'clsx'
import {
  CalendarDays,
  DoorOpen,
  LayoutDashboard,
  LogIn,
  LogOut,
  Menu,
  X,
} from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'

import { useAuth } from '@/context/AuthContext'

import { LanguageSwitcher } from './LanguageSwitcher'
import { NotificationBell } from './NotificationBell'

const NAV_ITEMS = [
  { to: '/', key: 'nav.dashboard', icon: LayoutDashboard, end: true },
  { to: '/bookings', key: 'nav.bookings', icon: CalendarDays, end: false },
  { to: '/rooms', key: 'nav.rooms', icon: DoorOpen, end: false },
]

export function Layout() {
  const { t } = useTranslation()
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [mobileOpen, setMobileOpen] = useState(false)

  const visibleItems = NAV_ITEMS

  const handleLogout = () => {
    logout()
    navigate('/')
  }

  /** Signed in: profile + sign out. Anonymous visitor: a link to sign in. */
  const accountBox = user ? (
    <>
      <div className="mb-2 px-3 py-2">
        <p className="truncate text-sm font-medium text-slate-800">{user.full_name}</p>
        <p className="text-xs text-slate-500">{t(`employees.roles.${user.role}`)}</p>
      </div>
      <button
        type="button"
        onClick={handleLogout}
        className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-red-50 hover:text-red-700"
      >
        <LogOut size={18} />
        {t('nav.logout')}
      </button>
    </>
  ) : (
    <>
      <p className="mb-2 px-3 text-xs text-slate-500">{t('nav.readOnlyNotice')}</p>
      <NavLink
        to="/login"
        onClick={() => setMobileOpen(false)}
        className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-brand-50 hover:text-brand-700"
      >
        <LogIn size={18} />
        {t('nav.login')}
      </NavLink>
    </>
  )

  const navigation = (
    <nav className="flex flex-1 flex-col gap-1 p-3">
      {visibleItems.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          onClick={() => setMobileOpen(false)}
          className={({ isActive }) =>
            clsx(
              'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition',
              isActive
                ? 'bg-brand-600 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
            )
          }
        >
          <item.icon size={18} />
          <span>{t(item.key)}</span>
        </NavLink>
      ))}
    </nav>
  )

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Sidebar - desktop */}
      <aside className="fixed inset-y-0 start-0 z-30 hidden w-64 flex-col border-e border-slate-200 bg-white lg:flex">
        <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 font-bold text-white">
            F
          </div>
          <div>
            <p className="text-sm font-bold text-slate-900">{t('app.name')}</p>
            <p className="text-xs text-slate-500">{t('app.center')}</p>
          </div>
        </div>
        {navigation}
        <div className="border-t border-slate-100 p-3">{accountBox}</div>
      </aside>

      {/* Sidebar - mobile */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-slate-900/50"
            onClick={() => setMobileOpen(false)}
            aria-hidden
          />
          <aside className="absolute inset-y-0 start-0 flex w-64 flex-col bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <p className="text-sm font-bold text-slate-900">{t('app.name')}</p>
              <button type="button" onClick={() => setMobileOpen(false)} aria-label="close">
                <X size={18} className="text-slate-500" />
              </button>
            </div>
            {navigation}
            <div className="border-t border-slate-100 p-3">{accountBox}</div>
          </aside>
        </div>
      )}

      <div className="lg:ps-64">
        <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur sm:px-6">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="rounded-lg p-2 text-slate-600 transition hover:bg-slate-100 lg:hidden"
            aria-label="menu"
          >
            <Menu size={20} />
          </button>
          <p className="hidden text-sm font-medium text-slate-500 sm:block">{t('app.fullName')}</p>
          <div className="flex items-center gap-2">
            <NotificationBell />
            <LanguageSwitcher />
          </div>
        </header>

        <main className="px-4 py-6 sm:px-6 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
