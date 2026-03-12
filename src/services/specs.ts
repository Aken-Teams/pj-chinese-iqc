import { apiFetch } from './api'

export interface CompareRow {
  param: string
  cpLower: string
  cpUpper: string
  ftLower: string
  ftUpper: string
  margin: string
  result: string
}

export interface SpecCompareResponse {
  matchCount: number
  tighterCount: number
  outOfRangeCount: number
  rows: CompareRow[]
}

export async function compareSpecs(lotId: number, rule: string = 'standard'): Promise<SpecCompareResponse> {
  return apiFetch('/specs/compare', {
    method: 'POST',
    body: JSON.stringify({ lot_id: lotId, rule }),
  })
}
