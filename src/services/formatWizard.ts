import { apiFetch } from './api'
import { downloadBlob } from '@/utils/downloadBlob'
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
  stats: DetectStats | null
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

/** What actually ran during detection, so a fast result isn't mistaken for a skipped one. */
export interface DetectStats {
  ruleFields: number
  aiFields: number
  aiCalls: number
  verifyRan: boolean
  elapsedMs: number
  detectModel: string | null
}

/** One reading of a clicked cell. `preview` is the value it would produce — that
 *  is what the user picks by, instead of choosing a source type or writing a regex. */
export interface InferOption {
  key: string
  label: string
  preview: string
  fields: Record<string, unknown>
  recommended: boolean
  note: string
}

export interface InferResult {
  cellValue: string
  row: number
  col: number
  inDataRegion: boolean
  labelText: string | null
  options: InferOption[]
}

export type InferRole = 'wafer' | 'product' | 'lot'

export async function inferFromCell(
  fileToken: string,
  row: number,
  col: number,
  role: InferRole,
  opts: { sheet?: string; dataStartRow?: number | null } = {},
): Promise<InferResult> {
  return apiFetch('/format-wizard/infer', {
    method: 'POST',
    body: JSON.stringify({
      file_token: fileToken, row, col, role,
      sheet: opts.sheet ?? null, data_start_row: opts.dataStartRow ?? null,
    }),
  })
}

/** Options for reading the product/lot out of the file name — offered only when
 *  the file's own contents carry nothing. */
export async function inferFromFilename(
  fileName: string, role: 'product' | 'lot',
): Promise<InferOption[]> {
  return apiFetch('/format-wizard/infer-filename', {
    method: 'POST',
    body: JSON.stringify({ file_name: fileName, role }),
  })
}

export interface SavedSample {
  id: number
  fileName: string
  fileToken: string
  sheetSelector: string | null
  uploadedBy: string | null
  uploadedAt: string
}

export interface RevisionChange {
  field: string
  from: unknown
  to: unknown
}

export interface Revision {
  id: number
  /** 1-based, oldest first — "v3" is how people refer to a template version. */
  version: number
  action: string
  changedBy: string | null
  changedAt: string
  note: string | null
  /** The sample this change was made against — a diff reads very differently
   *  next to the file it came from. */
  sampleName: string | null
  sampleToken: string | null
  changes: RevisionChange[]
}

export async function saveTemplate(payload: {
  vendor_id: number
  template: Partial<VendorFormat>
  file_token?: string | null
  file_name?: string | null
  format_id?: number | null
  site?: string
  note?: string | null
}): Promise<{ id: number; action: string; changes: RevisionChange[] }> {
  return apiFetch('/format-wizard/save', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

/** Sample files kept for a template — the way back into the preview without
 *  hunting for the original file, which the 無錫 users cannot reliably do. */
export async function getSamples(formatId: number): Promise<SavedSample[]> {
  return apiFetch(`/format-wizard/samples/${formatId}`)
}

export async function getRevisions(formatId: number): Promise<Revision[]> {
  return apiFetch(`/format-wizard/revisions/${formatId}`)
}

/**
 * Open a kept sample. Goes through fetch so the auth header is sent.
 *
 * Failures are reported rather than thrown: callers were firing this with
 * `void`, which turned every failure into an unhandled rejection and left the
 * user staring at a button that appeared to do nothing.
 */
export async function downloadSample(
  fileToken: string, fileName: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const token = localStorage.getItem('iqc-auth-token')
  let res: Response
  try {
    // A plain GET here is cacheable, and the browser was replaying an earlier
    // response — same bytes, same Content-Disposition — without ever asking the
    // server. Nothing reached the API log, and a fixed file could never arrive.
    // The nonce makes each request a distinct URL; `no-store` keeps the answer
    // out of the cache for next time.
    const url = `/api/format-wizard/sample-file`
      + `?file_token=${encodeURIComponent(fileToken)}`
      + `&_=${Date.now()}`
    res = await fetch(url, {
      cache: 'no-store',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
  if (!res.ok) {
    // A 404 here usually means the API has not been restarted since the
    // endpoint was added, so say the status out loud.
    const body = await res.text().catch(() => '')
    let detail = body.slice(0, 200)
    try {
      detail = (JSON.parse(body).detail as string) ?? detail
    } catch { /* not JSON */ }
    return { ok: false, error: `HTTP ${res.status}${detail ? ` — ${detail}` : ''}` }
  }
  const blob = await res.blob()
  if (blob.size === 0) return { ok: false, error: 'Empty response' }
  downloadBlob(blob, fileName)
  return { ok: true }
}
