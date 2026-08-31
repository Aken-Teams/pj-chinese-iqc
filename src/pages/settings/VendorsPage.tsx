import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, ChevronDown, ChevronRight, Trash2, Pencil, Check, X, HelpCircle, Wand2, AlertTriangle, Download } from 'lucide-react'
import PageHeader from '@/components/layout/PageHeader'
import {
  getVendors,
  createVendor,
  getVendorFormats,
  createVendorFormat,
  updateVendorFormat,
  deleteVendorFormat,
  deleteVendor,
  sitesMissingTemplate,
  type Vendor,
  type VendorFormat,
} from '@/services/vendors'
import { useAuthStore } from '@/store/authStore'
import { siteLabel, siteOptions } from '@/config/sites'
import Select from '@/components/ui/Select'
import FormatWizard from '@/components/settings/FormatWizard'
import { downloadSample } from '@/services/formatWizard'

const DEFAULT_FORMAT: Omit<VendorFormat, 'id'> = {
  format_name: '',
  header_row: 1,
  data_start_row: 3,
  lower_limit_row: 2,
  upper_limit_row: 1,
  electrical_start_col: 5,
  wafer_id_col: 1,
  bin_col: 2,
  x_coord_col: null,
  y_coord_col: null,
  product_id_col: null,
  lot_id_col: null,
  fixed_die_count: null,
  product_id_cell: null,
  lot_id_cell: null,
  wafer_id_source: 'column',
}

type FormatDraft = Omit<VendorFormat, 'id'>

/* ── Tooltip wrapper ── */
function FieldTip({ tip }: { tip: string }) {
  return (
    <div className="relative group inline-flex items-center">
      <HelpCircle size={13} className="text-text-muted/50 hover:text-accent cursor-help" />
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none z-50">
        <div className="bg-bg-dark-surface text-text-on-dark px-2.5 py-1.5 text-[11px] whitespace-nowrap shadow-lg max-w-[280px]">
          {tip}
        </div>
      </div>
    </div>
  )
}

