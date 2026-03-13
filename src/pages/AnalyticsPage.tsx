import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2, Sparkles, TriangleAlert, CircleX } from 'lucide-react'
import PageHeader from '@/components/layout/PageHeader'
import { getHistory, type HistoryRow } from '@/services/history'
import LotSearchSelect from '@/components/ui/LotSearchSelect'
import SearchSelect from '@/components/ui/SearchSelect'
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

// OOC marker styles — size in px, clipPath for shape, filter for visibility over colored bands
const OOC_STYLES: Record<string, {
  color: string
  label: string
  size: number
  clipPath?: string
  borderRadius?: string
}> = {
  ucl:   { color: '#E53935', label: '超出 UCL',  size: 10, borderRadius: '50%' },
  lcl:   { color: '#E53935', label: '超出 LCL',  size: 10, borderRadius: '50%' },
  // diamond ♦ — 7 points clustered on same side
  run:   { color: '#FF6D00', label: '連7點同側', size: 12,
           clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)' },
  // diamond ♦ — 6 consecutive directional trend
  trend: { color: '#9C27B0', label: '連6點趨勢', size: 12,
           clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)' },
}

function SpcChart({ spc, chartHeight }: { spc: SpcResponse; chartHeight: number }) {
  const { t } = useTranslation('analytics')
  const [hovered, setHovered] = useState<number | null>(null)
  const points = spc.dataPoints

  const getPos = (i: number) => {
    const xPct = points.length > 1 ? (i / (points.length - 1)) * 90 + 5 : 50
    const range = spc.ucl - spc.lcl
    const yPct = range > 0 ? 7.5 + (1 - (points[i].value - spc.lcl) / range) * 85 : 50
    return { xPct, yPct }
  }

  return (
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
      {/* Dots */}
      <div className="absolute inset-0">
        {points.map((pt, i) => {
          const { xPct, yPct } = getPos(i)
          const isHov = hovered === i
          const ooc = pt.oocReason ? OOC_STYLES[pt.oocReason] : null
          const size = ooc ? ooc.size : 8
          return (
            <div
              key={i}
              className="absolute"
              style={{
                left: `${xPct}%`,
                top: `${yPct}%`,
                width: size,
                height: size,
                backgroundColor: ooc ? ooc.color : 'var(--color-accent)',
                borderRadius: ooc?.borderRadius ?? (pt.oocReason ? 0 : '50%'),
                clipPath: ooc?.clipPath,
                transform: `translate(-50%, -50%) scale(${isHov ? 1.4 : 1})`,
                filter: ooc?.clipPath
                  ? `drop-shadow(0 0 2px white) drop-shadow(0 0 1px ${ooc.color})`
                  : undefined,
                cursor: 'pointer',
                zIndex: isHov ? 10 : (ooc ? 3 : 1),
                transition: 'transform 0.1s ease',
              }}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
            />
          )
        })}
      </div>
      {/* Tooltip */}
      {hovered !== null && (() => {
        const { xPct, yPct } = getPos(hovered)
        const pt = points[hovered]
        const ooc = pt.oocReason ? OOC_STYLES[pt.oocReason] : null
        return (
          <div
            className="absolute text-[10px] font-semibold px-2 py-1 whitespace-nowrap pointer-events-none z-20 flex flex-col gap-0.5"
            style={{
              left: `${xPct}%`,
              top: `${yPct}%`,
              transform: 'translate(-50%, calc(-100% - 12px))',
              background: 'var(--color-text-primary)',
              color: 'var(--color-bg-card)',
            }}
          >
            <span>{pt.waferId}: {pt.value.toFixed(4)}</span>
            {ooc && <span style={{ color: ooc.color, filter: 'brightness(1.8)' }}>⚠ {ooc.label}</span>}
          </div>
        )
      })()}
    </div>
  )
}

