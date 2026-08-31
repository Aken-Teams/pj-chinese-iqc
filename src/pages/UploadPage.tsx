import { useState, useEffect, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { CloudUpload, FileSpreadsheet, Loader2, CheckCircle, XCircle } from 'lucide-react'
import PageHeader from '@/components/layout/PageHeader'
import SearchSelect from '@/components/ui/SearchSelect'
import { useAuthStore } from '@/store/authStore'
import { uploadCpData, confirmUpload, batchUploadOne, type UploadPreview, type BatchUploadResult } from '@/services/upload'
import { getVendors, canUploadFor } from '@/services/vendors'

type Mode = 'single' | 'batch'

function SingleUpload({ selectedVendor, setSelectedVendor, vendorCodes, unusableVendors }: { selectedVendor: string; setSelectedVendor: (v: string) => void; vendorCodes: string[]; unusableVendors: Record<string, string> }) {
  const { t, i18n } = useTranslation('upload')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const [preview, setPreview] = useState<UploadPreview | null>(null)
  const [uploading, setUploading] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [cachedFile, setCachedFile] = useState<File | null>(null)

  const runPreview = async (file: File) => {
    setCachedFile(file)
    setError(''); setSuccess(''); setUploading(true)
    try {
      const result = await uploadCpData(file, selectedVendor, i18n.language)
      setPreview(result)
      // No vendor chosen → adopt the auto-detected one so the field reflects it.
      if (!selectedVendor && result.detectedVendor) {
        setSelectedVendor(result.detectedVendor)
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('error.uploadFailed'))
      setPreview(null)
    } finally { setUploading(false) }
  }

  // Re-run preview automatically when vendor changes while a file is cached.
  // This lets users correct a wrong vendor choice without needing a page refresh.
  useEffect(() => {
    if (cachedFile && selectedVendor) {
      runPreview(cachedFile)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedVendor])

  const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragOver(true) }, [])
  const handleDragLeave = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragOver(false) }, [])
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setIsDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) runPreview(file)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedVendor])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) runPreview(file)
  }

  const handleConfirm = async () => {
    if (!preview) return
    setConfirming(true); setError('')
    try {
      const result = await confirmUpload(preview.fileName, preview.format)
      setSuccess(t('preview.success', { lot: result.lotCode, wafers: result.waferCount, rows: result.totalRows }))
      setPreview(null)
      setCachedFile(null)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('error.confirmFailed'))
    } finally { setConfirming(false) }
  }

  const detected = preview?.detectedVendor
  // File content points at a different vendor than the one selected.
  const vendorMismatch = !!(preview && detected && selectedVendor && detected !== selectedVendor)
  // Selected vendor parsed nothing and no other vendor matched either.
  const noDataNoMatch = !!(preview && preview.dataRows === 0 && !vendorMismatch)

  return (
    <>
      {/* Step 1: vendor + format ID bar */}
      <div className="mt-6 bg-bg-card p-6">
        <div className="flex items-end gap-6">
          <div className="flex-1 flex flex-col gap-1.5">
            <label className="text-[11px] font-bold uppercase tracking-[0.5px] text-text-tertiary">{t('formatConfig.step1')}</label>
            <SearchSelect
              items={vendorCodes}
              value={selectedVendor}
              onChange={setSelectedVendor}
              placeholder={t('formatConfig.autoDetectVendor')}
              unavailable={unusableVendors}
            />
          </div>
          <div className="w-[280px] flex flex-col gap-1.5">
            <label className="text-[11px] font-bold uppercase tracking-[0.5px] text-text-tertiary">{t('formatConfig.formatId')}</label>
            <div className="border border-border-light bg-bg-page px-3 py-2 text-[13px] text-text-muted">
              {preview ? preview.format : t('formatConfig.autoDetected')}
            </div>
          </div>
        </div>
        <p className="mt-3 text-[13px] text-text-secondary">{t('formatConfig.description')}</p>
      </div>

      {error && <div className="mt-4 bg-badge-fail text-error text-sm px-4 py-2.5 font-medium">{error}</div>}
      {success && <div className="mt-4 bg-badge-pass text-success text-sm px-4 py-2.5 font-medium">{success}</div>}

      {vendorMismatch && (
        <div className="mt-4 flex flex-wrap items-center gap-3 border border-warning/40 bg-badge-warn px-4 py-3 text-[13px] text-warning">
          <span className="flex-1 min-w-[200px]">
            {t('warning.vendorMismatch', { detected, selected: selectedVendor })}
          </span>
          <button
            type="button"
            onClick={() => detected && setSelectedVendor(detected)}
            className="bg-warning/90 px-3 py-1.5 font-heading text-[11px] font-bold uppercase tracking-[0.5px] text-white hover:bg-warning"
          >
            {t('warning.switchTo', { vendor: detected })}
          </button>
        </div>
      )}
      {noDataNoMatch && (
        <div className="mt-4 border border-error/30 bg-badge-fail px-4 py-3 text-[13px] text-error">
          {t('warning.noData')}
        </div>
      )}

      {/* Step 2: drop zone + preview side-by-side when preview available */}
      <label className="mt-6 block text-[11px] font-bold uppercase tracking-[0.5px] text-text-tertiary">{t('formatConfig.step2')}</label>
      <div className="mt-2 flex items-stretch gap-6">
        <div
          className={`flex min-h-[220px] flex-[2] flex-col items-center justify-center border-2 border-dashed transition-colors ${isDragOver ? 'border-accent bg-accent/5' : 'border-border-light'}`}
          onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
        >
          {uploading ? <Loader2 size={48} className="text-accent animate-spin" /> : <CloudUpload size={48} className="text-text-muted" />}
          <span className="mt-3 font-heading text-[18px] font-semibold text-text-primary">
            {uploading
              ? (cachedFile ? t('formatConfig.retrying') : t('dropzone.uploading'))
              : t('dropzone.title')}
          </span>
          <span className="mt-1 text-[14px] text-text-secondary">{t('dropzone.subtitle')}</span>
          <button
            type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading}
            className="mt-4 bg-accent px-5 py-2.5 font-heading text-[11px] font-bold uppercase tracking-[1px] text-white hover:bg-accent/90 disabled:opacity-50"
          >
            {t('dropzone.browse')}
          </button>
          <input ref={fileInputRef} type="file" accept=".xlsx,.xlsm,.xls,.csv,.txt" onChange={handleFileChange} className="hidden" />
        </div>

        {preview && (
          <div className="flex flex-1 flex-col bg-bg-card p-6">
            <h3 className="mb-4 font-heading font-bold">{t('preview.title')}</h3>
            <div className="flex items-center gap-3 border-b border-border-light pb-4">
              <FileSpreadsheet size={20} className="text-success" />
              <span className="text-[13px] font-semibold text-text-primary truncate">{preview.fileName}</span>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-y-2.5">
              {[
                { label: t('preview.wafersDetected'), value: preview.wafersDetected },
                { label: t('preview.diePerWafer'), value: preview.diePerWafer ?? t('preview.variable') },
                { label: t('preview.rows'), value: preview.dataRows.toLocaleString() },
                { label: t('preview.formatMapped'), value: preview.format },
                ...(preview.productId ? [{ label: t('preview.product'), value: preview.productId }] : []),
                ...(preview.lotId ? [{ label: t('preview.lot'), value: preview.lotId }] : []),
              ].map(({ label, value }) => (
                <div key={label} className="flex items-center justify-between">
                  <span className="text-[13px] text-text-secondary">{label}</span>
                  <span className="text-[13px] font-semibold text-text-primary">{value}</span>
                </div>
              ))}
            </div>
            <button
              type="button" onClick={handleConfirm} disabled={confirming}
              className="mt-5 w-full bg-accent px-5 py-2.5 font-heading text-[11px] font-bold uppercase tracking-[1px] text-white hover:bg-accent/90 disabled:opacity-50"
            >
              {confirming ? t('preview.processing') : t('preview.confirm')}
            </button>
          </div>
        )}
      </div>
    </>
  )
}

