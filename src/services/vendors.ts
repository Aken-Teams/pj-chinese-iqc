import { apiFetch } from './api'

export interface Vendor {
  id: number
  name: string
  code: string
}

export interface VendorFormat {
  id: number
  format_name: string | null
  header_row: number
  data_start_row: number
  lower_limit_row: number
  upper_limit_row: number
  electrical_start_col: number
  wafer_id_col: number
  bin_col: number
  x_coord_col: number | null
  y_coord_col: number | null
  product_id_col: number | null
  lot_id_col: number | null
  fixed_die_count: number | null
  product_id_cell: string | null
  lot_id_cell: string | null
}

export interface Product {
  id: number
  product_code: string
  vendor_id: number
  vendor_code: string
  vendor_name: string
}

export interface LotInfo {
  id: number
  lotId: string
  productCode: string
  status: string
}

export async function getVendors(): Promise<Vendor[]> {
  return apiFetch('/vendors')
}

export async function createVendor(data: { code: string; name: string }): Promise<Vendor> {
  return apiFetch('/vendors', { method: 'POST', body: JSON.stringify(data) })
}

export async function getVendorFormats(vendorId: number): Promise<VendorFormat[]> {
  return apiFetch(`/vendors/${vendorId}/formats`)
}

export async function createVendorFormat(vendorId: number, data: Omit<VendorFormat, 'id'>): Promise<VendorFormat> {
  return apiFetch(`/vendors/${vendorId}/formats`, { method: 'POST', body: JSON.stringify(data) })
}

export async function updateVendorFormat(vendorId: number, fmtId: number, data: Partial<VendorFormat>): Promise<VendorFormat> {
  return apiFetch(`/vendors/${vendorId}/formats/${fmtId}`, { method: 'PUT', body: JSON.stringify(data) })
}

export async function deleteVendorFormat(vendorId: number, fmtId: number): Promise<void> {
  return apiFetch(`/vendors/${vendorId}/formats/${fmtId}`, { method: 'DELETE' })
}

export async function getProducts(): Promise<Product[]> {
  return apiFetch('/vendors/products')
}

export async function getLots(vendorCode?: string): Promise<LotInfo[]> {
  const params = vendorCode ? `?vendor=${vendorCode}` : ''
  return apiFetch(`/lots${params}`)
}

export interface VendorScore {
  vendorId: number
  vendorName: string
  vendorCode: string
  period: string
  avgYield: number | null
  lotCount: number
  anomalyCount: number
  cpkAvg: number | null
  score: number | null
  rank: number
}

export async function getVendorScores(period?: string): Promise<VendorScore[]> {
  const qs = period ? `?period=${period}` : ''
  return apiFetch(`/vendors/scores${qs}`)
}

export async function calculateVendorScores(period?: string): Promise<VendorScore[]> {
  const qs = period ? `?period=${period}` : ''
  return apiFetch(`/vendors/scores/calculate${qs}`, { method: 'POST' })
}
