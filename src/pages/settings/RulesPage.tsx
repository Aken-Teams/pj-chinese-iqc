import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Trash2, Check, X } from 'lucide-react'
import PageHeader from '@/components/layout/PageHeader'
import { getProducts, type Product } from '@/services/vendors'
import { getRules, createRule, updateRule, deleteRule, type ReviewRule } from '@/services/rules'
import ProductSearchSelect from '@/components/ui/ProductSearchSelect'

const LIMIT_KEYS: { key: keyof ReviewRule; labelKey: string }[] = [
  { key: 'q1_lower', labelKey: 'q1Lower' },
  { key: 'q1_upper', labelKey: 'q1Upper' },
  { key: 'q2_lower', labelKey: 'q2Lower' },
  { key: 'q2_upper', labelKey: 'q2Upper' },
  { key: 'q3_lower', labelKey: 'q3Lower' },
  { key: 'q3_upper', labelKey: 'q3Upper' },
]

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

  function setLimit(key: keyof ReviewRule, val: string) {
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

export default function RulesPage() {
  const { t } = useTranslation('settings')
  const [products, setProducts] = useState<Product[]>([])
  const [selectedProductId, setSelectedProductId] = useState<number | null>(null)
  const [rules, setRules] = useState<ReviewRule[]>([])
  const [addingNew, setAddingNew] = useState(false)

  useEffect(() => {
    getProducts().then(setProducts)
  }, [])

  useEffect(() => {
    if (selectedProductId == null) return
    getRules(selectedProductId).then(setRules)
    setAddingNew(false)
  }, [selectedProductId])

  return (
    <div className="p-9 pl-11 flex flex-col gap-6">
      <PageHeader
        title={t('rules.title')}
        subtitle={t('rules.desc')}
        actions={
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-text-muted uppercase tracking-[1px] shrink-0">
                Product
              </label>
              <ProductSearchSelect
                products={products}
                selectedProductId={selectedProductId}
                onSelect={(id) => setSelectedProductId(id)}
                placeholder={t('rules.selectProduct')}
                className="w-[220px]"
              />
            </div>
            {selectedProductId != null && (
              <button
                onClick={() => setAddingNew(true)}
                className="flex items-center gap-2 px-4 py-2 bg-accent text-white text-sm font-medium hover:bg-accent/90 cursor-pointer whitespace-nowrap"
              >
                <Plus size={16} /> {t('rules.addRule')}
              </button>
            )}
          </div>
        }
      />

      {selectedProductId == null ? (
        <p className="text-sm text-text-muted">{t('rules.selectProduct')}</p>
      ) : (
        <div className="bg-bg-card border border-border-light overflow-auto">
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
              {rules.length === 0 && !addingNew && (
                <tr>
                  <td colSpan={8} className="px-4 py-6 text-sm text-text-muted text-center">
                    {t('rules.noRules')}
                  </td>
                </tr>
              )}
              {rules.map((rule) => (
                <RuleRow
                  key={rule.id}
                  rule={rule}
                  productId={selectedProductId}
                  onSaved={(saved) => setRules((prev) => prev.map((r) => (r.id === saved.id ? saved : r)))}
                  onDeleted={() => setRules((prev) => prev.filter((r) => r.id !== rule.id))}
                />
              ))}
              {addingNew && (
                <RuleRow
                  rule={null}
                  productId={selectedProductId}
                  onSaved={(saved) => {
                    setRules((prev) => [...prev, saved])
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
