import { useState, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { CloudUpload, FileSpreadsheet, Loader2 } from 'lucide-react'
import PageHeader from '@/components/layout/PageHeader'
import { uploadCpData, confirmUpload, type UploadPreview } from '@/services/upload'

const VENDOR_OPTIONS = ['JJW', 'XRW', 'HJM']

export default function UploadPage() {
  const { t, i18n } = useTranslation('upload')
  const navigate = useNavigate()
  const [isDragOver, setIsDragOver] = useState(false)
  const [selectedVendor, setSelectedVendor] = useState('JJW')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<UploadPreview | null>(null)
  const [uploading, setUploading] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const handleFileUpload = async (file: File) => {
    setError('')
    setSuccess('')
    setUploading(true)
    try {
      const result = await uploadCpData(file, selectedVendor, i18n.language)
      setPreview(result)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('error.uploadFailed'))
    } finally {
      setUploading(false)
    }
  }

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFileUpload(file)
  }, [selectedVendor])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFileUpload(file)
  }

  const handleBrowseClick = () => {
    fileInputRef.current?.click()
  }

  const handleConfirm = async () => {
    if (!preview) return
    setConfirming(true)
    setError('')
    try {
      const result = await confirmUpload(preview.fileName, preview.format)
      setSuccess(t('preview.success', { lot: result.lotCode, wafers: result.waferCount, rows: result.totalRows }))
      setPreview(null)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('error.confirmFailed'))
    } finally {
      setConfirming(false)
    }
  }

  return (
    <div className="p-12">
      <PageHeader title={t('title')} subtitle={t('subtitle')} />

      {error && (
        <div className="mt-4 bg-badge-fail text-error text-sm px-4 py-2.5 font-medium">{error}</div>
      )}
      {success && (
        <div className="mt-4 bg-badge-pass text-success text-sm px-4 py-2.5 font-medium">{success}</div>
      )}

      {/* Drop Zone */}
      <div
        className={`mt-7 flex h-[220px] w-full flex-col items-center justify-center border-2 border-dashed transition-colors ${
          isDragOver ? 'border-accent bg-accent/5' : 'border-border-light'
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {uploading ? (
          <Loader2 size={48} className="text-accent animate-spin" />
        ) : (
          <CloudUpload size={48} className="text-text-muted" />
        )}
        <span className="mt-3 font-heading text-[18px] font-semibold text-text-primary">
          {uploading ? t('dropzone.uploading') : t('dropzone.title')}
        </span>
        <span className="mt-1 text-[14px] text-text-secondary">
          {t('dropzone.subtitle')}
        </span>
        <button
          type="button"
          onClick={handleBrowseClick}
          disabled={uploading}
          className="mt-4 bg-accent px-5 py-2.5 font-heading text-[11px] font-bold uppercase tracking-[1px] text-white hover:bg-accent/90 disabled:opacity-50"
        >
          {t('dropzone.browse')}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          onChange={handleFileChange}
          className="hidden"
        />
      </div>

      {/* Bottom Row */}
      <div className="mt-6 flex gap-6">
        {/* Format Configuration */}
        <div className="flex-1 bg-bg-card p-6">
          <h3 className="mb-4 font-heading font-bold">{t('formatConfig.title')}</h3>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-bold uppercase tracking-[0.5px] text-text-tertiary">
                {t('formatConfig.vendor')}
              </label>
              <select
                value={selectedVendor}
                onChange={(e) => setSelectedVendor(e.target.value)}
                className="border border-border-light bg-white px-3 py-2 text-[13px] text-text-primary"
              >
                {VENDOR_OPTIONS.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-bold uppercase tracking-[0.5px] text-text-tertiary">
                {t('formatConfig.formatId')}
              </label>
              <select
                disabled
                className="border border-border-light bg-white px-3 py-2 text-[13px] text-text-muted"
              >
                <option>{preview ? preview.format : t('formatConfig.autoDetected')}</option>
              </select>
            </div>
            <p className="text-[13px] text-text-secondary">
              {t('formatConfig.description')}
            </p>
          </div>
        </div>

        {/* Upload Preview */}
        <div className="w-[380px] bg-bg-card p-6">
          <h3 className="mb-4 font-heading font-bold">{t('preview.title')}</h3>
          {preview ? (
            <>
              <div className="flex items-center gap-3 border-b border-border-light pb-4">
                <FileSpreadsheet size={20} className="text-success" />
                <span className="text-[13px] font-semibold text-text-primary">
                  {preview.fileName}
                </span>
              </div>
              <div className="mt-4 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="text-[13px] text-text-secondary">{t('preview.wafersDetected')}</span>
                  <span className="text-[13px] font-semibold text-text-primary">{preview.wafersDetected}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[13px] text-text-secondary">{t('preview.diePerWafer')}</span>
                  <span className="text-[13px] font-semibold text-text-primary">{preview.diePerWafer ?? t('preview.variable')}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[13px] text-text-secondary">{t('preview.rows')}</span>
                  <span className="text-[13px] font-semibold text-text-primary">{preview.dataRows.toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[13px] text-text-secondary">{t('preview.formatMapped')}</span>
                  <span className="text-[13px] font-semibold text-text-primary">{preview.format}</span>
                </div>
                {preview.productId && (
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] text-text-secondary">{t('preview.product')}</span>
                    <span className="text-[13px] font-semibold text-text-primary">{preview.productId}</span>
                  </div>
                )}
                {preview.lotId && (
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] text-text-secondary">{t('preview.lot')}</span>
                    <span className="text-[13px] font-semibold text-text-primary">{preview.lotId}</span>
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={confirming}
                className="mt-4 w-full bg-accent px-5 py-2.5 font-heading text-[11px] font-bold uppercase tracking-[1px] text-white hover:bg-accent/90 disabled:opacity-50"
              >
                {confirming ? t('preview.processing') : t('preview.confirm')}
              </button>
            </>
          ) : (
            <p className="text-[13px] text-text-muted mt-4">
              {t('preview.noFile')}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
