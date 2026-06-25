import { apiFetch } from './api'

export interface AiUsageTotals {
  calls: number
  promptTokens: number
  completionTokens: number
  totalTokens: number
  estCost: number
  currency: string
}

export interface AiUsageBreakdownRow {
  key: string
  calls: number
  promptTokens: number
  completionTokens: number
  totalTokens: number
  estCost: number
}

export interface AiUsageDailyRow {
  date: string
  calls: number
  totalTokens: number
}

export interface AiUsageSummary {
  totals: AiUsageTotals
  byFeature: AiUsageBreakdownRow[]
  byModel: AiUsageBreakdownRow[]
  daily: AiUsageDailyRow[]
  currency: string
}

export interface AiUsageRecord {
  id: number
  feature: string
  model: string
  promptTokens: number
  completionTokens: number
  totalTokens: number
  lang: string | null
  userName: string | null
  lotId: number | null
  waferId: number | null
  timestamp: string
}

export function getAiUsageSummary(days = 30): Promise<AiUsageSummary> {
  return apiFetch<AiUsageSummary>(`/admin/ai-usage/summary?days=${days}`)
}

export function getRecentAiUsage(limit = 50): Promise<AiUsageRecord[]> {
  return apiFetch<AiUsageRecord[]>(`/admin/ai-usage/recent?limit=${limit}`)
}
