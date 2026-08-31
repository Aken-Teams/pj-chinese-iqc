import { apiFetch } from './api'

export interface HistoryRow {
  id: number
  productId: number
  date: string
  vendor: string
  product: string
  lotId: string
  wafers: number
  avgYield: string
  status: string
  /** True once 執行審核 has been run for this lot. */
  reviewed: boolean
  /** AD site (廠區) the lot belongs to; null for legacy/unassigned lots. */
  domain?: string | null
}

export interface HistoryResponse {
  items: HistoryRow[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

/** The 廠商 → 型號 → 批號 selection driving the cascading filters. */
export interface LotFilter {
  vendor: string
  product: string
  lot: string
}

export interface LotFilterOptions {
  vendors: { code: string; name: string }[]
  products: string[]
  lots: string[]
}

/**
 * Options for each filter level, already narrowed by the levels above and
 * scoped to the caller's site. One call rather than three: the lists are small,
 * and staggered responses made the selects refill one after another.
 */
export async function getLotFilterOptions(params: {
  vendor?: string
  product?: string
  site?: string
}): Promise<LotFilterOptions> {
  const qs = new URLSearchParams()
  if (params.vendor) qs.set('vendor', params.vendor)
  if (params.product) qs.set('product', params.product)
  if (params.site) qs.set('site', params.site)
  const q = qs.toString()
  return apiFetch(`/lots/filter-options${q ? `?${q}` : ''}`)
}

export async function getHistory(params?: {
  vendor?: string
  product?: string
  lot?: string
  status?: string
  search?: string
  site?: string
  fromDate?: string
  toDate?: string
  page?: number
  pageSize?: number
}): Promise<HistoryResponse> {
  const searchParams = new URLSearchParams()
  if (params?.vendor) searchParams.set('vendor', params.vendor)
  if (params?.product) searchParams.set('product', params.product)
  if (params?.lot) searchParams.set('lot', params.lot)
  if (params?.status) searchParams.set('status', params.status)
  if (params?.search) searchParams.set('search', params.search)
  if (params?.site) searchParams.set('site', params.site)
  if (params?.fromDate) searchParams.set('from_date', params.fromDate)
  if (params?.toDate) searchParams.set('to_date', params.toDate)
  if (params?.page) searchParams.set('page', String(params.page))
  if (params?.pageSize) searchParams.set('page_size', String(params.pageSize))
  const qs = searchParams.toString()
  return apiFetch(`/lots${qs ? `?${qs}` : ''}`)
}