/* ── Excel-style diagram ── */
function FormatHelpDiagram({ t: tv }: { t: (k: string) => string }) {
  return (
    <div className="border border-accent/20 bg-accent/5 p-5 flex flex-col gap-4">
      <div className="font-heading text-sm font-bold uppercase tracking-[1px] text-accent">
        {tv('helpToggle')}
      </div>

      {/* Excel diagram */}
      <div className="overflow-x-auto">
        <table className="border-collapse font-mono text-sm leading-normal w-full">
          <thead>
            <tr className="text-text-muted text-xs">
              <th className="px-3 py-2 text-right border border-border-light bg-bg-page w-12" />
              <th className="px-3 py-2 border border-border-light bg-bg-page min-w-[90px]">A</th>
              <th className="px-3 py-2 border border-border-light bg-bg-page min-w-[64px]">B</th>
              <th className="px-3 py-2 border border-border-light bg-bg-page min-w-[64px]">C</th>
              <th className="px-3 py-2 border border-border-light bg-bg-page min-w-[64px]">D</th>
              <th className="px-3 py-2 border border-border-light bg-bg-page min-w-[80px]">E</th>
              <th className="px-3 py-2 border border-border-light bg-bg-page min-w-[80px]">F</th>
              <th className="px-3 py-2 border border-border-light bg-bg-page min-w-[80px]">G</th>
              <th className="px-4 py-2 text-left min-w-[200px]" />
            </tr>
          </thead>
          <tbody>
            {/* Row 1 - product/lot */}
            <tr>
              <td className="px-3 py-2 text-right text-text-muted border border-border-light bg-bg-page font-semibold">1</td>
              <td className="px-3 py-2 border border-border-light text-text-muted">Prod01</td>
              <td className="px-3 py-2 border border-border-light text-text-muted">LOT001</td>
              <td className="px-3 py-2 border border-border-light" />
              <td className="px-3 py-2 border border-border-light" />
              <td className="px-3 py-2 border border-border-light" />
              <td className="px-3 py-2 border border-border-light" />
              <td className="px-3 py-2 border border-border-light" />
              <td className="px-4 py-2 text-text-muted/60 italic text-xs">
                &larr; {tv('diagramProductLot')}
              </td>
            </tr>
            {/* Row 2 - lower limits */}
            <tr className="bg-blue-500/5">
              <td className="px-3 py-2 text-right text-text-muted border border-border-light bg-bg-page font-semibold">2</td>
              <td className="px-3 py-2 border border-border-light text-text-muted">{tv('diagramLower')}</td>
              <td className="px-3 py-2 border border-border-light" />
              <td className="px-3 py-2 border border-border-light" />
              <td className="px-3 py-2 border border-border-light" />
              <td className="px-3 py-2 border border-border-light font-bold text-blue-500">0.3</td>
              <td className="px-3 py-2 border border-border-light font-bold text-blue-500">-70</td>
              <td className="px-3 py-2 border border-border-light font-bold text-blue-500">1.0</td>
              <td className="px-4 py-2 text-blue-500 font-semibold text-sm">
                &larr; {tv('diagramLowerRow')}
              </td>
            </tr>
            {/* Row 3 - upper limits */}
            <tr className="bg-orange-500/5">
              <td className="px-3 py-2 text-right text-text-muted border border-border-light bg-bg-page font-semibold">3</td>
              <td className="px-3 py-2 border border-border-light text-text-muted">{tv('diagramUpper')}</td>
              <td className="px-3 py-2 border border-border-light" />
              <td className="px-3 py-2 border border-border-light" />
              <td className="px-3 py-2 border border-border-light" />
              <td className="px-3 py-2 border border-border-light font-bold text-orange-500">5.4</td>
              <td className="px-3 py-2 border border-border-light font-bold text-orange-500">70</td>
              <td className="px-3 py-2 border border-border-light font-bold text-orange-500">50</td>
              <td className="px-4 py-2 text-orange-500 font-semibold text-sm">
                &larr; {tv('diagramUpperRow')}
              </td>
            </tr>
            {/* Row 4 - header row */}
            <tr className="bg-accent/8">
              <td className="px-3 py-2 text-right text-text-muted border border-border-light bg-bg-page font-semibold">4</td>
              <td className="px-3 py-2 border border-border-light font-bold text-accent">WAFER</td>
              <td className="px-3 py-2 border border-border-light font-bold text-accent">BIN</td>
              <td className="px-3 py-2 border border-border-light font-bold text-accent">X</td>
              <td className="px-3 py-2 border border-border-light font-bold text-accent">Y</td>
              <td className="px-3 py-2 border border-border-light font-bold text-green-600">Param1</td>
              <td className="px-3 py-2 border border-border-light font-bold text-green-600">Param2</td>
              <td className="px-3 py-2 border border-border-light font-bold text-green-600">Param3</td>
              <td className="px-4 py-2 text-accent font-semibold text-sm">
                &larr; {tv('diagramHeaderRow')}
              </td>
            </tr>
            {/* Row 5 - data row */}
            <tr className="bg-emerald-500/5">
              <td className="px-3 py-2 text-right text-text-muted border border-border-light bg-bg-page font-semibold">5</td>
              <td className="px-3 py-2 border border-border-light">W01</td>
              <td className="px-3 py-2 border border-border-light">1</td>
              <td className="px-3 py-2 border border-border-light">13</td>
              <td className="px-3 py-2 border border-border-light">2</td>
              <td className="px-3 py-2 border border-border-light">1.05</td>
              <td className="px-3 py-2 border border-border-light">-0.8</td>
              <td className="px-3 py-2 border border-border-light">12.3</td>
              <td className="px-4 py-2 text-emerald-600 font-semibold text-sm">
                &larr; {tv('diagramDataRow')}
              </td>
            </tr>
            {/* Row 6 - data row 2 */}
            <tr>
              <td className="px-3 py-2 text-right text-text-muted border border-border-light bg-bg-page font-semibold">6</td>
              <td className="px-3 py-2 border border-border-light">W01</td>
              <td className="px-3 py-2 border border-border-light">1</td>
              <td className="px-3 py-2 border border-border-light">17</td>
              <td className="px-3 py-2 border border-border-light">2</td>
              <td className="px-3 py-2 border border-border-light">1.02</td>
              <td className="px-3 py-2 border border-border-light">-0.6</td>
              <td className="px-3 py-2 border border-border-light">11.9</td>
              <td className="px-4 py-2 text-text-muted/60 italic text-xs">...</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Column annotations */}
      <div className="flex flex-wrap gap-x-6 gap-y-1.5 text-sm text-text-secondary mt-1">
        <span><b className="text-accent">A(1)</b> = {tv('diagramColWafer')}</span>
        <span><b className="text-accent">B(2)</b> = {tv('diagramColBin')}</span>
        <span><b className="text-accent">C(3)</b> = {tv('diagramColX')}</span>
        <span><b className="text-accent">D(4)</b> = {tv('diagramColY')}</span>
        <span><b className="text-green-600">E(5)</b> = {tv('diagramColElec')}</span>
      </div>

      <p className="text-sm text-text-muted mt-1">
        {tv('helpNote')}
      </p>
    </div>
  )
}

