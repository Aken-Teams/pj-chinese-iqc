import { create } from 'zustand'

export type Theme = 'light' | 'dark' | 'system'

interface AppState {
  sidebarCollapsed: boolean
  theme: Theme
  toggleSidebar: () => void
  setTheme: (theme: Theme) => void
}

const savedTheme = (localStorage.getItem('iqc-theme') as Theme) || 'light'

export const useAppStore = create<AppState>((set) => ({
  sidebarCollapsed: false,
  theme: savedTheme,
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setTheme: (theme) => {
    localStorage.setItem('iqc-theme', theme)
    set({ theme })
  },
}))
