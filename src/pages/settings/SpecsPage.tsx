import { useState, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Plus, Trash2, Check, X, ChevronDown, ChevronRight, Search,
} from 'lucide-react'
import PageHeader from '@/components/layout/PageHeader'
import { getProducts, type Product } from '@/services/vendors'
import {
  getPackagingSpecs,
  createPackagingSpec,
  updatePackagingSpec,
  deletePackagingSpec,
  type PackagingSpec,
} from '@/services/packaging_specs'
import { useAuthStore } from '@/store/authStore'
import { siteLabel, siteOptions } from '@/config/sites'
import Select from '@/components/ui/Select'

type SpecDraft = Omit<PackagingSpec, 'id' | 'product_code' | 'vendor_code'>

/* ------------------------------------------------------------------ */
/* Spec row (view + edit)                                              */
/* ------------------------------------------------------------------ */

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
    },
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
    else {
      setDraft({
        product_id: spec.product_id,
        param_name: spec.param_name,
        lower_limit: spec.lower_limit,
        upper_limit: spec.upper_limit,
        unit: spec.unit,
        test_condition: spec.test_condition,
      })
      setEditing(false)
    }
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
          type="number"
          step="any"
          className="w-full bg-bg-card border border-border-light px-2 py-1 text-sm text-text-primary outline-none focus:border-accent text-right"
          value={draft.lower_limit ?? ''}
          onChange={(e) =>
            setDraft((d) => ({ ...d, lower_limit: e.target.value === '' ? null : Number(e.target.value) }))
          }
        />
      </td>
      <td className="px-2 py-2">
        <input
          type="number"
          step="any"
          className="w-full bg-bg-card border border-border-light px-2 py-1 text-sm text-text-primary outline-none focus:border-accent text-right"
          value={draft.upper_limit ?? ''}
          onChange={(e) =>
            setDraft((d) => ({ ...d, upper_limit: e.target.value === '' ? null : Number(e.target.value) }))
          }
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
          <button
            onClick={save}
            disabled={saving}
            className="p-1 text-accent hover:text-accent/80 cursor-pointer disabled:opacity-50"
          >
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
/* Spec group card                                                     */
/* ------------------------------------------------------------------ */

interface SpecGroup {
  productId: number
  productCode: string
  vendorCode: string | null
  domain?: string | null
  specs: PackagingSpec[]
}

