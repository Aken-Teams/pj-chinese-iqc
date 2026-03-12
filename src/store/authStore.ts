import { create } from 'zustand'

export interface User {
  id: string
  name: string
  role: string
  department: string
  email: string
  employeeId: string
}

interface AuthState {
  user: User | null
  isAuthenticated: boolean
  login: (user: User, token: string) => void
  logout: () => void
}

const saved = localStorage.getItem('iqc-auth')
const initial = saved ? JSON.parse(saved) : null

export const useAuthStore = create<AuthState>((set) => ({
  user: initial,
  isAuthenticated: !!initial,
  login: (user, token) => {
    localStorage.setItem('iqc-auth', JSON.stringify(user))
    localStorage.setItem('iqc-auth-token', token)
    set({ user, isAuthenticated: true })
  },
  logout: () => {
    localStorage.removeItem('iqc-auth')
    localStorage.removeItem('iqc-auth-token')
    set({ user: null, isAuthenticated: false })
  },
}))
