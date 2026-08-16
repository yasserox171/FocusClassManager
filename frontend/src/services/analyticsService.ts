import type {
  Alert,
  DashboardSummary,
  NotificationItem,
  Paginated,
  ResourceUsageResponse,
  RoomUsageResponse,
  TimelineResponse,
  UsageStats,
} from '@/types'

import { api, buildQuery } from './api'

export interface PeriodFilters {
  start_date?: string
  end_date?: string
}

export const analyticsService = {
  async summary(): Promise<DashboardSummary> {
    const { data } = await api.get<DashboardSummary>('/analytics/summary/')
    return data
  },

  async roomUsage(filters: PeriodFilters = {}): Promise<RoomUsageResponse> {
    const { data } = await api.get<RoomUsageResponse>(
      `/analytics/room-usage/${buildQuery({ ...filters })}`,
    )
    return data
  },

  async roomStats(roomId: number, filters: PeriodFilters = {}): Promise<UsageStats> {
    const { data } = await api.get<UsageStats>(
      `/analytics/rooms/${roomId}/${buildQuery({ ...filters })}`,
    )
    return data
  },

  async timeline(months = 12): Promise<TimelineResponse> {
    const { data } = await api.get<TimelineResponse>(`/analytics/timeline/${buildQuery({ months })}`)
    return data
  },

  async peakHours(filters: PeriodFilters = {}): Promise<UsageStats> {
    const { data } = await api.get<UsageStats>(`/analytics/peak-hours/${buildQuery({ ...filters })}`)
    return data
  },

  async resourceUsage(filters: PeriodFilters = {}): Promise<ResourceUsageResponse> {
    const { data } = await api.get<ResourceUsageResponse>(
      `/analytics/resources/${buildQuery({ ...filters })}`,
    )
    return data
  },
}

export const notificationService = {
  async alerts(reminderHours = 24): Promise<Alert[]> {
    const { data } = await api.get<Alert[]>(
      `/notifications/alerts/${buildQuery({ reminder_hours: reminderHours })}`,
    )
    return data
  },

  async list(unreadOnly = false): Promise<Paginated<NotificationItem>> {
    const { data } = await api.get<Paginated<NotificationItem>>(
      `/notifications/${buildQuery({ is_read: unreadOnly ? false : undefined, page_size: 20 })}`,
    )
    return data
  },

  async markRead(id: number): Promise<void> {
    await api.post(`/notifications/${id}/read/`)
  },

  async markAllRead(): Promise<void> {
    await api.post('/notifications/read-all/')
  },
}
