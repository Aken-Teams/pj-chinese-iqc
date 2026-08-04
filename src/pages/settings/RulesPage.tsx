import { useState, useEffect, useMemo, useRef, Fragment } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Plus, Trash2, Check, X, Upload, Loader2, CheckCircle, AlertTriangle, XCircle, RefreshCw,
  PackagePlus, ChevronDown, ChevronRight, Search, Table2, Download,
} from 'lucide-react'
import PageHeader from '@/components/layout/PageHeader'
import { getProducts, type Product } from '@/services/vendors'
import {
  getRules, createRule, updateRule, deleteRule, deleteProductRules,
  importRulesPreview, confirmRulesImport,
  type ReviewRule, type RulesImportPreview, type RulePreviewRow,
} from '@/services/rules'
import { useAuthStore } from '@/store/authStore'
import { siteLabel, siteOptions } from '@/config/sites'
import Select from '@/components/ui/Select'

type LimitKey = 'q1_lower' | 'q1_upper' | 'q2_lower' | 'q2_upper' | 'q3_lower' | 'q3_upper'

const LIMIT_KEYS: { key: LimitKey; labelKey: string }[] = [
  { key: 'q1_lower', labelKey: 'q1Lower' },
  { key: 'q1_upper', labelKey: 'q1Upper' },
  { key: 'q2_lower', labelKey: 'q2Lower' },
  { key: 'q2_upper', labelKey: 'q2Upper' },
  { key: 'q3_lower', labelKey: 'q3Lower' },
  { key: 'q3_upper', labelKey: 'q3Upper' },
]

const IMPORTABLE_STATUSES = ['ready', 'update_existing', 'auto_create']

type RuleDraft = Omit<ReviewRule, 'id'>

