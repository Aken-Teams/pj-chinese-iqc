import { apiFetch } from './api'

/** A lot offered for comparison. */
export interface CandidateLot {
  lotId: number
  lot: string
  product: string
  vendor: string | null
  date: string | null
  /** False when the date is the upload time because the file carried no stamp. */
  dateIsTestDate: boolean
  waferCount: number
  judgement: string | null
}

export interface TrendPoint {
  lotId: number
  lot: string
  vendor: string | null
  product: string | null
  date: string | null
  dateIsTestDate: boolean
  waferCount: number
  bin1Yield: number | null
  q1Yield: number | null
  judgement: string | null
}

export interface BoxPlot {
  lotId: number
  lot: string
  vendor: string | null
  product: string | null
  date: string | null
  n: number
  min: number
  max: number
  q1: number
  median: number
  q3: number
  whiskerLow: number
  whiskerHigh: number
  mean: number
  stdev: number
  outliers: number[]
  outlierCount: number
  lower: number | null
  upper: number | null
  unit: string | null
}

export interface CrossLotResponse {
  paramName: string
  params: string[]
  /** Distinct products among the chosen lots — more than one means the yields
   *  on the trend are not on the same footing. */
  products: string[]
  trend: TrendPoint[]
  boxes: BoxPlot[]
}

export async function getCandidateLots(opts: {
  vendor?: string
  product?: string
  fromDate?: string
  toDate?: string
  site?: string
} = {}): Promise<CandidateLot[]> {
  const qs = new URLSearchParams()
  if (opts.vendor) qs.set('vendor', opts.vendor)
  if (opts.product) qs.set('product', opts.product)
  if (opts.fromDate) qs.set('from_date', opts.fromDate)
  if (opts.toDate) qs.set('to_date', opts.toDate)
  if (opts.site) qs.set('site', opts.site)
  const q = qs.toString()
  return apiFetch(`/analytics/cross-lot/lots${q ? `?${q}` : ''}`)
}

export async function getCrossLot(
  lotIds: number[], paramName?: string,
): Promise<CrossLotResponse> {
  const qs = new URLSearchParams({ lot_ids: lotIds.join(',') })
  if (paramName) qs.set('param_name', paramName)
  return apiFetch(`/analytics/cross-lot?${qs.toString()}`)
}
