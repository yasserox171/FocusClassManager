export type Role = 'admin' | 'department_manager' | 'room_manager' | 'staff'
export type RoomStatus = 'available' | 'maintenance' | 'closed'
export type BookingStatus = 'confirmed' | 'cancelled'
export type RecurrenceType = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly'
export type MonthlyMode = 'day_of_month' | 'nth_weekday'
export type ConflictPolicy = 'strict' | 'skip'
export type ResourceCondition = 'ok' | 'damaged' | 'missing'
export type IssueStatus = 'open' | 'in_progress' | 'resolved'

export interface Paginated<T> {
  count: number
  next: string | null
  previous: string | null
  results: T[]
}

export interface User {
  id: number
  username: string
  email: string
  first_name: string
  last_name: string
  full_name: string
  phone: string
  role: Role
  preferred_language: 'ar' | 'fr'
  is_active: boolean
  managed_room_ids: number[]
  last_login: string | null
}

export interface ResourceType {
  id: number
  code: string
  name_fr: string
  name_ar: string
  icon: string
  is_countable: boolean
}

export interface RoomResource {
  id?: number
  resource_type: number
  resource_type_detail?: ResourceType
  quantity: number
  condition: ResourceCondition
  notes: string
}

export interface Room {
  id: number
  name: string
  name_ar: string
  code: string
  capacity: number
  location: string
  description: string
  status: RoomStatus
  color: string
  resources: RoomResource[]
  open_issues_count: number
  is_bookable: boolean
  created_at: string
  updated_at: string
}

export interface RoomAvailability {
  room: Room
  is_available: boolean
  reason: '' | 'booked' | 'maintenance' | 'closed' | 'deleted'
}

export interface ResourceIssue {
  id: number
  room: number
  room_name: string
  room_resource: number | null
  description: string
  status: IssueStatus
  reported_by: number | null
  reported_by_name: string
  resolved_at: string | null
  created_at: string
}

export interface Department {
  id: number
  name: string
  name_ar: string
  code: string
  employees_count: number
}

export interface Employee {
  id: number
  user: number | null
  username: string
  full_name: string
  email: string
  phone: string
  role: Role
  role_display: string
  department: number | null
  department_name: string
  managed_rooms: number[]
  managed_rooms_detail: Pick<Room, 'id' | 'name' | 'code' | 'color'>[]
  is_active: boolean
  notes: string
  created_at: string
  updated_at: string
}

export interface Booking {
  id: number
  series: number | null
  room: number
  room_detail: Pick<Room, 'id' | 'name' | 'code' | 'color' | 'capacity' | 'location' | 'status'>
  title: string
  purpose: string
  notes: string
  expected_attendees: number
  start_datetime: string
  end_datetime: string
  duration_hours: number
  booked_by: number | null
  booked_by_name: string
  booked_by_display: string
  created_by: number | null
  required_resources: number[]
  required_resources_detail: ResourceType[]
  status: BookingStatus
  cancellation_reason: string
  is_recurring: boolean
  recurrence_type: RecurrenceType
  created_at: string
  updated_at: string
}

export interface BookingSeries {
  id: number
  room: number
  room_detail: Booking['room_detail']
  title: string
  purpose: string
  notes: string
  expected_attendees: number
  booked_by: number | null
  booked_by_name: string
  recurrence_type: RecurrenceType
  interval: number
  weekdays: number[]
  weekday_names: string[]
  monthly_mode: MonthlyMode
  month_days: number[]
  nth_week: number | null
  yearly_dates: YearlyDate[]
  start_date: string
  end_date: string
  start_time: string
  end_time: string
  required_resources: number[]
  required_resources_detail: ResourceType[]
  status: BookingStatus
  occurrences_count: number
  created_at: string
}

export interface YearlyDate {
  month: number
  day: number
}

export interface BookingPayload {
  room: number
  title: string
  purpose?: string
  notes?: string
  expected_attendees: number
  booked_by?: number | null
  booked_by_name?: string
  required_resources?: number[]
  recurrence_type: RecurrenceType
  interval?: number
  weekdays?: number[]
  monthly_mode?: MonthlyMode
  month_days?: number[]
  nth_week?: number | null
  yearly_dates?: YearlyDate[]
  start_date: string
  end_date?: string | null
  start_time: string
  end_time: string
  conflict_policy?: ConflictPolicy
}

export interface ConflictingBooking {
  id: number
  title: string
  room: string
  start: string
  end: string
  booked_by: string
}

export interface OccurrenceConflict {
  start: string
  end: string
  conflicts: ConflictingBooking[]
}

export interface BookingCreationResult {
  series: BookingSeries | null
  created: Booking[]
  created_count: number
  skipped_count: number
  skipped: OccurrenceConflict[]
}

export interface BookingPreview {
  occurrences_count: number
  conflicts_count: number
  occurrences: { start: string; end: string; has_conflict: boolean }[]
  conflicts: OccurrenceConflict[]
}

export interface DashboardSummary {
  total_rooms: number
  available_now: number
  occupied_now: number
  maintenance_rooms: number
  closed_rooms: number
  bookings_today: number
  bookings_next_7_days: number
  ongoing_bookings: number
  open_issues: number
  cancelled_today: number
  generated_at: string
}

export interface RoomUsageRow {
  room_id: number
  room_name: string
  room_code: string
  color: string
  capacity: number
  status: RoomStatus
  bookings_count: number
  booked_hours: number
  available_hours: number
  occupancy_rate: number
  average_attendees: number
}

export interface RoomUsageResponse {
  start_date: string
  end_date: string
  rooms: RoomUsageRow[]
  most_booked: RoomUsageRow | null
}

export interface UsageStats {
  room_id: number | null
  start_date: string
  end_date: string
  bookings_count: number
  booked_hours: number
  available_hours: number
  occupancy_rate: number
  peak_hours: { hour: number; hours_booked: number }[]
  hour_histogram: { hour: number; hours_booked: number }[]
  weekday_histogram: { weekday: number; bookings: number }[]
}

export interface TimelineResponse {
  months: { month: string; bookings: number; attendees: number }[]
}

export interface ResourceUsageResponse {
  start_date: string
  end_date: string
  resources: {
    id: number
    code: string
    name_fr: string
    name_ar: string
    bookings: number
  }[]
}

export type NotificationLevel = 'info' | 'warning' | 'critical'
export type NotificationCategory =
  | 'booking_created'
  | 'booking_cancelled'
  | 'booking_conflict'
  | 'booking_reminder'
  | 'room_maintenance'
  | 'resource_issue'

export interface Alert {
  id: string
  category: NotificationCategory
  level: NotificationLevel
  message_fr: string
  message_ar: string
  room_id: number | null
  booking_id: number | null
  created_at: string
}

export interface NotificationItem {
  id: number
  category: NotificationCategory
  level: NotificationLevel
  message_fr: string
  message_ar: string
  room: number | null
  room_name: string
  booking: number | null
  is_read: boolean
  created_at: string
}