/** A file's place in the batch run. `pending` rows are shown before the run
 *  starts, so the list stays the same list throughout, rather than a preview
 *  that gets replaced by a result table. */
interface BatchRow {
  name: string
  status: 'pending' | 'running' | 'ok' | 'fail'
  result?: BatchUploadResult
}

function BatchUpload({ selectedVendor, setSelectedVendor, vendorCodes, unusableVendors }: { selectedVendor: string; setSelectedVendor: (v: string) => void; vendorCodes: string[]; unusableVendors: Record<string, string> }) {
  const { t, i18n } = useTranslation('upload')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [files, setFiles] = useState<File[]>([])
  const [processing, setProcessing] = useState(false)
  // One row per selected file, updated as each import lands. The previous
  // version posted all 20 files in a single request and rendered nothing until
  // the last one finished, so a working import looked identical to a hang.
  const [rows, setRows] = useState<BatchRow[]>([])
  const [error, setError] = useState('')

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files ?? [])
    if (selected.length > 0) {
      setFiles(selected)
      setRows(selected.map((f) => ({ name: f.name, status: 'pending' })))
    }
  }

  const handleStart = async () => {
    if (files.length === 0) return
    setProcessing(true); setError('')
    setRows(files.map((f) => ({ name: f.name, status: 'pending' })))
    const patch = (i: number, next: Partial<BatchRow>) =>
      setRows((prev) => prev.map((r, j) => (j === i ? { ...r, ...next } : r)))

    for (let i = 0; i < files.length; i++) {
      patch(i, { status: 'running' })
      try {
        const r = await batchUploadOne(files[i], selectedVendor, i18n.language)
        patch(i, { status: r.success ? 'ok' : 'fail', result: r })
      } catch (err: unknown) {
        // A transport failure kills this file, not the run: the remaining
        // files are independent imports and should still be attempted.
        patch(i, {
          status: 'fail',
          result: {
            fileName: files[i].name, success: false,
            error: err instanceof Error ? err.message : t('error.uploadFailed'),
          },
        })
      }
    }
    setProcessing(false)
  }

  const successCount = rows.filter((r) => r.status === 'ok').length
  const failCount = rows.filter((r) => r.status === 'fail').length
  const doneCount = successCount + failCount
  const started = processing || doneCount > 0

  return (
    <div className="mt-7 flex flex-col gap-6">
      {error && <div className="bg-badge-fail text-error text-sm px-4 py-2.5 font-medium">{error}</div>}

      <div className="bg-bg-card p-6 flex flex-wrap gap-6 items-end">
        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] font-bold uppercase tracking-[0.5px] text-text-tertiary">{t('formatConfig.vendor')}</label>
          <SearchSelect
            items={vendorCodes}
            value={selectedVendor}
            onChange={setSelectedVendor}
            placeholder={t('formatConfig.autoDetectVendor')}
            className="min-w-[180px]"
            unavailable={unusableVendors}
          />
        </div>

        <div className="flex flex-col gap-1.5 flex-1">
          <label className="text-[11px] font-bold uppercase tracking-[0.5px] text-text-tertiary">{t('batch.title')}</label>
          <div className="flex gap-3 items-center">
            <button
              type="button" onClick={() => fileInputRef.current?.click()}
              className="bg-bg-page border border-border-light px-4 py-2 text-sm text-text-secondary hover:bg-border-light transition-colors"
            >
              {t('batch.selectFiles')}
            </button>
            {files.length > 0 && (
              <span className="text-sm text-text-primary font-medium">
                {t('batch.selectedCount', { count: files.length })}
              </span>
            )}
            <input ref={fileInputRef} type="file" accept=".xlsx,.xlsm,.xls,.csv,.txt" multiple onChange={handleFileChange} className="hidden" />
          </div>
        </div>

        <button
          type="button" onClick={handleStart} disabled={files.length === 0 || processing}
          className="bg-accent text-white px-5 py-2 font-heading text-[11px] font-bold uppercase tracking-[1px] hover:bg-accent/90 disabled:opacity-50 flex items-center gap-2"
        >
          {processing && <Loader2 size={14} className="animate-spin" />}
          {processing ? t('batch.processing') : t('batch.start')}
        </button>
      </div>

      {rows.length > 0 && (
        <div className="bg-bg-card p-6">
          <div className="flex items-center gap-4 mb-4">
            <h3 className="font-heading font-bold">
              {started ? t('batch.results') : t('batch.pending')}
            </h3>
            {started && (
              <span className="text-sm text-text-secondary tabular-nums">
                {doneCount} / {rows.length}
              </span>
            )}
            {successCount > 0 && (
              <span className="bg-badge-pass text-success text-[12px] font-semibold px-2.5 py-1">
                {successCount} {t('batch.success')}
              </span>
            )}
            {failCount > 0 && (
              <span className="bg-badge-fail text-error text-[12px] font-semibold px-2.5 py-1">
                {failCount} {t('batch.failed')}
              </span>
            )}
          </div>

          {started && (
            <div className="h-1 bg-border-light mb-4">
              <div
                className="h-full bg-accent transition-[width] duration-300"
                style={{ width: `${(doneCount / rows.length) * 100}%` }}
              />
            </div>
          )}

          <div className="flex flex-col gap-2">
            {rows.map((r, i) => (
              <div
                key={i}
                className={`flex items-start gap-3 p-3 border ${
                  r.status === 'fail' ? 'border-error/30 bg-badge-fail/30'
                  : r.status === 'running' ? 'border-accent/40'
                  : 'border-border-light'
                }`}
              >
                {r.status === 'ok' ? <CheckCircle size={16} className="text-success shrink-0 mt-0.5" />
                  : r.status === 'fail' ? <XCircle size={16} className="text-error shrink-0 mt-0.5" />
                  : r.status === 'running' ? <Loader2 size={16} className="text-accent shrink-0 mt-0.5 animate-spin" />
                  : <FileSpreadsheet size={16} className="text-text-muted shrink-0 mt-0.5" />}

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-text-primary truncate">{r.name}</span>
                    {/* The supplier badge. With auto-detect on this is the only
                        place the uploader learns what the file was read as. */}
                    {r.result?.vendor && (
                      <span className="bg-accent/15 text-accent text-[11px] font-semibold px-2 py-0.5 shrink-0">
                        {r.result.vendor}
                        {r.result.vendorName ? ` ${r.result.vendorName}` : ''}
                      </span>
                    )}
                  </div>
                  {r.status === 'ok' && r.result ? (
                    <span className="text-xs text-text-secondary">
                      {r.result.lotCode} · {t('batch.wafers', { count: r.result.waferCount })} · {t('batch.rows', { count: r.result.totalRows })}
                    </span>
                  ) : r.status === 'fail' ? (
                    <span className="text-xs text-error">{r.result?.error}</span>
                  ) : (
                    <span className="text-xs text-text-muted">
                      {r.status === 'running' ? t('batch.importing')
                        : started ? t('batch.queued')
                        : t('batch.notStarted')}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default function UploadPage() {
  const { t } = useTranslation('upload')
  const [mode, setMode] = useState<Mode>('single')
  const [vendorCodes, setVendorCodes] = useState<string[]>([])
  const [selectedVendor, setSelectedVendor] = useState('')
  // Vendors this site can see but has no template for. Shown, and shown as
  // unpickable: selecting one only fails later at upload time.
  const [unusableVendors, setUnusableVendors] = useState<Record<string, string>>({})
  const user = useAuthStore((s) => s.user)

  useEffect(() => {
    getVendors().then((list) => {
      setVendorCodes(list.map((v) => v.code))
      const blocked: Record<string, string> = {}
      for (const v of list) {
        if (!canUploadFor(v, user?.domain, user?.role === 'admin')) {
          blocked[v.code] = t('noTemplateForSite')
        }
      }
      setUnusableVendors(blocked)
      // Leave vendor blank so the server auto-detects it from the dropped file.
    }).catch(() => {})
  }, [user, t])

  return (
    <div className="p-12">
      <PageHeader title={t('title')} subtitle={t('subtitle')} />

      {/* Mode toggle tabs */}
      <div className="flex gap-0 mt-6 border-b border-border-light">
        {(['single', 'batch'] as Mode[]).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`px-5 py-2.5 font-heading text-[11px] font-bold uppercase tracking-[1px] transition-colors border-b-2 -mb-px ${
              mode === m ? 'border-accent text-accent' : 'border-transparent text-text-tertiary hover:text-text-primary'
            }`}
          >
            {m === 'single' ? t('modeSingle') : t('modeBatch')}
          </button>
        ))}
      </div>

      {mode === 'single'
        ? <SingleUpload selectedVendor={selectedVendor} setSelectedVendor={setSelectedVendor}
                        vendorCodes={vendorCodes} unusableVendors={unusableVendors} />
        : <BatchUpload selectedVendor={selectedVendor} setSelectedVendor={setSelectedVendor}
                       vendorCodes={vendorCodes} unusableVendors={unusableVendors} />}
    </div>
  )
}