function SpecGroupCard({
  group,
  expanded,
  onToggle,
  addingNew,
  onAddClick,
  onAddCancel,
  onSaved,
  onDeletedSpec,
}: {
  group: SpecGroup
  expanded: boolean
  onToggle: () => void
  addingNew: boolean
  onAddClick: () => void
  onAddCancel: () => void
  onSaved: (s: PackagingSpec) => void
  onDeletedSpec: (id: number) => void
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
          {t('specs.specsCount', { count: group.specs.length })}
        </span>
        <div className="ml-auto flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={onAddClick}
            className="p-1.5 text-text-muted hover:text-accent cursor-pointer"
            title={t('specs.addSpecFor')}
          >
            <Plus size={14} />
          </button>
        </div>
      </div>
      {expanded && (
        <div className="overflow-auto border-t border-border-light">
          <table className="w-full text-left">
            <thead className="bg-bg-page">
              <tr className="border-b-2 border-border-light">
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
              {group.specs.length === 0 && !addingNew && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-sm text-text-muted text-center">
                    {t('specs.noSpecs')}
                  </td>
                </tr>
              )}
              {group.specs.map((spec) => (
                <SpecRow
                  key={spec.id}
                  spec={spec}
                  productId={group.productId}
                  onSaved={onSaved}
                  onDeleted={() => onDeletedSpec(spec.id)}
                />
              ))}
              {addingNew && (
                <SpecRow
                  spec={null}
                  productId={group.productId}
                  onSaved={(s) => {
                    onSaved(s)
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
/* Main page                                                           */
/* ------------------------------------------------------------------ */

const PAGE_SIZE = 10

export default function SpecsPage() {
  const { t } = useTranslation('settings')
  const isAdmin = useAuthStore((s) => s.user?.role === 'admin')
  const [specs, setSpecs] = useState<PackagingSpec[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [filterVendor, setFilterVendor] = useState('')
  const [filterSite, setFilterSite] = useState('')
  const [filterProduct, setFilterProduct] = useState('')
  const [filterParam, setFilterParam] = useState('')
  const [showEmpty, setShowEmpty] = useState(false)
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [addingNewFor, setAddingNewFor] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)

  async function loadSpecs() {
    const data = await getPackagingSpecs()
    setSpecs(data)
    setLoading(false)
  }

  useEffect(() => {
    loadSpecs()
    getProducts().then(setProducts)
  }, [])

  // Group: all products with packaging specs, plus every product without specs
  // so users can still add specs for them via the master list.
  const groups = useMemo(() => {
    const map = new Map<number, SpecGroup>()

    // Seed from all products so products with zero specs still appear
    for (const p of products) {
      map.set(p.id, {
        productId: p.id,
        productCode: p.product_code,
        vendorCode: p.vendor_code ?? null,
        domain: p.domain ?? null,
        specs: [],
      })
    }

    for (const s of specs) {
      let g = map.get(s.product_id)
      if (!g) {
        g = {
          productId: s.product_id,
          productCode: s.product_code ?? `#${s.product_id}`,
          vendorCode: s.vendor_code ?? null,
          specs: [],
        }
        map.set(s.product_id, g)
      }
      // Keep enrichment current even if `products` hasn't loaded yet
      if (!g.productCode && s.product_code) g.productCode = s.product_code
      if (!g.vendorCode && s.vendor_code) g.vendorCode = s.vendor_code
      g.specs.push(s)
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
        .map((g) => ({ ...g, specs: g.specs.filter((s) => s.param_name.toLowerCase().includes(q)) }))
        .filter((g) => g.specs.length > 0)
    }
    if (!showEmpty) arr = arr.filter((g) => g.specs.length > 0)
    return arr
  }, [specs, products, filterVendor, filterSite, filterProduct, filterParam, showEmpty])

  // How many products the toggle would reveal, before it is switched on.
  const emptyCount = useMemo(
    () => products.filter((p) => !specs.some((sp) => sp.product_id === p.id)).length,
    [products, specs],
  )

  const totalSpecsShown = useMemo(
    () => groups.reduce((n, g) => n + g.specs.length, 0),
    [groups],
  )

  const totalPages = Math.max(1, Math.ceil(groups.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pagedGroups = groups.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  // Reset to first page whenever filters change
  useEffect(() => {
    setPage(1)
  }, [filterVendor, filterSite, filterProduct, filterParam, showEmpty])

  const vendorOptions = useMemo(() => {
    const set = new Set<string>()
    for (const s of specs) if (s.vendor_code) set.add(s.vendor_code)
    for (const p of products) if (p.vendor_code) set.add(p.vendor_code)
    return Array.from(set).sort()
  }, [specs, products])

  const isExpanded = (pid: number) => expanded.has(pid) || !!filterParam

  function toggleExpand(pid: number) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(pid)) next.delete(pid)
      else next.add(pid)
      return next
    })
  }

  function handleSaved(saved: PackagingSpec) {
    setSpecs((prev) => {
      const idx = prev.findIndex((s) => s.id === saved.id)
      if (idx >= 0) {
        const next = [...prev]
        // Preserve enrichment when backend create/update doesn't populate them
        next[idx] = {
          ...saved,
          product_code: saved.product_code ?? prev[idx].product_code,
          vendor_code: saved.vendor_code ?? prev[idx].vendor_code,
        }
        return next
      }
      // New spec: enrich from another spec or from product list
      const sibling = prev.find((s) => s.product_id === saved.product_id)
      const product = products.find((p) => p.id === saved.product_id)
      return [
        ...prev,
        {
          ...saved,
          product_code: saved.product_code ?? sibling?.product_code ?? product?.product_code ?? null,
          vendor_code: saved.vendor_code ?? sibling?.vendor_code ?? product?.vendor_code ?? null,
        },
      ]
    })
  }

  function handleDeletedSpec(specId: number) {
    setSpecs((prev) => prev.filter((s) => s.id !== specId))
  }

  return (
    <div className="p-9 pl-11 flex flex-col gap-6">
      <PageHeader title={t('specs.title')} subtitle={t('specs.desc')} />

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
            {t('specs.filterVendor')}
          </label>
          <Select
            className="w-32"
            value={filterVendor}
            onChange={setFilterVendor}
            options={[{ value: '', label: t('specs.allVendors') }, ...vendorOptions.map((v) => ({ value: v, label: v }))]}
          />
        </div>
        <div className="flex items-center gap-2">
          <Search size={14} className="text-text-muted" />
          <input
            type="text"
            placeholder={t('specs.filterProduct')}
            value={filterProduct}
            onChange={(e) => setFilterProduct(e.target.value)}
            className="bg-bg-card border border-border-light px-2 py-1 text-sm text-text-primary outline-none focus:border-accent w-44"
          />
        </div>
        <div className="flex items-center gap-2">
          <Search size={14} className="text-text-muted" />
          <input
            type="text"
            placeholder={t('specs.filterParam')}
            value={filterParam}
            onChange={(e) => setFilterParam(e.target.value)}
            className="bg-bg-card border border-border-light px-2 py-1 text-sm text-text-primary outline-none focus:border-accent w-44"
          />
        </div>
        <label className="flex items-center gap-1.5 text-xs text-text-secondary cursor-pointer">
          <input
            type="checkbox"
            checked={showEmpty}
            onChange={(e) => setShowEmpty(e.target.checked)}
            className="accent-accent"
          />
          {t('specs.showEmpty', { count: emptyCount })}
        </label>
        <div className="ml-auto text-xs text-text-muted">
          {t('specs.summary', { products: groups.length, specs: totalSpecsShown })}
        </div>
      </div>

      {/* Groups */}
      {loading ? (
        <p className="text-sm text-text-muted">…</p>
      ) : groups.length === 0 ? (
        <div className="bg-bg-card border border-border-light p-8 text-center">
          <p className="text-sm text-text-muted">{t('specs.noSpecsAtAll')}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {pagedGroups.map((group) => (
            <SpecGroupCard
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
              onDeletedSpec={handleDeletedSpec}
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
