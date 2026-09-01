import { apiFetch } from './api'
import { downloadBlob } from '@/utils/downloadBlob'

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
  // Enriched fields populated when listing across products
  product_code?: string | null
  vendor_code?: string | null
  /** AD site (廠區) of the owning product; null for legacy/unassigned. */
  domain?: string | null
}

export async function getRules(productId?: number): Promise<ReviewRule[]> {
  const qs = productId != null ? `?product_id=${productId}` : ''
  return apiFetch(`/rules${qs}`)
}

export interface DeleteProductRulesResult {
  success: boolean
  deleted_rules: number
  deleted_product: boolean
  kept_reason: 'has_lots' | 'has_specs' | null
}

export async function deleteProductRules(productId: number): Promise<DeleteProductRulesResult> {
  return apiFetch(`/rules/product/${productId}`, { method: 'DELETE' })
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

/* ------------------------------------------------------------------ */
/* Import                                                              */
/* ------------------------------------------------------------------ */

export interface RulePreviewRow {
  product_code: string
  product_code_pjxz: string
  product_id: number | null
  vendor_code: string
  param_name_excel: string
  param_name_matched: string | null
  match_confidence: number
  q1_lower: number | null
  q1_upper: number | null
  q2_lower: number | null
  q2_upper: number | null
  q3_lower: number | null
  q3_upper: number | null
  status: string
}

export interface RulesImportPreview {
  file_path: string
  sheets_parsed: string[]
  total_rules: number
  ready_count: number
  warning_count: number
  rules: RulePreviewRow[]
}

export interface RulesImportResult {
  success: boolean
  created: number
  updated: number
  skipped: number
  products_created: number
}

export interface RuleImportItem {
  product_id: number | null
  vendor_code: string | null
  product_code: string | null
  param_name: string
  q1_lower: number | null
  q1_upper: number | null
  q2_lower: number | null
  q2_upper: number | null
  q3_lower: number | null
  q3_upper: number | null
}

export async function importRulesPreview(file: File, lang = 'zh-TW'): Promise<RulesImportPreview> {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('lang', lang)

  const token = localStorage.getItem('iqc-auth-token')
  const headers: Record<string, string> = {}
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch('/api/rules/import-preview', {
    method: 'POST',
    headers,
    body: formData,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || `Import failed: ${res.status}`)
  }
  return res.json()
}

export async function confirmRulesImport(
  filePath: string,
  rules: RuleImportItem[],
  fileName?: string,
): Promise<RulesImportResult> {
  return apiFetch('/rules/import-confirm', {
    method: 'POST',
    body: JSON.stringify({ file_path: filePath, rules, file_name: fileName ?? null }),
  })
}

/** One change to a site's ruleset. */
export interface RuleRevision {
  id: number
  version: number
  action: string
  fileName: string | null
  changedBy: number | null
  changedAt: string | null
  note: string | null
  rulesBefore: number | null
  rulesAfter: number | null
  changeCount: number
}

export async function getRuleRevisions(site?: string): Promise<RuleRevision[]> {
  const qs = site ? `?site=${encodeURIComponent(site)}` : ''
  return apiFetch(`/rules/revisions${qs}`)
}

/**
 * Download the site's rule sheet. Goes through fetch so the auth header is
 * sent, and reports failure rather than throwing: callers fire this from a
 * button, and an unhandled rejection would leave it looking dead.
 */
export async function exportRules(
  site?: string, lang = 'zh-TW',
): Promise<{ ok: true } | { ok: false; error: string }> {
  const token = localStorage.getItem('iqc-auth-token')
  const qs = new URLSearchParams()
  if (site) qs.set('site', site)
  qs.set('lang', lang)
  qs.set('_', String(Date.now()))
  let res: Response
  try {
    res = await fetch(`/api/rules/export?${qs.toString()}`, {
      cache: 'no-store',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    let detail = body.slice(0, 200)
    try { detail = (JSON.parse(body).detail as string) ?? detail } catch { /* not JSON */ }
    return { ok: false, error: `HTTP ${res.status}${detail ? ` — ${detail}` : ''}` }
  }
  const blob = await res.blob()
  if (blob.size === 0) return { ok: false, error: 'Empty response' }
  downloadBlob(blob, filenameFromDisposition(res) ?? 'review-rules.xlsx')
  return { ok: true }
}

/** Prefer the server's UTF-8 name; the ASCII fallback loses the site label. */
function filenameFromDisposition(res: Response): string | null {
  const cd = res.headers.get('Content-Disposition') ?? ''
  const star = /filename\*=UTF-8''([^;]+)/i.exec(cd)
  if (star) {
    try { return decodeURIComponent(star[1]) } catch { /* fall through */ }
  }
  const plain = /filename="?([^";]+)"?/i.exec(cd)
  return plain ? plain[1] : null
}
