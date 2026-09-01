import { useState, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2 } from 'lucide-react'
import PageHeader from '@/components/layout/PageHeader'
import InfoHint from '@/components/ui/InfoHint'
import SearchSelect from '@/components/ui/SearchSelect'
import MultiSelect, { type MultiSelectItem } from '@/components/ui/MultiSelect'
import TrendChart from '@/components/analysis/TrendChart'
import BoxPlotChart from '@/components/analysis/BoxPlotChart'
import { getCandidateLots, getCrossLot,
         type CandidateLot, type CrossLotResponse } from '@/services/crossLot'
import { getThresholds } from '@/services/review'

const VERDICT_STYLE: Record<string, string> = {
  PASS: 'bg-badge-pass text-success',
  WARN: 'bg-badge-warn text-warning',
  HOLD: 'bg-badge-fail text-error',
}

/**
 * Cross-lot analysis: choose the lots to compare, then read them two ways.
 *
 * Kept apart from 分析 & AI, which answers "what happened in this lot" and is
 * scoped to a single lot throughout. Mixing the two scopes on one screen is what
 * made the old analytics page misread — its SPC chart quietly spanned the whole
 * product while the charts beside it showed one lot.
 *
 * The lots are picked one by one rather than implied by a product, because that
 * is the ask: compare the files I choose. It also allows the comparison a
 * product-keyed page could not — the same parameter across two sibling products
 * from one fab.
 */
