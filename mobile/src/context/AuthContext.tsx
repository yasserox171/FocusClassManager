import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

import { onSessionExpired, tokenStore } from '../api/client'
import { authApi } from '../api/services'
import type { User } from '../types'

interface AuthValue {
  user: User | null
  /** True while the stored session is being restored at startup. */
  loading: boolean
  isAdmin: boolean
  login: (username: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  // Restore a previous session, if any. Browsing works without one.
  useEffect(() => {
    let cancelled = false

    async function bootstrap() {
      try {
        const token = await tokenStore.load()
        if (!token) return
        const profile = await authApi.me()
        if (!cancelled) setUser(profile)
      } catch {
        await tokenStore.clear()
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void bootstrap()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => onSessionExpired(() => setUser(null)), [])

  const login = useCallback(async (username: string, password: string) => {
    const data = await authApi.login(username, password)
    await tokenStore.set(data.access, data.refresh)
    setUser(data.user)
  }, [])

  const logout = useCallback(async () => {
    await tokenStore.clear()
    setUser(null)
  }, [])

  const value = useMemo<AuthValue>(
    () => ({ user, loading, isAdmin: user?.role === 'admin', login, logout }),
    [user, loading, login, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthValue {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside an AuthProvider')
  return context
}
