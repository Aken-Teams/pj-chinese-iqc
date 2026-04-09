import { apiFetch } from './api'

export interface PackagingSpec {
  id: number
  product_id: number
  param_name: string
  lower_limit: number | null
  upper_limit: number | null
  unit: string | null
  test_condition: string | null
  // Present when fetched via the master list (without product_id)
  product_code?: string | null
  vendor_code?: string | null
}

export async function getPackagingSpecs(productId?: number): Promise<PackagingSpec[]> {
  const query = productId !== undefined ? `?product_id=${productId}` : ''
  return apiFetch(`/specs/packaging${query}`)
}

export async function createPackagingSpec(
  data: Omit<PackagingSpec, 'id' | 'product_code' | 'vendor_code'>,
): Promise<PackagingSpec> {
  return apiFetch('/specs/packaging', { method: 'POST', body: JSON.stringify(data) })
}

export async function updatePackagingSpec(id: number, data: Partial<PackagingSpec>): Promise<PackagingSpec> {
  return apiFetch(`/specs/packaging/${id}`, { method: 'PUT', body: JSON.stringify(data) })
}

export async function deletePackagingSpec(id: number): Promise<void> {
  return apiFetch(`/specs/packaging/${id}`, { method: 'DELETE' })
}
