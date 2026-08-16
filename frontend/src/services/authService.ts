import type { User } from '@/types'

import { api, tokenStorage } from './api'

interface LoginResponse {
  access: string
  refresh: string
  user: User
}

export const authService = {
  async login(username: string, password: string): Promise<User> {
    const { data } = await api.post<LoginResponse>('/auth/login/', { username, password })
    tokenStorage.set(data.access, data.refresh)
    return data.user
  },

  async me(): Promise<User> {
    const { data } = await api.get<User>('/users/me/')
    return data
  },

  async changePassword(current_password: string, new_password: string): Promise<void> {
    await api.post('/users/change-password/', { current_password, new_password })
  },

  logout(): void {
    tokenStorage.clear()
  },
}
