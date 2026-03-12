import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Trash2, Check, X } from 'lucide-react'
import PageHeader from '@/components/layout/PageHeader'
import { getProducts, type Product } from '@/services/vendors'
import {
  getPackagingSpecs,
  createPackagingSpec,
  updatePackagingSpec,
  deletePackagingSpec,
  type PackagingSpec,
} from '@/services/packaging_specs'

type SpecDraft = Omit<PackagingSpec, 'id'>

function SpecRow({
  spec,
  productId,
  onSaved,
  onDeleted,
}: {
  spec: PackagingSpec | null
  productId: number
  onSaved: (s: PackagingSpec) => void
  onDeleted?: () => void
}) {
  const { t } = useTranslation('settings')
  const [editing, setEditing] = useState(spec === null)
  const [draft, setDraft] = useState<SpecDraft>(
    spec ?? {
      product_id: productId,
      param_name: '',
      lower_limit: null,
      upper_limit: null,
      unit: null,
      test_condition: null,
    }
  )
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!draft.param_name.trim()) return
    setSaving(true)
    try {
      const saved = spec
        ? await updatePackagingSpec(spec.id, draft)
        : await createPackagingSpec(draft)
      onSaved(saved)
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  function cancel() {
    if (spec === null) onDeleted?.()
    else { setDraft(spec); setEditing(false) }
  }

  async function remove() {
    if (!spec || !window.confirm(t('specs.confirmDelete'))) return
    await deletePackagingSpec(spec.id)
    onDeleted?.()
  }

  if (!editing) {
    return (
      <tr className="border-b border-border-light hover:bg-bg-page transition-colors">
        <td className="px-4 py-2.5 text-sm font-medium text-text-primary">{spec?.param_name}</td>
        <td className="px-3 py-2.5 text-sm text-text-secondary text-right">{spec?.lower_limit ?? '—'}</td>
        <td className="px-3 py-2.5 text-sm text-text-secondary text-right">{spec?.upper_limit ?? '—'}</td>
        <td className="px-3 py-2.5 text-sm text-text-secondary">{spec?.unit ?? '—'}</td>
        <td className="px-3 py-2.5 text-sm text-text-secondary">{spec?.test_condition ?? '—'}</td>
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
      <td className="px-2 py-2">
        <input
          className="w-full bg-bg-card border border-border-light px-2 py-1 text-sm text-text-primary outline-none focus:border-accent"
          value={draft.param_name}
          onChange={(e) => setDraft((d) => ({ ...d, param_name: e.target.value }))}
          placeholder={t('specs.paramName')}
        />
      </td>
      <td className="px-2 py-2">
        <input
          type="number" step="any"
          className="w-full bg-bg-card border border-border-light px-2 py-1 text-sm text-text-primary outline-none focus:border-accent text-right"
          value={draft.lower_limit ?? ''}
          onChange={(e) => setDraft((d) => ({ ...d, lower_limit: e.target.value === '' ? null : Number(e.target.value) }))}
        />
      </td>
      <td className="px-2 py-2">
        <input
          type="number" step="any"
          className="w-full bg-bg-card border border-border-light px-2 py-1 text-sm text-text-primary outline-none focus:border-accent text-right"
          value={draft.upper_limit ?? ''}
          onChange={(e) => setDraft((d) => ({ ...d, upper_limit: e.target.value === '' ? null : Number(e.target.value) }))}
        />
      </td>
      <td className="px-2 py-2">
        <input
          className="w-full bg-bg-card border border-border-light px-2 py-1 text-sm text-text-primary outline-none focus:border-accent"
          value={draft.unit ?? ''}
          onChange={(e) => setDraft((d) => ({ ...d, unit: e.target.value || null }))}
          placeholder={t('specs.unit')}
        />
      </td>
      <td className="px-2 py-2">
        <input
          className="w-full bg-bg-card border border-border-light px-2 py-1 text-sm text-text-primary outline-none focus:border-accent"
          value={draft.test_condition ?? ''}
          onChange={(e) => setDraft((d) => ({ ...d, test_condition: e.target.value || null }))}
          placeholder={t('specs.testCondition')}
        />
      </td>
      <td className="px-2 py-2">
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

export default function SpecsPage() {
  const { t } = useTranslation('settings')
  const [products, setProducts] = useState<Product[]>([])
  const [selectedProductId, setSelectedProductId] = useState<number | null>(null)
  const [specs, setSpecs] = useState<PackagingSpec[]>([])
  const [addingNew, setAddingNew] = useState(false)

  useEffect(() => {
    getProducts().then(setProducts)
  }, [])

  useEffect(() => {
    if (selectedProductId == null) return
    getPackagingSpecs(selectedProductId).then(setSpecs)
    setAddingNew(false)
  }, [selectedProductId])

  return (
    <div className="p-9 pl-11 flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <PageHeader title={t('specs.title')} subtitle={t('specs.desc')} />
        {selectedProductId != null && (
          <button
            onClick={() => setAddingNew(true)}
            className="flex items-center gap-2 px-4 py-2 bg-accent text-white text-sm font-medium hover:bg-accent/90 cursor-pointer"
          >
            <Plus size={16} /> {t('specs.addSpec')}
          </button>
        )}
      </div>

      {/* Product selector */}
      <div className="flex items-center gap-3">
        <label className="text-xs font-semibold text-text-muted uppercase tracking-[1px] shrink-0">
          Product
        </label>
        <select
          className="bg-bg-card border border-border-light px-3 py-1.5 text-sm text-text-primary outline-none focus:border-accent cursor-pointer min-w-48"
          value={selectedProductId ?? ''}
          onChange={(e) => setSelectedProductId(e.target.value ? Number(e.target.value) : null)}
        >
          <option value="">{t('specs.selectProduct')}</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              [{p.vendor_code}] {p.product_code}
            </option>
          ))}
        </select>
      </div>

      {selectedProductId == null ? (
        <p className="text-sm text-text-muted">{t('specs.selectProduct')}</p>
      ) : (
        <div className="bg-bg-card border border-border-light overflow-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-border-light">
                <th className="px-4 py-2.5 text-xs font-semibold text-text-muted uppercase tracking-[1px]">
                  {t('specs.paramName')}
                </th>
                <th className="px-3 py-2.5 text-xs font-semibold text-text-muted uppercase tracking-[1px] text-right">
                  {t('specs.lowerLimit')}
                </th>
                <th className="px-3 py-2.5 text-xs font-semibold text-text-muted uppercase tracking-[1px] text-right">
                  {t('specs.upperLimit')}
                </th>
                <th className="px-3 py-2.5 text-xs font-semibold text-text-muted uppercase tracking-[1px]">
                  {t('specs.unit')}
                </th>
                <th className="px-3 py-2.5 text-xs font-semibold text-text-muted uppercase tracking-[1px]">
                  {t('specs.testCondition')}
                </th>
                <th className="px-3 py-2.5 w-16" />
              </tr>
            </thead>
            <tbody>
              {specs.length === 0 && !addingNew && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-sm text-text-muted text-center">
                    {t('specs.noSpecs')}
                  </td>
                </tr>
              )}
              {specs.map((spec) => (
                <SpecRow
                  key={spec.id}
                  spec={spec}
                  productId={selectedProductId}
                  onSaved={(saved) => setSpecs((prev) => prev.map((s) => (s.id === saved.id ? saved : s)))}
                  onDeleted={() => setSpecs((prev) => prev.filter((s) => s.id !== spec.id))}
                />
              ))}
              {addingNew && (
                <SpecRow
                  spec={null}
                  productId={selectedProductId}
                  onSaved={(saved) => {
                    setSpecs((prev) => [...prev, saved])
                    setAddingNew(false)
                  }}
                  onDeleted={() => setAddingNew(false)}
                />
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
