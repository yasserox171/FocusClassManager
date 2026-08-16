import axios, { AxiosError, type AxiosInstance, type InternalAxiosRequestConfig } from 'axios'

const BASE_URL = import.meta.env.VITE_API_URL ?? '/api'

export const TOKEN_KEY = 'faas.access'
export const REFRESH_KEY = 'faas.refresh'

export const tokenStorage = {
  get access() {
    return localStorage.getItem(TOKEN_KEY)
  },
  get refresh() {
    return localStorage.getItem(REFRESH_KEY)
  },
  set(access: string, refresh?: string) {
    localStorage.setItem(TOKEN_KEY, access)
    if (refresh) localStorage.setItem(REFRESH_KEY, refresh)
  },
  clear() {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(REFRESH_KEY)
  },
}

export const api: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
})

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = tokenStorage.access
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

/** Emitted when the refresh token is dead so the app can send the user back to /login. */
export const SESSION_EXPIRED_EVENT = 'faas:session-expired'

let refreshing: Promise<string | null> | null = null

async function refreshAccessToken(): Promise<string | null> {
  const refresh = tokenStorage.refresh
  if (!refresh) return null
  try {
    const { data } = await axios.post<{ access: string; refresh?: string }>(
      `${BASE_URL}/auth/refresh/`,
      { refresh },
      { headers: { 'Content-Type': 'application/json' } },
    )
    tokenStorage.set(data.access, data.refresh)
    return data.access
  } catch {
    return null
  }
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as InternalAxiosRequestConfig & { _retried?: boolean }

    if (error.response?.status === 401 && original && !original._retried) {
      original._retried = true
      refreshing = refreshing ?? refreshAccessToken()
      const token = await refreshing
      refreshing = null

      if (token) {
        original.headers.Authorization = `Bearer ${token}`
        return api(original)
      }
      tokenStorage.clear()
      window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT))
    }
    return Promise.reject(error)
  },
)

export interface ApiErrorShape {
  status?: number
  detail: string
  fields: Record<string, string[]>
  raw?: unknown
}

/** Flattens a DRF error payload into something a form can display. */
export function parseApiError(error: unknown): ApiErrorShape {
  if (!axios.isAxiosError(error)) {
    return { detail: 'errors.generic', fields: {} }
  }
  const response = error.response
  if (!response) {
    return { detail: 'errors.network', fields: {} }
  }
  const data = response.data as Record<string, unknown> | undefined
  const fields: Record<string, string[]> = {}
  let detail = ''

  if (data && typeof data === 'object') {
    for (const [key, value] of Object.entries(data)) {
      if (key === 'detail' && typeof value === 'string') {
        detail = value
      } else if (Array.isArray(value)) {
        fields[key] = value.map(String)
      } else if (typeof value === 'string') {
        fields[key] = [value]
      }
    }
  }

  if (!detail) {
    const first = Object.values(fields)[0]
    detail = first?.[0] ?? 'errors.generic'
  }

  return { status: response.status, detail, fields, raw: data }
}

/** Turns `{ room: 3, period: 'upcoming', empty: '' }` into a clean query string. */
export function buildQuery(params: Record<string, unknown>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue
    if (Array.isArray(value)) {
      if (value.length === 0) continue
      search.set(key, value.join(','))
    } else {
      search.set(key, String(value))
    }
  }
  const query = search.toString()
  return query ? `?${query}` : ''
}
