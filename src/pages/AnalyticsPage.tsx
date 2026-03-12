import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2, Sparkles, TriangleAlert, CircleX } from 'lucide-react'
import PageHeader from '@/components/layout/PageHeader'
import { getHistory, type HistoryRow } from '@/services/history'
import {
  getParamNames,
  getSpc,
  getDistribution,
  getCorrelation,
  detectAnomalies,
  type SpcResponse,
  type DistributionResponse,
  type CorrelationResponse,
  type AnomalyItem,
} from '@/services/analytics'

function getCellColor(value: number, isDiagonal: boolean): string {
  if (isDiagonal) return 'bg-accent text-white'
  if (Math.abs(value) > 0.7) return 'bg-[#D4B8A8]'
  if (Math.abs(value) >= 0.3) return 'bg-[#E8DCD0]'
  return 'bg-bar-track'
}

export default function AnalyticsPage() {
  const { t, i18n } = useTranslation('analytics')
  const [lots, setLots] = useState<HistoryRow[]>([])
  const [selectedLotId, setSelectedLotId] = useState<number | null>(null)
  const [selectedProductId, setSelectedProductId] = useState<number | null>(null)
  const [params, setParams] = useState<string[]>([])
  const [selectedParam, setSelectedParam] = useState('')
  const [loading, setLoading] = useState(true)
  const [dataLoading, setDataLoading] = useState(false)
  const [anomalyLoading, setAnomalyLoading] = useState(false)

  const [spc, setSpc] = useState<SpcResponse | null>(null)
  const [dist, setDist] = useState<DistributionResponse | null>(null)
  const [corr, setCorr] = useState<CorrelationResponse | null>(null)
  const [anomalies, setAnomalies] = useState<AnomalyItem[]>([])

  useEffect(() => {
    getHistory({ pageSize: 50 })
      .then(res => {
        setLots(res.items)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const handleLotChange = async (lotId: number, productId: number) => {
    setSelectedLotId(lotId)
    setSelectedProductId(productId)
    setDataLoading(true)
    setAnomalies([])
    try {
      const paramNames = await getParamNames(lotId)
      setParams(paramNames)
      if (paramNames.length > 0) {
        setSelectedParam(paramNames[0])
        await loadParamData(lotId, productId, paramNames[0])
      }
      const corrData = await getCorrelation(productId).catch(() => ({ params: [], matrix: [] }))
      setCorr(corrData)
    } catch {
      // ignore
    } finally {
      setDataLoading(false)
    }

    // Detect anomalies via real AI (runs in background after main data loads)
    setAnomalyLoading(true)
    detectAnomalies(lotId, i18n.language)
      .then(setAnomalies)
      .catch(() => setAnomalies([]))
      .finally(() => setAnomalyLoading(false))
  }

  const loadParamData = async (lotId: number, productId: number, paramName: string) => {
    const [spcData, distData] = await Promise.all([
      getSpc(productId, paramName).catch(() => null),
      getDistribution(lotId, paramName).catch(() => null),
    ])
    setSpc(spcData)
    setDist(distData)
  }

  const handleParamChange = async (paramName: string) => {
    setSelectedParam(paramName)
    if (selectedLotId && selectedProductId) {
      setDataLoading(true)
      await loadParamData(selectedLotId, selectedProductId, paramName)
      setDataLoading(false)
    }
  }

  const spcPoints = spc?.dataPoints || []
  const chartHeight = 180

  return (
    <div className="p-9 pl-11 flex flex-col gap-6">
      <PageHeader
        title={t('title')}
        actions={
          <div className="flex items-center gap-3">
            <select
              value={selectedLotId ?? ''}
              onChange={(e) => {
                const lot = lots.find(l => l.id === Number(e.target.value))
                if (lot) handleLotChange(lot.id, lot.productId)
              }}
              className="bg-bg-card border border-border-light px-3 py-2 text-sm text-text-secondary"
            >
              <option value="">{t('selectLot')}</option>
              {lots.map((lot) => (
                <option key={lot.id} value={lot.id}>
                  {lot.vendor} / {lot.product} / {lot.lotId}
                </option>
              ))}
            </select>
            <select
              value={selectedParam}
              onChange={(e) => handleParamChange(e.target.value)}
              className="bg-bg-card border border-border-light px-3 py-2 text-sm text-text-secondary"
              disabled={params.length === 0}
            >
              {params.length === 0 && <option value="">{t('noParams')}</option>}
              {params.map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
        }
      />

      {loading || dataLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 size={32} className="animate-spin text-accent" />
        </div>
      ) : !selectedLotId ? (
        <div className="text-center text-text-muted py-16">
          {t('selectLotPrompt')}
        </div>
      ) : (
        <>
          {/* Row 1: SPC + Distribution */}
          <div className="flex gap-5">
            {/* SPC Control Chart */}
            <div className="flex-1 bg-bg-card p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-heading font-bold">{t('spcChartTitle', { param: selectedParam })}</h3>
                <div className="flex gap-4">
                  <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 bg-success" />
                    <span className="text-[11px] text-text-secondary">{t('spc.mean')}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 bg-[#E8A849]" />
                    <span className="text-[11px] text-text-secondary">{t('spc.sigma2')}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 bg-error" />
                    <span className="text-[11px] text-text-secondary">{t('spc.uclLcl')}</span>
                  </div>
                </div>
              </div>

              {spc && spc.dataPoints.length > 0 ? (
                <div className="relative" style={{ height: chartHeight }}>
                  <div className="absolute inset-x-0 top-0 bg-[#FFEBEE] flex items-center justify-end pr-3" style={{ height: '15%' }}>
                    <span className="text-[10px] font-semibold text-error">UCL {spc.ucl.toFixed(4)}</span>
                  </div>
                  <div className="absolute inset-x-0 bg-[#FFF3E0] flex items-center justify-end pr-3" style={{ top: '15%', height: '15%' }}>
                    <span className="text-[10px] font-semibold text-[#E8A849]">+2&sigma;</span>
                  </div>
                  <div className="absolute inset-x-0 bg-[#E8F5E9]" style={{ top: '30%', height: '20%' }} />
                  <div className="absolute inset-x-0 bg-success flex items-center justify-end pr-3" style={{ top: '50%', height: '2px' }}>
                    <span className="text-[10px] font-semibold text-success absolute -top-3 right-3">{t('spc.mean')} {spc.grandMean.toFixed(4)}</span>
                  </div>
                  <div className="absolute inset-x-0 bg-[#E8F5E9]" style={{ top: '50%', height: '20%' }} />
                  <div className="absolute inset-x-0 bg-[#FFF3E0] flex items-center justify-end pr-3" style={{ top: '70%', height: '15%' }}>
                    <span className="text-[10px] font-semibold text-[#E8A849]">-2&sigma;</span>
                  </div>
                  <div className="absolute inset-x-0 bg-[#FFEBEE] flex items-center justify-end pr-3" style={{ top: '85%', height: '15%' }}>
                    <span className="text-[10px] font-semibold text-error">LCL {spc.lcl.toFixed(4)}</span>
                  </div>
                  <div className="absolute inset-0 pointer-events-none">
                    {spcPoints.map((pt, i) => {
                      const xPct = spcPoints.length > 1 ? (i / (spcPoints.length - 1)) * 90 + 5 : 50
                      const range = spc.ucl - spc.lcl
                      const yPct = range > 0
                        ? 7.5 + (1 - (pt.value - spc.lcl) / range) * 85
                        : 50
                      return (
                        <div
                          key={i}
                          className={`absolute w-2 h-2 rounded-full ${pt.isOoc ? 'bg-error' : 'bg-accent'}`}
                          style={{ left: `${xPct}%`, top: `${yPct}%`, transform: 'translate(-50%, -50%)' }}
                          title={`${pt.waferId}: ${pt.value.toFixed(4)}`}
                        />
                      )
                    })}
                  </div>
                </div>
              ) : (
                <div className="h-[180px] flex items-center justify-center text-text-muted text-sm">
                  {t('noSpcData')}
                </div>
              )}
            </div>

            {/* Distribution */}
            <div className="w-[340px] bg-bg-card p-5 flex flex-col">
              <h3 className="font-heading font-bold mb-3">{t('distributionTitle', { param: selectedParam })}</h3>
              {dist && dist.counts.length > 0 ? (
                <>
                  <div className="flex gap-4 mb-4">
                    <div className="flex flex-col">
                      <span className="text-[10px] text-text-muted uppercase tracking-wider">{t('distribution.mean')}</span>
                      <span className="text-sm font-bold text-text-primary">{dist.mean.toFixed(4)}</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[10px] text-text-muted uppercase tracking-wider">{t('distribution.stdev')}</span>
                      <span className="text-sm font-bold text-text-primary">{dist.stdev.toFixed(4)}</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[10px] text-text-muted uppercase tracking-wider">Cpk</span>
                      <span className={`text-sm font-bold ${dist.cpk !== null && dist.cpk >= 1.33 ? 'text-success' : 'text-warning'}`}>
                        {dist.cpk !== null ? dist.cpk.toFixed(2) : 'N/A'}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-end gap-1 flex-1">
                    {dist.counts.map((c, i) => {
                      const maxCount = Math.max(...dist.counts)
                      const hPct = maxCount > 0 ? (c / maxCount) * 100 : 0
                      const isCenterRange = i >= Math.floor(dist.counts.length * 0.3) && i <= Math.floor(dist.counts.length * 0.7)
                      return (
                        <div
                          key={i}
                          className={`flex-1 ${isCenterRange ? 'bg-accent' : 'bg-bar-track'}`}
                          style={{ height: `${hPct}%` }}
                          title={`${c} wafers`}
                        />
                      )
                    })}
                  </div>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center text-text-muted text-sm">
                  {t('noDistData')}
                </div>
              )}
            </div>
          </div>

          {/* Row 2: AI Anomaly Detection (flex-1) + Correlation Matrix (fixed width, same height) */}
          <div className="flex gap-5 items-stretch">
            {/* AI Anomaly Detection */}
            <div className="flex-1 bg-bg-card p-5 overflow-y-auto" style={{ maxHeight: 560 }}>
              <div className="flex items-center gap-2 mb-3">
                <Sparkles size={16} className="text-accent" />
                <h3 className="font-heading font-bold">{t('anomaly.title')}</h3>
              </div>
              <p className="text-[12px] text-text-secondary mb-4 leading-relaxed">
                {t('anomaly.description')}
              </p>

              {anomalyLoading ? (
                <div className="flex items-center gap-2 text-text-muted text-[13px] py-4">
                  <Loader2 size={14} className="animate-spin" />
                  <span>{t('anomaly.analyzing')}</span>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {anomalies.length > 0 ? anomalies.map((a) => {
                    const isWarning = a.severity === 'warning'
                    return (
                      <div key={a.id} className={`${isWarning ? 'bg-badge-warn' : 'bg-badge-fail'} p-3 flex items-start gap-3`}>
                        <div className={`w-8 h-8 ${isWarning ? 'bg-[#E8A849]' : 'bg-error'} flex items-center justify-center flex-shrink-0`}>
                          {isWarning ? <TriangleAlert size={16} className="text-white" /> : <CircleX size={16} className="text-white" />}
                        </div>
                        <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className={`text-[12px] font-bold ${isWarning ? 'text-warning' : 'text-error'}`}>{a.title}</span>
                            <span className="text-[10px] text-text-muted whitespace-nowrap">{a.timestamp}</span>
                          </div>
                          <span className="text-[11px] text-text-secondary">{a.description}</span>
                          <span className={`text-[10px] font-semibold ${isWarning ? 'text-[#E8A849]' : 'text-error'}`}>
                            {t('anomaly.confidence')}: {(a.confidence * 100).toFixed(0)}%
                          </span>
                        </div>
                      </div>
                    )
                  }) : (
                    <div className="text-text-muted text-sm py-4 text-center">{t('noAnomalies')}</div>
                  )}
                </div>
              )}
            </div>

            {/* Correlation Matrix — fixed width, matches anomaly height, scrollable inside */}
            <div className="w-[680px] flex-shrink-0 bg-bg-card p-5 flex flex-col">
              <h3 className="font-heading font-bold mb-3">{t('correlation.title')}</h3>
              {corr && corr.params.length >= 2 ? (
                <div className="flex-1 overflow-auto">
                  {/* Sticky header row */}
                  <div className="flex gap-px">
                    <div className="h-8 w-16 flex-shrink-0 sticky left-0 bg-bg-card z-10" />
                    {corr.params.map((p) => (
                      <div
                        key={p}
                        className="h-8 w-10 flex-shrink-0 flex items-end justify-center pb-1 text-[9px] font-semibold text-text-secondary overflow-hidden"
                        title={p}
                        style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
                      >
                        {p.length > 8 ? p.slice(0, 8) : p}
                      </div>
                    ))}
                  </div>
                  {/* Data rows */}
                  {corr.matrix.map((row, ri) => (
                    <div key={ri} className="flex gap-px mt-px">
                      <div
                        className="h-10 w-16 flex-shrink-0 flex items-center text-[10px] font-semibold text-text-secondary sticky left-0 bg-bg-card z-10 pr-1"
                        title={corr.params[ri]}
                      >
                        <span className="truncate">{corr.params[ri].length > 8 ? corr.params[ri].slice(0, 8) : corr.params[ri]}</span>
                      </div>
                      {row.map((val, ci) => (
                        <div
                          key={ci}
                          className={`h-10 w-10 flex-shrink-0 flex items-center justify-center text-[10px] font-semibold ${getCellColor(val, ri === ci)}`}
                          title={`${corr.params[ri]} × ${corr.params[ci]}: ${val.toFixed(3)}`}
                        >
                          {val.toFixed(2)}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-text-muted text-sm py-8 text-center">
                  {t('noCorrelation')}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
