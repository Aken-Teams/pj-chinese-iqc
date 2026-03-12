import { apiFetch } from './api'

export interface PackagingSpec {
  id: number
  product_id: number
  param_name: string
  lower_limit: number | null
  upper_limit: number | null
  unit: string | null
  test_condition: string | null
}

export async function getPackagingSpecs(productId: number): Promise<PackagingSpec[]> {
  return apiFetch(`/specs/packaging?product_id=${productId}`)
}

export async function createPackagingSpec(data: Omit<PackagingSpec, 'id'>): Promise<PackagingSpec> {
  return apiFetch('/specs/packaging', { method: 'POST', body: JSON.stringify(data) })
}

export async function updatePackagingSpec(id: number, data: Partial<PackagingSpec>): Promise<PackagingSpec> {
  return apiFetch(`/specs/packaging/${id}`, { method: 'PUT', body: JSON.stringify(data) })
}

export async function deletePackagingSpec(id: number): Promise<void> {
  return apiFetch(`/specs/packaging/${id}`, { method: 'DELETE' })
}
