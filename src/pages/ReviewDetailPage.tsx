import { useState, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ChevronLeft, ChevronRight, Sparkles, Loader2 } from 'lucide-react'
import { getWaferDetail, type WaferDetail, type ElectricalParam } from '@/services/review'
import { getWaferMap, getBinDistribution, type WaferMapData, type BinCount } from '@/services/waferMap'
import { getLotResults } from '@/services/review'
import { apiFetch } from '@/services/api'

export default function ReviewDetailPage() {
  const { t, i18n } = useTranslation('review')
  const navigate = useNavigate()
  const { lotId, waferId } = useParams<{ lotId: string; waferId: string }>()
  const [detail, setDetail] = useState<WaferDetail | null>(null)
  const [mapData, setMapData] = useState<WaferMapData | null>(null)
  const [binDist, setBinDist] = useState<BinCount[]>([])
  const [loading, setLoading] = useState(true)
  const [waferIds, setWaferIds] = useState<string[]>([])
  const [aiSummary, setAiSummary] = useState<string | null>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [waferDbId, setWaferDbId] = useState<number | null>(null)

  const lotDbId = Number(lotId)

  useEffect(() => {
    if (!lotId || !waferId) return
    setLoading(true)
    setAiSummary(null)

    // Load wafer detail
    const loadDetail = getWaferDetail(lotDbId, waferId).then(setDetail).catch(() => null)

    // Load wafer list for prev/next navigation, then load map data
    const loadWaferList = getLotResults(lotDbId).then(res => {
      setWaferIds(res.wafers.map(w => w.waferId))
      const wafer = res.wafers.find(w => w.waferId === waferId)
      if (wafer) {
        setWaferDbId(wafer.dbId)
        getWaferMap(wafer.dbId).then(setMapData).catch(() => null)
        getBinDistribution(wafer.dbId).then(setBinDist).catch(() => null)
      }
    }).catch(() => null)

    Promise.all([loadDetail, loadWaferList]).finally(() => setLoading(false))
  }, [lotId, waferId])

  // Load AI summary: use cached DB result if available, otherwise generate new one
  useEffect(() => {
    if (!waferDbId || !lotDbId) return
    setAiLoading(true)
    // Try reading cached summary first (GET) — match current language
    apiFetch<{ summary: string }>(`/ai/review-summary/${lotDbId}/${waferId}?lang=${encodeURIComponent(i18n.language)}`)
      .then(res => {
        setAiSummary(res.summary)
        setAiLoading(false)
      })
      .catch(() => {
        // Not in DB yet — generate and save (POST)
        apiFetch<{ summary: string }>('/ai/review-summary', {
          method: 'POST',
          body: JSON.stringify({ lot_id: lotDbId, wafer_id: waferDbId, lang: i18n.language }),
        })
          .then(res => setAiSummary(res.summary))
          .catch(() => null)
          .finally(() => setAiLoading(false))
      })
  }, [waferDbId, i18n.language])

  const currentIdx = waferIds.indexOf(waferId || '')
  const prevWaferId = currentIdx > 0 ? waferIds[currentIdx - 1] : null
  const nextWaferId = currentIdx < waferIds.length - 1 ? waferIds[currentIdx + 1] : null

  // Build wafer map grid from die data
  const mapGrid = useMemo(() => {
    if (!mapData || !mapData.dies.length) return null
    // Normalize coordinates to 0-based indices so the grid always fits the display
    // regardless of the actual coordinate values or range
    const uniqueXs = [...new Set(mapData.dies.map(d => d.x))].sort((a, b) => a - b)
    const uniqueYs = [...new Set(mapData.dies.map(d => d.y))].sort((a, b) => a - b)
    const xToIdx = new Map(uniqueXs.map((x, i) => [x, i] as [number, number]))
    const yToIdx = new Map(uniqueYs.map((y, i) => [y, i] as [number, number]))
    const grid: Record<string, number> = {}
    for (const die of mapData.dies) {
      const xi = xToIdx.get(die.x)!
      const yi = yToIdx.get(die.y)!
      grid[`${yi},${xi}`] = die.bin
    }
    return {
      grid,
      minX: 0,
      maxX: uniqueXs.length - 1,
      minY: 0,
      maxY: uniqueYs.length - 1,
    }
  }, [mapData])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 size={32} className="animate-spin text-accent" />
      </div>
    )
  }

  // Fallback wafer map using circle if no real map data
  const renderWaferMap = () => {
    if (mapGrid) {
      const cols = mapGrid.maxX - mapGrid.minX + 1
      const rows = mapGrid.maxY - mapGrid.minY + 1
      // Pad to square so the wafer appears circular and symmetric
      const displaySize = Math.max(cols, rows)
      const colOffset = Math.floor((displaySize - cols) / 2)
      const rowOffset = Math.floor((displaySize - rows) / 2)
      const cellSize = Math.min(24, Math.floor(380 / displaySize))
      const radius = Math.ceil(cellSize / 4)
      return (
        <div
          className="inline-grid"
            style={{ gridTemplateColumns: `repeat(${displaySize}, ${cellSize}px)`, gap: '1px' }}
          >
            {Array.from({ length: displaySize }, (_, row) =>
              Array.from({ length: displaySize }, (_, col) => {
                const dataRow = row - rowOffset
                const dataCol = col - colOffset
                const inBounds = dataRow >= 0 && dataRow < rows && dataCol >= 0 && dataCol < cols
                const key = `${dataRow},${dataCol}`
                const bin = inBounds ? mapGrid.grid[key] : undefined
                let bgColor: string
                if (bin === 1) bgColor = 'var(--color-success)'
                else if (bin !== undefined) bgColor = 'var(--color-error)'
                else if (inBounds) bgColor = 'rgba(0,0,0,0.06)'
                else bgColor = 'transparent'
                return (
                  <div
                    key={`${row}-${col}`}
                    style={{ width: cellSize, height: cellSize, backgroundColor: bgColor, borderRadius: radius }}
                  />
                )
              })
            )}
        </div>
      )
    }
    // Fallback: circle approximation
    const cx = 6.5, cy = 6.5, r = 6.5
    return (
      <div className="inline-grid gap-px" style={{ gridTemplateColumns: 'repeat(14, 20px)' }}>
        {Array.from({ length: 14 }, (_, row) =>
          Array.from({ length: 14 }, (_, col) => {
            const inside = (col - cx) ** 2 + (row - cy) ** 2 <= r * r
            return (
              <div
                key={`${row}-${col}`}
                className={`w-5 h-5 ${inside ? 'bg-success' : 'bg-transparent'}`}
              />
            )
          })
        )}
      </div>
    )
  }

  const params = detail?.electricalParams || []
  const maxBinCount = Math.max(...(binDist.map(b => b.count) || [1]), 1)

  return (
    <div className="p-9 pl-11 flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/review', { state: { lotId: lotDbId } })} className="text-text-secondary hover:text-accent cursor-pointer">
            <ArrowLeft size={20} />
          </button>
          <h1 className="font-heading text-xl font-bold text-text-primary">
            {t('detail.title')} — {detail?.lotId || lotId} / {waferId}
          </h1>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => prevWaferId && navigate(`/review/${lotId}/wafer/${prevWaferId}`)}
            disabled={!prevWaferId}
            className="bg-bg-card border border-border-light px-3 py-1.5 text-sm text-text-secondary flex items-center gap-1 hover:text-text-primary cursor-pointer disabled:opacity-30"
          >
            <ChevronLeft size={16} /> {t('detail.prevWaferShort')}
          </button>
          <button
            onClick={() => nextWaferId && navigate(`/review/${lotId}/wafer/${nextWaferId}`)}
            disabled={!nextWaferId}
            className="bg-bg-card border border-border-light px-3 py-1.5 text-sm text-text-secondary flex items-center gap-1 hover:text-text-primary cursor-pointer disabled:opacity-30"
          >
            {t('detail.nextWaferShort')} <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* Top Row */}
      <div className="flex gap-5 h-[520px]">
        {/* Wafer Map */}
        <div className="flex-1 bg-bg-card p-5 flex flex-col min-w-0 overflow-hidden">
          <h3 className="font-heading font-bold mb-3">{t('detail.waferMap')} — {waferId}</h3>
          <div className="flex-1 flex items-center justify-center overflow-hidden">
            {renderWaferMap()}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 bg-success rounded-sm flex-shrink-0" />
              <span className="text-[11px] text-text-secondary whitespace-nowrap">{t('detail.bin1Label')} Pass</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 bg-error rounded-sm flex-shrink-0" />
              <span className="text-[11px] text-text-secondary whitespace-nowrap">{t('detail.bin2PlusLabel')} Fail</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: 'rgba(0,0,0,0.06)' }} />
              <span className="text-[11px] text-text-secondary whitespace-nowrap">No Die</span>
            </div>
          </div>
        </div>

        {/* Wafer Statistics */}
        <div className="w-[380px] bg-bg-card p-5 flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col">
              <span className="text-[10px] text-text-muted uppercase tracking-wider">{t('detail.totalDies')}</span>
              <span className="font-heading text-2xl font-bold text-text-primary">{detail?.totalDies ?? '-'}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] text-text-muted uppercase tracking-wider">{t('detail.passing')}</span>
              <span className="font-heading text-2xl font-bold text-success">{detail?.bin1Pass ?? '-'}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] text-text-muted uppercase tracking-wider">{t('detail.bin1Yield')}</span>
              <span className="font-heading text-2xl font-bold text-success">{detail ? `${detail.bin1Yield.toFixed(2)}%` : '-'}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] text-text-muted uppercase tracking-wider">{t('detail.failCount')}</span>
              <span className="font-heading text-2xl font-bold text-error">{detail?.failCount ?? '-'}</span>
            </div>
          </div>

          <div className="h-px bg-border-light" />

          <div className="flex flex-col gap-2 overflow-auto flex-1">
            <h4 className="font-heading font-bold text-sm">{t('detail.electricalParams')}</h4>
            <table className="w-full">
              <thead>
                <tr className="text-[10px] text-text-muted uppercase tracking-wider">
                  <th className="text-left py-1 font-medium">{t('detail.param')}</th>
                  <th className="text-right py-1 pl-4 font-medium">{t('detail.avg')}</th>
                  <th className="text-right py-1 pl-4 font-medium">{t('detail.stdev')}</th>
                  <th className="text-right py-1 pl-4 font-medium">{t('detail.min')}</th>
                  <th className="text-right py-1 pl-4 pr-2 font-medium">{t('detail.max')}</th>
                </tr>
              </thead>
              <tbody>
                {params.map((row) => (
                  <tr key={row.param} className="border-t border-border-light">
                    <td className="text-[12px] font-semibold text-text-primary py-1.5">{row.param}</td>
                    <td className="text-[12px] text-text-secondary text-right py-1.5 pl-4">{row.avg}</td>
                    <td className="text-[12px] text-text-secondary text-right py-1.5 pl-4">{row.stdev}</td>
                    <td className="text-[12px] text-text-secondary text-right py-1.5 pl-4">{row.min}</td>
                    <td className={`text-[12px] text-right py-1.5 pl-4 pr-2 ${row.maxWarning ? 'text-warning font-semibold' : 'text-text-secondary'}`}>
                      {row.max}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Bottom Row */}
      <div className="flex gap-5">
        {/* AI Review Summary */}
        <div className="flex-1 bg-bg-card p-5">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles size={16} className="text-accent" />
            <h3 className="font-heading font-bold text-sm">{t('detail.aiSummary')}</h3>
          </div>
          {aiLoading ? (
            <div className="flex items-center gap-2 text-text-muted text-[13px]">
              <Loader2 size={14} className="animate-spin" />
              <span>{t('detail.aiGenerating')}</span>
            </div>
          ) : (
            <div className="text-[13px] text-text-secondary leading-relaxed space-y-1">
              {(aiSummary || (detail ? (
                detail.failCount > 0
                  ? t('detail.aiSummaryWithFail', { waferId, yield: detail.bin1Yield.toFixed(2), failCount: detail.failCount, paramCount: params.length })
                  : t('detail.aiSummaryAllPass', { waferId, yield: detail.bin1Yield.toFixed(2), paramCount: params.length })
              ) : t('detail.noData'))).split('\n').map((line, i) => (
                <p key={i}>
                  {line.split(/(\*\*[^*]+\*\*)/).map((part, j) =>
                    part.startsWith('**') && part.endsWith('**')
                      ? <strong key={j} className="font-semibold text-text-primary">{part.slice(2, -2)}</strong>
                      : part
                  )}
                </p>
              ))}
            </div>
          )}
        </div>

        {/* Bin Distribution */}
        <div className="w-[340px] bg-bg-card p-5 flex flex-col">
          <h3 className="font-heading font-bold text-sm mb-3">{t('detail.binDistribution')}</h3>
          {detail ? (() => {
            const total = detail.totalDies || 1
            const bins = [
              { label: t('detail.bin1Label'), count: detail.bin1Pass, colorClass: 'bg-success' },
              { label: t('detail.bin2PlusLabel'), count: detail.failCount, colorClass: 'bg-error' },
            ]
            const maxCount = Math.max(...bins.map(b => b.count), 1)
            const chartH = 100
            return (
              <div className="flex items-end gap-6 flex-1 px-4 pb-1">
                {bins.map((bin) => {
                  const barH = (bin.count / maxCount) * chartH * 0.85
                  return (
                    <div key={bin.label} className="flex-1 flex flex-col items-center gap-1">
                      <span className="text-[12px] font-bold text-text-primary">{bin.count}</span>
                      <span className="text-[10px] text-text-muted">
                        ({total > 0 ? ((bin.count / total) * 100).toFixed(1) : 0}%)
                      </span>
                      <div className="w-full flex justify-center">
                        <div
                          className={`w-16 ${bin.colorClass}`}
                          style={{ height: `${Math.max(barH, bin.count > 0 ? 6 : 2)}px` }}
                        />
                      </div>
                      <span className="text-[11px] font-semibold text-text-secondary mt-0.5">{bin.label}</span>
                    </div>
                  )
                })}
              </div>
            )
          })() : (
            <p className="text-text-muted text-sm">{t('detail.noData')}</p>
          )}
        </div>
      </div>
    </div>
  )
}
