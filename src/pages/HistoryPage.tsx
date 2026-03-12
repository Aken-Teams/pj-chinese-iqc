import { useTranslation } from 'react-i18next'
import PageHeader from '@/components/layout/PageHeader'
import { Download, Search } from 'lucide-react'

const mockHistoryData = [
  { date: '2025-03-10', vendor: 'JJW', product: 'JI30050A', lotId: 'PD03414', wafers: 25, avgYield: '99.18%', status: 'PASS' as const },
  { date: '2025-03-09', vendor: 'XRW', product: '4746', lotId: 'AME216', wafers: 20, avgYield: '98.73%', status: 'PASS' as const },
  { date: '2025-03-08', vendor: 'JJW', product: 'JI30050A', lotId: 'PD03410', wafers: 25, avgYield: '97.45%', status: 'WARN' as const },
  { date: '2025-03-07', vendor: 'HJM', product: 'HJ2080', lotId: 'HJ00512', wafers: 18, avgYield: '95.20%', status: 'FAIL' as const },
  { date: '2025-03-06', vendor: 'XRW', product: '4746', lotId: 'AME215', wafers: 22, avgYield: '99.01%', status: 'PASS' as const },
]

export default function HistoryPage() {
  const { t } = useTranslation('history')

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
          <select className="bg-bg-card border border-border-light px-3 py-2 text-sm text-text-primary w-full">
            <option>All Vendors</option>
            <option>JJW</option>
            <option>XRW</option>
            <option>HJM</option>
          </select>
        </div>
        <div className="w-[180px] flex flex-col gap-1.5">
          <label className="text-[11px] font-bold text-text-tertiary tracking-[1px] uppercase">
            {t('product', { defaultValue: 'Product' })}
          </label>
          <select className="bg-bg-card border border-border-light px-3 py-2 text-sm text-text-primary w-full">
            <option>All Products</option>
            <option>JI30050A</option>
            <option>4746</option>
            <option>HJ2080</option>
          </select>
        </div>
        <div className="w-[200px] flex flex-col gap-1.5">
          <label className="text-[11px] font-bold text-text-tertiary tracking-[1px] uppercase">
            {t('dateRange', { defaultValue: 'Date Range' })}
          </label>
          <select className="bg-bg-card border border-border-light px-3 py-2 text-sm text-text-primary w-full">
            <option>Last 30 Days</option>
            <option>Last 7 Days</option>
            <option>Last 90 Days</option>
            <option>All Time</option>
          </select>
        </div>
        <div className="w-[140px] flex flex-col gap-1.5">
          <label className="text-[11px] font-bold text-text-tertiary tracking-[1px] uppercase">
            {t('status', { defaultValue: 'Status' })}
          </label>
          <select className="bg-bg-card border border-border-light px-3 py-2 text-sm text-text-primary w-full">
            <option>All Status</option>
            <option>PASS</option>
            <option>WARN</option>
            <option>FAIL</option>
          </select>
        </div>
        <button className="bg-accent text-white px-4 py-2 text-sm font-semibold hover:opacity-90 transition-opacity flex items-center gap-2">
          <Search size={16} />
          {t('search', { defaultValue: 'Search' })}
        </button>
      </div>

      {/* History Table */}
      <div className="bg-bg-card p-6 mt-5">
        {/* Title Row */}
        <div className="flex items-center justify-between">
          <h3 className="font-heading font-bold">
            {t('reviewHistory', { defaultValue: 'Review History' })}
          </h3>
          <span className="text-text-muted text-[12px]">
            Showing 1-10 of 156 records
          </span>
        </div>

        {/* Table */}
        <table className="w-full mt-4">
          <thead>
            <tr className="border-b border-border-light">
              <th className="text-left text-[11px] font-bold text-text-tertiary tracking-[1px] uppercase py-2.5 pr-4">
                {t('date', { defaultValue: 'Date' })}
              </th>
              <th className="text-left text-[11px] font-bold text-text-tertiary tracking-[1px] uppercase py-2.5 pr-4">
                {t('vendorCol', { defaultValue: 'Vendor' })}
              </th>
              <th className="text-left text-[11px] font-bold text-text-tertiary tracking-[1px] uppercase py-2.5 pr-4">
                {t('productCol', { defaultValue: 'Product' })}
              </th>
              <th className="text-left text-[11px] font-bold text-text-tertiary tracking-[1px] uppercase py-2.5 pr-4">
                {t('lotId', { defaultValue: 'Lot ID' })}
              </th>
              <th className="text-left text-[11px] font-bold text-text-tertiary tracking-[1px] uppercase py-2.5 pr-4">
                {t('wafers', { defaultValue: 'Wafers' })}
              </th>
              <th className="text-left text-[11px] font-bold text-text-tertiary tracking-[1px] uppercase py-2.5 pr-4">
                {t('avgYield', { defaultValue: 'Avg Yield' })}
              </th>
              <th className="text-left text-[11px] font-bold text-text-tertiary tracking-[1px] uppercase py-2.5">
                {t('statusCol', { defaultValue: 'Status' })}
              </th>
            </tr>
          </thead>
          <tbody>
            {mockHistoryData.map((row, i) => (
              <tr
                key={row.lotId}
                className={`${i > 0 ? 'border-t border-border-light' : ''}`}
              >
                <td className="py-3 pr-4 text-[13px] text-text-secondary">
                  {row.date}
                </td>
                <td className="py-3 pr-4 text-[13px] font-semibold text-text-primary">
                  {row.vendor}
                </td>
                <td className="py-3 pr-4 text-[13px] text-text-secondary">
                  {row.product}
                </td>
                <td className="py-3 pr-4 text-[13px] text-text-secondary font-mono">
                  {row.lotId}
                </td>
                <td className="py-3 pr-4 text-[13px] text-text-secondary">
                  {row.wafers}
                </td>
                <td className="py-3 pr-4 text-[13px] font-semibold text-text-primary">
                  {row.avgYield}
                </td>
                <td className="py-3">
                  <span
                    className={`text-[12px] font-semibold px-2.5 py-1 ${
                      row.status === 'PASS'
                        ? 'bg-badge-pass text-success'
                        : row.status === 'WARN'
                          ? 'bg-badge-warn text-warning'
                          : 'bg-badge-fail text-error'
                    }`}
                  >
                    {row.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Pagination */}
        <div className="flex gap-1 justify-end mt-4">
          <button className="bg-bg-card border border-border-light px-3 py-1.5 text-[12px] text-text-secondary hover:bg-border-light transition-colors">
            {t('previous', { defaultValue: 'Previous' })}
          </button>
          <button className="bg-accent text-white px-3 py-1.5 text-[12px] font-semibold">
            1
          </button>
          <button className="bg-bg-card border border-border-light px-3 py-1.5 text-[12px] text-text-secondary hover:bg-border-light transition-colors">
            2
          </button>
          <button className="bg-bg-card border border-border-light px-3 py-1.5 text-[12px] text-text-secondary hover:bg-border-light transition-colors">
            3
          </button>
          <button className="bg-bg-card border border-border-light px-3 py-1.5 text-[12px] text-text-secondary hover:bg-border-light transition-colors">
            {t('next', { defaultValue: 'Next' })}
          </button>
        </div>
      </div>
    </div>
  )
}
