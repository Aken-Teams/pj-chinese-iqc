import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import PageHeader from '@/components/layout/PageHeader'
import { Download, Search, Loader2, FileText } from 'lucide-react'
import { getHistory, type HistoryRow, type HistoryResponse } from '@/services/history'
import { downloadCsv } from '@/utils/exportCsv'
import { printToPdf } from '@/utils/exportPdf'

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
  const [data, setData] = useState<HistoryResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [vendor, setVendor] = useState('')
  const [product, setProduct] = useState('')
  const [status, setStatus] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [page, setPage] = useState(1)
  const [allItems, setAllItems] = useState<HistoryRow[]>([])

  const buildParams = () => ({ vendor, product, status, fromDate: fromDate || undefined, toDate: toDate || undefined })

  const loadData = async (pg = page) => {
    setLoading(true)
    const params = buildParams()
    // Paginated table data
    try {
      const res = await getHistory({ ...params, page: pg, pageSize: 10 })
      setData(res)
    } catch {
      setData(null)
    } finally {
      setLoading(false)
    }
    // All items for trend chart (independent — failure doesn't affect table)
    try {
      const res = await getHistory({ ...params, page: 1, pageSize: 500 })
      setAllItems(res.items)
    } catch {
      // keep previous allItems
    }
  }

  useEffect(() => { loadData(page) }, [page])

  const handleSearch = () => {
    setPage(1)
    loadData(1)
  }

  const items = data?.items || []

  const handleExportCsv = () => {
    const headers = [
      t('table.date'), t('table.vendor'), t('table.product'),
      t('table.lotId'), t('table.wafers'), t('table.avgYield'), t('table.status'),
    ]
    const rows = items.map((r) => [r.date, r.vendor, r.product, r.lotId, r.wafers, r.avgYield, r.status])
    downloadCsv('history.csv', [headers, ...rows])
  }

  const handleExportPdf = () => {
    const headers = [
      t('table.date'), t('table.vendor'), t('table.product'),
      t('table.lotId'), t('table.wafers'), t('table.avgYield'), t('table.status'),
    ]
    const rows = items.map((r) => `
      <tr>
        <td>${r.date}</td><td>${r.vendor}</td><td>${r.product}</td>
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

      {/* Filter Row */}
      <div className="flex flex-wrap gap-4 items-end mt-7">
        <div className="w-[160px] flex flex-col gap-1.5">
          <label className="text-[11px] font-bold text-text-tertiary tracking-[1px] uppercase">{t('vendor')}</label>
          <select value={vendor} onChange={(e) => setVendor(e.target.value)} className="bg-bg-card border border-border-light px-3 py-2 text-sm text-text-primary w-full">
            <option value="">{t('allVendors')}</option>
            <option value="JJW">JJW</option>
            <option value="XRW">XRW</option>
            <option value="HJM">HJM</option>
          </select>
        </div>
        <div className="w-[160px] flex flex-col gap-1.5">
          <label className="text-[11px] font-bold text-text-tertiary tracking-[1px] uppercase">{t('product')}</label>
          <input type="text" value={product} onChange={(e) => setProduct(e.target.value)} placeholder={t('allProducts')} className="bg-bg-card border border-border-light px-3 py-2 text-sm text-text-primary w-full" />
        </div>
        <div className="w-[130px] flex flex-col gap-1.5">
          <label className="text-[11px] font-bold text-text-tertiary tracking-[1px] uppercase">{t('status')}</label>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="bg-bg-card border border-border-light px-3 py-2 text-sm text-text-primary w-full">
            <option value="">{t('allStatus')}</option>
            <option value="reviewed">{t('reviewed')}</option>
            <option value="pending">{t('pending')}</option>
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] font-bold text-text-tertiary tracking-[1px] uppercase">{t('fromDate')}</label>
          <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="bg-bg-card border border-border-light px-3 py-2 text-sm text-text-primary" />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] font-bold text-text-tertiary tracking-[1px] uppercase">{t('toDate')}</label>
          <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="bg-bg-card border border-border-light px-3 py-2 text-sm text-text-primary" />
        </div>
        <button onClick={handleSearch} className="bg-accent text-white px-4 py-2 text-sm font-semibold hover:opacity-90 transition-opacity flex items-center gap-2">
          <Search size={16} />
          {t('search')}
        </button>
      </div>

      {/* Yield Trend Chart */}
      <div className="bg-bg-card p-6 mt-5">
        <h3 className="font-heading font-bold mb-4">{t('trendTitle')}</h3>
        <YieldTrendChart items={allItems} />
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
                  <tr><td colSpan={7} className="py-8 text-center text-text-muted">{t('noRecords')}</td></tr>
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
