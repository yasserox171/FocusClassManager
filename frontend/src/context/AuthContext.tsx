import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

import { SESSION_EXPIRED_EVENT, tokenStorage } from '@/services/api'
import { authService } from '@/services/authService'
import type { Role, User } from '@/types'

interface AuthContextValue {
  user: User | null
  loading: boolean
  login: (username: string, password: string) => Promise<void>
  logout: () => void
  hasRole: (...roles: Role[]) => boolean
  isAdmin: boolean
  canManageRooms: boolean
  canManageEmployees: boolean
  canManageRoom: (roomId: number) => boolean
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function bootstrap() {
      if (!tokenStorage.access) {
        setLoading(false)
        return
      }
      try {
        const profile = await authService.me()
        if (!cancelled) setUser(profile)
      } catch {
        tokenStorage.clear()
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void bootstrap()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const handler = () => setUser(null)
    window.addEventListener(SESSION_EXPIRED_EVENT, handler)
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, handler)
  }, [])

  const login = useCallback(async (username: string, password: string) => {
    const profile = await authService.login(username, password)
    setUser(profile)
  }, [])

  const logout = useCallback(() => {
    authService.logout()
    setUser(null)
  }, [])

  const value = useMemo<AuthContextValue>(() => {
    const hasRole = (...roles: Role[]) => (user ? roles.includes(user.role) : false)
    const isAdmin = user?.role === 'admin'
    return {
      user,
      loading,
      login,
      logout,
      hasRole,
      isAdmin,
      canManageRooms: isAdmin,
      canManageEmployees: isAdmin,
      canManageRoom: (roomId: number) =>
        isAdmin || (user?.managed_room_ids ?? []).includes(roomId),
    }
  }, [user, loading, login, logout])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used inside an AuthProvider')
  }
  return context
}
