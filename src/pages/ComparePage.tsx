import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { Loader2, FileText, FileWarning } from 'lucide-react'
import PageHeader from '@/components/layout/PageHeader'
import { getHistory, type HistoryRow } from '@/services/history'
import LotSearchSelect from '@/components/ui/LotSearchSelect'
import SearchSelect from '@/components/ui/SearchSelect'
import { compareSpecs, type SpecCompareResponse } from '@/services/specs'
import { downloadCsv } from '@/utils/exportCsv'
import { printToPdf } from '@/utils/exportPdf'
import { useAuthStore } from '@/store/authStore'

export default function ComparePage() {
  const { t } = useTranslation('compare')
  const isAdmin = useAuthStore((s) => s.user?.role === 'admin')
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

  const handleExportCsv = () => {
    if (!result) return
    const headers = [
      t('table.parameter'), t('table.cpLower'), t('table.cpUpper'),
      t('table.ftLower'), t('table.ftUpper'), t('table.margin'), t('table.result'),
    ]
    const rows = result.rows.map((r) => [
      r.param, r.cpLower, r.cpUpper, r.ftLower, r.ftUpper, r.margin, r.result,
    ])
    downloadCsv(`compare_lot${selectedLotId}.csv`, [headers, ...rows])
  }

  const handleExportPdf = () => {
    if (!result) return
    const headers = [
      t('table.parameter'), t('table.cpLower'), t('table.cpUpper'),
      t('table.ftLower'), t('table.ftUpper'), t('table.margin'), t('table.result'),
    ]
    const rows = result.rows.map((r) => `
      <tr>
        <td>${r.param}</td><td>${r.cpLower ?? '—'}</td><td>${r.cpUpper ?? '—'}</td>
        <td>${r.ftLower ?? '—'}</td><td>${r.ftUpper ?? '—'}</td><td>${r.margin ?? '—'}</td>
        <td><span class="badge badge-${r.result === 'Match' ? 'pass' : r.result === 'Tighter' ? 'warn' : 'fail'}">${resultLabel(r.result)}</span></td>
      </tr>`).join('')
    const html = `<table>
      <thead><tr>${headers.map((h) => `<th>${h}</th>`).join('')}</tr></thead>
      <tbody>${rows}</tbody>
    </table>`
    printToPdf(`${t('title')} - Lot ${selectedLotId}`, html)
  }

  const resultLabel = (key: string) => {
    if (key === 'Match') return t('match')
    if (key === 'Tighter') return t('tighter')
    return t('outOfRange')
  }

  return (
    <div className="p-12">
      <PageHeader
        title={t('title')}
        actions={
          <div className="flex gap-2">
            <button
              onClick={handleExportCsv}
              disabled={!result}
              className="bg-bg-card border border-border-light px-4 py-2 text-sm text-text-secondary font-semibold hover:bg-border-light transition-colors disabled:opacity-40"
            >
              {t('exportComparison')}
            </button>
            <button
              onClick={handleExportPdf}
              disabled={!result}
              className="flex items-center gap-1.5 bg-bg-card border border-border-light px-4 py-2 text-sm text-text-secondary font-semibold hover:bg-border-light transition-colors disabled:opacity-40"
            >
              <FileText size={14} />
              {t('exportPdf')}
            </button>
          </div>
        }
      />

      {/* Selector Row */}
      <div className="flex gap-4 items-end mt-7">
        <div className="flex-1 flex flex-col gap-1.5">
          <label className="text-[11px] font-bold text-text-tertiary tracking-[1px] uppercase">
            {t('lot')}
          </label>
          {loading ? (
            <div className="h-[38px] flex items-center">
              <Loader2 size={16} className="animate-spin text-accent" />
            </div>
          ) : (
            <LotSearchSelect
              lots={lots}
              selectedLotId={selectedLotId}
              placeholder={t('selectLot')}
              onSelect={(lot) => setSelectedLotId(lot.id)}
              showSite={isAdmin}
              className="w-full"
            />
          )}
        </div>
        <div className="w-[200px] flex flex-col gap-1.5">
          <label className="text-[11px] font-bold text-text-tertiary tracking-[1px] uppercase">
            {t('reviewRule')}
          </label>
          <SearchSelect
            items={[t('ruleStandard'), t('ruleStrict')]}
            value={rule === 'standard' ? t('ruleStandard') : t('ruleStrict')}
            onChange={(label) => setRule(label === t('ruleStandard') ? 'standard' : 'strict')}
          />
        </div>
        <button
          onClick={handleCompare}
          disabled={comparing || selectedLotId === null}
          className="bg-accent text-white px-5 py-2 text-sm font-semibold hover:opacity-90 disabled:opacity-50"
        >
          {comparing ? t('comparing') : t('compare')}
        </button>
      </div>

      {/* Results */}
      {comparing ? (
        <div className="flex justify-center py-16">
          <Loader2 size={32} className="animate-spin text-accent" />
        </div>
      ) : result && result.rows.length === 0 ? (
        <div className="mt-5 bg-bg-card p-8 flex flex-col items-center gap-3 text-center">
          <FileWarning size={36} className="text-text-muted" />
          <h3 className="font-heading text-[15px] font-bold text-text-primary">{t('noSpecsTitle')}</h3>
          <p className="text-[13px] text-text-secondary max-w-md">{t('noSpecsHint')}</p>
          <Link
            to="/settings/specs"
            className="mt-2 bg-accent text-white px-5 py-2 text-sm font-semibold hover:opacity-90"
          >
            {t('configureSpecsBtn')}
          </Link>
        </div>
      ) : result ? (
        <div className="bg-bg-card p-6 mt-5">
          <div className="flex items-center justify-between">
            <h3 className="font-heading font-bold">
              {t('results')}
            </h3>
            <div className="flex items-center gap-2">
              <span className="bg-badge-pass text-success text-[12px] font-semibold px-2.5 py-1">
                {result.matchCount} {t('match')}
              </span>
              <span className="bg-badge-warn text-warning text-[12px] font-semibold px-2.5 py-1">
                {result.tighterCount} {t('tighter')}
              </span>
              <span className="bg-badge-fail text-error text-[12px] font-semibold px-2.5 py-1">
                {result.outOfRangeCount} {t('outOfRange')}
              </span>
            </div>
          </div>

          <table className="w-full mt-4">
            <thead>
              <tr className="border-b border-border-light">
                <th className="text-left text-[11px] font-bold text-text-tertiary tracking-[1px] uppercase py-2.5 pr-4">
                  {t('table.parameter')}
                </th>
                <th className="text-left text-[11px] font-bold text-text-tertiary tracking-[1px] uppercase py-2.5 pr-4">
                  {t('table.cpLower')}
                </th>
                <th className="text-left text-[11px] font-bold text-text-tertiary tracking-[1px] uppercase py-2.5 pr-4">
                  {t('table.cpUpper')}
                </th>
                <th className="text-left text-[11px] font-bold text-text-tertiary tracking-[1px] uppercase py-2.5 pr-4">
                  {t('table.ftLower')}
                </th>
                <th className="text-left text-[11px] font-bold text-text-tertiary tracking-[1px] uppercase py-2.5 pr-4">
                  {t('table.ftUpper')}
                </th>
                <th className="text-left text-[11px] font-bold text-text-tertiary tracking-[1px] uppercase py-2.5 pr-4">
                  {t('table.margin')}
                </th>
                <th className="text-left text-[11px] font-bold text-text-tertiary tracking-[1px] uppercase py-2.5">
                  {t('table.result')}
                </th>
              </tr>
            </thead>
            <tbody>
              {result.rows.map((row, i) => {
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
                        {resultLabel(row.result)}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="mt-10 text-center text-text-muted">
          {t('emptyHint')}
        </div>
      )}
    </div>
  )
}
