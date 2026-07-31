import { apiFetch } from './api'

export interface WaferRow {
  dbId: number
  waferId: string
  dieCount: number
  bin1Yield: number
  // Q yields are null when the product has no rule for that Q level
  // (distinct from 0 which means "rule exists but no dies pass").
  q1Yield: number | null
  q2Yield: number | null
  q3Yield: number | null
  status: 'PASS' | 'WARN' | 'FAIL'
}

export interface LotReviewSummary {
  lotId: string
  vendor: string
  product: string
  waferCount: number
  avgYield: number
  totalDies: number
  q1Compliance: string
  q2Compliance: string
  wafers: WaferRow[]
}

export interface ElectricalParam {
  param: string
  avg: string
  stdev: string
  min: string
  max: string
  maxWarning: boolean
  // Per-electrical-item yields (%). null when no rule for that Q level.
  q1Yield: number | null
  q2Yield: number | null
  q3Yield: number | null
}

export interface WaferDetail {
  waferId: string
  lotId: string
  totalDies: number
  bin1Pass: number
  bin1Yield: number
  failCount: number
  electricalParams: ElectricalParam[]
}

export interface MatrixCell {
  q1: number | null
  q2: number | null
  q3: number | null
}

export interface MatrixWaferRow {
  waferId: string
  bin1Yield: number
  cells: MatrixCell[] // aligned index-for-index with ReviewMatrix.params
}

export interface ReviewMatrix {
  params: string[]
  wafers: MatrixWaferRow[]
}

export async function executeReview(lotId: number, params?: string[]): Promise<{ success: boolean; resultCount: number }> {
  return apiFetch('/review/execute', {
    method: 'POST',
    body: JSON.stringify({ lot_id: lotId, params: params || null }),
  })
}

export async function getLotResults(lotId: number): Promise<LotReviewSummary> {
  return apiFetch(`/review/results/${lotId}`)
}

export async function getWaferDetail(lotId: number, waferId: string): Promise<WaferDetail> {
  return apiFetch(`/review/results/${lotId}/wafer/${waferId}`)
}

export async function getReviewMatrix(lotId: number): Promise<ReviewMatrix> {
  return apiFetch(`/review/matrix/${lotId}`)
}
