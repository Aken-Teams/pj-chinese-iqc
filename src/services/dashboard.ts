import { apiFetch } from './api'

export type TrendPeriod = '14d' | '30d' | '6m'

export interface DashboardData {
  kpis: { labelKey: string; value: string; delta: string; deltaType: string }[]
  yieldTrend: {
    period: TrendPeriod
    months: string[]
    vendors: { name: string; color: string; data: (number | null)[] }[]
  }
  vendorPerf: { name: string; yield: number }[]
  aiInsights: { severity: string; title: string; description: string }[]
  recentActivity: { time: string; action: string; user: string }[]
  cpkData: { param: string; value: number }[]
}

export async function getDashboard(
  lang: string = 'zh-TW',
  period: TrendPeriod = '14d',
): Promise<DashboardData> {
  return apiFetch(`/dashboard/summary?lang=${lang}&period=${period}`)
}
