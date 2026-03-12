import { create } from 'zustand'

export type Theme = 'light' | 'dark' | 'system'

interface AppState {
  sidebarCollapsed: boolean
  theme: Theme
  toggleSidebar: () => void
  setTheme: (theme: Theme) => void
}

const savedTheme = (localStorage.getItem('iqc-theme') as Theme) || 'light'
const savedCollapsed = localStorage.getItem('iqc-sidebar-collapsed') === 'true'

export const useAppStore = create<AppState>((set) => ({
  sidebarCollapsed: savedCollapsed,
  theme: savedTheme,
  toggleSidebar: () => set((s) => {
    const next = !s.sidebarCollapsed
    localStorage.setItem('iqc-sidebar-collapsed', String(next))
    return { sidebarCollapsed: next }
  }),
  setTheme: (theme) => {
    localStorage.setItem('iqc-theme', theme)
    set({ theme })
  },
}))
