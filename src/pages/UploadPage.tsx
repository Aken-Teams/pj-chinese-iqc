import { useState, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { CloudUpload, FileSpreadsheet } from 'lucide-react'
import PageHeader from '@/components/layout/PageHeader'

const VENDOR_OPTIONS = ['JJW', 'XRW', 'HJM']

const mockPreview = {
  fileName: 'PD680_CP_data.xlsx',
  wafersDetected: 25,
  diePerWafer: 208,
  dataRows: '5,200',
  format: 'JJW',
}

export default function UploadPage() {
  const { t } = useTranslation('upload')
  const [isDragOver, setIsDragOver] = useState(false)
  const [selectedVendor, setSelectedVendor] = useState('JJW')
  const fileInputRef = useRef<HTMLInputElement>(null)

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
    // File handling would go here
  }, [])

  const handleBrowseClick = () => {
    fileInputRef.current?.click()
  }

  return (
    <div className="p-12">
      <PageHeader title={t('title')} subtitle={t('subtitle')} />

      {/* Drop Zone */}
      <div
        className={`mt-7 flex h-[220px] w-full flex-col items-center justify-center border-2 border-dashed transition-colors ${
          isDragOver ? 'border-accent bg-accent/5' : 'border-border-light'
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <CloudUpload size={48} className="text-text-muted" />
        <span className="mt-3 font-heading text-[18px] font-semibold text-text-primary">
          {t('dropzone.title')}
        </span>
        <span className="mt-1 text-[14px] text-text-secondary">
          {t('dropzone.subtitle')}
        </span>
        <button
          type="button"
          onClick={handleBrowseClick}
          className="mt-4 bg-accent px-5 py-2.5 font-heading text-[11px] font-bold uppercase tracking-[1px] text-white hover:bg-accent/90"
        >
          {t('dropzone.browse')}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
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
                <option>{t('formatConfig.autoDetected')}</option>
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
          <div className="flex items-center gap-3 border-b border-border-light pb-4">
            <FileSpreadsheet size={20} className="text-success" />
            <span className="text-[13px] font-semibold text-text-primary">
              {mockPreview.fileName}
            </span>
          </div>
          <div className="mt-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-[13px] text-text-secondary">
                {t('preview.wafersDetected')}
              </span>
              <span className="text-[13px] font-semibold text-text-primary">
                {mockPreview.wafersDetected}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[13px] text-text-secondary">
                {t('preview.diePerWafer')}
              </span>
              <span className="text-[13px] font-semibold text-text-primary">
                {mockPreview.diePerWafer}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[13px] text-text-secondary">
                {t('preview.rows')}
              </span>
              <span className="text-[13px] font-semibold text-text-primary">
                {mockPreview.dataRows}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[13px] text-text-secondary">
                {t('preview.formatMapped')}
              </span>
              <span className="text-[13px] font-semibold text-text-primary">
                {mockPreview.format}
              </span>
            </div>
          </div>
          <button
            type="button"
            className="mt-4 w-full bg-accent px-5 py-2.5 font-heading text-[11px] font-bold uppercase tracking-[1px] text-white hover:bg-accent/90"
          >
            {t('preview.confirm')}
          </button>
        </div>
      </div>
    </div>
  )
}
