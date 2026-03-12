import { apiFetch } from './api'

export interface DieCell {
  x: number
  y: number
  bin: number
}

export interface WaferMapData {
  waferId: string
  dies: DieCell[]
  maxX: number
  maxY: number
  minX: number
  minY: number
}

export interface WaferStats {
  totalDies: number
  bin1Pass: number
  bin1Yield: number
  failCount: number
}

export interface BinCount {
  bin: number
  label: string
  count: number
}

export async function getWaferMap(waferDbId: number): Promise<WaferMapData> {
  return apiFetch(`/wafer-map/${waferDbId}`)
}

export async function getWaferStats(waferDbId: number): Promise<WaferStats> {
  return apiFetch(`/wafer-map/${waferDbId}/statistics`)
}

export async function getBinDistribution(waferDbId: number): Promise<{ bins: BinCount[] }> {
  return apiFetch(`/wafer-map/${waferDbId}/bin-distribution`)
}