function RuleRow({
  rule,
  productId,
  onSaved,
  onDeleted,
}: {
  rule: ReviewRule | null
  productId: number
  onSaved: (r: ReviewRule) => void
  onDeleted?: () => void
}) {
  const { t } = useTranslation('settings')
  const [editing, setEditing] = useState(rule === null)
  const [draft, setDraft] = useState<RuleDraft>(
    rule ?? {
      product_id: productId,
      param_name: '',
      q1_lower: null, q1_upper: null,
      q2_lower: null, q2_upper: null,
      q3_lower: null, q3_upper: null,
    }
  )
  const [saving, setSaving] = useState(false)

  function setLimit(key: LimitKey, val: string) {
    setDraft((d) => ({ ...d, [key]: val === '' ? null : Number(val) }))
  }

  async function save() {
    if (!draft.param_name.trim()) return
    setSaving(true)
    try {
      const saved = rule
        ? await updateRule(rule.id, draft)
        : await createRule(draft)
      onSaved(saved)
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  function cancel() {
    if (rule === null) onDeleted?.()
    else { setDraft(rule); setEditing(false) }
  }

  async function remove() {
    if (!rule || !window.confirm(t('rules.confirmDelete'))) return
    await deleteRule(rule.id)
    onDeleted?.()
  }

  if (!editing) {
    return (
      <tr className="border-b border-border-light hover:bg-bg-page transition-colors">
        <td className="px-4 py-2.5 text-sm font-medium text-text-primary">{rule?.param_name}</td>
        {LIMIT_KEYS.map(({ key }) => (
          <td key={key} className="px-3 py-2.5 text-sm text-text-secondary text-right">
            {rule?.[key] != null ? String(rule[key]) : '—'}
          </td>
        ))}
        <td className="px-3 py-2.5 text-right">
          <div className="flex justify-end gap-1">
            <button onClick={() => setEditing(true)} className="p-1 text-text-muted hover:text-accent cursor-pointer">
              <Check size={14} />
            </button>
            <button onClick={remove} className="p-1 text-text-muted hover:text-danger cursor-pointer">
              <Trash2 size={14} />
            </button>
          </div>
        </td>
      </tr>
    )
  }

  return (
    <tr className="border-b border-accent/30 bg-bg-page/50">
      <td className="px-4 py-2">
        <input
          className="w-full bg-bg-card border border-border-light px-2 py-1 text-sm text-text-primary outline-none focus:border-accent"
          value={draft.param_name}
          onChange={(e) => setDraft((d) => ({ ...d, param_name: e.target.value }))}
          placeholder={t('rules.paramName')}
        />
      </td>
      {LIMIT_KEYS.map(({ key }) => (
        <td key={key} className="px-2 py-2">
          <input
            type="number"
            step="any"
            className="w-full bg-bg-card border border-border-light px-2 py-1 text-sm text-text-primary outline-none focus:border-accent text-right"
            value={draft[key] ?? ''}
            onChange={(e) => setLimit(key, e.target.value)}
          />
        </td>
      ))}
      <td className="px-3 py-2">
        <div className="flex justify-end gap-1">
          <button onClick={save} disabled={saving} className="p-1 text-accent hover:text-accent/80 cursor-pointer disabled:opacity-50">
            <Check size={14} />
          </button>
          <button onClick={cancel} className="p-1 text-text-muted hover:text-text-primary cursor-pointer">
            <X size={14} />
          </button>
        </div>
      </td>
    </tr>
  )
}

/* ------------------------------------------------------------------ */
/* Status badge for import preview rows                                */
/* ------------------------------------------------------------------ */

function StatusBadge({ status, t }: { status: string; t: (k: string) => string }) {
  const base = 'inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded whitespace-nowrap'
  switch (status) {
    case 'ready':
      return <span className={`${base} bg-green-100 text-green-800`}><CheckCircle size={12} className="shrink-0" />{t('rules.importStatusReady')}</span>
    case 'update_existing':
      return <span className={`${base} bg-blue-100 text-blue-800`}><RefreshCw size={12} className="shrink-0" />{t('rules.importStatusUpdate')}</span>
    case 'auto_create':
      return <span className={`${base} bg-purple-100 text-purple-800`}><PackagePlus size={12} className="shrink-0" />{t('rules.importStatusAutoCreate')}</span>
    case 'no_param_match':
      return <span className={`${base} bg-amber-100 text-amber-800`}><AlertTriangle size={12} className="shrink-0" />{t('rules.importStatusNoMatch')}</span>
    case 'no_vendor':
      return <span className={`${base} bg-red-100 text-red-800`}><XCircle size={12} className="shrink-0" />{t('rules.importStatusNoVendor')}</span>
    default:
      return <span className="text-xs text-text-muted">{status}</span>
  }
}

/* ------------------------------------------------------------------ */
/* Import panel                                                        */
/* ------------------------------------------------------------------ */

function ImportPanel({
  onDone,
  onImported,
}: {
  onDone: () => void
  onImported: (productCodes: string[]) => void
}) {
  const { t, i18n } = useTranslation('settings')
  const fileRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<RulesImportPreview | null>(null)
  const [uploading, setUploading] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [importedCodes, setImportedCodes] = useState<string[]>([])

  async function handleUpload() {
    if (!file) return
    setUploading(true)
    setError('')
    setSuccess('')
    try {
      const data = await importRulesPreview(file, i18n.language)
      setPreview(data)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setUploading(false)
    }
  }

  async function handleConfirm() {
    if (!preview) return
    setConfirming(true)
    setError('')
    try {
      const importable = preview.rules
        .filter((r) => IMPORTABLE_STATUSES.includes(r.status))
        .map((r) => ({
          product_id: r.product_id,
          vendor_code: r.vendor_code,
          product_code: r.product_code,
          param_name: r.param_name_matched || r.param_name_excel,
          q1_lower: r.q1_lower,
          q1_upper: r.q1_upper,
          q2_lower: r.q2_lower,
          q2_upper: r.q2_upper,
          q3_lower: r.q3_lower,
          q3_upper: r.q3_upper,
        }))
      const result = await confirmRulesImport(preview.file_path, importable)
      setSuccess(
        t('rules.importSuccess', {
          created: result.created,
          updated: result.updated,
          skipped: result.skipped,
          productsCreated: result.products_created,
        })
      )
      // Track unique product codes that were imported, for quick navigation
      const codes = Array.from(new Set(importable.map((r) => r.product_code).filter((c): c is string => !!c)))
      setImportedCodes(codes)
      // Refresh parent products list so newly auto-created products appear in dropdown
      onImported(codes)
      setPreview(null)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setConfirming(false)
    }
  }

  const readyRows = preview?.rules.filter((r) => IMPORTABLE_STATUSES.includes(r.status)) ?? []

  return (
    <div className="bg-bg-card border border-border-light p-6 mb-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-heading font-bold text-text-primary">{t('rules.importTitle')}</h3>
        <button onClick={onDone} className="p-1 text-text-muted hover:text-text-primary cursor-pointer"><X size={16} /></button>
      </div>

      {/* File upload */}
      {!preview && !success && (
        <div className="flex items-center gap-3">
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          <button
            onClick={() => fileRef.current?.click()}
            className="px-4 py-2 border border-border-light text-sm text-text-secondary hover:bg-bg-page cursor-pointer"
          >
            {file ? file.name : t('rules.importSelectFile')}
          </button>
          <button
            onClick={handleUpload}
            disabled={!file || uploading}
            className="flex items-center gap-2 px-4 py-2 bg-accent text-white text-sm font-medium hover:bg-accent/90 cursor-pointer disabled:opacity-50"
          >
            {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
            {uploading ? t('rules.importUploading') : t('rules.importUpload')}
          </button>
        </div>
      )}

      {/* Messages */}
      {error && (
        <div className="mt-3 px-4 py-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded">
          {t('rules.importError')}: {error}
        </div>
      )}
      {success && (
        <div className="mt-3 px-4 py-3 bg-green-50 border border-green-200 text-green-800 text-sm rounded">
          <div className="flex items-center gap-2 font-medium">
            <CheckCircle size={16} />
            {success}
          </div>
          {importedCodes.length > 0 && (
            <div className="mt-3">
              <div className="text-xs text-green-700 mb-2">{t('rules.importViewProducts')}</div>
              <div className="flex flex-wrap gap-1.5">
                {importedCodes.map((code) => (
                  <button
                    key={code}
                    onClick={() => onImported([code])}
                    className="px-2.5 py-1 bg-white border border-green-300 text-green-800 text-xs font-mono hover:bg-green-100 cursor-pointer rounded"
                  >
                    {code}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="mt-3 flex gap-2">
            <button
              onClick={onDone}
              className="px-4 py-1.5 bg-green-600 text-white text-sm font-medium hover:bg-green-700 cursor-pointer rounded"
            >
              {t('rules.importDone')}
            </button>
          </div>
        </div>
      )}

      {/* Preview table */}
      {preview && (
        <>
          <div className="mb-3 flex items-center gap-4 text-sm">
            <span className="text-green-700 font-medium">{t('rules.importReady', { count: preview.ready_count })}</span>
            {preview.warning_count > 0 && (
              <span className="text-amber-700 font-medium">{t('rules.importWarnings', { count: preview.warning_count })}</span>
            )}
            <span className="text-text-muted">({preview.sheets_parsed.join(', ')})</span>
          </div>

          <div className="border border-border-light overflow-auto max-h-[400px]">
            <table className="w-full text-left text-sm">
              <thead className="bg-bg-page sticky top-0">
                <tr className="border-b-2 border-border-light">
                  <th className="px-3 py-2 text-xs font-semibold text-text-muted uppercase tracking-[1px]" />
                  <th className="px-3 py-2 text-xs font-semibold text-text-muted uppercase tracking-[1px]">{t('rules.importColProduct')}</th>
                  <th className="px-3 py-2 text-xs font-semibold text-text-muted uppercase tracking-[1px]">{t('rules.importColVendor')}</th>
                  <th className="px-3 py-2 text-xs font-semibold text-text-muted uppercase tracking-[1px]">{t('rules.importColExcelParam')}</th>
                  <th className="px-3 py-2 text-xs font-semibold text-text-muted uppercase tracking-[1px]">{t('rules.importColMatchedParam')}</th>
                  <th className="px-3 py-2 text-xs font-semibold text-text-muted uppercase tracking-[1px] text-center">{t('rules.importColConfidence')}</th>
                  <th className="px-3 py-2 text-xs font-semibold text-text-muted uppercase tracking-[1px] text-right">Q1</th>
                  <th className="px-3 py-2 text-xs font-semibold text-text-muted uppercase tracking-[1px] text-right">Q2</th>
                  <th className="px-3 py-2 text-xs font-semibold text-text-muted uppercase tracking-[1px] text-right">Q3</th>
                </tr>
              </thead>
              <tbody>
                {preview.rules.map((row, i) => (
                  <ImportPreviewRow key={i} row={row} t={t} />
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex items-center gap-3">
            <button
              onClick={handleConfirm}
              disabled={confirming || readyRows.length === 0}
              className="flex items-center gap-2 px-5 py-2 bg-accent text-white text-sm font-medium hover:bg-accent/90 cursor-pointer disabled:opacity-50"
            >
              {confirming ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              {confirming ? t('rules.importConfirming') : t('rules.importConfirm')}
            </button>
            <button
              onClick={onDone}
              className="px-5 py-2 border border-border-light text-sm text-text-secondary hover:bg-bg-page cursor-pointer"
            >
              {t('rules.importCancel')}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

function ImportPreviewRow({ row, t }: { row: RulePreviewRow; t: (k: string) => string }) {
  const isGood = IMPORTABLE_STATUSES.includes(row.status)
  const bgClass = isGood ? '' : 'bg-red-50/50'

  const fmtLimits = (lo: number | null, hi: number | null) => {
    if (lo == null && hi == null) return '—'
    return `[${lo ?? '—'}, ${hi ?? '—'}]`
  }

  return (
    <tr className={`border-b border-border-light ${bgClass}`}>
      <td className="px-3 py-2 whitespace-nowrap"><StatusBadge status={row.status} t={t} /></td>
      <td className="px-3 py-2 text-text-primary font-medium">{row.product_code}</td>
      <td className="px-3 py-2 text-text-secondary">{row.vendor_code}</td>
      <td className="px-3 py-2 text-text-secondary font-mono text-xs">{row.param_name_excel}</td>
      <td className="px-3 py-2 text-text-primary font-mono text-xs">
        {row.param_name_matched || <span className="text-text-muted italic">—</span>}
      </td>
      <td className="px-3 py-2 text-center">
        {row.match_confidence > 0 ? (
          <span className={`text-xs font-medium ${row.match_confidence >= 0.95 ? 'text-green-700' : row.match_confidence >= 0.8 ? 'text-amber-700' : 'text-red-700'}`}>
            {Math.round(row.match_confidence * 100)}%
          </span>
        ) : (
          <span className="text-text-muted">—</span>
        )}
      </td>
      <td className="px-3 py-2 text-right text-xs text-text-secondary">{fmtLimits(row.q1_lower, row.q1_upper)}</td>
      <td className="px-3 py-2 text-right text-xs text-text-secondary">{fmtLimits(row.q2_lower, row.q2_upper)}</td>
      <td className="px-3 py-2 text-right text-xs text-text-secondary">{fmtLimits(row.q3_lower, row.q3_upper)}</td>
    </tr>
  )
}

/* ------------------------------------------------------------------ */
/* Rule group card                                                     */
/* ------------------------------------------------------------------ */

interface RuleGroup {
  productId: number
  productCode: string
  vendorCode: string | null
  domain?: string | null
  rules: ReviewRule[]
}

function RuleGroupCard({
  group,
  expanded,
  onToggle,
  addingNew,
  onAddClick,
  onAddCancel,
  onSaved,
  onDeletedRule,
  onDeleteGroup,
}: {
  group: RuleGroup
  expanded: boolean
  onToggle: () => void
  addingNew: boolean
  onAddClick: () => void
  onAddCancel: () => void
  onSaved: (r: ReviewRule) => void
  onDeletedRule: (id: number) => void
  onDeleteGroup: () => void
}) {
  const { t } = useTranslation('settings')

  return (
    <div className="bg-bg-card border border-border-light">
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-bg-page select-none"
        onClick={onToggle}
      >
        <div className="text-text-muted shrink-0">
          {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </div>
        {group.vendorCode && (
          <span className="px-2 py-0.5 bg-accent/10 text-accent text-xs font-semibold rounded shrink-0">
            {group.vendorCode}
          </span>
        )}
        {group.domain && (
          <span className="px-2 py-0.5 bg-bg-page text-text-secondary text-[11px] font-semibold rounded shrink-0">
            {siteLabel(group.domain)}
          </span>
        )}
        <span className="font-mono text-sm font-semibold text-text-primary">{group.productCode}</span>
        <span className="text-xs text-text-muted">
          {t('rules.rulesCount', { count: group.rules.length })}
        </span>
        <div className="ml-auto flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={onAddClick}
            className="p-1.5 text-text-muted hover:text-accent cursor-pointer"
            title={t('rules.addRule')}
          >
            <Plus size={14} />
          </button>
          <button
            onClick={onDeleteGroup}
            className="p-1.5 text-text-muted hover:text-danger cursor-pointer"
            title={t('rules.deleteAllRulesTitle')}
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
      {expanded && (
        <div className="overflow-auto border-t border-border-light">
          <table className="w-full text-left">
            <thead className="bg-bg-page">
              <tr className="border-b-2 border-border-light">
                <th className="px-4 py-2.5 text-xs font-semibold text-text-muted uppercase tracking-[1px]">
                  {t('rules.paramName')}
                </th>
                {LIMIT_KEYS.map(({ labelKey }) => (
                  <th key={labelKey} className="px-3 py-2.5 text-xs font-semibold text-text-muted uppercase tracking-[1px] text-right">
                    {t(`rules.${labelKey}`)}
                  </th>
                ))}
                <th className="px-3 py-2.5 w-16" />
              </tr>
            </thead>
            <tbody>
              {group.rules.length === 0 && !addingNew && (
                <tr>
                  <td colSpan={8} className="px-4 py-6 text-sm text-text-muted text-center">
                    {t('rules.noRules')}
                  </td>
                </tr>
              )}
              {group.rules.map((rule) => (
                <RuleRow
                  key={rule.id}
                  rule={rule}
                  productId={group.productId}
                  onSaved={onSaved}
                  onDeleted={() => onDeletedRule(rule.id)}
                />
              ))}
              {addingNew && (
                <RuleRow
                  rule={null}
                  productId={group.productId}
                  onSaved={(r) => {
                    onSaved(r)
                    onAddCancel()
                  }}
                  onDeleted={onAddCancel}
                />
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Matrix (pivot) view modal                                           */
/* ------------------------------------------------------------------ */

function RulesMatrixModal({
  groups,
  onClose,
}: {
  groups: RuleGroup[]
  onClose: () => void
}) {
  const { t } = useTranslation('settings')

  const { params, rows } = useMemo(() => {
    const paramSet = new Set<string>()
    for (const g of groups) {
      for (const r of g.rules) paramSet.add(r.param_name)
    }
    const paramsArr = Array.from(paramSet).sort()
    const rowsArr = groups.map((g) => {
      const byName = new Map<string, ReviewRule>()
      g.rules.forEach((r) => byName.set(r.param_name, r))
      return {
        productId: g.productId,
        vendorCode: g.vendorCode,
        productCode: g.productCode,
        cells: paramsArr.map((p) => byName.get(p) ?? null),
      }
    })
    return { params: paramsArr, rows: rowsArr }
  }, [groups])

  const noValue = t('rules.matrixNoValue')

  function fmt(v: number | null | undefined): string {
    return v == null ? noValue : String(v)
  }

  function exportCsv() {
    const BOM = '\uFEFF'
    // Row 1: vendor, product, [param repeated 6 times per param]
    const row1 = ['', '']
    params.forEach((p) => row1.push(p, '', '', '', '', ''))
    // Row 2: empty, empty, Q1-L Q1-U Q2-L Q2-U Q3-L Q3-U repeated
    const row2 = [t('rules.matrixColVendor'), t('rules.matrixColProduct')]
    params.forEach(() => {
      row2.push(
        t('rules.q1Lower'),
        t('rules.q1Upper'),
        t('rules.q2Lower'),
        t('rules.q2Upper'),
        t('rules.q3Lower'),
        t('rules.q3Upper'),
      )
    })
    const escape = (s: string) => {
      if (s.includes(',') || s.includes('"') || s.includes('\n')) {
        return `"${s.replace(/"/g, '""')}"`
      }
      return s
    }
    const lines = [row1.map(escape).join(','), row2.map(escape).join(',')]
    rows.forEach((row) => {
      const cells: string[] = [row.vendorCode ?? '', row.productCode]
      row.cells.forEach((rule) => {
        cells.push(fmt(rule?.q1_lower))
        cells.push(fmt(rule?.q1_upper))
        cells.push(fmt(rule?.q2_lower))
        cells.push(fmt(rule?.q2_upper))
        cells.push(fmt(rule?.q3_lower))
        cells.push(fmt(rule?.q3_upper))
      })
      lines.push(cells.map(escape).join(','))
    })
    const blob = new Blob([BOM + lines.join('\n')], {
      type: 'text/csv;charset=utf-8',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `review-rules-matrix-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const subColLabels = [
    t('rules.q1Lower'),
    t('rules.q1Upper'),
    t('rules.q2Lower'),
    t('rules.q2Upper'),
    t('rules.q3Lower'),
    t('rules.q3Upper'),
  ]
  const subColKeys: (keyof ReviewRule)[] = [
    'q1_lower', 'q1_upper', 'q2_lower', 'q2_upper', 'q3_lower', 'q3_upper',
  ]

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-6"
      onClick={onClose}
    >
      <div
        className="bg-bg-card w-full max-w-[95vw] max-h-[90vh] flex flex-col border border-border-light"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-4 px-6 py-4 border-b border-border-light shrink-0">
          <div>
            <h3 className="text-base font-heading font-bold text-text-primary">
              {t('rules.matrixTitle')}
            </h3>
            <p className="text-xs text-text-muted mt-0.5">{t('rules.matrixDesc')}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={exportCsv}
              disabled={rows.length === 0 || params.length === 0}
              className="flex items-center gap-2 px-3 py-1.5 bg-accent text-white text-sm font-medium hover:bg-accent/90 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Download size={14} /> {t('rules.matrixExportCsv')}
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-text-muted hover:text-text-primary cursor-pointer"
              title={t('rules.matrixClose')}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto min-h-0">
          {rows.length === 0 || params.length === 0 ? (
            <div className="p-12 text-center text-sm text-text-muted">
              {t('rules.matrixNoRules')}
            </div>
          ) : (
            <table className="text-xs border-collapse" style={{ tableLayout: 'fixed' }}>
              <colgroup>
                <col style={{ width: '48px' }} />
                <col style={{ width: '104px' }} />
                {params.map((p) => (
                  <Fragment key={`cg-${p}`}>
                    <col style={{ width: '60px' }} />
                    <col style={{ width: '60px' }} />
                    <col style={{ width: '60px' }} />
                    <col style={{ width: '60px' }} />
                    <col style={{ width: '60px' }} />
                    <col style={{ width: '60px' }} />
                  </Fragment>
                ))}
              </colgroup>
              <thead className="sticky top-0 z-20">
                {/* Row 1: param names (span 6 sub-cols each) */}
                <tr className="bg-bg-page">
                  <th
                    className="sticky left-0 z-30 bg-bg-page px-1.5 py-2 text-[11px] font-semibold text-text-muted uppercase tracking-[1px] whitespace-nowrap text-left overflow-hidden"
                    rowSpan={2}
                    style={{ boxShadow: 'inset -1px 0 0 var(--color-border-light)' }}
                  >
                    {t('rules.matrixColVendor')}
                  </th>
                  <th
                    className="sticky left-[48px] z-30 bg-bg-page px-2 py-2 text-[11px] font-semibold text-text-muted uppercase tracking-[1px] whitespace-nowrap text-left"
                    rowSpan={2}
                    style={{ boxShadow: 'inset -2px 0 0 var(--color-border-light)' }}
                  >
                    {t('rules.matrixColProduct')}
                  </th>
                  {params.map((p, pi) => (
                    <th
                      key={p}
                      colSpan={6}
                      className={`px-3 py-2 text-[11px] font-mono font-semibold text-text-primary text-center whitespace-nowrap border-b border-border-light ${
                        pi < params.length - 1 ? 'border-r-2 border-border-light' : ''
                      }`}
                    >
                      {p}
                    </th>
                  ))}
                </tr>
                {/* Row 2: Q1-L Q1-U Q2-L Q2-U Q3-L Q3-U repeated */}
                <tr className="bg-bg-page">
                  {params.map((p, pi) => (
                    <Fragment key={`sub-${p}`}>
                      {subColLabels.map((lbl, si) => (
                        <th
                          key={`${p}-sub-${si}`}
                          className={`px-2 py-1.5 text-[10px] font-semibold text-text-muted tracking-wide whitespace-nowrap text-right border-b-2 border-border-light ${
                            si === 5 && pi < params.length - 1
                              ? 'border-r-2 border-border-light'
                              : ''
                          }`}
                        >
                          {lbl}
                        </th>
                      ))}
                    </Fragment>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.productId}
                    className="border-b border-border-light hover:bg-bg-page/50"
                  >
                    <td
                      className="sticky left-0 z-10 bg-bg-card px-1.5 py-1.5 whitespace-nowrap overflow-hidden"
                      style={{ boxShadow: 'inset -1px 0 0 var(--color-border-light)' }}
                    >
                      {row.vendorCode ? (
                        <span className="px-1 py-0.5 bg-accent/10 text-accent text-[10px] font-semibold rounded">
                          {row.vendorCode}
                        </span>
                      ) : (
                        <span className="text-text-muted">—</span>
                      )}
                    </td>
                    <td
                      className="sticky left-[48px] z-10 bg-bg-card px-2 py-1.5 font-mono text-[11px] font-semibold text-text-primary whitespace-nowrap overflow-hidden text-ellipsis"
                      style={{ boxShadow: 'inset -2px 0 0 var(--color-border-light)' }}
                    >
                      {row.productCode}
                    </td>
                    {row.cells.map((rule, pi) => (
                      <Fragment key={`cell-${row.productId}-${pi}`}>
                        {subColKeys.map((k, si) => {
                          const v = rule?.[k] as number | null | undefined
                          return (
                            <td
                              key={`cell-${row.productId}-${pi}-${si}`}
                              className={`px-2 py-1.5 text-right tabular-nums whitespace-nowrap ${
                                v == null ? 'text-text-muted' : 'text-text-primary'
                              } ${
                                si === 5 && pi < params.length - 1
                                  ? 'border-r-2 border-border-light'
                                  : ''
                              }`}
                            >
                              {fmt(v)}
                            </td>
                          )
                        })}
                      </Fragment>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-border-light text-xs text-text-muted shrink-0">
          {t('rules.summary', {
            products: rows.length,
            rules: rows.reduce(
              (s, r) => s + r.cells.filter((c) => c !== null).length,
              0,
            ),
          })}
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Main page                                                           */
/* ------------------------------------------------------------------ */

const PAGE_SIZE = 10

export default function RulesPage() {
  const { t } = useTranslation('settings')
  const isAdmin = useAuthStore((s) => s.user?.role === 'admin')
  const [rules, setRules] = useState<ReviewRule[]>([])
  const [, setProducts] = useState<Product[]>([])
  const [filterVendor, setFilterVendor] = useState('')
  const [filterSite, setFilterSite] = useState('')
  const [filterProduct, setFilterProduct] = useState('')
  const [filterParam, setFilterParam] = useState('')
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [addingNewFor, setAddingNewFor] = useState<number | null>(null)
  const [importMode, setImportMode] = useState(false)
  const [matrixMode, setMatrixMode] = useState(false)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)

  async function loadRules() {
    const data = await getRules()
    setRules(data)
    setLoading(false)
  }

  useEffect(() => {
    loadRules()
    getProducts().then(setProducts)
  }, [])

  const groups = useMemo(() => {
    const map = new Map<number, RuleGroup>()
    for (const r of rules) {
      let g = map.get(r.product_id)
      if (!g) {
        g = {
          productId: r.product_id,
          productCode: r.product_code ?? `#${r.product_id}`,
          vendorCode: r.vendor_code ?? null,
          domain: r.domain ?? null,
          rules: [],
        }
        map.set(r.product_id, g)
      }
      g.rules.push(r)
    }
    let arr = Array.from(map.values())
    arr.sort((a, b) => {
      const vc = (a.vendorCode ?? '').localeCompare(b.vendorCode ?? '')
      if (vc !== 0) return vc
      return a.productCode.localeCompare(b.productCode)
    })
    if (filterVendor) arr = arr.filter((g) => g.vendorCode === filterVendor)
    if (filterSite) arr = arr.filter((g) => (g.domain ?? '') === filterSite)
    if (filterProduct) {
      const q = filterProduct.toLowerCase()
      arr = arr.filter((g) => g.productCode.toLowerCase().includes(q))
    }
    if (filterParam) {
      const q = filterParam.toLowerCase()
      arr = arr
        .map((g) => ({ ...g, rules: g.rules.filter((r) => r.param_name.toLowerCase().includes(q)) }))
        .filter((g) => g.rules.length > 0)
    }
    return arr
  }, [rules, filterVendor, filterSite, filterProduct, filterParam])

  const totalRulesShown = useMemo(
    () => groups.reduce((s, g) => s + g.rules.length, 0),
    [groups],
  )

  const totalPages = Math.max(1, Math.ceil(groups.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pagedGroups = groups.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  // Reset to first page whenever filters change
  useEffect(() => {
    setPage(1)
  }, [filterVendor, filterSite, filterProduct, filterParam])

  const vendorOptions = useMemo(() => {
    const set = new Set<string>()
    rules.forEach((r) => r.vendor_code && set.add(r.vendor_code))
    return Array.from(set).sort()
  }, [rules])

  const isExpanded = (pid: number) => expanded.has(pid) || !!filterParam

  function toggleExpand(pid: number) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(pid)) next.delete(pid)
      else next.add(pid)
      return next
    })
  }

  function handleSaved(saved: ReviewRule) {
    setRules((prev) => {
      const idx = prev.findIndex((r) => r.id === saved.id)
      if (idx >= 0) {
        const next = [...prev]
        // Preserve enrichment fields when updating (backend create/update endpoints
        // don't populate product_code/vendor_code).
        next[idx] = {
          ...saved,
          product_code: prev[idx].product_code,
          vendor_code: prev[idx].vendor_code,
        }
        return next
      }
      // New rule: enrich with codes from any other rule sharing the same product_id
      const sibling = prev.find((r) => r.product_id === saved.product_id)
      return [
        ...prev,
        {
          ...saved,
          product_code: sibling?.product_code ?? null,
          vendor_code: sibling?.vendor_code ?? null,
        },
      ]
    })
  }

  function handleDeletedRule(ruleId: number) {
    setRules((prev) => prev.filter((r) => r.id !== ruleId))
  }

  async function handleDeleteGroup(group: RuleGroup) {
    if (!window.confirm(t('rules.deleteAllRulesConfirm', { code: group.productCode }))) return
    await deleteProductRules(group.productId)
    const [freshRules, freshProducts] = await Promise.all([getRules(), getProducts()])
    setRules(freshRules)
    setProducts(freshProducts)
    setExpanded((prev) => {
      const next = new Set(prev)
      next.delete(group.productId)
      return next
    })
  }

  function handleImportDone() {
    setImportMode(false)
    loadRules()
  }

  async function handleImported(productCodes: string[]) {
    const fresh = await getProducts()
    setProducts(fresh)
    await loadRules()
    // Auto-expand the imported product cards so the user sees what was added.
    setExpanded((prev) => {
      const next = new Set(prev)
      for (const code of productCodes) {
        const p = fresh.find((p) => p.product_code === code)
        if (p) next.add(p.id)
      }
      return next
    })
    if (productCodes.length === 1) setImportMode(false)
  }

  return (
    <div className="p-9 pl-11 flex flex-col gap-6">
      <PageHeader
        title={t('rules.title')}
        subtitle={t('rules.desc')}
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={() => setMatrixMode(true)}
              disabled={groups.length === 0}
              className="flex items-center gap-2 px-4 py-2 border border-border-light text-text-secondary text-sm font-medium hover:bg-bg-page cursor-pointer whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Table2 size={16} /> {t('rules.matrixView')}
            </button>
            <button
              onClick={() => setImportMode(true)}
              className="flex items-center gap-2 px-4 py-2 bg-accent text-white text-sm font-medium hover:bg-accent/90 cursor-pointer whitespace-nowrap"
            >
              <Upload size={16} /> {t('rules.importExcel')}
            </button>
          </div>
        }
      />

      {importMode && <ImportPanel onDone={handleImportDone} onImported={handleImported} />}
      {matrixMode && (
        <RulesMatrixModal groups={groups} onClose={() => setMatrixMode(false)} />
      )}

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-4 bg-bg-card border border-border-light px-4 py-3">
        {isAdmin && (
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-text-muted uppercase tracking-[1px]">
              {t('scores.site')}
            </label>
            <Select
              className="w-28"
              value={filterSite}
              onChange={setFilterSite}
              options={siteOptions(t('scores.allSites'))}
            />
          </div>
        )}
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-text-muted uppercase tracking-[1px]">
            {t('rules.filterVendor')}
          </label>
          <Select
            className="w-32"
            value={filterVendor}
            onChange={setFilterVendor}
            options={[{ value: '', label: t('rules.allVendors') }, ...vendorOptions.map((v) => ({ value: v, label: v }))]}
          />
        </div>
        <div className="flex items-center gap-2">
          <Search size={14} className="text-text-muted" />
          <input
            type="text"
            placeholder={t('rules.filterProduct')}
            value={filterProduct}
            onChange={(e) => setFilterProduct(e.target.value)}
            className="bg-bg-card border border-border-light px-2 py-1 text-sm text-text-primary outline-none focus:border-accent w-44"
          />
        </div>
        <div className="flex items-center gap-2">
          <Search size={14} className="text-text-muted" />
          <input
            type="text"
            placeholder={t('rules.filterParam')}
            value={filterParam}
            onChange={(e) => setFilterParam(e.target.value)}
            className="bg-bg-card border border-border-light px-2 py-1 text-sm text-text-primary outline-none focus:border-accent w-44"
          />
        </div>
        <div className="ml-auto text-xs text-text-muted">
          {t('rules.summary', { products: groups.length, rules: totalRulesShown })}
        </div>
      </div>

      {/* Groups */}
      {loading ? (
        <p className="text-sm text-text-muted">…</p>
      ) : groups.length === 0 ? (
        <div className="bg-bg-card border border-border-light p-8 text-center">
          <p className="text-sm text-text-muted">{t('rules.noRulesAtAll')}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {pagedGroups.map((group) => (
            <RuleGroupCard
              key={group.productId}
              group={group}
              expanded={isExpanded(group.productId)}
              onToggle={() => toggleExpand(group.productId)}
              addingNew={addingNewFor === group.productId}
              onAddClick={() => {
                setAddingNewFor(group.productId)
                setExpanded((prev) => new Set(prev).add(group.productId))
              }}
              onAddCancel={() => setAddingNewFor(null)}
              onSaved={handleSaved}
              onDeletedRule={handleDeletedRule}
              onDeleteGroup={() => handleDeleteGroup(group)}
            />
          ))}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={currentPage <= 1}
                className="px-3 py-1.5 border border-border-light text-sm text-text-secondary hover:bg-bg-page cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {t('pagination.prev')}
              </button>
              <span className="text-sm text-text-muted tabular-nums">
                {t('pagination.pageInfo', { page: currentPage, total: totalPages })}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
                className="px-3 py-1.5 border border-border-light text-sm text-text-secondary hover:bg-bg-page cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {t('pagination.next')}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
