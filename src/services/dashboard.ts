import { apiFetch } from './api'

export interface DashboardData {
  kpis: { labelKey: string; value: string; delta: string; deltaType: string }[]
  yieldTrend: {
    months: string[]
    vendors: { name: string; color: string; data: number[] }[]
  }
  vendorPerf: { name: string; yield: number }[]
  aiInsights: { severity: string; title: string; description: string }[]
  recentActivity: { time: string; action: string; user: string }[]
  cpkData: { param: string; value: number }[]
}

export async function getDashboard(lang: string = 'zh-TW'): Promise<DashboardData> {
  return apiFetch(`/dashboard/summary?lang=${lang}`)
}
