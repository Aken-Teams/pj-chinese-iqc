import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import PageHeader from '@/components/layout/PageHeader'
import { Download, Search, Loader2, FileText } from 'lucide-react'
import SearchSelect from '@/components/ui/SearchSelect'
import { getHistory, type HistoryRow, type HistoryResponse } from '@/services/history'
import { getVendors, getProducts, type Product } from '@/services/vendors'
import { downloadCsv } from '@/utils/exportCsv'
import { printToPdf } from '@/utils/exportPdf'
import { useAuthStore } from '@/store/authStore'
import { siteLabel, siteOptions } from '@/config/sites'
import Select from '@/components/ui/Select'

// SVG line chart for yield trend with hover tooltip
function YieldTrendChart({ items }: { items: HistoryRow[] }) {
  const { t } = useTranslation('history')
  const [hovered, setHovered] = useState<number | null>(null)

  if (items.length === 0) {
    return <p className="text-sm text-text-muted text-center py-6">{t('noTrend')}</p>
  }

  const W = 680
  const H = 140
  const PAD = { top: 20, right: 24, bottom: 32, left: 48 }
  const chartW = W - PAD.left - PAD.right
  const chartH = H - PAD.top - PAD.bottom

  const yieldValues = items.map((r) => parseFloat(r.avgYield) || 0)
  const minY = Math.max(0, Math.min(...yieldValues) - 5)
  const maxY = Math.min(100, Math.max(...yieldValues) + 5)
  const rangeY = maxY - minY || 1

  const toX = (i: number) => PAD.left + (i / Math.max(items.length - 1, 1)) * chartW
  const toY = (v: number) => PAD.top + chartH - ((v - minY) / rangeY) * chartH

  const points = items.map((r, i) => ({ x: toX(i), y: toY(parseFloat(r.avgYield) || 0), row: r }))
  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')

  const ticks = [minY, minY + rangeY / 2, maxY].map((v) => ({
    v: Math.round(v * 10) / 10,
    y: toY(v),
  }))

  const step = Math.ceil(items.length / 6)
  const xLabels = items
    .map((r, i) => ({ label: r.lotId ?? '', x: toX(i) }))
    .filter((_, i) => i % step === 0 || i === items.length - 1)

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ overflow: 'visible' }}
      onMouseLeave={() => setHovered(null)}>
      {ticks.map((tk) => (
        <g key={tk.v}>
          <line x1={PAD.left} y1={tk.y} x2={W - PAD.right} y2={tk.y} stroke="var(--color-border-light)" strokeDasharray="4 3" />
          <text x={PAD.left - 6} y={tk.y + 4} textAnchor="end" fontSize="9" fill="var(--color-text-muted)">
            {tk.v}%
          </text>
        </g>
      ))}
      <path d={pathD} fill="none" stroke="var(--color-accent)" strokeWidth="2" strokeLinejoin="round" />
      {/* Invisible wider hit area + visible dot */}
      {points.map((p, i) => {
        const isHov = hovered === i
        return (
          <g key={i} onMouseEnter={() => setHovered(i)} style={{ cursor: 'pointer' }}>
            <circle cx={p.x} cy={p.y} r="10" fill="transparent" />
            <circle cx={p.x} cy={p.y} r={isHov ? 5 : 3} fill="var(--color-accent)"
              style={{ transition: 'r 0.1s ease' }} />
          </g>
        )
      })}
      {xLabels.map((lbl) => (
        <text key={lbl.x} x={lbl.x} y={H - 4} textAnchor="middle" fontSize="9" fill="var(--color-text-muted)">
          {lbl.label}
        </text>
      ))}
      {/* Tooltip */}
      {hovered !== null && (() => {
        const p = points[hovered]
        const row = p.row
        const line1 = row.date?.slice(0, 10) ?? ''
        const line2 = `${row.lotId}  ${row.avgYield}`
        const tw = Math.max(line1.length, line2.length) * 5.8 + 14
        const tx = Math.min(Math.max(p.x, PAD.left + tw / 2), W - PAD.right - tw / 2)
        const ty = p.y - 6
        return (
          <g>
            <rect x={tx - tw / 2} y={ty - 32} width={tw} height={28} rx={2}
              fill="var(--color-text-primary)" />
            <text x={tx} y={ty - 18} textAnchor="middle" fontSize="9"
              fill="var(--color-bg-card)" fontWeight="600">{line1}</text>
            <text x={tx} y={ty - 7} textAnchor="middle" fontSize="9"
              fill="var(--color-bg-card)">{line2}</text>
          </g>
        )
      })()}
    </svg>
  )
}

