import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2 } from 'lucide-react'
import PageHeader from '@/components/layout/PageHeader'
import { getHistory, type HistoryRow } from '@/services/history'
import { compareSpecs, type SpecCompareResponse } from '@/services/specs'

export default function ComparePage() {
  const { t } = useTranslation('compare')
  const [lots, setLots] = useState<HistoryRow[]>([])
  const [selectedLotId, setSelectedLotId] = useState<number | null>(null)
  const [rule, setRule] = useState('standard')
  const [result, setResult] = useState<SpecCompareResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [comparing, setComparing] = useState(false)

  useEffect(() => {
    getHistory({ pageSize: 50 })
      .then(res => {
        setLots(res.items)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const handleCompare = async () => {
    if (selectedLotId === null) return
    setComparing(true)
    try {
      const data = await compareSpecs(selectedLotId, rule)
      setResult(data)
    } catch {
      setResult(null)
    } finally {
      setComparing(false)
    }
  }

  return (
    <div className="p-12">
      <PageHeader
        title={t('title')}
        actions={
          <button className="bg-bg-card border border-border-light px-4 py-2 text-sm text-text-secondary font-semibold hover:bg-border-light transition-colors">
            {t('exportComparison', { defaultValue: 'Export Comparison' })}
          </button>
        }
      />

      {/* Selector Row */}
      <div className="flex gap-4 items-end mt-7">
        <div className="flex-1 flex flex-col gap-1.5">
          <label className="text-[11px] font-bold text-text-tertiary tracking-[1px] uppercase">
            {t('lot', { defaultValue: 'Lot' })}
          </label>
          {loading ? (
            <div className="h-[38px] flex items-center">
              <Loader2 size={16} className="animate-spin text-accent" />
            </div>
          ) : (
            <select
              value={selectedLotId ?? ''}
              onChange={(e) => setSelectedLotId(Number(e.target.value) || null)}
              className="bg-bg-card border border-border-light px-3 py-2 text-sm text-text-primary w-full"
            >
              <option value="">-- Select Lot --</option>
              {lots.map(lot => (
                <option key={lot.id} value={lot.id}>
                  {lot.vendor} / {lot.product} / {lot.lotId}
                </option>
              ))}
            </select>
          )}
        </div>
        <div className="w-[200px] flex flex-col gap-1.5">
          <label className="text-[11px] font-bold text-text-tertiary tracking-[1px] uppercase">
            {t('reviewRule', { defaultValue: 'Review Rule' })}
          </label>
          <select
            value={rule}
            onChange={(e) => setRule(e.target.value)}
            className="bg-bg-card border border-border-light px-3 py-2 text-sm text-text-primary w-full"
          >
            <option value="standard">Standard (&plusmn;10%)</option>
            <option value="strict">Strict (&plusmn;5%)</option>
          </select>
        </div>
        <button
          onClick={handleCompare}
          disabled={comparing || selectedLotId === null}
          className="bg-accent text-white px-5 py-2 text-sm font-semibold hover:opacity-90 disabled:opacity-50"
        >
          {comparing ? 'Comparing...' : t('compare', { defaultValue: 'Compare' })}
        </button>
      </div>

      {/* Results */}
      {comparing ? (
        <div className="flex justify-center py-16">
          <Loader2 size={32} className="animate-spin text-accent" />
        </div>
      ) : result ? (
        <div className="bg-bg-card p-6 mt-5">
          <div className="flex items-center justify-between">
            <h3 className="font-heading font-bold">
              {t('comparisonResults', { defaultValue: 'Comparison Results' })}
            </h3>
            <div className="flex items-center gap-2">
              <span className="bg-badge-pass text-success text-[12px] font-semibold px-2.5 py-1">
                {result.matchCount} Match
              </span>
              <span className="bg-badge-warn text-warning text-[12px] font-semibold px-2.5 py-1">
                {result.tighterCount} Tighter
              </span>
              <span className="bg-badge-fail text-error text-[12px] font-semibold px-2.5 py-1">
                {result.outOfRangeCount} Out of Range
              </span>
            </div>
          </div>

          <table className="w-full mt-4">
            <thead>
              <tr className="border-b border-border-light">
                <th className="text-left text-[11px] font-bold text-text-tertiary tracking-[1px] uppercase py-2.5 pr-4">
                  {t('parameter', { defaultValue: 'Parameter' })}
                </th>
                <th className="text-left text-[11px] font-bold text-text-tertiary tracking-[1px] uppercase py-2.5 pr-4">
                  {t('cpLower', { defaultValue: 'CP Lower' })}
                </th>
                <th className="text-left text-[11px] font-bold text-text-tertiary tracking-[1px] uppercase py-2.5 pr-4">
                  {t('cpUpper', { defaultValue: 'CP Upper' })}
                </th>
                <th className="text-left text-[11px] font-bold text-text-tertiary tracking-[1px] uppercase py-2.5 pr-4">
                  {t('ftLower', { defaultValue: 'FT Lower' })}
                </th>
                <th className="text-left text-[11px] font-bold text-text-tertiary tracking-[1px] uppercase py-2.5 pr-4">
                  {t('ftUpper', { defaultValue: 'FT Upper' })}
                </th>
                <th className="text-left text-[11px] font-bold text-text-tertiary tracking-[1px] uppercase py-2.5 pr-4">
                  {t('margin', { defaultValue: 'Margin' })}
                </th>
                <th className="text-left text-[11px] font-bold text-text-tertiary tracking-[1px] uppercase py-2.5">
                  {t('result', { defaultValue: 'Result' })}
                </th>
              </tr>
            </thead>
            <tbody>
              {result.rows.length > 0 ? result.rows.map((row, i) => {
                const isMatch = row.result === 'Match'
                const isTighter = row.result === 'Tighter'
                const isOutOfRange = row.result === 'Out of Range'

                const ftValueClass = isOutOfRange
                  ? 'text-error font-bold'
                  : isTighter
                    ? 'text-warning font-semibold'
                    : ''

                return (
                  <tr
                    key={row.param}
                    className={`${i > 0 ? 'border-t border-border-light' : ''}`}
                  >
                    <td className="py-3 pr-4 text-[13px] font-semibold text-text-primary">{row.param}</td>
                    <td className="py-3 pr-4 text-[13px] text-text-secondary">{row.cpLower}</td>
                    <td className="py-3 pr-4 text-[13px] text-text-secondary">{row.cpUpper}</td>
                    <td className={`py-3 pr-4 text-[13px] ${ftValueClass || 'text-text-secondary'}`}>{row.ftLower}</td>
                    <td className={`py-3 pr-4 text-[13px] ${ftValueClass || 'text-text-secondary'}`}>{row.ftUpper}</td>
                    <td className="py-3 pr-4 text-[13px] text-text-secondary">{row.margin}</td>
                    <td className="py-3">
                      <span
                        className={`text-[12px] font-semibold px-2.5 py-1 ${
                          isMatch
                            ? 'bg-badge-pass text-success'
                            : isTighter
                              ? 'bg-badge-warn text-warning'
                              : 'bg-badge-fail text-error'
                        }`}
                      >
                        {row.result}
                      </span>
                    </td>
                  </tr>
                )
              }) : (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-text-muted">
                    No packaging test specs found for this lot's product. Upload FT specs first.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="mt-10 text-center text-text-muted">
          Select a lot and click Compare to see CP vs FT spec comparison.
        </div>
      )}
    </div>
  )
}
