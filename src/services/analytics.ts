import { apiFetch } from './api'

export interface SpcDataPoint {
  waferId: string
  value: number
  isOoc: boolean
}

export interface SpcResponse {
  param: string
  dataPoints: SpcDataPoint[]
  grandMean: number
  ucl: number
  lcl: number
  sigma2Upper: number
  sigma2Lower: number
}

export interface DistributionResponse {
  param: string
  mean: number
  stdev: number
  cpk: number | null
  bins: number[]
  counts: number[]
}

export interface CorrelationResponse {
  params: string[]
  matrix: number[][]
}

export interface CpkResult {
  param: string
  cp: number | null
  cpk: number | null
  mean: number
  stdev: number
  usl: number | null
  lsl: number | null
}

export interface AnomalyItem {
  id: number
  severity: string
  title: string
  description: string
  confidence: number
  timestamp: string
  paramName: string | null
  isResolved: boolean
}

export async function getParamNames(lotId: number): Promise<string[]> {
  return apiFetch(`/analytics/params/${lotId}`)
}

export async function getSpc(productId: number, paramName: string): Promise<SpcResponse> {
  return apiFetch(`/analytics/spc/${productId}/${encodeURIComponent(paramName)}`)
}

export async function getDistribution(lotId: number, paramName: string): Promise<DistributionResponse> {
  return apiFetch(`/analytics/distribution/${lotId}/${encodeURIComponent(paramName)}`)
}

export async function getCpk(lotId: number): Promise<CpkResult[]> {
  return apiFetch(`/analytics/cpk/${lotId}`)
}

export async function getCorrelation(productId: number): Promise<CorrelationResponse> {
  return apiFetch(`/analytics/correlation/${productId}`)
}

export async function getAnomalies(lotId?: number, lang?: string): Promise<AnomalyItem[]> {
  const params = new URLSearchParams()
  if (lotId !== undefined) params.set('lot_id', String(lotId))
  if (lang) params.set('lang', lang)
  const qs = params.toString() ? `?${params.toString()}` : ''
  return apiFetch(`/ai/anomalies${qs}`)
}

export async function detectAnomalies(lotId: number, lang: string): Promise<AnomalyItem[]> {
  return apiFetch('/ai/detect-anomalies', {
    method: 'POST',
    body: JSON.stringify({ lot_id: lotId, lang }),
  })
}
