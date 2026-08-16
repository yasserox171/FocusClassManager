import type { Department, Employee, Paginated } from '@/types'

import { api, buildQuery } from './api'

export interface EmployeeFilters {
  search?: string
  role?: string
  is_active?: boolean
  department?: number
  managed_rooms?: number
  ordering?: string
  page?: number
  page_size?: number
}

export const employeeService = {
  async list(filters: EmployeeFilters = {}): Promise<Paginated<Employee>> {
    const { data } = await api.get<Paginated<Employee>>(`/employees/${buildQuery({ ...filters })}`)
    return data
  },

  async all(): Promise<Employee[]> {
    const { data } = await api.get<Paginated<Employee>>('/employees/?page_size=200')
    return data.results
  },

  async create(payload: Partial<Employee>): Promise<Employee> {
    const { data } = await api.post<Employee>('/employees/', payload)
    return data
  },

  async update(id: number, payload: Partial<Employee>): Promise<Employee> {
    const { data } = await api.patch<Employee>(`/employees/${id}/`, payload)
    return data
  },

  async remove(id: number): Promise<void> {
    await api.delete(`/employees/${id}/`)
  },

  async departments(): Promise<Department[]> {
    const { data } = await api.get<Department[]>('/departments/')
    return data
  },
}
