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
  }
}

export async function login(employeeId: string, password: string): Promise<LoginResponse> {
  const data = await apiFetch<LoginResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ employee_id: employeeId, password }),
  })
  setToken(data.token)
  return data
}

export function logout() {
  clearToken()
}
