import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, ChevronDown, ChevronRight, Trash2, Pencil, Check, X, HelpCircle } from 'lucide-react'
import PageHeader from '@/components/layout/PageHeader'
import {
  getVendors,
  createVendor,
  getVendorFormats,
  createVendorFormat,
  updateVendorFormat,
  deleteVendorFormat,
  type Vendor,
  type VendorFormat,
} from '@/services/vendors'
import { useAuthStore } from '@/store/authStore'
import { SITE_LABELS, siteLabel } from '@/config/sites'

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
  onSaved,
  onDeleted,
}: {
  fmt: VendorFormat | null
  vendorId: number
  onSaved: (f: VendorFormat) => void
  onDeleted?: () => void
}) {
  const { t } = useTranslation('settings')
  const [editing, setEditing] = useState(fmt === null)
  const [draft, setDraft] = useState<FormatDraft>(fmt ?? DEFAULT_FORMAT)
  const [saving, setSaving] = useState(false)
  const [showHelp, setShowHelp] = useState(false)

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

  async function save() {
    setSaving(true)
    try {
      const saved = fmt
        ? await updateVendorFormat(vendorId, fmt.id, draft)
        : await createVendorFormat(vendorId, draft)
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
        <button onClick={() => setEditing(true)} className="p-1 text-text-muted hover:text-accent cursor-pointer">
          <Pencil size={15} />
        </button>
        <button onClick={remove} className="p-1 text-text-muted hover:text-danger cursor-pointer">
          <Trash2 size={15} />
        </button>
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
      </div>

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
              value={draft[key] ?? ''}
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

function VendorCard({ vendor }: { vendor: Vendor }) {
  const { t } = useTranslation('settings')
  const [expanded, setExpanded] = useState(false)
  const [formats, setFormats] = useState<VendorFormat[]>([])
  const [loaded, setLoaded] = useState(false)
  const [addingNew, setAddingNew] = useState(false)

  async function loadFormats() {
    if (loaded) return
    const data = await getVendorFormats(vendor.id)
    setFormats(data)
    setLoaded(true)
  }

  function toggle() {
    if (!expanded) loadFormats()
    setExpanded((v) => !v)
  }

  return (
    <div className="bg-bg-card border border-border-light">
      <button
        onClick={toggle}
        className="w-full flex items-center gap-3 px-5 py-4 hover:bg-bg-page transition-colors cursor-pointer"
      >
        {expanded ? <ChevronDown size={17} className="text-text-muted" /> : <ChevronRight size={17} className="text-text-muted" />}
        <span className="font-heading text-sm font-bold uppercase tracking-[1px] text-accent">{vendor.code}</span>
        <span className="text-base text-text-primary">{vendor.name}</span>
        {vendor.domains && vendor.domains.length > 0 && (
          <span className="flex items-center gap-1">
            {vendor.domains.map((d) => (
              <span key={d} className="px-1.5 py-0.5 bg-bg-page text-text-secondary text-[10px] font-semibold rounded">
                {siteLabel(d)}
              </span>
            ))}
          </span>
        )}
      </button>

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
                onSaved={(saved) => setFormats((prev) => prev.map((f) => (f.id === saved.id ? saved : f)))}
                onDeleted={() => setFormats((prev) => prev.filter((f) => f.id !== fmt.id))}
              />
            ))}

            {addingNew && (
              <FormatRow
                fmt={null}
                vendorId={vendor.id}
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
            <select
              className="bg-bg-card border border-border-light px-3 py-2 text-sm text-text-primary outline-none focus:border-accent cursor-pointer"
              value={filterSite}
              onChange={(e) => setFilterSite(e.target.value)}
            >
              <option value="">{t('scores.allSites')}</option>
              {Object.keys(SITE_LABELS).map((code) => (
                <option key={code} value={code}>{siteLabel(code)}</option>
              ))}
            </select>
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
        {vendors.map((v) => (
          <VendorCard key={v.id} vendor={v} />
        ))}
      </div>
    </div>
  )
}
