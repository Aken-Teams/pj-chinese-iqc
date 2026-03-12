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
  login: (user: User) => void
  logout: () => void
}

const saved = localStorage.getItem('iqc-auth')
const initial = saved ? JSON.parse(saved) : null

export const useAuthStore = create<AuthState>((set) => ({
  user: initial,
  isAuthenticated: !!initial,
  login: (user) => {
    localStorage.setItem('iqc-auth', JSON.stringify(user))
    set({ user, isAuthenticated: true })
  },
  logout: () => {
    localStorage.removeItem('iqc-auth')
    set({ user: null, isAuthenticated: false })
  },
}))
