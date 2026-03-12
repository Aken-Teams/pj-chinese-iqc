import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import PageHeader from '@/components/layout/PageHeader'

type WaferStatus = 'PASS' | 'WARN' | 'FAIL'

interface WaferRow {
  waferId: string
  dieCount: number
  bin1Yield: number
  q1Yield: number
  q2Yield: number
  q3Yield: number
  status: WaferStatus
}

const mockWafers: WaferRow[] = [
  { waferId: 'W01', dieCount: 204, bin1Yield: 99.51, q1Yield: 99.12, q2Yield: 98.95, q3Yield: 98.80, status: 'PASS' },
  { waferId: 'W02', dieCount: 208, bin1Yield: 99.04, q1Yield: 98.90, q2Yield: 98.75, q3Yield: 98.60, status: 'PASS' },
  { waferId: 'W03', dieCount: 206, bin1Yield: 97.57, q1Yield: 97.20, q2Yield: 96.90, q3Yield: 96.50, status: 'WARN' },
  { waferId: 'W04', dieCount: 210, bin1Yield: 99.52, q1Yield: 99.30, q2Yield: 99.15, q3Yield: 99.00, status: 'PASS' },
  { waferId: 'W05', dieCount: 204, bin1Yield: 99.02, q1Yield: 98.85, q2Yield: 98.70, q3Yield: 98.55, status: 'PASS' },
]

function yieldColor(value: number): string {
  if (value >= 99) return 'text-success'
  if (value >= 97) return 'text-warning'
  return 'text-error'
}

function StatusBadge({ status }: { status: WaferStatus }) {
  const styles: Record<WaferStatus, string> = {
    PASS: 'bg-badge-pass text-success',
    WARN: 'bg-badge-warn text-warning',
    FAIL: 'bg-badge-fail text-error',
  }
  return (
    <span className={`inline-block px-2.5 py-0.5 text-[11px] font-bold ${styles[status]}`}>
      {status}
    </span>
  )
}

