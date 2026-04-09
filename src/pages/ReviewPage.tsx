import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useLocation } from 'react-router-dom'
import { ChevronRight, Loader2, FileText } from 'lucide-react'
import PageHeader from '@/components/layout/PageHeader'
import { getLotResults, executeReview, type LotReviewSummary } from '@/services/review'
import { getHistory, type HistoryRow } from '@/services/history'
import { downloadCsv } from '@/utils/exportCsv'
import { printToPdf } from '@/utils/exportPdf'
import LotSearchSelect from '@/components/ui/LotSearchSelect'

type WaferStatus = 'PASS' | 'WARN' | 'FAIL'

function yieldColor(value: number | null): string {
  if (value === null) return 'text-text-muted'
  if (value >= 99) return 'text-success'
  if (value >= 97) return 'text-warning'
  return 'text-error'
}

function formatYield(value: number | null): string {
  return value === null ? 'N/A' : `${value.toFixed(2)}%`
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    PASS: 'bg-badge-pass text-success',
    WARN: 'bg-badge-warn text-warning',
    FAIL: 'bg-badge-fail text-error',
    'N/A': 'bg-bg-page text-text-muted',
  }
  return (
    <span className={`inline-block px-2.5 py-0.5 text-[11px] font-bold ${styles[status] || 'bg-bg-page text-text-muted'}`}>
      {status}
    </span>
  )
}


