import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'
import SearchSelect from './SearchSelect'
import { getLotFilterOptions, type LotFilter } from '@/services/history'

interface LotFilterBarProps {
  value: LotFilter
  onChange: (next: LotFilter) => void
  /** Rendered inline after 批號 — the lot picker these filters narrow. */
  children?: React.ReactNode
  /** Admin-only 廠區 narrowing, passed through to the options query. */
  site?: string
  className?: string
}

const EMPTY: LotFilter = { vendor: '', product: '', lot: '', judgement: '' }

/**
 * 廠商 → 型號 → 批號, each list narrowed by the ones above it.
 *
 * The single combined picker could only be searched as free text, so finding a
 * lot meant knowing how to spell it. These three answer the question the other
 * way round: pick a vendor, see its products, see that product's lots.
 *
 * Choosing a vendor clears the product and lot below it, because a product from
 * the previous vendor would filter the list down to nothing and read as "no
 * data" rather than "that combination does not exist".
 */
export default function LotFilterBar({ value, onChange, children, site, className = '' }: LotFilterBarProps) {
  const { t } = useTranslation('history')
  const [vendors, setVendors] = useState<string[]>([])
  const [products, setProducts] = useState<string[]>([])
  const [lots, setLots] = useState<string[]>([])
  const [judgements, setJudgements] = useState<string[]>([])

  useEffect(() => {
    let stale = false
    getLotFilterOptions({ vendor: value.vendor, product: value.product, site })
      .then((res) => {
        if (stale) return
        setVendors(res.vendors.map((v) => v.code))
        setProducts(res.products)
        setLots(res.lots)
        setJudgements(res.judgements ?? [])
      })
      .catch(() => {})
    // Discard a slower earlier response so the lists always match the current
    // selection rather than whichever request happened to land last.
    return () => { stale = true }
  }, [value.vendor, value.product, site])

  const active = !!(value.vendor || value.product || value.lot)

  return (
    <div className={`flex flex-wrap items-end gap-3 ${className}`}>
      <FilterField label={t('filter.vendor')}>
        <SearchSelect
          items={vendors}
          value={value.vendor}
          onChange={(vendor) => onChange({ ...value, vendor, product: '', lot: '' })}
          placeholder={t('filter.allVendors')}
          className="w-[150px]"
        />
      </FilterField>
      <FilterField label={t('filter.product')}>
        <SearchSelect
          items={products}
          value={value.product}
          onChange={(product) => onChange({ ...value, product, lot: '' })}
          placeholder={t('filter.allProducts')}
          className="w-[190px]"
        />
      </FilterField>
      <FilterField label={t('filter.lot')}>
        <SearchSelect
          items={lots}
          value={value.lot}
          onChange={(lot) => onChange({ ...value, lot })}
          placeholder={t('filter.allLots')}
          className="w-[230px]"
        />
      </FilterField>
      {judgements.length > 0 && (
        <FilterField label={t('filter.judgement')}>
          <SearchSelect
            items={judgements.map((j) => t(`filter.verdict.${j}`))}
            value={value.judgement ? t(`filter.verdict.${value.judgement}`) : ''}
            onChange={(label) => {
              const hit = judgements.find((j) => t(`filter.verdict.${j}`) === label)
              onChange({ ...value, judgement: hit ?? '' })
            }}
            placeholder={t('filter.allJudgements')}
            className="w-[140px]"
          />
        </FilterField>
      )}
      {children}
      {active && (
        <button
          type="button"
          onClick={() => onChange(EMPTY)}
          className="mb-[1px] flex items-center gap-1 px-2 py-2 text-[12px] text-text-muted hover:text-accent"
        >
          <X size={13} />
          {t('filter.clear')}
        </button>
      )}
    </div>
  )
}

/** A labelled control matching the filter selects, so a picker a page adds
 *  through `children` lines up with them. */
export function FilterField(
  { label, className = '', children }:
  { label: string; className?: string; children: React.ReactNode },
) {
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label className="text-[11px] font-bold uppercase tracking-[0.5px] text-text-tertiary">
        {label}
      </label>
      {children}
    </div>
  )
}
