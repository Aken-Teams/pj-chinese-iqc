import { useState, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ChevronLeft, ChevronRight, Sparkles, Loader2 } from 'lucide-react'
import { getWaferDetail, type WaferDetail } from '@/services/review'
import { getWaferMap, type WaferMapData } from '@/services/waferMap'
import { getLotResults } from '@/services/review'
import { apiFetch } from '@/services/api'
import { useAuthStore } from '@/store/authStore'
import { siteLabel } from '@/config/sites'

// Per-item yield: colour by level, N/A when no rule for that Q.
function yieldCell(value: number | null): { text: string; cls: string } {
  if (value === null || value === undefined) return { text: 'N/A', cls: 'text-text-muted' }
  const cls = value >= 99 ? 'text-success' : value >= 97 ? 'text-warning' : 'text-error'
  return { text: `${value.toFixed(2)}%`, cls }
}

export default function ReviewDetailPage() {
  const { t, i18n } = useTranslation('review')
  const navigate = useNavigate()
  const isAdmin = useAuthStore((s) => s.user?.role === 'admin')
  const { lotId, waferId } = useParams<{ lotId: string; waferId: string }>()
  const [detail, setDetail] = useState<WaferDetail | null>(null)
  const [lotDomain, setLotDomain] = useState<string | null | undefined>(undefined)
  const [mapData, setMapData] = useState<WaferMapData | null>(null)
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
      setLotDomain(res.domain ?? null)
      const wafer = res.wafers.find(w => w.waferId === waferId)
      if (wafer) {
        setWaferDbId(wafer.dbId)
        getWaferMap(wafer.dbId).then(setMapData).catch(() => null)
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

  /**
   * Die positions, converted from the vendor's coordinates to row/column
   * indices using the real die pitch.
   *
   * The previous version rank-compressed the distinct X and Y values, which
   * assumes the coordinates already are indices. Measured across both sites,
   * they usually are not:
   *
   *   天狼芯 / 世界先进   pitch 1 — indices after all
   *   捷捷微 / 祥瑞微     pitch 12-33 — physical units
   *   祥瑞微 (無錫)       pitch alternating 4 and 5, so no integer fits
   *   禾納                rows offset from each other, 300 probed sites
   *
   * Rank compression only works where the pitch never varies, which is why
   * 徐州's maps looked right and 禾納's came out scrambled with distant dies
   * drawn as neighbours. Dividing by the measured pitch works for all of them.
   */
  const mapPlot = useMemo(() => {
    if (!mapData || !mapData.dies.length) return null

    // The pitch is the spacing between neighbours in the same row (width) or
    // column (height). Gaps far above the median are dropped so a void in the
    // middle of a row does not stretch the die; the rest are averaged, which is
    // what handles 祥瑞微's alternating 4 and 5.
    const pitchAlong = (groups: Map<number, number[]>) => {
      const gaps: number[] = []
      for (const line of groups.values()) {
        const uniq = [...new Set(line)].sort((a, b) => a - b)
        for (let k = 1; k < uniq.length; k++) gaps.push(uniq[k] - uniq[k - 1])
      }
      if (!gaps.length) return 1
      gaps.sort((a, b) => a - b)
      const median = gaps[Math.floor(gaps.length / 2)]
      const kept = gaps.filter((g) => g <= median * 1.5)
      return kept.reduce((a, b) => a + b, 0) / kept.length || 1
    }

    const byRow = new Map<number, number[]>()
    const byCol = new Map<number, number[]>()
    for (const d of mapData.dies) {
      if (!byRow.has(d.y)) byRow.set(d.y, [])
      if (!byCol.has(d.x)) byCol.set(d.x, [])
      byRow.get(d.y)!.push(d.x)
      byCol.get(d.x)!.push(d.y)
    }

    const xs = mapData.dies.map((d) => d.x)
    const ys = mapData.dies.map((d) => d.y)
    const minX = Math.min(...xs), maxX = Math.max(...xs)
    const minY = Math.min(...ys), maxY = Math.max(...ys)

    let pw = pitchAlong(byRow)
    let ph = pitchAlong(byCol)

    // A pitch too coarse lands two dies in one cell and hides one of them.
    // Counting cells is not enough to catch that: 禾納's rows are offset from
    // each other, so the spacing measured along a row overstates the pitch and
    // 48 dies were being painted over even though the grid had room. Count the
    // actual collisions and refine until they are gone.
    const collisions = (w: number, h: number) => {
      const seen = new Set<string>()
      let hits = 0
      for (const d of mapData.dies) {
        const key = `${Math.round((maxY - d.y) / h)},${Math.round((d.x - minX) / w)}`
        if (seen.has(key)) hits++
        else seen.add(key)
      }
      return hits
    }
    for (let guard = 0; guard < 12 && collisions(pw, ph) > 0; guard++) {
      pw /= 2
      ph /= 2
    }

    const cols = Math.round((maxX - minX) / pw) + 1
    const rows = Math.round((maxY - minY) / ph) + 1
    const grid: Record<string, number> = {}
    for (const d of mapData.dies) {
      const col = Math.round((d.x - minX) / pw)
      // Y grows upward on a wafer and downward on screen.
      const row = Math.round((maxY - d.y) / ph)
      const key = `${row},${col}`
      // A failing die must never be painted over by a passing one.
      if (grid[key] === undefined || grid[key] === 1) grid[key] = d.bin
    }
    // 禾納's files carry 300 probed sites spread over the wafer rather than
    // every die, and no pitch packs a staggered sample into a dense lattice.
    // Flagged so the map can be drawn as points and say what it is, instead of
    // looking like a full map with most of it missing.
    const fill = Object.keys(grid).length / (cols * rows)
    return { grid, cols, rows, sparse: fill < 0.2 }
  }, [mapData])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 size={32} className="animate-spin text-accent" />
      </div>
    )
  }

  const renderWaferMap = () => {
    if (mapPlot) {
      const SIZE = 380
      // Each axis fills the square viewport independently. A wafer is round, so
      // this is the shape to draw even when the die itself is not square —
      // 世界先进's map is 64 columns by 50 rows and would otherwise read as an
      // oval.
      const cw = SIZE / mapPlot.cols
      const ch = SIZE / mapPlot.rows
      const gap = Math.min(cw, ch) > 4 ? Math.min(cw, ch) * 0.12 : 0
      const dieCount = Object.keys(mapPlot.grid).length
      return (
        <div className="flex flex-col gap-2">
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} role="img">
          {/* The wafer edge, so a sparsely probed map still reads as a wafer
              rather than as scattered dots. */}
          <circle
            cx={SIZE / 2} cy={SIZE / 2} r={SIZE / 2 - 1}
            fill="rgba(0,0,0,0.035)" stroke="rgba(0,0,0,0.10)" strokeWidth={1}
          />
          {Object.entries(mapPlot.grid).map(([key, bin]) => {
            const [row, col] = key.split(',').map(Number)
            const fill = bin === 1 ? 'var(--color-success)' : 'var(--color-error)'
            // A sampled map gets fixed-size points: cells scaled to a lattice
            // that is 98% empty would be a pixel wide and invisible.
            if (mapPlot.sparse) {
              return (
                <circle
                  key={key}
                  cx={col * cw + cw / 2}
                  cy={row * ch + ch / 2}
                  r={3}
                  fill={fill}
                />
              )
            }
            return (
              <rect
                key={key}
                x={col * cw + gap / 2}
                y={row * ch + gap / 2}
                width={Math.max(cw - gap, 1)}
                height={Math.max(ch - gap, 1)}
                rx={gap ? gap : 0}
                fill={fill}
              />
            )
          })}
        </svg>
        {mapPlot.sparse && (
          <p className="max-w-[380px] text-[11px] leading-snug text-text-muted">
            {t('map.sampled', { count: dieCount })}
          </p>
        )}
        </div>
      )
    }
    // No coordinates in the file: a plain circle rather than an empty box.
    const cx = 6.5, cy = 6.5, rad = 6.5
    return (
      <div className="inline-grid gap-px" style={{ gridTemplateColumns: 'repeat(14, 20px)' }}>
        {Array.from({ length: 14 }, (_, row) =>
          Array.from({ length: 14 }, (_, col) => {
            const inside = (col - cx) ** 2 + (row - cy) ** 2 <= rad * rad
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
          {isAdmin && lotDomain !== undefined && (
            <span className="bg-bg-page px-2 py-0.5 text-[11px] font-semibold text-text-secondary">
              {siteLabel(lotDomain)}
            </span>
          )}
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
        <div className="w-[560px] bg-bg-card p-5 flex flex-col gap-4">
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
                  <th className="text-right py-1 pl-3 font-medium">{t('detail.avg')}</th>
                  <th className="text-right py-1 pl-3 font-medium">{t('detail.stdev')}</th>
                  <th className="text-right py-1 pl-3 font-medium">{t('detail.min')}</th>
                  <th className="text-right py-1 pl-3 font-medium">{t('detail.max')}</th>
                  <th className="text-right py-1 pl-3 font-medium">{t('table.q1Yield')}</th>
                  <th className="text-right py-1 pl-3 font-medium">{t('table.q2Yield')}</th>
                  <th className="text-right py-1 pl-3 pr-2 font-medium">{t('table.q3Yield')}</th>
                </tr>
              </thead>
              <tbody>
                {params.map((row) => {
                  const q1 = yieldCell(row.q1Yield)
                  const q2 = yieldCell(row.q2Yield)
                  const q3 = yieldCell(row.q3Yield)
                  return (
                  <tr key={row.param} className="border-t border-border-light">
                    <td className="text-[12px] font-semibold text-text-primary py-1.5">{row.param}</td>
                    <td className="text-[12px] text-text-secondary text-right py-1.5 pl-3">{row.avg}</td>
                    <td className="text-[12px] text-text-secondary text-right py-1.5 pl-3">{row.stdev}</td>
                    <td className="text-[12px] text-text-secondary text-right py-1.5 pl-3">{row.min}</td>
                    <td className={`text-[12px] text-right py-1.5 pl-3 ${row.maxWarning ? 'text-warning font-semibold' : 'text-text-secondary'}`}>
                      {row.max}
                    </td>
                    <td className={`text-[12px] text-right py-1.5 pl-3 font-semibold ${q1.cls}`}>{q1.text}</td>
                    <td className={`text-[12px] text-right py-1.5 pl-3 font-semibold ${q2.cls}`}>{q2.text}</td>
                    <td className={`text-[12px] text-right py-1.5 pl-3 pr-2 font-semibold ${q3.cls}`}>{q3.text}</td>
                  </tr>
                  )
                })}
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
