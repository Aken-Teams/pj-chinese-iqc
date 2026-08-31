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
  /** AD site (廠區) the lot belongs to; null for legacy/unassigned lots. */
  domain?: string | null
  waferCount: number
  avgYield: number
  totalDies: number
  q1Compliance: string
  q2Compliance: string
  wafers: WaferRow[]

  /** What the system worked out from the site's thresholds — advisory. */
  judgement?: string | null
  judgedYield?: number | null
  /** True once 執行審核 has run; until then the verdict is a live reading. */
  reviewed?: boolean
  passMin?: number | null
  warnMin?: number | null
  basis?: string | null
  /** What a person decided. Separate, so a re-review never overwrites it. */
  confirmedJudgement?: string | null
  confirmedBy?: string | null
  confirmedAt?: string | null
  confirmNote?: string | null
}

export interface ReviewThreshold {
  domain: string | null
  passMin: number
  warnMin: number
  basis: string
}

export async function getThresholds(): Promise<ReviewThreshold[]> {
  return apiFetch('/review/thresholds')
}

export async function updateThreshold(t: ReviewThreshold): Promise<ReviewThreshold> {
  return apiFetch('/review/thresholds', {
    method: 'PUT',
    body: JSON.stringify(t),
  })
}

/** Record a person's decision on a lot. `judgement: null` withdraws it. */
export async function confirmJudgement(
  lotId: number, judgement: string | null, note?: string,
): Promise<{ confirmedJudgement: string | null; confirmedBy: string; confirmedAt: string | null }> {
  return apiFetch('/review/confirm', {
    method: 'POST',
    body: JSON.stringify({ lot_id: lotId, judgement, note: note ?? null }),
  })
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

export interface BatchReviewResult {
  reviewed: number
  failed: number
  results: { lotId: number; success: boolean; resultCount: number; error: string | null }[]
}

export async function executeBatchReview(lotIds: number[]): Promise<BatchReviewResult> {
  return apiFetch('/review/execute-batch', {
    method: 'POST',
    body: JSON.stringify({ lot_ids: lotIds }),
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