export default function HistoryPage() {
  const { t } = useTranslation('history')
  const isAdmin = useAuthStore((s) => s.user?.role === 'admin')
  const [data, setData] = useState<HistoryResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [vendor, setVendor] = useState('')
  const [filterSite, setFilterSite] = useState('')
  const [product, setProduct] = useState('')
  const [status, setStatus] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [page, setPage] = useState(1)
  const [allItems, setAllItems] = useState<HistoryRow[]>([])
  const [vendorCodes, setVendorCodes] = useState<string[]>([])
  const [products, setProducts] = useState<Product[]>([])

  useEffect(() => {
    getVendors(isAdmin ? filterSite : undefined).then((list) => setVendorCodes(list.map((v) => v.code))).catch(() => {})
    getProducts(isAdmin ? filterSite : undefined).then(setProducts).catch(() => {})
  }, [filterSite, isAdmin])

  // Product-model dropdown options, scoped by the selected site and vendor.
  const productOptions = (() => {
    const codes = products
      .filter((p) => !vendor || p.vendor_code === vendor)
      .map((p) => p.product_code)
    return Array.from(new Set(codes)).sort()
  })()

  const buildParams = () => ({
    vendor, product, status,
    site: isAdmin ? (filterSite || undefined) : undefined,
    fromDate: fromDate || undefined, toDate: toDate || undefined,
  })

  // "Latest wins": rapid filter changes fire overlapping requests; ignore any
  // response that isn't from the most recent call so a slow earlier request
  // (e.g. the unfiltered set) can't overwrite the current filtered result.
  const reqIdRef = useRef(0)

  const loadData = async (pg = page) => {
    const myId = ++reqIdRef.current
    setLoading(true)
    const params = buildParams()
    // Paginated table data
    try {
      const res = await getHistory({ ...params, page: pg, pageSize: 10 })
      if (myId === reqIdRef.current) setData(res)
    } catch {
      if (myId === reqIdRef.current) setData(null)
    } finally {
      if (myId === reqIdRef.current) setLoading(false)
    }
    // All items for trend chart (independent — failure doesn't affect table)
    try {
      const res = await getHistory({ ...params, page: 1, pageSize: 500 })
      if (myId === reqIdRef.current) setAllItems(res.items)
    } catch {
      // keep previous allItems
    }
  }

  // Live filtering: reload whenever any filter (or page) changes — no need to
  // click 搜尋. Filter changes reset the page to 1 in their onChange handlers.
  useEffect(() => { loadData(page) }, [page, vendor, filterSite, product, status, fromDate, toDate])

  const handleSearch = () => { setPage(1); loadData(1) }

  const items = data?.items || []

  const handleExportCsv = () => {
    const headers = [
      t('table.date'), ...(isAdmin ? [t('table.site')] : []), t('table.vendor'), t('table.product'),
      t('table.lotId'), t('table.wafers'), t('table.avgYield'), t('table.status'),
    ]
    const rows = items.map((r) => [
      r.date, ...(isAdmin ? [siteLabel(r.domain)] : []), r.vendor, r.product, r.lotId, r.wafers, r.avgYield, r.status,
    ])
    downloadCsv('history.csv', [headers, ...rows])
  }

  const handleExportPdf = () => {
    const headers = [
      t('table.date'), ...(isAdmin ? [t('table.site')] : []), t('table.vendor'), t('table.product'),
      t('table.lotId'), t('table.wafers'), t('table.avgYield'), t('table.status'),
    ]
    const rows = items.map((r) => `
      <tr>
        <td>${r.date}</td>${isAdmin ? `<td>${siteLabel(r.domain)}</td>` : ''}<td>${r.vendor}</td><td>${r.product}</td>
        <td>${r.lotId}</td><td>${r.wafers}</td><td>${r.avgYield}</td>
        <td><span class="badge badge-${r.status === 'PASS' ? 'pass' : r.status === 'WARN' ? 'warn' : 'fail'}">${r.status}</span></td>
      </tr>`).join('')
    const html = `<table>
      <thead><tr>${headers.map((h) => `<th>${h}</th>`).join('')}</tr></thead>
      <tbody>${rows}</tbody>
    </table>`
    printToPdf(t('title'), html)
  }

  return (
    <div className="p-12">
      <PageHeader
        title={t('title')}
        actions={
          <div className="flex gap-2">
            <button
              onClick={handleExportCsv}
              disabled={items.length === 0}
              className="bg-bg-card border border-border-light px-4 py-2 text-sm text-text-secondary font-semibold hover:bg-border-light transition-colors flex items-center gap-2 disabled:opacity-40"
            >
              <Download size={16} />
              {t('exportCsv')}
            </button>
            <button
              onClick={handleExportPdf}
              disabled={items.length === 0}
              className="bg-bg-card border border-border-light px-4 py-2 text-sm text-text-secondary font-semibold hover:bg-border-light transition-colors flex items-center gap-2 disabled:opacity-40"
            >
              <FileText size={16} />
              {t('exportPdf')}
            </button>
          </div>
        }
      />

      {/* Filter Row — live filtering (no need to click 搜尋) */}
      <div className="flex flex-wrap gap-4 items-end mt-7">
        {isAdmin && (
          <div className="w-[140px] flex flex-col gap-1.5">
            <label className="text-[11px] font-bold text-text-tertiary tracking-[1px] uppercase">{t('table.site')}</label>
            <Select
              value={filterSite}
              onChange={(v) => { setFilterSite(v); setVendor(''); setProduct(''); setPage(1) }}
              options={siteOptions(t('allSites'))}
            />
          </div>
        )}
        <div className="w-[160px] flex flex-col gap-1.5">
          <label className="text-[11px] font-bold text-text-tertiary tracking-[1px] uppercase">{t('vendor')}</label>
          <SearchSelect
            items={[t('allVendors'), ...vendorCodes]}
            value={vendor || t('allVendors')}
            onChange={(v) => { setVendor(v === t('allVendors') ? '' : v); setProduct(''); setPage(1) }}
          />
        </div>
        <div className="w-[180px] flex flex-col gap-1.5">
          <label className="text-[11px] font-bold text-text-tertiary tracking-[1px] uppercase">{t('product')}</label>
          <SearchSelect
            items={[t('allProducts'), ...productOptions]}
            value={product || t('allProducts')}
            onChange={(v) => { setProduct(v === t('allProducts') ? '' : v); setPage(1) }}
          />
        </div>
        <div className="w-[140px] flex flex-col gap-1.5">
          <label className="text-[11px] font-bold text-text-tertiary tracking-[1px] uppercase">{t('status')}</label>
          <SearchSelect
            items={[t('allStatus'), t('reviewed'), t('pending')]}
            value={status === 'reviewed' ? t('reviewed') : status === 'pending' ? t('pending') : t('allStatus')}
            onChange={(v) => { setStatus(v === t('reviewed') ? 'reviewed' : v === t('pending') ? 'pending' : ''); setPage(1) }}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] font-bold text-text-tertiary tracking-[1px] uppercase">{t('fromDate')}</label>
          <input type="date" value={fromDate} onChange={(e) => { setFromDate(e.target.value); setPage(1) }} className="bg-white border border-border-light px-3 py-2 text-[13px] text-text-primary outline-none focus:border-accent/60" />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] font-bold text-text-tertiary tracking-[1px] uppercase">{t('toDate')}</label>
          <input type="date" value={toDate} onChange={(e) => { setToDate(e.target.value); setPage(1) }} className="bg-white border border-border-light px-3 py-2 text-[13px] text-text-primary outline-none focus:border-accent/60" />
        </div>
        <button onClick={handleSearch} className="bg-accent text-white px-4 py-2 text-sm font-semibold hover:opacity-90 transition-opacity flex items-center gap-2">
          <Search size={16} />
          {t('search')}
        </button>
      </div>

      {/* Yield Trend Chart */}
      <div className="bg-bg-card p-6 mt-5">
        <h3 className="font-heading font-bold mb-4">{t('trendTitle')}</h3>
        {/* Skip lots with no wafers — they have no real yield and would plunge
            the trend to 0% (failed/empty uploads). */}
        <YieldTrendChart items={allItems.filter((r) => r.wafers > 0)} />
      </div>

      {/* History Table */}
      <div className="bg-bg-card p-6 mt-5">
        <div className="flex items-center justify-between">
          <h3 className="font-heading font-bold">{t('table.title')}</h3>
          <span className="text-text-muted text-[12px]">
            {data ? t('showing', {
              from: (data.page - 1) * data.pageSize + 1,
              to: Math.min(data.page * data.pageSize, data.total),
              total: data.total,
            }) : ''}
          </span>
        </div>

        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 size={32} className="animate-spin text-accent" />
          </div>
        ) : (
          <>
            <table className="w-full mt-4">
              <thead>
                <tr className="border-b border-border-light">
                  <th className="text-left text-[11px] font-bold text-text-tertiary tracking-[1px] uppercase py-2.5 pr-4">{t('table.date')}</th>
                  {isAdmin && <th className="text-left text-[11px] font-bold text-text-tertiary tracking-[1px] uppercase py-2.5 pr-4">{t('table.site')}</th>}
                  <th className="text-left text-[11px] font-bold text-text-tertiary tracking-[1px] uppercase py-2.5 pr-4">{t('table.vendor')}</th>
                  <th className="text-left text-[11px] font-bold text-text-tertiary tracking-[1px] uppercase py-2.5 pr-4">{t('table.product')}</th>
                  <th className="text-left text-[11px] font-bold text-text-tertiary tracking-[1px] uppercase py-2.5 pr-4">{t('table.lotId')}</th>
                  <th className="text-left text-[11px] font-bold text-text-tertiary tracking-[1px] uppercase py-2.5 pr-4">{t('table.wafers')}</th>
                  <th className="text-left text-[11px] font-bold text-text-tertiary tracking-[1px] uppercase py-2.5 pr-4">{t('table.avgYield')}</th>
                  <th className="text-left text-[11px] font-bold text-text-tertiary tracking-[1px] uppercase py-2.5">{t('table.status')}</th>
                </tr>
              </thead>
              <tbody>
                {items.length > 0 ? items.map((row, i) => (
                  <tr key={row.lotId} className={i > 0 ? 'border-t border-border-light' : ''}>
                    <td className="py-3 pr-4 text-[13px] text-text-secondary">{row.date}</td>
                    {isAdmin && <td className="py-3 pr-4 text-[13px] text-text-secondary">{siteLabel(row.domain)}</td>}
                    <td className="py-3 pr-4 text-[13px] font-semibold text-text-primary">{row.vendor}</td>
                    <td className="py-3 pr-4 text-[13px] text-text-secondary">{row.product}</td>
                    <td className="py-3 pr-4 text-[13px] text-text-secondary font-mono">{row.lotId}</td>
                    <td className="py-3 pr-4 text-[13px] text-text-secondary">{row.wafers}</td>
                    <td className="py-3 pr-4 text-[13px] font-semibold text-text-primary">{row.avgYield}</td>
                    <td className="py-3">
                      <span className={`text-[12px] font-semibold px-2.5 py-1 ${
                        row.status === 'PASS' ? 'bg-badge-pass text-success' :
                        row.status === 'WARN' ? 'bg-badge-warn text-warning' :
                        'bg-badge-fail text-error'
                      }`}>{row.status}</span>
                    </td>
                  </tr>
                )) : (
                  <tr><td colSpan={isAdmin ? 8 : 7} className="py-8 text-center text-text-muted">{t('noRecords')}</td></tr>
                )}
              </tbody>
            </table>

            {data && data.totalPages > 1 && (
              <div className="flex gap-1 justify-end mt-4">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} className="bg-bg-card border border-border-light px-3 py-1.5 text-[12px] text-text-secondary hover:bg-border-light disabled:opacity-30">
                  {t('previous')}
                </button>
                {Array.from({ length: Math.min(data.totalPages, 5) }, (_, i) => i + 1).map(p => (
                  <button key={p} onClick={() => setPage(p)} className={`px-3 py-1.5 text-[12px] font-semibold ${p === page ? 'bg-accent text-white' : 'bg-bg-card border border-border-light text-text-secondary hover:bg-border-light'}`}>
                    {p}
                  </button>
                ))}
                <button onClick={() => setPage(p => Math.min(data.totalPages, p + 1))} disabled={page >= data.totalPages} className="bg-bg-card border border-border-light px-3 py-1.5 text-[12px] text-text-secondary hover:bg-border-light disabled:opacity-30">
                  {t('next')}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
