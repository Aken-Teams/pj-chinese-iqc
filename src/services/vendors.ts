import { apiFetch } from './api'

export interface Vendor {
  id: number
  name: string
  code: string
  /** AD sites (廠區) this vendor serves; empty = unassigned (all sites). */
  domains?: string[]
  /** How many format templates exist. Zero means uploads for this vendor fail. */
  formatCount?: number
  /** Sites that have a template; '' is an unassigned template usable by all. */
  formatDomains?: string[]
}

/**
 * Sites the vendor is visible to but has no template for.
 *
 * Three vendors were sitting in this state unnoticed — a site could see them,
 * pick them, and only discover the gap when the upload failed.
 */
/**
 * Can this site actually upload for this vendor?
 *
 * A vendor may be visible to a site (a `vendor_domains` link) yet have no
 * template for it — JJW serves both sites but only 徐州 has a template. Picking
 * it then fails at upload time with nothing beforehand to warn you.
 */
export function canUploadFor(
  vendor: Vendor, userDomain: string | null | undefined, isAdmin: boolean,
): boolean {
  const covered = vendor.formatDomains ?? []
  if ((vendor.formatCount ?? 0) === 0) return false
  if (isAdmin) return true                 // admins are not bound to one site
  if (covered.includes('')) return true    // an unassigned template serves all
  return !!userDomain && covered.includes(userDomain)
}

export function sitesMissingTemplate(vendor: Vendor): string[] {
  const covered = vendor.formatDomains ?? []
  if (covered.includes('')) return []   // an unassigned template covers every site
  return (vendor.domains ?? []).filter((d) => !covered.includes(d))
}

/** Where a file's wafer id comes from. Only two of the six real vendor formats
 *  surveyed in 2026-08 carry a per-row wafer id column. */
export type WaferIdSource = 'column' | 'cell' | 'label' | 'filename' | 'single'

export interface VendorFormat {
  id: number
  format_name: string | null
  header_row: number
  data_start_row: number
  lower_limit_row: number
  upper_limit_row: number
  electrical_start_col: number
  /** Null unless wafer_id_source is 'column'. */
  wafer_id_col: number | null
  bin_col: number
  x_coord_col: number | null
  y_coord_col: number | null
  product_id_col: number | null
  lot_id_col: number | null
  fixed_die_count: number | null
  product_id_cell: string | null
  lot_id_cell: string | null

  // Flexible layout descriptors. All optional, so a template written against
  // the original column-only model keeps working unchanged.
  wafer_id_source?: WaferIdSource
  wafer_id_cell?: string | null
  /** Label to anchor on when the wafer-id row drifts between files. */
  wafer_id_label?: string | null
  /** Regex refining an extracted id; group 1 wins, e.g. `-(\d+)$`. */
  wafer_id_pattern?: string | null
  product_id_label?: string | null
  lot_id_label?: string | null
  /** Refine the extracted value, same convention as wafer_id_pattern.
   *  世界先进 writes its lot as "H2XR46.1-01"; without stripping the suffix
   *  every wafer becomes its own single-wafer lot. */
  product_id_pattern?: string | null
  lot_id_pattern?: string | null
  /** Last resort: read from the FILE NAME, tried only when the file's own
   *  contents yield nothing — so only those files need a naming convention. */
  product_id_filename_pattern?: string | null
  lot_id_filename_pattern?: string | null
  /** Second header row naming the id columns, when split from the param row. */
  id_header_row?: number | null
  unit_row?: number | null
  /** Worksheet name, or `#n` for a 1-indexed position. */
  sheet_selector?: string | null
  /** Explicit electrical columns; null = contiguous scan from the start col. */
  param_cols?: number[] | null
  /** 'tab' | 'comma', or null to sniff. */
  text_delimiter?: string | null

  /** AD site (廠區) this template belongs to; null = unassigned (all sites). */
  domain?: string | null
  /** Saved versions. 0 means the template predates history tracking. */
  version?: number
  /** Newest kept sample, for the download action on the template row. */
  sampleToken?: string | null
  sampleName?: string | null
}

export interface Product {
  id: number
  product_code: string
  vendor_id: number
  vendor_code: string
  vendor_name: string
  /** AD site (廠區) the product belongs to; null for legacy/unassigned. */
  domain?: string | null
}

export interface LotInfo {
  id: number
  lotId: string
  productCode: string
  status: string
}

export async function getVendors(site?: string): Promise<Vendor[]> {
  const qs = site ? `?site=${encodeURIComponent(site)}` : ''
  return apiFetch(`/vendors${qs}`)
}

export async function createVendor(data: { code: string; name: string }): Promise<Vendor> {
  return apiFetch('/vendors', { method: 'POST', body: JSON.stringify(data) })
}

/**
 * Remove a vendor together with its site links and format templates.
 * Refused by the server while any lot exists for it — CP data is the record of
 * what shipped, so the vendor cannot be removed out from under it.
 */
export async function deleteVendor(vendorId: number): Promise<{
  success: boolean; deletedFormats: number; deletedProducts: number
}> {
  return apiFetch(`/vendors/${vendorId}`, { method: 'DELETE' })
}

export async function getVendorFormats(vendorId: number, site?: string): Promise<VendorFormat[]> {
  const qs = site ? `?site=${encodeURIComponent(site)}` : ''
  return apiFetch(`/vendors/${vendorId}/formats${qs}`)
}

// `site` (admins only) tags a newly created template with a target 廠區; a site
// user's template is always tagged with their own site server-side.
export async function createVendorFormat(vendorId: number, data: Omit<VendorFormat, 'id'>, site?: string): Promise<VendorFormat> {
  const qs = site ? `?site=${encodeURIComponent(site)}` : ''
  return apiFetch(`/vendors/${vendorId}/formats${qs}`, { method: 'POST', body: JSON.stringify(data) })
}

export async function updateVendorFormat(vendorId: number, fmtId: number, data: Partial<VendorFormat>): Promise<VendorFormat> {
  return apiFetch(`/vendors/${vendorId}/formats/${fmtId}`, { method: 'PUT', body: JSON.stringify(data) })
}

export async function deleteVendorFormat(vendorId: number, fmtId: number): Promise<void> {
  return apiFetch(`/vendors/${vendorId}/formats/${fmtId}`, { method: 'DELETE' })
}

export async function getProducts(site?: string): Promise<Product[]> {
  const qs = site ? `?site=${encodeURIComponent(site)}` : ''
  return apiFetch(`/vendors/products${qs}`)
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

// `site` is an AD domain code to scope scores to one site (admins only);
// '' = group-wide (all sites). Site users are always locked to their own site.
function scoreQuery(period?: string, site?: string): string {
  const p = new URLSearchParams()
  if (period) p.set('period', period)
  if (site) p.set('site', site)
  const qs = p.toString()
  return qs ? `?${qs}` : ''
}

export async function getVendorScores(period?: string, site?: string): Promise<VendorScore[]> {
  return apiFetch(`/vendors/scores${scoreQuery(period, site)}`)
}

export async function calculateVendorScores(period?: string, site?: string): Promise<VendorScore[]> {
  return apiFetch(`/vendors/scores/calculate${scoreQuery(period, site)}`, { method: 'POST' })
}
