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
}

export interface HistoryResponse {
  items: HistoryRow[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export async function getHistory(params?: {
  vendor?: string
  product?: string
  status?: string
  search?: string
  fromDate?: string
  toDate?: string
  page?: number
  pageSize?: number
}): Promise<HistoryResponse> {
  const searchParams = new URLSearchParams()
  if (params?.vendor) searchParams.set('vendor', params.vendor)
  if (params?.product) searchParams.set('product', params.product)
  if (params?.status) searchParams.set('status', params.status)
  if (params?.search) searchParams.set('search', params.search)
  if (params?.fromDate) searchParams.set('from_date', params.fromDate)
  if (params?.toDate) searchParams.set('to_date', params.toDate)
  if (params?.page) searchParams.set('page', String(params.page))
  if (params?.pageSize) searchParams.set('page_size', String(params.pageSize))
  const qs = searchParams.toString()
  return apiFetch(`/lots${qs ? `?${qs}` : ''}`)
}
