import type {
  Paginated,
  ResourceIssue,
  ResourceType,
  Room,
  RoomAvailability,
} from '@/types'

import { api, buildQuery } from './api'

export interface RoomFilters {
  search?: string
  status?: string
  location?: string
  min_capacity?: number
  max_capacity?: number
  resource?: string
  ordering?: string
  page?: number
  page_size?: number
}

export const roomService = {
  async list(filters: RoomFilters = {}): Promise<Paginated<Room>> {
    const { data } = await api.get<Paginated<Room>>(`/rooms/${buildQuery({ ...filters })}`)
    return data
  },

  async all(): Promise<Room[]> {
    const { data } = await api.get<Paginated<Room>>('/rooms/?page_size=200')
    return data.results
  },

  async get(id: number): Promise<Room> {
    const { data } = await api.get<Room>(`/rooms/${id}/`)
    return data
  },

  async create(payload: Partial<Room>): Promise<Room> {
    const { data } = await api.post<Room>('/rooms/', payload)
    return data
  },

  async update(id: number, payload: Partial<Room>): Promise<Room> {
    const { data } = await api.patch<Room>(`/rooms/${id}/`, payload)
    return data
  },

  async remove(id: number): Promise<void> {
    await api.delete(`/rooms/${id}/`)
  },

  async restore(id: number): Promise<Room> {
    const { data } = await api.post<Room>(`/rooms/${id}/restore/`)
    return data
  },

  async available(start: string, end: string, capacity?: number): Promise<RoomAvailability[]> {
    const { data } = await api.get<RoomAvailability[]>(
      `/rooms/available/${buildQuery({ start, end, capacity })}`,
    )
    return data
  },

  async resourceTypes(): Promise<ResourceType[]> {
    const { data } = await api.get<ResourceType[]>('/resource-types/')
    return data
  },

  async issues(roomId?: number): Promise<Paginated<ResourceIssue>> {
    const { data } = await api.get<Paginated<ResourceIssue>>(
      `/resource-issues/${buildQuery({ room: roomId })}`,
    )
    return data
  },

  async reportIssue(payload: {
    room: number
    room_resource?: number | null
    description: string
  }): Promise<ResourceIssue> {
    const { data } = await api.post<ResourceIssue>('/resource-issues/', payload)
    return data
  },

  async resolveIssue(id: number): Promise<ResourceIssue> {
    const { data } = await api.post<ResourceIssue>(`/resource-issues/${id}/resolve/`)
    return data
  },
}
