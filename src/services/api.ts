const BASE_URL = '/api'

function getToken(): string | null {
  const auth = localStorage.getItem('iqc-auth-token')
  return auth
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = getToken()
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json'
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || `API Error ${res.status}`)
  }

  return res.json()
}

export function setToken(token: string) {
  localStorage.setItem('iqc-auth-token', token)
}

export function clearToken() {
  localStorage.removeItem('iqc-auth-token')
}