export default function ReviewPage() {
  const { t } = useTranslation('review')
  const navigate = useNavigate()

  const handleRowClick = (waferId: string) => {
    navigate(`/review/PD03414/wafer/${waferId}`)
  }

  return (
    <div className="p-12">
      <PageHeader
        title={t('title')}
        actions={
          <>
            <button
              type="button"
              className="border border-border-light bg-bg-card px-5 py-2.5 font-heading text-[11px] font-bold uppercase tracking-[1px] text-text-secondary hover:bg-bg-page"
            >
              {t('exportCsv')}
            </button>
            <button
              type="button"
              className="bg-accent px-5 py-2.5 font-heading text-[11px] font-bold uppercase tracking-[1px] text-white hover:bg-accent/90"
            >
              {t('runReview')}
            </button>
          </>
        }
      />

      {/* Lot Selection Bar */}
      <div className="mt-7 flex gap-4">
        <select
          defaultValue="JJW"
          className="w-[180px] border border-border-light bg-white px-3 py-2 text-[13px] text-text-primary"
        >
          <option value="JJW">JJW</option>
          <option value="XRW">XRW</option>
          <option value="HJM">HJM</option>
        </select>
        <select
          defaultValue="PD03414"
          className="w-[200px] border border-border-light bg-white px-3 py-2 text-[13px] text-text-primary"
        >
          <option value="PD03414">PD03414</option>
          <option value="PD03415">PD03415</option>
          <option value="PD03416">PD03416</option>
        </select>
        <select
          defaultValue="JI30050A"
          className="w-[160px] border border-border-light bg-white px-3 py-2 text-[13px] text-text-primary"
        >
          <option value="JI30050A">JI30050A</option>
          <option value="JI30050B">JI30050B</option>
        </select>
      </div>

      {/* Summary Cards */}
      <div className="mt-5 flex gap-4">
        {/* Avg Bin1 Yield */}
        <div className="flex-1 bg-bg-card p-4">
          <span className="text-[11px] font-bold uppercase tracking-[0.5px] text-text-tertiary">
            {t('summary.avgYield')}
          </span>
          <div className="mt-1 font-heading text-2xl font-bold text-text-primary">99.18%</div>
          <span className="text-[12px] font-semibold text-success">
            {t('summary.wafersPassed', { count: 25 })}
          </span>
        </div>

        {/* Wafer Count */}
        <div className="flex-1 bg-bg-card p-4">
          <span className="text-[11px] font-bold uppercase tracking-[0.5px] text-text-tertiary">
            {t('summary.waferCount')}
          </span>
          <div className="mt-1 font-heading text-2xl font-bold text-text-primary">25</div>
          <span className="text-[12px] text-text-secondary">
            {t('summary.totalDies', { total: '5,108' })}
          </span>
        </div>

        {/* Q1 Compliance */}
        <div className="flex-1 bg-bg-card p-4">
          <span className="text-[11px] font-bold uppercase tracking-[0.5px] text-text-tertiary">
            {t('summary.q1')}
          </span>
          <div className="mt-1 font-heading text-2xl font-bold text-success">PASS</div>
          <span className="mt-1 inline-block bg-badge-pass px-2 py-0.5 text-[11px] font-bold text-success">
            PASS
          </span>
        </div>

        {/* Q2 Compliance */}
        <div className="flex-1 bg-bg-card p-4">
          <span className="text-[11px] font-bold uppercase tracking-[0.5px] text-text-tertiary">
            {t('summary.q2')}
          </span>
          <div className="mt-1 font-heading text-2xl font-bold text-success">PASS</div>
          <span className="mt-1 inline-block bg-badge-pass px-2 py-0.5 text-[11px] font-bold text-success">
            PASS
          </span>
        </div>
      </div>

      {/* Review Table */}
      <div className="mt-5 bg-bg-card p-6">
        <h3 className="mb-4 font-heading font-bold">{t('table.title')}</h3>
        <table className="w-full">
          <thead>
            <tr>
              <th className="pb-3 text-left text-[11px] font-bold uppercase tracking-[0.5px] text-text-tertiary">
                {t('table.waferId')}
              </th>
              <th className="pb-3 text-left text-[11px] font-bold uppercase tracking-[0.5px] text-text-tertiary">
                {t('table.dieCount')}
              </th>
              <th className="pb-3 text-left text-[11px] font-bold uppercase tracking-[0.5px] text-text-tertiary">
                {t('table.bin1Yield')}
              </th>
              <th className="pb-3 text-left text-[11px] font-bold uppercase tracking-[0.5px] text-text-tertiary">
                {t('table.q1Yield')}
              </th>
              <th className="pb-3 text-left text-[11px] font-bold uppercase tracking-[0.5px] text-text-tertiary">
                {t('table.q2Yield')}
              </th>
              <th className="pb-3 text-left text-[11px] font-bold uppercase tracking-[0.5px] text-text-tertiary">
                {t('table.q3Yield')}
              </th>
              <th className="pb-3 text-left text-[11px] font-bold uppercase tracking-[0.5px] text-text-tertiary">
                {t('table.status')}
              </th>
              <th className="pb-3 w-8"></th>
            </tr>
          </thead>
          <tbody>
            {mockWafers.map((wafer) => (
              <tr
                key={wafer.waferId}
                onClick={() => handleRowClick(wafer.waferId)}
                className="cursor-pointer border-t border-border-light hover:bg-bg-page"
              >
                <td className="py-2.5 text-[13px] font-semibold text-text-primary">
                  {wafer.waferId}
                </td>
                <td className="py-2.5 text-[13px] text-text-primary">
                  {wafer.dieCount}
                </td>
                <td className={`py-2.5 text-[13px] font-semibold ${yieldColor(wafer.bin1Yield)}`}>
                  {wafer.bin1Yield.toFixed(2)}%
                </td>
                <td className={`py-2.5 text-[13px] font-semibold ${yieldColor(wafer.q1Yield)}`}>
                  {wafer.q1Yield.toFixed(2)}%
                </td>
                <td className={`py-2.5 text-[13px] font-semibold ${yieldColor(wafer.q2Yield)}`}>
                  {wafer.q2Yield.toFixed(2)}%
                </td>
                <td className={`py-2.5 text-[13px] font-semibold ${yieldColor(wafer.q3Yield)}`}>
                  {wafer.q3Yield.toFixed(2)}%
                </td>
                <td className="py-2.5">
                  <StatusBadge status={wafer.status} />
                </td>
                <td className="py-2.5 text-text-muted">
                  <ChevronRight size={16} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