/* ── Format row editor ── */
function FormatRow({
  fmt,
  vendorId,
  vendorCode,
  siteFilter,
  onSaved,
  onDeleted,
}: {
  fmt: VendorFormat | null
  vendorId: number
  vendorCode: string
  siteFilter: string
  onSaved: (f: VendorFormat) => void
  onDeleted?: () => void
}) {
  const { t } = useTranslation('settings')
  const [editing, setEditing] = useState(fmt === null)
  const [draft, setDraft] = useState<FormatDraft>(fmt ?? DEFAULT_FORMAT)
  const [saving, setSaving] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const [wizardOpen, setWizardOpen] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)

  const tv = (k: string) => t(`vendors.${k}`)

  const numFields: { key: keyof FormatDraft; labelKey: string; helpKey: string; nullable?: boolean }[] = [
    { key: 'header_row', labelKey: 'headerRow', helpKey: 'helpHeaderRow' },
    { key: 'data_start_row', labelKey: 'dataStartRow', helpKey: 'helpDataStartRow' },
    { key: 'lower_limit_row', labelKey: 'lowerLimitRow', helpKey: 'helpLowerLimitRow' },
    { key: 'upper_limit_row', labelKey: 'upperLimitRow', helpKey: 'helpUpperLimitRow' },
    { key: 'electrical_start_col', labelKey: 'electricalStartCol', helpKey: 'helpElectricalStartCol' },
    { key: 'wafer_id_col', labelKey: 'waferIdCol', helpKey: 'helpWaferIdCol' },
    { key: 'bin_col', labelKey: 'binCol', helpKey: 'helpBinCol' },
    { key: 'x_coord_col', labelKey: 'xCoordCol', helpKey: 'helpXCoordCol', nullable: true },
    { key: 'y_coord_col', labelKey: 'yCoordCol', helpKey: 'helpYCoordCol', nullable: true },
    { key: 'product_id_col', labelKey: 'productIdCol', helpKey: 'helpProductIdCol', nullable: true },
    { key: 'lot_id_col', labelKey: 'lotIdCol', helpKey: 'helpLotIdCol', nullable: true },
    { key: 'fixed_die_count', labelKey: 'fixedDieCount', helpKey: 'helpFixedDieCount', nullable: true },
  ]

  const textFields: { key: keyof FormatDraft; labelKey: string; helpKey: string }[] = [
    { key: 'product_id_cell', labelKey: 'productIdCell', helpKey: 'helpProductIdCell' },
    { key: 'lot_id_cell', labelKey: 'lotIdCell', helpKey: 'helpLotIdCell' },
  ]

  // Descriptors added after the 2026-08 vendor survey. They were only editable
  // in the wizard, so a template using them (禾纳's label-anchored wafer id, for
  // instance) read as unconfigured here — WAFER ID 列 blank with no hint why.
  const advancedNumFields: { key: keyof FormatDraft; labelKey: string }[] = [
    { key: 'id_header_row', labelKey: 'wizard.roleIdHeaderRow' },
    { key: 'unit_row', labelKey: 'wizard.roleUnitRow' },
  ]
  const advancedTextFields: { key: keyof FormatDraft; labelKey: string }[] = [
    { key: 'wafer_id_cell', labelKey: 'wizard.cellAddress' },
    { key: 'wafer_id_label', labelKey: 'wizard.labelText' },
    { key: 'wafer_id_pattern', labelKey: 'wizard.pattern' },
    { key: 'product_id_label', labelKey: 'wizard.productLabel' },
    { key: 'product_id_pattern', labelKey: 'wizard.productPattern' },
    { key: 'product_id_filename_pattern', labelKey: 'wizard.productFilenamePattern' },
    { key: 'lot_id_label', labelKey: 'wizard.lotLabel' },
    { key: 'lot_id_pattern', labelKey: 'wizard.lotPattern' },
    { key: 'lot_id_filename_pattern', labelKey: 'wizard.lotFilenamePattern' },
    { key: 'sheet_selector', labelKey: 'wizard.sheetSelector' },
    { key: 'text_delimiter', labelKey: 'wizard.textDelimiter' },
  ]

  // Badge on the collapsed section, so a template configured through the wizard
  // advertises that it holds settings this form is not showing.
  const advancedCount = [
    ...advancedNumFields.map((f) => f.key),
    ...advancedTextFields.map((f) => f.key),
  ].filter((k) => draft[k] !== null && draft[k] !== undefined && draft[k] !== '').length

  async function save() {
    setSaving(true)
    try {
      const saved = fmt
        ? await updateVendorFormat(vendorId, fmt.id, draft)
        : await createVendorFormat(vendorId, draft, siteFilter)
      onSaved(saved)
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  function cancel() {
    if (fmt === null) {
      onDeleted?.()
    } else {
      setDraft(fmt)
      setEditing(false)
    }
  }

  async function remove() {
    if (!fmt || !window.confirm(t('vendors.confirmDelete'))) return
    await deleteVendorFormat(vendorId, fmt.id)
    onDeleted?.()
  }

  if (!editing) {
    return (
      <div className="flex items-center gap-3 px-4 py-3 bg-bg-page border border-border-light">
        <span className="flex-1 text-sm text-text-primary font-medium">{fmt?.format_name || '—'}</span>
        {!!fmt?.version && (
          <span className="px-1.5 py-0.5 bg-accent/10 text-accent text-[11px] font-heading
                           font-bold rounded" title={t('wizard.versionTip')}>
            v{fmt.version}
          </span>
        )}
        {fmt?.sampleToken && (
          <button
            onClick={() => void downloadSample(fmt.sampleToken as string,
                                               fmt.sampleName ?? 'sample')}
            title={`${t('wizard.downloadSample')} — ${fmt.sampleName ?? ''}`}
            className="p-1 text-text-muted hover:text-accent cursor-pointer"
          >
            <Download size={15} />
          </button>
        )}
        {fmt?.domain && (
          <span className="px-1.5 py-0.5 bg-bg-card text-text-secondary text-[10px] font-semibold rounded">
            {siteLabel(fmt.domain)}
          </span>
        )}
        <button onClick={() => setWizardOpen(true)} title={t('wizard.openSaved')}
                className="flex items-center gap-1.5 px-2.5 py-1 text-xs bg-accent text-white
                           hover:opacity-90 cursor-pointer">
          <Wand2 size={13} /> {t('wizard.openSaved')}
        </button>
        <button onClick={() => setEditing(true)} title={t('vendors.editFields')}
                className="p-1 text-text-muted hover:text-accent cursor-pointer">
          <Pencil size={15} />
        </button>
        <button onClick={remove} className="p-1 text-text-muted hover:text-danger cursor-pointer">
          <Trash2 size={15} />
        </button>

        {wizardOpen && (
          <FormatWizard
            vendorId={vendorId}
            vendorCode={vendorCode}
            formatId={fmt?.id ?? null}
            initialTemplate={fmt ?? null}
            site={siteFilter}
            onClose={() => setWizardOpen(false)}
            onApply={(tpl) => {
              setDraft((d) => ({ ...d, ...tpl }) as FormatDraft)
              setWizardOpen(false)
            }}
            onSaved={() => { setWizardOpen(false); onSaved(draft as VendorFormat) }}
          />
        )}
      </div>
    )
  }

  return (
    <div className="border border-accent/30 bg-bg-page p-4 flex flex-col gap-3">
      {/* Format name + help toggle */}
      <div className="flex gap-3 items-center">
        <label className="text-xs font-semibold text-text-muted uppercase tracking-[1px] w-36 shrink-0">
          {tv('formatName')}
        </label>
        <input
          className="flex-1 bg-bg-card border border-border-light px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
          value={draft.format_name ?? ''}
          onChange={(e) => setDraft((d) => ({ ...d, format_name: e.target.value }))}
        />
        <button
          onClick={() => setShowHelp((v) => !v)}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium cursor-pointer transition-colors ${
            showHelp
              ? 'bg-accent/10 text-accent border border-accent/30'
              : 'text-text-muted hover:text-accent border border-transparent'
          }`}
        >
          <HelpCircle size={14} />
          {tv('helpToggle')}
        </button>
        <button
          onClick={() => setWizardOpen(true)}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium cursor-pointer
                     bg-accent text-white hover:opacity-90 transition-opacity"
        >
          <Wand2 size={14} />
          {t('wizard.open')}
        </button>
      </div>

      {wizardOpen && (
        <FormatWizard
          vendorId={vendorId}
          vendorCode={vendorCode}
          formatId={fmt?.id ?? null}
          site={siteFilter}
          onClose={() => setWizardOpen(false)}
          onApply={(tpl) => {
            // The wizard only fills in what it resolved; anything it could not
            // determine keeps whatever the form already had.
            setDraft((d) => ({ ...d, ...tpl }) as FormatDraft)
            setWizardOpen(false)
          }}
          onSaved={() => { setWizardOpen(false); onSaved(draft as VendorFormat) }}
        />
      )}

      {/* Collapsible help diagram */}
      {showHelp && <FormatHelpDiagram t={tv} />}

      {/* Fields grid */}
      <div className="grid grid-cols-2 gap-3">
        {numFields.map(({ key, labelKey, helpKey, nullable }) => (
          <div key={key} className="flex gap-2 items-center">
            <label className="text-xs font-semibold text-text-muted uppercase tracking-[1px] w-36 shrink-0 flex items-center gap-1.5">
              {tv(labelKey)}
              <FieldTip tip={tv(helpKey)} />
            </label>
            <input
              type="number"
              className="w-24 bg-bg-card border border-border-light px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
              // Narrowed explicitly: FormatDraft now also holds non-numeric
              // descriptors (param_cols, the wafer-id source), but numFields
              // only ever lists numeric keys.
              value={(draft[key] as number | null | undefined) ?? ''}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  [key]: e.target.value === '' ? null : Number(e.target.value),
                }))
              }
              placeholder={nullable ? '—' : undefined}
            />
          </div>
        ))}
        {textFields.map(({ key, labelKey, helpKey }) => (
          <div key={key} className="flex gap-2 items-center">
            <label className="text-xs font-semibold text-text-muted uppercase tracking-[1px] w-36 shrink-0 flex items-center gap-1.5">
              {tv(labelKey)}
              <FieldTip tip={tv(helpKey)} />
            </label>
            <input
              type="text"
              className="w-24 bg-bg-card border border-border-light px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
              value={(draft[key] as string) ?? ''}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  [key]: e.target.value === '' ? null : e.target.value,
                }))
              }
              placeholder="—"
            />
          </div>
        ))}
      </div>

      {/* Descriptors the wizard writes. Hidden behind a toggle because the
          click-driven wizard is the intended path, but shown here so a template
          never looks unconfigured just because this form did not render it. */}
      <div className="border-t border-border-light pt-3">
        <button
          onClick={() => setShowAdvanced((v) => !v)}
          className="flex items-center gap-1.5 text-xs font-semibold text-text-muted
                     uppercase tracking-[1px] hover:text-accent cursor-pointer"
        >
          {showAdvanced ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          {t('wizard.advanced')}
          {advancedCount > 0 && (
            <span className="ml-1 px-1.5 bg-accent/15 text-accent text-[10px]">
              {advancedCount}
            </span>
          )}
        </button>

        {showAdvanced && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2.5 mt-3">
            <div className="flex gap-2 items-center">
              <label className="text-xs font-semibold text-text-muted uppercase
                                tracking-[1px] w-36 shrink-0">
                {t('wizard.waferSource')}
              </label>
              <select
                className="bg-bg-card border border-border-light px-2 py-1.5 text-sm
                           text-text-primary outline-none focus:border-accent"
                value={draft.wafer_id_source ?? ''}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    wafer_id_source: (e.target.value || undefined) as
                      VendorFormat['wafer_id_source'],
                  }))
                }
              >
                <option value="">{t('wizard.unset')}</option>
                {(['column', 'cell', 'label', 'filename', 'single'] as const).map((s) => (
                  <option key={s} value={s}>{t(`wizard.src_${s}`)}</option>
                ))}
              </select>
            </div>
            {advancedNumFields.map(({ key, labelKey }) => (
              <div key={key} className="flex gap-2 items-center">
                <label className="text-xs font-semibold text-text-muted uppercase
                                  tracking-[1px] w-36 shrink-0">{t(labelKey)}</label>
                <input
                  type="number"
                  className="w-24 bg-bg-card border border-border-light px-2 py-1.5 text-sm
                             text-text-primary outline-none focus:border-accent"
                  value={(draft[key] as number | null | undefined) ?? ''}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      [key]: e.target.value === '' ? null : Number(e.target.value),
                    }))
                  }
                  placeholder="—"
                />
              </div>
            ))}
            {advancedTextFields.map(({ key, labelKey }) => (
              <div key={key} className="flex gap-2 items-center">
                <label className="text-xs font-semibold text-text-muted uppercase
                                  tracking-[1px] w-36 shrink-0">{t(labelKey)}</label>
                <input
                  type="text"
                  className="flex-1 min-w-0 bg-bg-card border border-border-light px-2 py-1.5
                             text-sm font-mono text-text-primary outline-none focus:border-accent"
                  value={(draft[key] as string) ?? ''}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      [key]: e.target.value === '' ? null : e.target.value,
                    }))
                  }
                  placeholder="—"
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex gap-2 justify-end">
        <button onClick={cancel} className="flex items-center gap-1.5 px-4 py-1.5 text-sm border border-border-light text-text-secondary hover:text-text-primary cursor-pointer">
          <X size={13} /> Cancel
        </button>
        <button onClick={save} disabled={saving} className="flex items-center gap-1.5 px-4 py-1.5 text-sm bg-accent text-white hover:bg-accent/90 cursor-pointer disabled:opacity-50">
          <Check size={13} /> {saving ? '...' : 'Save'}
        </button>
      </div>
    </div>
  )
}

function VendorCard({ vendor, siteFilter, onDeleted, defaultOpen }: {
  vendor: Vendor; siteFilter: string; onDeleted: () => void; defaultOpen?: boolean
}) {
  const { t } = useTranslation('settings')
  // A freshly created vendor opens straight onto its (empty) template list, so
  // the next step is in front of the user rather than one click away.
  const [expanded, setExpanded] = useState(!!defaultOpen)
  const [formats, setFormats] = useState<VendorFormat[]>([])
  const [loaded, setLoaded] = useState(false)
  const [addingNew, setAddingNew] = useState(false)
  const missingSites = sitesMissingTemplate(vendor)
  const noTemplates = (vendor.formatCount ?? 0) === 0

  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  async function remove() {
    setDeleting(true)
    setDeleteError(null)
    try {
      await deleteVendor(vendor.id)
      onDeleted()
    } catch (e) {
      // The server refuses while lots exist and says how many; show that
      // rather than a generic failure.
      setDeleteError(e instanceof Error ? e.message : String(e))
      setConfirmDelete(false)
    } finally {
      setDeleting(false)
    }
  }

  useEffect(() => {
    if (defaultOpen) void loadFormats()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultOpen])

  async function loadFormats() {
    if (loaded) return
    const data = await getVendorFormats(vendor.id, siteFilter)
    setFormats(data)
    setLoaded(true)
  }

  function toggle() {
    if (!expanded) loadFormats()
    setExpanded((v) => !v)
  }

  return (
    <div className="bg-bg-card border border-border-light">
      <div className="w-full flex items-center gap-3 pr-4 hover:bg-bg-page transition-colors">
      <button
        onClick={toggle}
        className="flex-1 min-w-0 flex items-center gap-3 px-5 py-4 cursor-pointer text-left"
      >
        {expanded ? <ChevronDown size={17} className="text-text-muted" /> : <ChevronRight size={17} className="text-text-muted" />}
        <span className="font-heading text-sm font-bold uppercase tracking-[1px] text-accent">{vendor.code}</span>
        <span className="text-base text-text-primary">{vendor.name}</span>
        {vendor.domains && vendor.domains.length > 0 && (
          <span className="flex items-center gap-1">
            {vendor.domains.map((d) => {
              // A site that can see this vendor but has no template for it can
              // select it and then fail at upload time — flag it here instead.
              const gap = missingSites.includes(d)
              return (
                <span
                  key={d}
                  title={gap ? t('vendors.siteNoTemplate', { site: siteLabel(d) }) : undefined}
                  className={`px-1.5 py-0.5 text-[10px] font-semibold rounded flex items-center gap-0.5 ${
                    gap ? 'bg-amber-500/15 text-amber-700' : 'bg-bg-page text-text-secondary'
                  }`}
                >
                  {siteLabel(d)}
                  {gap && <AlertTriangle size={9} />}
                </span>
              )
            })}
          </span>
        )}
        {noTemplates && (
          <span className="flex items-center gap-1 px-2 py-0.5 bg-error/10 text-error
                           text-[10px] font-semibold rounded">
            <AlertTriangle size={10} />
            {t('vendors.noTemplateWarning')}
          </span>
        )}
      </button>

      {confirmDelete ? (
        <span className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-error">{t('vendors.confirmDelete')}</span>
          <button onClick={() => void remove()} disabled={deleting}
                  className="px-2 py-1 text-xs bg-error text-white cursor-pointer disabled:opacity-50">
            {t('vendors.confirmYes')}
          </button>
          <button onClick={() => setConfirmDelete(false)}
                  className="px-2 py-1 text-xs border border-border-light cursor-pointer">
            {t('vendors.confirmNo')}
          </button>
        </span>
      ) : (
        <button onClick={() => { setConfirmDelete(true); setDeleteError(null) }}
                title={t('vendors.deleteVendor')}
                className="p-1.5 text-text-muted hover:text-error cursor-pointer shrink-0">
          <Trash2 size={15} />
        </button>
      )}
      </div>

      {deleteError && (
        <div className="px-5 py-2 border-t border-error/30 bg-error/5 text-xs text-error">
          {deleteError}
        </div>
      )}

      {expanded && (
        <div className="flex flex-col">
          {/* Sub-header bar — visually separated from vendor row */}
          <div className="flex items-center justify-between px-5 py-2.5 bg-bg-page border-t border-border-light">
            <span className="text-xs font-bold text-text-muted uppercase tracking-[1px]">
              {t('vendors.formats')}
            </span>
            <button
              onClick={() => setAddingNew(true)}
              className="flex items-center gap-1 text-sm text-accent hover:text-accent/80 cursor-pointer font-medium"
            >
              <Plus size={14} /> {t('vendors.addFormat')}
            </button>
          </div>

          {/* Format rows */}
          <div className="px-5 pb-5 pt-3 flex flex-col gap-2">
            {formats.length === 0 && !addingNew && (
              <p className="text-sm text-text-muted py-1">{t('vendors.noFormats')}</p>
            )}

            {formats.map((fmt) => (
              <FormatRow
                key={fmt.id}
                fmt={fmt}
                vendorId={vendor.id}
                vendorCode={vendor.code}
                siteFilter={siteFilter}
                onSaved={(saved) => setFormats((prev) => prev.map((f) => (f.id === saved.id ? saved : f)))}
                onDeleted={() => setFormats((prev) => prev.filter((f) => f.id !== fmt.id))}
              />
            ))}

            {addingNew && (
              <FormatRow
                fmt={null}
                vendorId={vendor.id}
                vendorCode={vendor.code}
                siteFilter={siteFilter}
                onSaved={(saved) => {
                  setFormats((prev) => [...prev, saved])
                  setAddingNew(false)
                }}
                onDeleted={() => setAddingNew(false)}
              />
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default function VendorsPage() {
  const { t } = useTranslation('settings')
  const isAdmin = useAuthStore((s) => s.user?.role === 'admin')
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [filterSite, setFilterSite] = useState('')
  const [showAddForm, setShowAddForm] = useState(false)
  const [newCode, setNewCode] = useState('')
  const [newName, setNewName] = useState('')
  const [saving, setSaving] = useState(false)
  const [justCreated, setJustCreated] = useState<string | null>(null)

  useEffect(() => {
    getVendors(filterSite).then(setVendors)
  }, [filterSite])

  async function addVendor() {
    if (!newCode.trim() || !newName.trim()) return
    setSaving(true)
    try {
      const v = await createVendor({ code: newCode.trim(), name: newName.trim() })
      setVendors((prev) => [...prev, v])
      setNewCode('')
      setNewName('')
      setShowAddForm(false)
      // A vendor with no template cannot receive an upload, and nothing used to
      // say so — one vendor sat half-configured for two months that way.
      setJustCreated(v.code)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-9 pl-11 flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <PageHeader title={t('vendors.title')} subtitle={t('vendors.desc')} />
        <div className="flex items-center gap-3">
          {isAdmin && (
            <Select
              className="w-32"
              value={filterSite}
              onChange={setFilterSite}
              options={siteOptions(t('scores.allSites'))}
            />
          )}
          <button
            onClick={() => setShowAddForm(true)}
            className="flex items-center gap-2 px-4 py-2 bg-accent text-white text-sm font-medium hover:bg-accent/90 cursor-pointer"
          >
            <Plus size={16} /> {t('vendors.addVendor')}
          </button>
        </div>
      </div>

      {showAddForm && (
        <div className="bg-bg-card border border-accent/30 p-5 flex gap-3 items-end">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-text-muted uppercase tracking-[1px]">
              {t('vendors.vendorCode')}
            </label>
            <input
              className="bg-bg-page border border-border-light px-3 py-2 text-sm text-text-primary outline-none focus:border-accent w-28"
              value={newCode}
              onChange={(e) => setNewCode(e.target.value.toUpperCase())}
              maxLength={10}
              placeholder="JJW"
            />
          </div>
          <div className="flex flex-col gap-1.5 flex-1">
            <label className="text-xs font-semibold text-text-muted uppercase tracking-[1px]">
              {t('vendors.vendorName')}
            </label>
            <input
              className="bg-bg-page border border-border-light px-3 py-2 text-sm text-text-primary outline-none focus:border-accent w-full"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Vendor Full Name"
            />
          </div>
          <button
            onClick={addVendor}
            disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 text-sm bg-accent text-white hover:bg-accent/90 cursor-pointer disabled:opacity-50"
          >
            <Check size={14} /> Save
          </button>
          <button
            onClick={() => setShowAddForm(false)}
            className="flex items-center gap-1.5 px-4 py-2 text-sm border border-border-light text-text-secondary hover:text-text-primary cursor-pointer"
          >
            <X size={14} /> Cancel
          </button>
        </div>
      )}

      <div className="flex flex-col gap-2">
        {justCreated && (
          <div className="flex items-center gap-2 px-4 py-2.5 border border-amber-500/40
                          bg-amber-500/10 text-amber-700 text-xs">
            <AlertTriangle size={14} className="shrink-0" />
            <span className="flex-1">{t('vendors.createdHint')}</span>
            <button onClick={() => setJustCreated(null)}
                    className="text-amber-700 hover:opacity-70 cursor-pointer">
              <X size={14} />
            </button>
          </div>
        )}
        {vendors.map((v) => (
          <VendorCard
            key={v.id}
            vendor={v}
            siteFilter={filterSite}
            defaultOpen={v.code === justCreated}
            onDeleted={() => setVendors((prev) => prev.filter((x) => x.id !== v.id))}
          />
        ))}
      </div>
    </div>
  )
}
