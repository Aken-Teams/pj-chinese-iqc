import { apiFetch } from './api'

export interface UploadPreview {
  fileName: string
  wafersDetected: number
  diePerWafer: number | null
  dataRows: number
  format: string
  productId: string | null
  lotId: string | null
  paramNames: string[]
}

export interface UploadConfirmResult {
  success: boolean
  lotId: number
  lotCode: string
  waferCount: number
  totalRows: number
}

export async function uploadCpData(file: File, vendor: string, lang: string = 'zh-TW'): Promise<UploadPreview> {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('vendor', vendor)
  formData.append('lang', lang)

  const token = localStorage.getItem('iqc-auth-token')
  const headers: Record<string, string> = {}
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch('/api/upload/cp-data', {
    method: 'POST',
    headers,
    body: formData,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || `Upload failed: ${res.status}`)
  }
  return res.json()
}

export async function confirmUpload(filePath: string, vendorCode: string): Promise<UploadConfirmResult> {
  return apiFetch<UploadConfirmResult>('/upload/confirm', {
    method: 'POST',
    body: JSON.stringify({ file_path: filePath, vendor_code: vendorCode }),
  })
}

export interface BatchUploadResult {
  fileName: string
  success: boolean
  error: string | null
  lotId?: number
  lotCode?: string
  waferCount?: number
  totalRows?: number
}

export async function batchUpload(files: File[], vendor: string, lang: string = 'zh-TW'): Promise<BatchUploadResult[]> {
  const formData = new FormData()
  for (const file of files) {
    formData.append('files', file)
  }
  formData.append('vendor', vendor)
  formData.append('lang', lang)

  const token = localStorage.getItem('iqc-auth-token')
  const headers: Record<string, string> = {}
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch('/api/upload/batch', {
    method: 'POST',
    headers,
    body: formData,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || `Batch upload failed: ${res.status}`)
  }
  return res.json()
}