function DistributionChart({ counts: rawCounts, bins, mean, stdev }: {
  counts: number[]
  bins: number[]
  mean: number
  stdev: number
}) {
  const [hovered, setHovered] = useState<number | null>(null)

  // Pad 3 empty bins on each side so tail area is always visible
  const PADDING = 3
  const counts = [...Array(PADDING).fill(0), ...rawCounts, ...Array(PADDING).fill(0)]
  const dataStart = PADDING
  const dataEnd = dataStart + rawCounts.length - 1

  // Extend bins array for padding (bins has length rawCounts.length + 1)
  const binWidth = bins.length >= 2 ? bins[1] - bins[0] : 0
  const paddedBins = [
    ...Array.from({ length: PADDING }, (_, k) => bins[0] - (PADDING - k) * binWidth),
    ...bins,
    ...Array.from({ length: PADDING }, (_, k) => (bins[bins.length - 1] ?? 0) + (k + 1) * binWidth),
  ]

  // ±2σ range
  const lo2 = mean - 2 * stdev
  const hi2 = mean + 2 * stdev

  const maxCount = Math.max(...rawCounts, 1)
  const W = 290, H = 120
  const PAD = { top: 20, right: 6, bottom: 6, left: 28 }
  const cW = W - PAD.left - PAD.right
  const cH = H - PAD.top - PAD.bottom
  const barW = cW / counts.length
  const gap = Math.max(1, barW * 0.2)
  const toY = (v: number) => PAD.top + cH - (v / maxCount) * cH
  const toX = (i: number) => PAD.left + i * barW + gap / 2
  const yTicks = [0, Math.round(maxCount / 2), maxCount]
  const MIN_BAR_H = 3

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ overflow: 'visible' }}
      onMouseLeave={() => setHovered(null)}>
      {yTicks.map((tick) => (
        <g key={tick}>
          <line x1={PAD.left} y1={toY(tick)} x2={W - PAD.right} y2={toY(tick)}
            stroke="var(--color-border-light)" strokeDasharray="3 3" />
          <text x={PAD.left - 4} y={toY(tick) + 3.5} textAnchor="end" fontSize="8"
            fill="var(--color-text-muted)">{tick}</text>
        </g>
      ))}
      {counts.map((c, i) => {
        const inData = i >= dataStart && i <= dataEnd
        // Bin center from padded bins array
        const binCenter = paddedBins[i] !== undefined && paddedBins[i + 1] !== undefined
          ? (paddedBins[i] + paddedBins[i + 1]) / 2
          : NaN
        // ±2σ: accent color; outside or padding: lighter
        const isWithin2Sigma = !isNaN(binCenter) && binCenter >= lo2 && binCenter <= hi2
        const x = toX(i)
        const bw = Math.max(barW - gap, 1)
        const bh = maxCount > 0 ? (c / maxCount) * cH : 0
        const displayH = Math.max(bh, isWithin2Sigma ? 0 : MIN_BAR_H)
        return (
          <rect key={i} x={x} y={PAD.top + cH - displayH} width={bw} height={displayH}
            fill="var(--color-accent)"
            fillOpacity={isWithin2Sigma ? 1 : 0.25}
            opacity={hovered !== null && hovered !== (i - dataStart) ? 0.5 : 1}
            style={{ cursor: inData ? 'pointer' : 'default' }}
            onMouseEnter={() => inData && setHovered(i - dataStart)}
          />
        )
      })}
      {hovered !== null && (() => {
        const paddedIdx = hovered + dataStart
        const c = rawCounts[hovered]
        const cx = toX(paddedIdx) + (barW - gap) / 2
        const ty = toY(c)
        const label = `${c} wafers`
        const tw = label.length * 5.2 + 10
        return (
          <g>
            <rect x={cx - tw / 2} y={ty - 17} width={tw} height={15} rx={2}
              fill="var(--color-text-primary)" />
            <text x={cx} y={ty - 6} textAnchor="middle" fontSize="9"
              fill="var(--color-bg-card)" fontWeight="600">{label}</text>
          </g>
        )
      })()}
    </svg>
  )
}

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
  const [corrHover, setCorrHover] = useState<{ ri: number; ci: number; x: number; y: number } | null>(null)

  useEffect(() => {
    getHistory({ pageSize: 50 })
      .then(res => {
        setLots(res.items)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const loadAnomalies = useCallback(async (lotId: number, lang: string) => {
    setAnomalyLoading(true)
    setAnomalies([])
    try {
      const result = await detectAnomalies(lotId, lang)
      setAnomalies(result)
    } catch {
      setAnomalies([])
    } finally {
      setAnomalyLoading(false)
    }
  }, [])

  // Re-fetch anomalies when language changes (if a lot is already selected)
  useEffect(() => {
    if (selectedLotId) {
      loadAnomalies(selectedLotId, i18n.language)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i18n.language])

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
      const corrData = await getCorrelation(productId).catch(() => ({ params: [], matrix: [] }))
      setCorr(corrData)
    } catch {
      // ignore
    } finally {
      setDataLoading(false)
    }

    // Load anomalies for current language (cache-first)
    loadAnomalies(lotId, i18n.language)
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

  const chartHeight = 180

  return (
    <div className="p-9 pl-11 flex flex-col gap-6">
      <PageHeader
        title={t('title')}
        actions={
          <div className="flex items-center gap-3">
            <LotSearchSelect
              lots={lots}
              selectedLotId={selectedLotId}
              placeholder={t('selectLot')}
              onSelect={(lot) => handleLotChange(lot.id, lot.productId)}
              className="w-[280px]"
              align="right"
            />
            <SearchSelect
              items={params}
              value={selectedParam}
              onChange={handleParamChange}
              placeholder={t('noParams')}
              disabled={params.length === 0}
              className="w-[200px]"
              align="right"
            />
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
                    <div className="w-2.5 h-2.5 bg-error rounded-full" />
                    <span className="text-[11px] text-text-secondary">{t('spc.uclLcl')}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="flex-shrink-0" style={{ width: 11, height: 11, backgroundColor: OOC_STYLES.run.color, clipPath: OOC_STYLES.run.clipPath }} />
                    <span className="text-[11px] text-text-secondary">{OOC_STYLES.run.label}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="flex-shrink-0" style={{ width: 11, height: 11, backgroundColor: OOC_STYLES.trend.color, clipPath: OOC_STYLES.trend.clipPath }} />
                    <span className="text-[11px] text-text-secondary">{OOC_STYLES.trend.label}</span>
                  </div>
                </div>
              </div>

              {spc && spc.dataPoints.length > 0 ? (
                <SpcChart spc={spc} chartHeight={chartHeight} />
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
                  {/* SVG distribution chart with Y-axis and tooltip */}
                  <div className="flex-1 min-h-0" style={{ minHeight: 100 }}>
                    <DistributionChart counts={dist.counts} bins={dist.bins} mean={dist.mean} stdev={dist.stdev} />
                  </div>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center text-text-muted text-sm">
                  {t('noDistData')}
                </div>
              )}
            </div>
          </div>

          {/* Row 2: AI Anomaly (1/3) + Correlation Matrix (2/3) — same height via items-stretch */}
          <div className="flex gap-5 items-stretch">
            {/* AI Anomaly Detection — 1/3 width, natural height (no scroll), determines row height */}
            <div className="w-1/3 bg-bg-card p-5">
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

            {/* Correlation Matrix — 2/3 width, stretches to same height, scrollable both axes */}
            <div className="w-2/3 bg-bg-card p-5 flex flex-col min-h-[300px]">
              <h3 className="font-heading font-bold mb-3">{t('correlation.title')}</h3>
              {corr && corr.params.length >= 2 ? (
                <div className="flex-1 overflow-auto">
                  {/* Header row — tall enough for vertical param names */}
                  <div className="flex gap-px">
                    {/* Corner spacer matches label column width and header height */}
                    <div className="flex-shrink-0 sticky left-0 bg-bg-card z-10" style={{ width: 120, height: 88 }} />
                    {corr.params.map((p) => (
                      <div
                        key={p}
                        className="flex-shrink-0 flex items-center justify-center text-[9px] font-semibold text-text-secondary"
                        style={{ width: 40, height: 88, writingMode: 'vertical-rl', transform: 'rotate(180deg)', overflow: 'hidden' }}
                        title={p}
                      >
                        {p}
                      </div>
                    ))}
                  </div>
                  {/* Data rows */}
                  {corr.matrix.map((row, ri) => (
                    <div key={ri} className="flex gap-px mt-px">
                      <div
                        className="flex-shrink-0 flex items-center text-[9px] font-semibold text-text-secondary sticky left-0 bg-bg-card z-10 pr-2 leading-tight"
                        style={{ width: 120, height: 40, wordBreak: 'break-all', overflowWrap: 'anywhere', overflow: 'hidden' }}
                        title={corr.params[ri]}
                      >
                        {corr.params[ri]}
                      </div>
                      {row.map((val, ci) => {
                        const isHovered = corrHover?.ri === ri && corrHover?.ci === ci
                        const isDimmed = corrHover !== null && !isHovered
                        return (
                          <div
                            key={ci}
                            className={`flex-shrink-0 flex items-center justify-center text-[10px] font-semibold cursor-pointer transition-all duration-100 ${getCellColor(val, ri === ci)} ${isHovered ? 'ring-2 ring-inset ring-black/30 brightness-90' : ''} ${isDimmed ? 'opacity-40' : ''}`}
                            style={{ width: 40, height: 40 }}
                            onMouseEnter={(e) => setCorrHover({ ri, ci, x: e.clientX, y: e.clientY })}
                            onMouseMove={(e) => setCorrHover((h) => h ? { ...h, x: e.clientX, y: e.clientY } : null)}
                            onMouseLeave={() => setCorrHover(null)}
                          >
                            {val.toFixed(2)}
                          </div>
                        )
                      })}
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

      {/* Correlation cell tooltip */}
      {corrHover !== null && corr && (
        <div
          className="fixed z-50 pointer-events-none bg-text-primary text-bg-card px-3 py-2 shadow-lg"
          style={{
            left: corrHover.x + 14,
            top: corrHover.y - 56,
          }}
        >
          <div className="text-[10px] opacity-60 leading-snug">
            {corr.params[corrHover.ri]} × {corr.params[corrHover.ci]}
          </div>
          <div className="text-[15px] font-bold mt-0.5 leading-none">
            {corr.matrix[corrHover.ri][corrHover.ci].toFixed(3)}
          </div>
        </div>
      )}
    </div>
  )
}
