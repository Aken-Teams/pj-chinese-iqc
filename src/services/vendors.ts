import { apiFetch } from './api'

export interface Vendor {
  id: number
  name: string
  code: string
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

export async function getLots(vendorCode?: string): Promise<LotInfo[]> {
  const params = vendorCode ? `?vendor=${vendorCode}` : ''
  return apiFetch(`/lots${params}`)
}
