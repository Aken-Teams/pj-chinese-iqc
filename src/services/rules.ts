import { apiFetch } from './api'

export interface ReviewRule {
  id: number
  product_id: number
  param_name: string
  q1_lower: number | null
  q1_upper: number | null
  q2_lower: number | null
  q2_upper: number | null
  q3_lower: number | null
  q3_upper: number | null
}

export async function getRules(productId: number): Promise<ReviewRule[]> {
  return apiFetch(`/rules?product_id=${productId}`)
}

export async function createRule(data: Omit<ReviewRule, 'id'>): Promise<ReviewRule> {
  return apiFetch('/rules', { method: 'POST', body: JSON.stringify(data) })
}

export async function updateRule(id: number, data: Partial<ReviewRule>): Promise<ReviewRule> {
  return apiFetch(`/rules/${id}`, { method: 'PUT', body: JSON.stringify(data) })
}

export async function deleteRule(id: number): Promise<void> {
  return apiFetch(`/rules/${id}`, { method: 'DELETE' })
}
