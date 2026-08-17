import AsyncStorage from '@react-native-async-storage/async-storage'
import axios, { AxiosError, type AxiosInstance, type InternalAxiosRequestConfig } from 'axios'

import { API_URL } from '../config'

const ACCESS_KEY = 'faas.access'
const REFRESH_KEY = 'faas.refresh'

/**
 * The token lives in AsyncStorage, but it is also cached in memory so the
 * request interceptor stays synchronous-ish and cheap on every call.
 */
let accessToken: string | null = null

export const tokenStore = {
  async load() {
    accessToken = await AsyncStorage.getItem(ACCESS_KEY)
    return accessToken
  },
  get access() {
    return accessToken
  },
  async set(access: string, refresh?: string) {
    accessToken = access
    await AsyncStorage.setItem(ACCESS_KEY, access)
    if (refresh) await AsyncStorage.setItem(REFRESH_KEY, refresh)
  },
  async refresh() {
    return AsyncStorage.getItem(REFRESH_KEY)
  },
  async clear() {
    accessToken = null
    await AsyncStorage.multiRemove([ACCESS_KEY, REFRESH_KEY])
  },
}

export const api: AxiosInstance = axios.create({
  baseURL: API_URL,
  timeout: 20000,
  headers: { 'Content-Type': 'application/json' },
})

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`
  return config
})

/** Fired when the refresh token is dead, so the UI can drop back to guest mode. */
type Listener = () => void
const sessionExpiredListeners = new Set<Listener>()
export function onSessionExpired(listener: Listener): () => void {
  sessionExpiredListeners.add(listener)
  return () => {
    sessionExpiredListeners.delete(listener)
  }
}

let refreshing: Promise<string | null> | null = null

async function refreshAccessToken(): Promise<string | null> {
  const refresh = await tokenStore.refresh()
  if (!refresh) return null
  try {
    const { data } = await axios.post<{ access: string; refresh?: string }>(
      `${API_URL}/auth/refresh/`,
      { refresh },
      { headers: { 'Content-Type': 'application/json' }, timeout: 20000 },
    )
    await tokenStore.set(data.access, data.refresh)
    return data.access
  } catch {
    return null
  }
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as (InternalAxiosRequestConfig & { _retried?: boolean }) | undefined

    // Only a signed-in session can be refreshed. Guests legitimately get 401 on
    // writes and must not be pushed through the refresh dance.
    if (error.response?.status === 401 && original && !original._retried && accessToken) {
      original._retried = true
      refreshing = refreshing ?? refreshAccessToken()
      const token = await refreshing
      refreshing = null

      if (token) {
        original.headers.Authorization = `Bearer ${token}`
        return api(original)
      }
      await tokenStore.clear()
      sessionExpiredListeners.forEach((listener) => listener())
    }
    return Promise.reject(error)
  },
)

export interface ApiError {
  status?: number
  detail: string
  fields: Record<string, string[]>
}

/** Flattens a DRF error payload into something a screen can display. */
export function parseApiError(error: unknown): ApiError {
  if (!axios.isAxiosError(error)) return { detail: 'errors.generic', fields: {} }
  if (!error.response) return { detail: 'errors.network', fields: {} }

  const data = error.response.data as Record<string, unknown> | undefined
  const fields: Record<string, string[]> = {}
  let detail = ''

  if (data && typeof data === 'object') {
    for (const [key, value] of Object.entries(data)) {
      if (key === 'detail' && typeof value === 'string') detail = value
      else if (Array.isArray(value)) fields[key] = value.map(String)
      else if (typeof value === 'string') fields[key] = [value]
    }
  }
  if (!detail) detail = Object.values(fields)[0]?.[0] ?? 'errors.generic'
  return { status: error.response.status, detail, fields }
}

/** `{ room: 3, empty: '' }` -> `?room=3`, dropping blanks. */
export function query(params: Record<string, unknown>): string {
  const parts: string[] = []
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue
    if (Array.isArray(value)) {
      if (!value.length) continue
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(value.join(','))}`)
    } else {
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    }
  }
  return parts.length ? `?${parts.join('&')}` : ''
}
