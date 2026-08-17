import { api, query } from './client'
import type {
  Alert,
  Booking,
  DashboardSummary,
  Department,
  Employee,
  Paginated,
  ResourceUsageResponse,
  Room,
  RoomAvailability,
  RoomUsageResponse,
  TimelineResponse,
  UsageStats,
  User,
} from '../types'

/* -- auth ---------------------------------------------------------------- */

export const authApi = {
  async login(username: string, password: string) {
    const { data } = await api.post<{ access: string; refresh: string; user: User }>(
      '/auth/login/',
      { username, password },
    )
    return data
  },
  async me() {
    const { data } = await api.get<User>('/users/me/')
    return data
  },
}

/* -- rooms --------------------------------------------------------------- */

export const roomApi = {
  async list(params: Record<string, unknown> = {}) {
    const { data } = await api.get<Paginated<Room>>(`/rooms/${query({ page_size: 100, ...params })}`)
    return data
  },
  async get(id: number) {
    const { data } = await api.get<Room>(`/rooms/${id}/`)
    return data
  },
  /** Free/busy for a slot; `start` and `end` are ISO 8601 and both required. */
  async availability(start: string, end: string) {
    const { data } = await api.get<RoomAvailability[]>(`/rooms/available/${query({ start, end })}`)
    return data
  },
  async remove(id: number) {
    await api.delete(`/rooms/${id}/`)
  },
}

/* -- bookings ------------------------------------------------------------ */

export const bookingApi = {
  async list(params: Record<string, unknown> = {}) {
    const { data } = await api.get<Paginated<Booking>>(`/bookings/${query(params)}`)
    return data
  },
  async get(id: number) {
    const { data } = await api.get<Booking>(`/bookings/${id}/`)
    return data
  },
  /**
   * `upcoming` is paginated like the main list (it honours `page_size`, not
   * `limit`), so unwrap `results` rather than expecting a bare array.
   */
  async upcoming(count = 10) {
    const { data } = await api.get<Paginated<Booking> | Booking[]>(
      `/bookings/upcoming/${query({ page_size: count })}`,
    )
    return Array.isArray(data) ? data : data.results
  },
  async calendar(start: string, end: string) {
    const { data } = await api.get<Booking[]>(`/bookings/calendar/${query({ start, end })}`)
    return Array.isArray(data) ? data : []
  },
  /** Cancels by default; `scope` handles a recurring series. */
  async cancel(id: number, scope: 'occurrence' | 'future' | 'series' = 'occurrence') {
    await api.delete(`/bookings/${id}/${query({ scope })}`)
  },
}

/* -- directory ----------------------------------------------------------- */

export const employeeApi = {
  async list(params: Record<string, unknown> = {}) {
    const { data } = await api.get<Paginated<Employee>>(
      `/employees/${query({ page_size: 100, ...params })}`,
    )
    return data
  },
}

export const departmentApi = {
  async list() {
    const { data } = await api.get<Department[] | Paginated<Department>>('/departments/')
    return Array.isArray(data) ? data : data.results
  },
}

/* -- statistics and alerts ----------------------------------------------- */

export const analyticsApi = {
  async summary() {
    const { data } = await api.get<DashboardSummary>('/analytics/summary/')
    return data
  },
  async roomUsage(params: Record<string, unknown> = {}) {
    const { data } = await api.get<RoomUsageResponse>(`/analytics/room-usage/${query(params)}`)
    return data
  },
  async peakHours(params: Record<string, unknown> = {}) {
    const { data } = await api.get<UsageStats>(`/analytics/peak-hours/${query(params)}`)
    return data
  },
  async timeline(params: Record<string, unknown> = {}) {
    const { data } = await api.get<TimelineResponse>(`/analytics/timeline/${query(params)}`)
    return data
  },
  async resources(params: Record<string, unknown> = {}) {
    const { data } = await api.get<ResourceUsageResponse>(`/analytics/resources/${query(params)}`)
    return data
  },
}

export const alertApi = {
  async list(reminderHours = 24) {
    const { data } = await api.get<Alert[]>(
      `/notifications/alerts/${query({ reminder_hours: reminderHours })}`,
    )
    return Array.isArray(data) ? data : []
  },
}
