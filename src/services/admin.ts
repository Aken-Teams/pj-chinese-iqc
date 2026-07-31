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
  domain: string | null
  timestamp: string
}

export interface AiUsageRecentResponse {
  items: AiUsageRecord[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export function getAiUsageSummary(days = 30, site = ''): Promise<AiUsageSummary> {
  const s = site ? `&site=${encodeURIComponent(site)}` : ''
  return apiFetch<AiUsageSummary>(`/admin/ai-usage/summary?days=${days}${s}`)
}

export function getRecentAiUsage(page = 1, pageSize = 10, site = ''): Promise<AiUsageRecentResponse> {
  const s = site ? `&site=${encodeURIComponent(site)}` : ''
  return apiFetch<AiUsageRecentResponse>(`/admin/ai-usage/recent?page=${page}&page_size=${pageSize}${s}`)
}
