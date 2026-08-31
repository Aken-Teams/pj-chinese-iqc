import { apiFetch } from './api'
import type { VendorFormat } from './vendors'

/** One detected field, with why it was chosen. */
export interface Candidate {
  value: number | string | null
  /** 0..1 — anything under ~0.7 is shown as needing a human check. */
  confidence: number
  evidence: string
  source: 'rule' | 'ai' | 'user'
}

export interface GridPreview {
  rows: (string | null)[][]
  nRows: number
  nCols: number
  sheets: string[]
  sheetUsed: string
  encoding: string | null
  delimiter: string | null
}

export interface Conflict {
  field: string
  proposed: number | null
  shouldBe: number | null
  why: string
}

export interface DetectResponse {
  fileToken: string
  fileName: string
  preview: GridPreview
  fields: Record<string, Candidate | null>
  warnings: string[]
  /** Required fields nothing could resolve — often the file's fault. */
  missing: string[]
  conflicts: Conflict[]
  template: Partial<VendorFormat>
}

export interface SpecPreview {
  param: string
  lower: number | null
  upper: number | null
  unit: string | null
}

export interface DryRunResponse {
  ok: boolean
  error: string | null
  waferCount: number
  dataRows: number
  paramNames: string[]
  waferIds: string[]
  productId: string | null
  lotId: string | null
  specs: SpecPreview[]
  sampleRows: Record<string, unknown>[]
  issues: string[]
}

/** Upload a sample file and get a proposed template back. */
export async function detectFormat(
  file: File,
  opts: { useAi?: boolean; verify?: boolean; sheet?: string } = {},
): Promise<DetectResponse> {
  const body = new FormData()
  body.append('file', file)
  body.append('use_ai', String(opts.useAi ?? true))
  body.append('verify', String(opts.verify ?? false))
  if (opts.sheet) body.append('sheet', opts.sheet)

  const token = localStorage.getItem('iqc-auth-token')
  const res = await fetch('/api/format-wizard/detect', {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || `Detect failed: ${res.status}`)
  }
  return res.json()
}

/** Re-read a stored sample, optionally on another worksheet. */
export async function previewSample(fileToken: string, sheet?: string): Promise<GridPreview> {
  const qs = new URLSearchParams({ file_token: fileToken })
  if (sheet) qs.set('sheet', sheet)
  return apiFetch(`/format-wizard/preview?${qs.toString()}`)
}

/**
 * Parse the sample with a draft template. A bad template comes back as
 * `ok: false` / `issues`, not as a thrown error — a half-filled form is a
 * normal state in this screen.
 */
export async function dryRunFormat(
  fileToken: string,
  template: Partial<VendorFormat>,
  vendorCode = 'PREVIEW',
): Promise<DryRunResponse> {
  return apiFetch('/format-wizard/dry-run', {
    method: 'POST',
    body: JSON.stringify({ file_token: fileToken, template, vendor_code: vendorCode }),
  })
}

/** Save a template as a .json file the user can archive or re-import. */
export function downloadTemplate(name: string, template: Partial<VendorFormat>): void {
  const blob = new Blob([JSON.stringify(template, null, 2)], {
    type: 'application/json;charset=utf-8',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${name || 'vendor-format'}.json`
  a.click()
  URL.revokeObjectURL(url)
}
