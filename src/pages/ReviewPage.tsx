import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { ChevronRight, Loader2 } from 'lucide-react'
import PageHeader from '@/components/layout/PageHeader'
import { getLotResults, executeReview, type LotReviewSummary } from '@/services/review'
import { getHistory, type HistoryRow } from '@/services/history'

type WaferStatus = 'PASS' | 'WARN' | 'FAIL'

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
  const [lots, setLots] = useState<HistoryRow[]>([])
  const [selectedLotId, setSelectedLotId] = useState<number | null>(null)
  const [summary, setSummary] = useState<LotReviewSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [reviewing, setReviewing] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    getHistory({ pageSize: 50 })
      .then(res => {
        setLots(res.items)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const loadResults = async (lotDbId: number) => {
    setLoading(true)
    try {
      const data = await getLotResults(lotDbId)
      setSummary(data)
      setSelectedLotId(lotDbId)
    } catch {
      setSummary(null)
    } finally {
      setLoading(false)
    }
  }

  const handleRunReview = async () => {
    if (selectedLotId === null) return
    setReviewing(true)
    setError('')
    try {
      await executeReview(selectedLotId)
      await loadResults(selectedLotId)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Review failed')
    } finally {
      setReviewing(false)
    }
  }

  const handleRowClick = (waferId: string) => {
    if (selectedLotId !== null) {
      navigate(`/review/${selectedLotId}/wafer/${waferId}`)
    }
  }

  const wafers = summary?.wafers || []

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
              onClick={handleRunReview}
              disabled={reviewing || selectedLotId === null}
              className="bg-accent px-5 py-2.5 font-heading text-[11px] font-bold uppercase tracking-[1px] text-white hover:bg-accent/90 disabled:opacity-50"
            >
              {reviewing ? 'Running...' : t('runReview')}
            </button>
          </>
        }
      />

      {error && (
        <div className="mt-4 bg-badge-fail text-error text-sm px-4 py-2.5 font-medium">{error}</div>
      )}

      {/* Lot Selection */}
      <div className="mt-7 flex gap-4">
        <select
          value={selectedLotId ?? ''}
          onChange={(e) => {
            const id = Number(e.target.value)
            if (id) loadResults(id)
          }}
          className="w-[400px] border border-border-light bg-white px-3 py-2 text-[13px] text-text-primary"
        >
          <option value="">-- Select a lot --</option>
          {lots.map((lot) => (
            <option key={lot.id} value={lot.id}>
              {lot.vendor} / {lot.product} / {lot.lotId} ({lot.status})
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="mt-10 flex justify-center">
          <Loader2 size={32} className="animate-spin text-accent" />
        </div>
      ) : summary ? (
        <>
          {/* Summary Cards */}
          <div className="mt-5 flex gap-4">
            <div className="flex-1 bg-bg-card p-4">
              <span className="text-[11px] font-bold uppercase tracking-[0.5px] text-text-tertiary">{t('summary.avgYield')}</span>
              <div className="mt-1 font-heading text-2xl font-bold text-text-primary">{summary.avgYield.toFixed(2)}%</div>
              <span className="text-[12px] font-semibold text-success">{t('summary.wafersPassed', { count: summary.waferCount })}</span>
            </div>
            <div className="flex-1 bg-bg-card p-4">
              <span className="text-[11px] font-bold uppercase tracking-[0.5px] text-text-tertiary">{t('summary.waferCount')}</span>
              <div className="mt-1 font-heading text-2xl font-bold text-text-primary">{summary.waferCount}</div>
              <span className="text-[12px] text-text-secondary">{t('summary.totalDies', { total: summary.totalDies.toLocaleString() })}</span>
            </div>
            <div className="flex-1 bg-bg-card p-4">
              <span className="text-[11px] font-bold uppercase tracking-[0.5px] text-text-tertiary">{t('summary.q1')}</span>
              <div className={`mt-1 font-heading text-2xl font-bold ${summary.q1Compliance === 'PASS' ? 'text-success' : 'text-error'}`}>{summary.q1Compliance}</div>
              <StatusBadge status={summary.q1Compliance as WaferStatus} />
            </div>
            <div className="flex-1 bg-bg-card p-4">
              <span className="text-[11px] font-bold uppercase tracking-[0.5px] text-text-tertiary">{t('summary.q2')}</span>
              <div className={`mt-1 font-heading text-2xl font-bold ${summary.q2Compliance === 'PASS' ? 'text-success' : 'text-error'}`}>{summary.q2Compliance}</div>
              <StatusBadge status={summary.q2Compliance as WaferStatus} />
            </div>
          </div>

          {/* Review Table */}
          <div className="mt-5 bg-bg-card p-6">
            <h3 className="mb-4 font-heading font-bold">{t('table.title')}</h3>
            <table className="w-full">
              <thead>
                <tr>
                  <th className="pb-3 text-left text-[11px] font-bold uppercase tracking-[0.5px] text-text-tertiary">{t('table.waferId')}</th>
                  <th className="pb-3 text-left text-[11px] font-bold uppercase tracking-[0.5px] text-text-tertiary">{t('table.dieCount')}</th>
                  <th className="pb-3 text-left text-[11px] font-bold uppercase tracking-[0.5px] text-text-tertiary">{t('table.bin1Yield')}</th>
                  <th className="pb-3 text-left text-[11px] font-bold uppercase tracking-[0.5px] text-text-tertiary">{t('table.q1Yield')}</th>
                  <th className="pb-3 text-left text-[11px] font-bold uppercase tracking-[0.5px] text-text-tertiary">{t('table.q2Yield')}</th>
                  <th className="pb-3 text-left text-[11px] font-bold uppercase tracking-[0.5px] text-text-tertiary">{t('table.q3Yield')}</th>
                  <th className="pb-3 text-left text-[11px] font-bold uppercase tracking-[0.5px] text-text-tertiary">{t('table.status')}</th>
                  <th className="pb-3 w-8"></th>
                </tr>
              </thead>
              <tbody>
                {wafers.map((wafer) => (
                  <tr
                    key={wafer.waferId}
                    onClick={() => handleRowClick(wafer.waferId)}
                    className="cursor-pointer border-t border-border-light hover:bg-bg-page"
                  >
                    <td className="py-2.5 text-[13px] font-semibold text-text-primary">{wafer.waferId}</td>
                    <td className="py-2.5 text-[13px] text-text-primary">{wafer.dieCount}</td>
                    <td className={`py-2.5 text-[13px] font-semibold ${yieldColor(wafer.bin1Yield)}`}>{wafer.bin1Yield.toFixed(2)}%</td>
                    <td className={`py-2.5 text-[13px] font-semibold ${yieldColor(wafer.q1Yield)}`}>{wafer.q1Yield.toFixed(2)}%</td>
                    <td className={`py-2.5 text-[13px] font-semibold ${yieldColor(wafer.q2Yield)}`}>{wafer.q2Yield.toFixed(2)}%</td>
                    <td className={`py-2.5 text-[13px] font-semibold ${yieldColor(wafer.q3Yield)}`}>{wafer.q3Yield.toFixed(2)}%</td>
                    <td className="py-2.5"><StatusBadge status={wafer.status as WaferStatus} /></td>
                    <td className="py-2.5 text-text-muted"><ChevronRight size={16} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <div className="mt-10 text-center text-text-muted">
          Select a lot to view review results, or upload data first.
        </div>
      )}
    </div>
  )
}
