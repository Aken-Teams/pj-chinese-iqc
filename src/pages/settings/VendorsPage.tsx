import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, ChevronDown, ChevronRight, Trash2, Pencil, Check, X } from 'lucide-react'
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
}

type FormatDraft = Omit<VendorFormat, 'id'>

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

  const numFields: { key: keyof FormatDraft; labelKey: string; nullable?: boolean }[] = [
    { key: 'header_row', labelKey: 'headerRow' },
    { key: 'data_start_row', labelKey: 'dataStartRow' },
    { key: 'lower_limit_row', labelKey: 'lowerLimitRow' },
    { key: 'upper_limit_row', labelKey: 'upperLimitRow' },
    { key: 'electrical_start_col', labelKey: 'electricalStartCol' },
    { key: 'wafer_id_col', labelKey: 'waferIdCol' },
    { key: 'bin_col', labelKey: 'binCol' },
    { key: 'fixed_die_count', labelKey: 'fixedDieCount', nullable: true },
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
      <div className="flex gap-3 items-center">
        <label className="text-xs font-semibold text-text-muted uppercase tracking-[1px] w-36 shrink-0">
          {t('vendors.formatName')}
        </label>
        <input
          className="flex-1 bg-bg-card border border-border-light px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
          value={draft.format_name ?? ''}
          onChange={(e) => setDraft((d) => ({ ...d, format_name: e.target.value }))}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        {numFields.map(({ key, labelKey, nullable }) => (
          <div key={key} className="flex gap-2 items-center">
            <label className="text-xs font-semibold text-text-muted uppercase tracking-[1px] w-36 shrink-0">
              {t(`vendors.${labelKey}`)}
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
      </div>
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
      </button>

      {expanded && (
        <div className="px-5 pb-5 flex flex-col gap-2">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold text-text-muted uppercase tracking-[1px]">
              {t('vendors.formats')}
            </span>
            <button
              onClick={() => setAddingNew(true)}
              className="flex items-center gap-1 text-sm text-accent hover:text-accent/80 cursor-pointer"
            >
              <Plus size={14} /> {t('vendors.addFormat')}
            </button>
          </div>

          {formats.length === 0 && !addingNew && (
            <p className="text-sm text-text-muted py-2">{t('vendors.noFormats')}</p>
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
      )}
    </div>
  )
}

export default function VendorsPage() {
  const { t } = useTranslation('settings')
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [showAddForm, setShowAddForm] = useState(false)
  const [newCode, setNewCode] = useState('')
  const [newName, setNewName] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    getVendors().then(setVendors)
  }, [])

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
        <button
          onClick={() => setShowAddForm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-accent text-white text-sm font-medium hover:bg-accent/90 cursor-pointer"
        >
          <Plus size={16} /> {t('vendors.addVendor')}
        </button>
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