export default function CrossLotPage() {
  const { t } = useTranslation('analysis')

  const [vendor, setVendor] = useState('')
  const [product, setProduct] = useState('')
  const [lotFilter, setLotFilter] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')

  const [candidates, setCandidates] = useState<CandidateLot[] | null>(null)
  const [chosen, setChosen] = useState<number[]>([])
  const [param, setParam] = useState('')
  const [data, setData] = useState<CrossLotResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [thresholds, setThresholds] = useState<{ passMin: number; warnMin: number } | null>(null)

  useEffect(() => {
    getThresholds()
      .then((rows) => {
        const own = rows.find((r) => r.domain !== null) ?? rows[0]
        if (own) setThresholds({ passMin: own.passMin, warnMin: own.warnMin })
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    let stale = false
    getCandidateLots({ vendor, product, fromDate, toDate })
      .then((list) => {
        if (stale) return
        setCandidates(list)
        // Pre-select the newest few so the page shows something on arrival
        // without committing the user to a set they did not choose.
        setChosen((prev) => {
          const stillThere = prev.filter((id) => list.some((l) => l.lotId === id))
          return stillThere.length ? stillThere : list.slice(0, 6).map((l) => l.lotId)
        })
      })
      .catch(() => { if (!stale) setCandidates([]) })
    return () => { stale = true }
  }, [vendor, product, fromDate, toDate])

  useEffect(() => {
    // Clearing the last tick leaves the previous response in state; `shown`
    // below discards it during render instead, because setting state
    // synchronously inside an effect starts a second render pass.
    if (!chosen.length) return
    let stale = false
    // Deferred past the render that scheduled this effect: setting state in the
    // effect body starts a second pass before the browser paints the first.
    const spinner = window.setTimeout(() => { setLoading(true); setError('') }, 0)
    getCrossLot(chosen, param)
      .then((res) => {
        if (stale) return
        setData(res)
        if (res.params.length && !res.params.includes(param)) setParam(res.params[0])
      })
      .catch((e) => { if (!stale) setError(e instanceof Error ? e.message : String(e)) })
      .finally(() => { if (!stale) setLoading(false) })
    return () => { stale = true; window.clearTimeout(spinner) }
  }, [chosen, param])

  const vendors = useMemo(
    () => [...new Set((candidates ?? []).map((l) => l.vendor).filter(Boolean))] as string[],
    [candidates],
  )
  const products = useMemo(
    () => [...new Set((candidates ?? []).map((l) => l.product))],
    [candidates],
  )
  const lotNumbers = useMemo(
    () => [...new Set((candidates ?? []).map((l) => l.lot))].sort(),
    [candidates],
  )

  const options: MultiSelectItem[] = useMemo(
    () => (candidates ?? [])
      .filter((l) => !lotFilter || l.lot === lotFilter)
      .map((l) => ({
        value: String(l.lotId),
        label: l.lot,
        hint: `${l.vendor} / ${l.product} · ${(l.date ?? '').slice(0, 10)}`
          + `${l.dateIsTestDate ? '' : ' *'} · ${l.waferCount} 片`,
        badge: l.judgement ?? undefined,
        badgeClass: VERDICT_STYLE[l.judgement ?? ''] ?? '',
        keywords: `${l.vendor} ${l.product}`,
      })),
    [candidates, lotFilter],
  )

  // Nothing ticked means nothing to show, whatever the last response held.
  const shown = chosen.length ? data : null
  const uploadTimeOnly = (shown?.trend ?? []).filter((p) => !p.dateIsTestDate).length
  const mixedProducts = (shown?.products ?? []).length > 1

  return (
    <div className="flex flex-col gap-6 p-9 pl-11">
      <PageHeader
        titleAfter={
          <InfoHint
            title={t('hint.title')}
            lines={t('hint.lines', { returnObjects: true }) as string[]}
          />
        }
        title={t('title')}
        subtitle={t('subtitle')}
      />

      <div className="flex flex-wrap items-end gap-3 bg-bg-card px-4 py-3">
        <Field label={t('filter.vendor')}>
          <SearchSelect items={vendors} value={vendor} onChange={setVendor}
                        placeholder={t('filter.allVendors')} className="w-[118px]" />
        </Field>
        <Field label={t('filter.product')}>
          <SearchSelect items={products} value={product} onChange={setProduct}
                        placeholder={t('filter.allProducts')} className="w-[150px]" />
        </Field>
        <Field label={t('filter.lot')}>
          <SearchSelect items={lotNumbers} value={lotFilter} onChange={setLotFilter}
                        placeholder={t('filter.allLots')} className="w-[150px]" />
        </Field>
        <Field label={t('filter.from')}>
          <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)}
                 className="w-[132px] border border-border-light bg-bg-page px-2 py-2 text-[13px] outline-none focus:border-accent/60" />
        </Field>
        <Field label={t('filter.to')}>
          <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)}
                 className="w-[145px] border border-border-light bg-bg-page px-2 py-2 text-[13px] outline-none focus:border-accent/60" />
        </Field>
        <Field label={t('filter.param')}>
          <SearchSelect items={data?.params ?? []} value={param} onChange={setParam}
                        placeholder={t('filter.pickParam')}
                        disabled={!data?.params.length} className="w-[160px]" />
        </Field>
        {/* The comparison set itself, in the same row as the filters that
            narrow it — which lots are in scope is the thing most likely to be
            misread, so it is picked in plain sight rather than inferred. */}
        <Field label={t('pick.title')}>
          <MultiSelect
            items={options}
            value={chosen.map(String)}
            onChange={(next) => setChosen(next.map(Number))}
            placeholder={t('pick.none')}
            summary={(n) => t('pick.chosen', { count: n })}
            selectAllLabel={t('pick.all')}
            clearLabel={t('pick.clear')}
            emptyLabel={t('pick.empty')}
            searchPlaceholder={t('pick.search')}
            className="w-[210px]"
          />
        </Field>
        {loading && <Loader2 size={16} className="mb-2 animate-spin text-accent" />}
      </div>

      {error && (
        <div className="bg-badge-fail px-4 py-2.5 text-sm font-medium text-error">{error}</div>
      )}

      <section className="bg-bg-card p-6">
        <div className="mb-3 flex flex-wrap items-baseline gap-3">
          <h3 className="font-heading font-bold">{t('trend.title')}</h3>
          <span className="text-[12px] text-text-muted">{t('trend.desc')}</span>
          {mixedProducts && (
            <span className="text-[12px] text-warning">
              {t('trend.mixedProducts', { count: (shown?.products ?? []).length })}
            </span>
          )}
          {uploadTimeOnly > 0 && (
            <span className="text-[12px] text-warning">
              {t('trend.noTestDate', { count: uploadTimeOnly })}
            </span>
          )}
        </div>
        <TrendChart points={shown?.trend ?? []}
                    passMin={thresholds?.passMin} warnMin={thresholds?.warnMin} />
      </section>

      <section className="bg-bg-card p-6">
        <div className="mb-3 flex flex-wrap items-baseline gap-3">
          <h3 className="font-heading font-bold">{t('box.title')}</h3>
          <span className="text-[12px] text-text-muted">{t('box.desc')}</span>
        </div>
        <BoxPlotChart boxes={shown?.boxes ?? []} paramName={param} />
      </section>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[11px] font-bold uppercase tracking-[0.5px] text-text-tertiary">
        {label}
      </label>
      {children}
    </div>
  )
}
