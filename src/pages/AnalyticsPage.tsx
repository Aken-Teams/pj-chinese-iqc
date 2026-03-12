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
  getAnomalies,
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
  const { t } = useTranslation('analytics')
  const [lots, setLots] = useState<HistoryRow[]>([])
  const [selectedLotId, setSelectedLotId] = useState<number | null>(null)
  const [selectedProductId, setSelectedProductId] = useState<number | null>(null)
  const [params, setParams] = useState<string[]>([])
  const [selectedParam, setSelectedParam] = useState('')
  const [loading, setLoading] = useState(true)
  const [dataLoading, setDataLoading] = useState(false)

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
    try {
      const paramNames = await getParamNames(lotId)
      setParams(paramNames)
      if (paramNames.length > 0) {
        setSelectedParam(paramNames[0])
        await loadParamData(lotId, productId, paramNames[0])
      }
      // Load correlation + anomalies in parallel
      const [corrData, anomalyData] = await Promise.all([
        getCorrelation(productId).catch(() => ({ params: [], matrix: [] })),
        getAnomalies().catch(() => []),
      ])
      setCorr(corrData)
      setAnomalies(anomalyData)
    } catch {
      // ignore
    } finally {
      setDataLoading(false)
    }
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

  // Compute SPC chart dimensions from data
  const spcPoints = spc?.dataPoints || []
  const chartHeight = 180 // total px height for the SPC chart area

  return (
    <div className="p-9 pl-11 flex flex-col gap-6">
      <PageHeader
        title={t('title', { defaultValue: 'Analytics & AI' })}
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
              <option value="">-- Select Lot --</option>
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
              {params.length === 0 && <option value="">No params</option>}
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
          Select a lot to view analytics data.
        </div>
      ) : (
        <>
          {/* Top Row */}
          <div className="flex gap-5">
            {/* SPC Control Chart */}
            <div className="flex-1 bg-bg-card p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-heading font-bold">SPC Control Chart — {selectedParam}</h3>
                <div className="flex gap-4">
                  <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 bg-success" />
                    <span className="text-[11px] text-text-secondary">Mean</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 bg-[#E8A849]" />
                    <span className="text-[11px] text-text-secondary">&plusmn;2&sigma;</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 bg-error" />
                    <span className="text-[11px] text-text-secondary">UCL/LCL</span>
                  </div>
                </div>
              </div>

              {spc && spc.dataPoints.length > 0 ? (
                <div className="relative" style={{ height: chartHeight }}>
                  {/* UCL zone */}
                  <div className="absolute inset-x-0 top-0 bg-[#FFEBEE] flex items-center justify-end pr-3" style={{ height: '15%' }}>
                    <span className="text-[10px] font-semibold text-error">UCL {spc.ucl.toFixed(4)}</span>
                  </div>
                  {/* +2σ zone */}
                  <div className="absolute inset-x-0 bg-[#FFF3E0] flex items-center justify-end pr-3" style={{ top: '15%', height: '15%' }}>
                    <span className="text-[10px] font-semibold text-[#E8A849]">+2&sigma;</span>
                  </div>
                  {/* Normal zone above mean */}
                  <div className="absolute inset-x-0 bg-[#E8F5E9]" style={{ top: '30%', height: '20%' }} />
                  {/* Mean line */}
                  <div className="absolute inset-x-0 bg-success flex items-center justify-end pr-3" style={{ top: '50%', height: '2px' }}>
                    <span className="text-[10px] font-semibold text-success absolute -top-3 right-3">Mean {spc.grandMean.toFixed(4)}</span>
                  </div>
                  {/* Normal zone below mean */}
                  <div className="absolute inset-x-0 bg-[#E8F5E9]" style={{ top: '50%', height: '20%' }} />
                  {/* -2σ zone */}
                  <div className="absolute inset-x-0 bg-[#FFF3E0] flex items-center justify-end pr-3" style={{ top: '70%', height: '15%' }}>
                    <span className="text-[10px] font-semibold text-[#E8A849]">-2&sigma;</span>
                  </div>
                  {/* LCL zone */}
                  <div className="absolute inset-x-0 bg-[#FFEBEE] flex items-center justify-end pr-3" style={{ top: '85%', height: '15%' }}>
                    <span className="text-[10px] font-semibold text-error">LCL {spc.lcl.toFixed(4)}</span>
                  </div>

                  {/* Data points */}
                  <div className="absolute inset-0 pointer-events-none">
                    {spcPoints.map((pt, i) => {
                      const xPct = spcPoints.length > 1 ? (i / (spcPoints.length - 1)) * 90 + 5 : 50
                      // Map value to Y: UCL = 7.5%, LCL = 92.5%
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
                  No SPC data available
                </div>
              )}
            </div>

            {/* Distribution */}
            <div className="w-[340px] bg-bg-card p-5 flex flex-col">
              <h3 className="font-heading font-bold mb-3">Distribution — {selectedParam}</h3>
              {dist && dist.counts.length > 0 ? (
                <>
                  <div className="flex gap-4 mb-4">
                    <div className="flex flex-col">
                      <span className="text-[10px] text-text-muted uppercase tracking-wider">Mean</span>
                      <span className="text-sm font-bold text-text-primary">{dist.mean.toFixed(4)}</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[10px] text-text-muted uppercase tracking-wider">Stdev</span>
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
                  No distribution data
                </div>
              )}
            </div>
          </div>

          {/* Bottom Row */}
          <div className="flex gap-5">
            {/* AI Anomaly Detection */}
            <div className="flex-1 bg-bg-card p-5 overflow-hidden">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles size={16} className="text-accent" />
                <h3 className="font-heading font-bold">AI Anomaly Detection</h3>
              </div>
              <p className="text-[12px] text-text-secondary mb-4 leading-relaxed">
                Machine learning models continuously monitor incoming test data to identify anomalies,
                parameter drift, and wafer map patterns that may indicate process shifts or equipment issues.
              </p>

              <div className="flex flex-col gap-3">
                {anomalies.length > 0 ? anomalies.map((a) => {
                  const isWarning = a.severity === 'warning'
                  return (
                    <div key={a.id} className={`${isWarning ? 'bg-badge-warn' : 'bg-badge-fail'} p-3 flex items-start gap-3`}>
                      <div className={`w-8 h-8 ${isWarning ? 'bg-[#E8A849]' : 'bg-error'} flex items-center justify-center flex-shrink-0`}>
                        {isWarning ? <TriangleAlert size={16} className="text-white" /> : <CircleX size={16} className="text-white" />}
                      </div>
                      <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className={`text-[12px] font-bold ${isWarning ? 'text-warning' : 'text-error'}`}>{a.title}</span>
                          <span className="text-[10px] text-text-muted">{a.timestamp}</span>
                        </div>
                        <span className="text-[11px] text-text-secondary">{a.description}</span>
                        <span className={`text-[10px] font-semibold ${isWarning ? 'text-[#E8A849]' : 'text-error'}`}>
                          Confidence: {(a.confidence * 100).toFixed(0)}%
                        </span>
                      </div>
                    </div>
                  )
                }) : (
                  <div className="text-text-muted text-sm py-4 text-center">No anomalies detected</div>
                )}
              </div>
            </div>

            {/* Correlation Matrix */}
            <div className="w-[400px] bg-bg-card p-5">
              <h3 className="font-heading font-bold mb-3">Parameter Correlation Matrix</h3>
              {corr && corr.params.length >= 2 ? (
                <div className="flex flex-col gap-px overflow-auto">
                  {/* Header row */}
                  <div className="flex gap-px">
                    <div className="h-9 w-14 flex-shrink-0" />
                    {corr.params.map((p) => (
                      <div
                        key={p}
                        className="h-9 w-12 flex-shrink-0 flex items-center justify-center text-[10px] font-semibold text-text-secondary"
                        title={p}
                      >
                        {p.length > 5 ? p.slice(0, 5) : p}
                      </div>
                    ))}
                  </div>
                  {/* Data rows */}
                  {corr.matrix.map((row, ri) => (
                    <div key={ri} className="flex gap-px">
                      <div className="h-9 w-14 flex-shrink-0 flex items-center justify-start text-[10px] font-semibold text-text-secondary" title={corr.params[ri]}>
                        {corr.params[ri].length > 6 ? corr.params[ri].slice(0, 6) : corr.params[ri]}
                      </div>
                      {row.map((val, ci) => (
                        <div
                          key={ci}
                          className={`h-9 w-12 flex-shrink-0 flex items-center justify-center text-[10px] font-semibold ${getCellColor(val, ri === ci)}`}
                        >
                          {val.toFixed(2)}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-text-muted text-sm py-8 text-center">
                  Not enough parameters for correlation
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
