import { apiFetch, setToken, clearToken } from './api'

interface LoginResponse {
  token: string
  user: {
    id: string
    name: string
    role: string
    department: string | null
    email: string | null
    employeeId: string
    domain?: string | null
  }
}

export interface DomainOption {
  code: string
  name: string
}

export async function login(employeeId: string, password: string): Promise<LoginResponse> {
  const data = await apiFetch<LoginResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ employee_id: employeeId, password }),
  })
  setToken(data.token)
  return data
}

export async function adLogin(
  employeeId: string,
  password: string,
  domain: string,
): Promise<LoginResponse> {
  const data = await apiFetch<LoginResponse>('/auth/ad-login', {
    method: 'POST',
    body: JSON.stringify({ employee_id: employeeId, password, domain }),
  })
  setToken(data.token)
  return data
}

export async function getDomains(): Promise<DomainOption[]> {
  return apiFetch<DomainOption[]>('/auth/domains')
}

export function logout() {
  clearToken()
}
