import { useState, useEffect, useCallback, Fragment } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useLocation } from 'react-router-dom'
import { ChevronRight, Loader2, FileText, AlertTriangle } from 'lucide-react'
import PageHeader from '@/components/layout/PageHeader'
import { getLotResults, getReviewMatrix, executeReview, type LotReviewSummary, type ReviewMatrix } from '@/services/review'
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

// Matrix cell styling: a cell WITH data is bold + colored so it stands out; an
// N/A cell (no rule for that Q level) is dimmed so it clearly recedes.
function matrixCellClass(value: number | null): string {
  if (value === null) return 'text-text-muted opacity-40'
  return `font-semibold ${yieldColor(value)}`
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
  // Held separately from `lots` so the not-reviewed banner survives even after a
  // server-side search replaces the list with a subset that excludes it.
  const [selectedLot, setSelectedLot] = useState<HistoryRow | null>(null)
  const [summary, setSummary] = useState<LotReviewSummary | null>(null)
  // Per-electrical-item yield matrix (每片 × 每參數 × Q1/Q2/Q3) — the 徐州 layout.
  const [matrix, setMatrix] = useState<ReviewMatrix | null>(null)
  const [loading, setLoading] = useState(true)
  const [reviewing, setReviewing] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const restoredLotId: number | undefined = location.state?.lotId
    getHistory({ pageSize: 50 })
      .then(res => {
        setLots(res.items)
        const restored = restoredLotId ? res.items.find(l => l.id === restoredLotId) : undefined
        if (restored) {
          setSelectedLot(restored)
          loadResults(restored.id)
        } else {
          setLoading(false)
        }
      })
      .catch(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Server-side lot search: fetch from the API as the user types so the picker
  // reaches every lot, not just the initial page. Debounced inside the select.
  const handleLotSearch = useCallback((query: string) => {
    getHistory({ search: query, pageSize: 50 })
      .then(res => setLots(res.items))
      .catch(() => { /* keep the current list on a failed search */ })
  }, [])

  // Review is run manually via the "執行審核" button — selecting a lot only
  // loads whatever results already exist. Un-reviewed lots show N/A yields and
  // a banner prompting the user to run the review.
  const loadResults = async (lotDbId: number) => {
    setSelectedLotId(lotDbId)
    setError('')
    setLoading(true)
    try {
      const data = await getLotResults(lotDbId)
      setSummary(data)
      const m = await getReviewMatrix(lotDbId).catch(() => null)
      setMatrix(m)
    } catch {
      setSummary(null)
      setMatrix(null)
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
      setLots(prev => prev.map(l => l.id === selectedLotId ? { ...l, reviewed: true } : l))
      setSelectedLot(prev => prev && prev.id === selectedLotId ? { ...prev, reviewed: true } : prev)
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
  const notReviewed = selectedLot?.reviewed === false
  const hasMatrix = !!(matrix && matrix.params.length > 0)

  // Export the per-electrical-item matrix (每片 × 每參數 × Q1/Q2/Q3) — the data
  // that lets a supplier see exactly which item drifted.
  const handleExportCsv = () => {
    if (!matrix) return
    const headers = [t('table.waferId'), t('table.bin1Yield')]
    matrix.params.forEach((p) => headers.push(`${p} Q1`, `${p} Q2`, `${p} Q3`))
    const rows = matrix.wafers.map((w) => {
      const row: (string | number)[] = [w.waferId, `${w.bin1Yield.toFixed(2)}%`]
      w.cells.forEach((c) => row.push(formatYield(c.q1), formatYield(c.q2), formatYield(c.q3)))
      return row
    })
    downloadCsv(`review_${summary?.lotId ?? 'lot'}.csv`, [headers, ...rows])
  }

  const handleExportPdf = () => {
    if (!matrix) return
    const topHeader = matrix.params
      .map((p) => `<th colspan="3">${p}</th>`)
      .join('')
    const subHeader = matrix.params.map(() => `<th>Q1</th><th>Q2</th><th>Q3</th>`).join('')
    const body = matrix.wafers.map((w) => {
      const cells = w.cells
        .map((c) => `<td>${formatYield(c.q1)}</td><td>${formatYield(c.q2)}</td><td>${formatYield(c.q3)}</td>`)
        .join('')
      return `<tr><td>${w.waferId}</td><td>${w.bin1Yield.toFixed(2)}%</td>${cells}</tr>`
    }).join('')
    const html = `<table>
      <thead>
        <tr><th rowspan="2">${t('table.waferId')}</th><th rowspan="2">${t('table.bin1Yield')}</th>${topHeader}</tr>
        <tr>${subHeader}</tr>
      </thead>
      <tbody>${body}</tbody>
    </table>`
    printToPdf(`${t('title')} - ${summary?.lotId ?? ''}`, html)
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
              disabled={!hasMatrix}
              className="border border-border-light bg-bg-card px-5 py-2.5 font-heading text-[11px] font-bold uppercase tracking-[1px] text-text-secondary hover:bg-bg-page disabled:opacity-40"
            >
              {t('exportCsv')}
            </button>
            <button
              type="button"
              onClick={handleExportPdf}
              disabled={!hasMatrix}
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
        selectedLot={selectedLot}
        placeholder={t('selectLot')}
        onSelect={(lot) => { setSelectedLot(lot); loadResults(lot.id) }}
        onSearch={handleLotSearch}
        notReviewedLabel={t('notReviewedBadge')}
        className="mt-7 w-[440px]"
      />

      {/* Not-reviewed warning — explains why Q yields are N/A */}
      {notReviewed && (
        <div className="mt-4 flex items-start gap-2.5 border border-warning/40 bg-badge-warn px-4 py-3 text-[13px] text-warning">
          <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" />
          <span>{t('notReviewedHint')}</span>
        </div>
      )}

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

          {/* Overview Table — per-wafer BIN1 + status only. Per-item Q yields
              live in the matrix below (no misleading combined yield here). */}
          <div className="mt-5 bg-bg-card p-6">
            <h3 className="mb-4 font-heading font-bold">{t('table.title')}</h3>
            <table className="w-full">
              <thead>
                <tr>
                  <th className="pb-3 text-left text-[11px] font-bold uppercase tracking-[0.5px] text-text-tertiary">{t('table.waferId')}</th>
                  <th className="pb-3 text-left text-[11px] font-bold uppercase tracking-[0.5px] text-text-tertiary">{t('table.dieCount')}</th>
                  <th className="pb-3 text-left text-[11px] font-bold uppercase tracking-[0.5px] text-text-tertiary">{t('table.bin1Yield')}</th>
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
                    <td className="py-2.5"><StatusBadge status={wafer.status as WaferStatus} /></td>
                    <td className="py-2.5 text-text-muted"><ChevronRight size={16} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Per-Electrical-Item Yield Matrix — one row per wafer, Q1/Q2/Q3 per
              parameter. Mirrors the original CP-review spreadsheet: a drifting
              item shows in its own cell instead of collapsing to a combined %. */}
          {hasMatrix && (
            <div className="mt-5 bg-bg-card p-6">
              <h3 className="mb-1 font-heading font-bold">{t('matrix.title')}</h3>
              <p className="mb-4 text-[12px] text-text-muted">{t('matrix.hint')}</p>
              <div className="overflow-x-auto">
                <table className="border-collapse text-[12px]">
                  <thead>
                    <tr>
                      <th rowSpan={2} className="sticky left-0 z-10 bg-bg-card border-b border-border-light px-3 py-2 text-left font-bold text-text-tertiary">{t('table.waferId')}</th>
                      <th rowSpan={2} className="border-b border-border-light px-3 py-2 text-right font-bold text-text-tertiary whitespace-nowrap">{t('table.bin1Yield')}</th>
                      {matrix!.params.map((p) => (
                        <th key={p} colSpan={3} className="border-b border-l border-border-light px-3 py-1.5 text-center font-bold text-text-secondary whitespace-nowrap">{p}</th>
                      ))}
                    </tr>
                    <tr>
                      {matrix!.params.map((p) => (
                        <Fragment key={p}>
                          <th className="border-b border-l border-border-light px-2 py-1 text-right font-medium text-text-muted">Q1</th>
                          <th className="border-b border-border-light px-2 py-1 text-right font-medium text-text-muted">Q2</th>
                          <th className="border-b border-border-light px-2 py-1 text-right font-medium text-text-muted">Q3</th>
                        </Fragment>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {matrix!.wafers.map((w) => (
                      <tr key={w.waferId} className="border-t border-border-light hover:bg-bg-page">
                        <td className="sticky left-0 z-10 bg-bg-card px-3 py-1.5 font-semibold text-text-primary">{w.waferId}</td>
                        <td className={`px-3 py-1.5 text-right font-semibold ${yieldColor(w.bin1Yield)}`}>{w.bin1Yield.toFixed(2)}%</td>
                        {w.cells.map((c, i) => (
                          <Fragment key={matrix!.params[i]}>
                            <td className={`border-l border-border-light px-2 py-1.5 text-right ${matrixCellClass(c.q1)}`}>{formatYield(c.q1)}</td>
                            <td className={`px-2 py-1.5 text-right ${matrixCellClass(c.q2)}`}>{formatYield(c.q2)}</td>
                            <td className={`px-2 py-1.5 text-right ${matrixCellClass(c.q3)}`}>{formatYield(c.q3)}</td>
                          </Fragment>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="mt-10 text-center text-text-muted">
          {t('selectLotPrompt')}
        </div>
      )}
    </div>
  )
}
