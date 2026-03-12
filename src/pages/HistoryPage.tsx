import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import PageHeader from '@/components/layout/PageHeader'
import { Download, Search, Loader2 } from 'lucide-react'
import { getHistory, type HistoryRow, type HistoryResponse } from '@/services/history'

export default function HistoryPage() {
  const { t } = useTranslation('history')
  const [data, setData] = useState<HistoryResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [vendor, setVendor] = useState('')
  const [product, setProduct] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)

  const loadData = async () => {
    setLoading(true)
    try {
      const res = await getHistory({ vendor, product, status, page, pageSize: 10 })
      setData(res)
    } catch {
      setData(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadData() }, [page])

  const handleSearch = () => {
    setPage(1)
    loadData()
  }

  const items = data?.items || []

  return (
    <div className="p-12">
      <PageHeader
        title={t('title')}
        actions={
          <button className="bg-bg-card border border-border-light px-4 py-2 text-sm text-text-secondary font-semibold hover:bg-border-light transition-colors flex items-center gap-2">
            <Download size={16} />
            {t('exportCsv', { defaultValue: 'Export CSV' })}
          </button>
        }
      />

      {/* Filter Row */}
      <div className="flex gap-4 items-end mt-7">
        <div className="w-[180px] flex flex-col gap-1.5">
          <label className="text-[11px] font-bold text-text-tertiary tracking-[1px] uppercase">
            {t('vendor', { defaultValue: 'Vendor' })}
          </label>
          <select
            value={vendor}
            onChange={(e) => setVendor(e.target.value)}
            className="bg-bg-card border border-border-light px-3 py-2 text-sm text-text-primary w-full"
          >
            <option value="">All Vendors</option>
            <option value="JJW">JJW</option>
            <option value="XRW">XRW</option>
            <option value="HJM">HJM</option>
          </select>
        </div>
        <div className="w-[180px] flex flex-col gap-1.5">
          <label className="text-[11px] font-bold text-text-tertiary tracking-[1px] uppercase">
            {t('product', { defaultValue: 'Product' })}
          </label>
          <input
            type="text"
            value={product}
            onChange={(e) => setProduct(e.target.value)}
            placeholder="All Products"
            className="bg-bg-card border border-border-light px-3 py-2 text-sm text-text-primary w-full"
          />
        </div>
        <div className="w-[140px] flex flex-col gap-1.5">
          <label className="text-[11px] font-bold text-text-tertiary tracking-[1px] uppercase">
            {t('status', { defaultValue: 'Status' })}
          </label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="bg-bg-card border border-border-light px-3 py-2 text-sm text-text-primary w-full"
          >
            <option value="">All Status</option>
            <option value="reviewed">Reviewed</option>
            <option value="pending">Pending</option>
          </select>
        </div>
        <button
          onClick={handleSearch}
          className="bg-accent text-white px-4 py-2 text-sm font-semibold hover:opacity-90 transition-opacity flex items-center gap-2"
        >
          <Search size={16} />
          {t('search', { defaultValue: 'Search' })}
        </button>
      </div>

      {/* History Table */}
      <div className="bg-bg-card p-6 mt-5">
        <div className="flex items-center justify-between">
          <h3 className="font-heading font-bold">{t('reviewHistory', { defaultValue: 'Review History' })}</h3>
          <span className="text-text-muted text-[12px]">
            {data ? `Showing ${(data.page - 1) * data.pageSize + 1}-${Math.min(data.page * data.pageSize, data.total)} of ${data.total} records` : ''}
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
                  <th className="text-left text-[11px] font-bold text-text-tertiary tracking-[1px] uppercase py-2.5 pr-4">{t('date', { defaultValue: 'Date' })}</th>
                  <th className="text-left text-[11px] font-bold text-text-tertiary tracking-[1px] uppercase py-2.5 pr-4">{t('vendorCol', { defaultValue: 'Vendor' })}</th>
                  <th className="text-left text-[11px] font-bold text-text-tertiary tracking-[1px] uppercase py-2.5 pr-4">{t('productCol', { defaultValue: 'Product' })}</th>
                  <th className="text-left text-[11px] font-bold text-text-tertiary tracking-[1px] uppercase py-2.5 pr-4">{t('lotId', { defaultValue: 'Lot ID' })}</th>
                  <th className="text-left text-[11px] font-bold text-text-tertiary tracking-[1px] uppercase py-2.5 pr-4">{t('wafers', { defaultValue: 'Wafers' })}</th>
                  <th className="text-left text-[11px] font-bold text-text-tertiary tracking-[1px] uppercase py-2.5 pr-4">{t('avgYield', { defaultValue: 'Avg Yield' })}</th>
                  <th className="text-left text-[11px] font-bold text-text-tertiary tracking-[1px] uppercase py-2.5">{t('statusCol', { defaultValue: 'Status' })}</th>
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
                  <tr><td colSpan={7} className="py-8 text-center text-text-muted">No records found</td></tr>
                )}
              </tbody>
            </table>

            {/* Pagination */}
            {data && data.totalPages > 1 && (
              <div className="flex gap-1 justify-end mt-4">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="bg-bg-card border border-border-light px-3 py-1.5 text-[12px] text-text-secondary hover:bg-border-light disabled:opacity-30"
                >
                  {t('previous', { defaultValue: 'Previous' })}
                </button>
                {Array.from({ length: Math.min(data.totalPages, 5) }, (_, i) => i + 1).map(p => (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    className={`px-3 py-1.5 text-[12px] font-semibold ${
                      p === page ? 'bg-accent text-white' : 'bg-bg-card border border-border-light text-text-secondary hover:bg-border-light'
                    }`}
                  >
                    {p}
                  </button>
                ))}
                <button
                  onClick={() => setPage(p => Math.min(data.totalPages, p + 1))}
                  disabled={page >= data.totalPages}
                  className="bg-bg-card border border-border-light px-3 py-1.5 text-[12px] text-text-secondary hover:bg-border-light disabled:opacity-30"
                >
                  {t('next', { defaultValue: 'Next' })}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
