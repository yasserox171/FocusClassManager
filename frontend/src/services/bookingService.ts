import type {
  Booking,
  BookingCreationResult,
  BookingPayload,
  BookingPreview,
  BookingSeries,
  ConflictingBooking,
  Paginated,
} from '@/types'

import { api, buildQuery } from './api'

export interface BookingFilters {
  search?: string
  room?: number
  rooms?: number[]
  status?: string
  series?: number
  booked_by?: number
  period?: 'upcoming' | 'past' | 'today'
  date?: string
  recurring?: boolean
  start_after?: string
  start_before?: string
  ordering?: string
  page?: number
  page_size?: number
}

export type DeleteScope = 'occurrence' | 'future' | 'series'

export const bookingService = {
  async list(filters: BookingFilters = {}): Promise<Paginated<Booking>> {
    const { data } = await api.get<Paginated<Booking>>(`/bookings/${buildQuery({ ...filters })}`)
    return data
  },

  async get(id: number): Promise<Booking> {
    const { data } = await api.get<Booking>(`/bookings/${id}/`)
    return data
  },

  /** Creates a one-off booking or a whole recurring series. */
  async create(payload: BookingPayload): Promise<BookingCreationResult> {
    const { data } = await api.post<BookingCreationResult>('/bookings/', payload)
    return data
  },

  async update(id: number, payload: Partial<Booking>): Promise<Booking> {
    const { data } = await api.patch<Booking>(`/bookings/${id}/`, payload)
    return data
  },

  /** Cancels (or purges) an occurrence, the following ones, or the whole series. */
  async remove(
    id: number,
    scope: DeleteScope = 'occurrence',
    options: { purge?: boolean; reason?: string } = {},
  ): Promise<void> {
    await api.delete(`/bookings/${id}/${buildQuery({ scope, ...options })}`)
  },

  async restore(id: number): Promise<Booking> {
    const { data } = await api.post<Booking>(`/bookings/${id}/restore/`)
    return data
  },

  /** Dry run: returns the generated slots and their conflicts without writing. */
  async preview(payload: Partial<BookingPayload>): Promise<BookingPreview> {
    const { data } = await api.post<BookingPreview>('/bookings/preview/', payload)
    return data
  },

  async checkCollision(
    room: number,
    start: string,
    end: string,
    excludeBooking?: number,
  ): Promise<{ has_conflict: boolean; conflicts: ConflictingBooking[] }> {
    const { data } = await api.get<{ has_conflict: boolean; conflicts: ConflictingBooking[] }>(
      `/bookings/check-collision/${buildQuery({
        room,
        start,
        end,
        exclude_booking: excludeBooking,
      })}`,
    )
    return data
  },

  async upcoming(days = 7, pageSize = 10): Promise<Paginated<Booking>> {
    const { data } = await api.get<Paginated<Booking>>(
      `/bookings/upcoming/${buildQuery({ days, page_size: pageSize })}`,
    )
    return data
  },

  async calendar(start: string, end: string, rooms?: number[]): Promise<Booking[]> {
    const { data } = await api.get<Booking[]>(
      `/bookings/calendar/${buildQuery({ start, end, rooms })}`,
    )
    return data
  },

  async series(id: number): Promise<BookingSeries> {
    const { data } = await api.get<BookingSeries>(`/booking-series/${id}/`)
    return data
  },

  async listSeries(page = 1): Promise<Paginated<BookingSeries>> {
    const { data } = await api.get<Paginated<BookingSeries>>(`/booking-series/${buildQuery({ page })}`)
    return data
  },

  async updateSeries(id: number, payload: Partial<BookingSeries>): Promise<BookingSeries> {
    const { data } = await api.patch<BookingSeries>(`/booking-series/${id}/`, payload)
    return data
  },

  async removeSeries(id: number, purge = false): Promise<void> {
    await api.delete(`/booking-series/${id}/${buildQuery({ purge })}`)
  },
}