export default function ReviewPage() {
  const { t } = useTranslation('review')
  const navigate = useNavigate()
  const location = useLocation()
  const [lots, setLots] = useState<HistoryRow[]>([])
  const [selectedLotId, setSelectedLotId] = useState<number | null>(null)
  const [summary, setSummary] = useState<LotReviewSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [reviewing, setReviewing] = useState(false)
  const [error, setError] = useState('')
  // Tracks lots we've already auto-triggered so selecting the same lot a second
  // time doesn't re-run the review.
  const autoTriggeredRef = useRef<Set<number>>(new Set())

  useEffect(() => {
    const restoredLotId: number | undefined = location.state?.lotId
    getHistory({ pageSize: 50 })
      .then(res => {
        setLots(res.items)
        if (restoredLotId && res.items.find(l => l.id === restoredLotId)) {
          loadResults(restoredLotId, res.items)
        } else {
          setLoading(false)
        }
      })
      .catch(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadResults = async (lotDbId: number, lotsSource?: HistoryRow[]) => {
    setSelectedLotId(lotDbId)
    setError('')
    const source = lotsSource ?? lots
    const lotRow = source.find(l => l.id === lotDbId)

    // Auto-run review for lots that are still pending and haven't been
    // auto-triggered yet in this session.
    if (lotRow?.status === 'pending' && !autoTriggeredRef.current.has(lotDbId)) {
      autoTriggeredRef.current.add(lotDbId)
      setSummary(null)
      setReviewing(true)
      setLoading(true)
      try {
        await executeReview(lotDbId)
        setLots(prev => prev.map(l => l.id === lotDbId ? { ...l, status: 'reviewed' } : l))
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Auto review failed')
      } finally {
        setReviewing(false)
      }
    } else {
      setLoading(true)
    }

    try {
      const data = await getLotResults(lotDbId)
      setSummary(data)
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

  const handleExportCsv = () => {
    if (!summary) return
    const headers = [
      t('table.waferId'), t('table.dieCount'), t('table.bin1Yield'),
      t('table.q1Yield'), t('table.q2Yield'), t('table.q3Yield'), t('table.status'),
    ]
    const rows = summary.wafers.map((w) => [
      w.waferId, w.dieCount, `${w.bin1Yield.toFixed(2)}%`,
      formatYield(w.q1Yield), formatYield(w.q2Yield),
      formatYield(w.q3Yield), w.status,
    ])
    downloadCsv(`review_${summary.lotId}.csv`, [headers, ...rows])
  }

  const handleExportPdf = () => {
    if (!summary) return
    const headers = [
      t('table.waferId'), t('table.dieCount'), t('table.bin1Yield'),
      t('table.q1Yield'), t('table.q2Yield'), t('table.q3Yield'), t('table.status'),
    ]
    const rows = summary.wafers.map((w) => `
      <tr>
        <td>${w.waferId}</td><td>${w.dieCount}</td>
        <td>${w.bin1Yield.toFixed(2)}%</td><td>${formatYield(w.q1Yield)}</td>
        <td>${formatYield(w.q2Yield)}</td><td>${formatYield(w.q3Yield)}</td>
        <td><span class="badge badge-${w.status === 'PASS' ? 'pass' : w.status === 'WARN' ? 'warn' : 'fail'}">${w.status}</span></td>
      </tr>`).join('')
    const html = `<table>
      <thead><tr>${headers.map((h) => `<th>${h}</th>`).join('')}</tr></thead>
      <tbody>${rows}</tbody>
    </table>`
    printToPdf(`${t('title')} - ${summary.lotId}`, html)
  }

  return (
    <div className="p-12">
      <PageHeader
        title={t('title')}
        actions={
          <>
            <button
              type="button"
              onClick={handleExportCsv}
              disabled={!summary}
              className="border border-border-light bg-bg-card px-5 py-2.5 font-heading text-[11px] font-bold uppercase tracking-[1px] text-text-secondary hover:bg-bg-page disabled:opacity-40"
            >
              {t('exportCsv')}
            </button>
            <button
              type="button"
              onClick={handleExportPdf}
              disabled={!summary}
              className="flex items-center gap-1.5 border border-border-light bg-bg-card px-5 py-2.5 font-heading text-[11px] font-bold uppercase tracking-[1px] text-text-secondary hover:bg-bg-page disabled:opacity-40"
            >
              <FileText size={14} />
              {t('exportPdf')}
            </button>
            <button
              type="button"
              onClick={handleRunReview}
              disabled={reviewing || selectedLotId === null}
              className="bg-accent px-5 py-2.5 font-heading text-[11px] font-bold uppercase tracking-[1px] text-white hover:bg-accent/90 disabled:opacity-50"
            >
              {reviewing ? t('running') : t('runReview')}
            </button>
          </>
        }
      />

      {error && (
        <div className="mt-4 bg-badge-fail text-error text-sm px-4 py-2.5 font-medium">{error}</div>
      )}

      {/* Lot Selection */}
      <LotSearchSelect
        lots={lots}
        selectedLotId={selectedLotId}
        placeholder={t('selectLot')}
        onSelect={(lot) => loadResults(lot.id)}
        className="mt-7 w-[440px]"
      />

      {loading ? (
        <div className="mt-10 flex flex-col items-center gap-3">
          <Loader2 size={32} className="animate-spin text-accent" />
          {reviewing && (
            <span className="text-[13px] text-text-secondary">{t('autoRunning')}</span>
          )}
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
              <StatusBadge status={summary.q1Compliance} />
            </div>
            <div className="flex-1 bg-bg-card p-4">
              <span className="text-[11px] font-bold uppercase tracking-[0.5px] text-text-tertiary">{t('summary.q2')}</span>
              <div className={`mt-1 font-heading text-2xl font-bold ${
                summary.q2Compliance === 'PASS' ? 'text-success' :
                summary.q2Compliance === 'N/A' ? 'text-text-muted' : 'text-error'
              }`}>{summary.q2Compliance}</div>
              <StatusBadge status={summary.q2Compliance} />
              {summary.q2Compliance === 'N/A' && (
                <div className="mt-2 text-[11px] text-text-muted leading-tight">
                  {t('q2NotConfigured')}
                </div>
              )}
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
                    <td className={`py-2.5 text-[13px] font-semibold ${yieldColor(wafer.q1Yield)}`}>{formatYield(wafer.q1Yield)}</td>
                    <td className={`py-2.5 text-[13px] font-semibold ${yieldColor(wafer.q2Yield)}`}>{formatYield(wafer.q2Yield)}</td>
                    <td className={`py-2.5 text-[13px] font-semibold ${yieldColor(wafer.q3Yield)}`}>{formatYield(wafer.q3Yield)}</td>
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
          {t('selectLotPrompt')}
        </div>
      )}
    </div>
  )
}
