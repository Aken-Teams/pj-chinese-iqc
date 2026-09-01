import { useState, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import ChartTooltip from './ChartTooltip'
import type { TrendPoint } from '@/services/crossLot'

interface TrendChartProps {
  points: TrendPoint[]
  passMin?: number
  warnMin?: number
}

const VERDICT_FILL: Record<string, string> = {
  PASS: 'var(--color-success)',
  WARN: 'var(--color-warning)',
  HOLD: 'var(--color-error)',
}
const VERDICT_TONE: Record<string, 'success' | 'warning' | 'error'> = {
  PASS: 'success', WARN: 'warning', HOLD: 'error',
}

/**
 * Yield against the date the lots were tested.
 *
 * Spaced by real elapsed time rather than evenly: three lots tested in one
 * afternoon and a fourth six months later is a different picture from four
 * evenly spread lots, and evenly spaced points hide that.
 */
export default function TrendChart({ points, passMin, warnMin }: TrendChartProps) {
  const { t } = useTranslation('analysis')
  const [hover, setHover] = useState<number | null>(null)
  const wrap = useRef<HTMLDivElement>(null)

  const usable = points.filter((p) => p.date && p.bin1Yield !== null)
  if (usable.length < 2) {
    return <p className="py-10 text-center text-sm text-text-muted">{t('trend.tooFew')}</p>
  }

  const W = 900
  const H = 300
  const PAD = { top: 20, right: 62, bottom: 48, left: 58 }
  const plotW = W - PAD.left - PAD.right
  const plotH = H - PAD.top - PAD.bottom

  const times = usable.map((p) => new Date(p.date!).getTime())
  const tMin = Math.min(...times)
  const tMax = Math.max(...times)
  const tSpan = tMax - tMin || 1

  const yields = usable.map((p) => p.bin1Yield!)
  const thresholds = [passMin, warnMin].filter((v): v is number => v !== undefined)
    .map((v) => v * 100)
  const rawLo = Math.min(...yields, ...thresholds)
  const rawHi = Math.max(...yields, ...thresholds)
  const pad = (rawHi - rawLo || 1) * 0.12
  const lo = Math.max(0, rawLo - pad)
  const hi = Math.min(100, rawHi + pad)

  const toX = (ms: number) => PAD.left + ((ms - tMin) / tSpan) * plotW
  const toY = (v: number) => PAD.top + plotH - ((v - lo) / (hi - lo)) * plotH

  const pts = usable.map((p, i) => ({ ...p, x: toX(times[i]), y: toY(p.bin1Yield!) }))
  const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')

  const ticks = Array.from({ length: 4 }, (_, i) => lo + ((hi - lo) * i) / 3)
  const dateLabels = [0, Math.floor(pts.length / 2), pts.length - 1]
    .filter((v, i, a) => a.indexOf(v) === i)
    .map((i) => ({ x: pts[i].x, label: (pts[i].date ?? '').slice(0, 10) }))

  const band = (from: number, to: number, fill: string) => {
    const y1 = toY(Math.min(to, hi))
    const y2 = toY(Math.max(from, lo))
    if (y2 <= y1) return null
    return <rect x={PAD.left} y={y1} width={plotW} height={y2 - y1} fill={fill} opacity={0.35} />
  }

  const hovered = hover !== null ? pts[hover] : null
  const slot = plotW / Math.max(pts.length, 1)

  return (
    <div className="relative overflow-x-auto" ref={wrap}>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ minWidth: 620 }}
           onMouseLeave={() => setHover(null)}>
        {passMin !== undefined && band(passMin * 100, hi, 'var(--color-badge-pass)')}
        {warnMin !== undefined && passMin !== undefined
          && band(warnMin * 100, passMin * 100, 'var(--color-badge-warn)')}
        {warnMin !== undefined && band(lo, warnMin * 100, 'var(--color-badge-fail)')}

        {ticks.map((v) => (
          <g key={v}>
            <line x1={PAD.left} y1={toY(v)} x2={W - PAD.right} y2={toY(v)}
                  stroke="var(--color-border-light)" strokeDasharray="4 3" />
            <text x={PAD.left - 8} y={toY(v) + 4} textAnchor="end" fontSize="10"
                  fill="var(--color-text-muted)">{v.toFixed(1)}%</text>
          </g>
        ))}

        <path d={path} fill="none" stroke="var(--color-accent)" strokeWidth={1.6} />

        {pts.map((p, i) => (
          <g key={p.lotId} onMouseEnter={() => setHover(i)} style={{ cursor: 'pointer' }}>
            {/* A catcher wider than the dot: points can sit a few pixels apart
                when several lots were tested the same day. */}
            <rect x={p.x - slot / 2} y={PAD.top} width={Math.max(slot, 14)} height={plotH}
                  fill="transparent" />
            <circle cx={p.x} cy={p.y} r={hover === i ? 6.5 : 4}
                    fill={VERDICT_FILL[p.judgement ?? ''] ?? 'var(--color-accent)'}
                    stroke="white" strokeWidth={1.5} />
            {/* An open ring marks a point placed by upload time because the file
                carried no test date — its position on the axis is not evidence. */}
            {!p.dateIsTestDate && (
              <circle cx={p.x} cy={p.y} r={8} fill="none"
                      stroke="var(--color-text-muted)" strokeDasharray="2 2" />
            )}
          </g>
        ))}

        {dateLabels.map((d) => (
          <text key={d.label + d.x} x={d.x} y={H - PAD.bottom + 18} textAnchor="middle"
                fontSize="10" fill="var(--color-text-muted)">{d.label}</text>
        ))}
      </svg>

      {hovered && wrap.current && (
        <ChartTooltip
          boundsWidth={wrap.current.clientWidth}
          x={(hovered.x / W) * wrap.current.clientWidth}
          y={(hovered.y / H) * (wrap.current.clientHeight || H)}
          title={hovered.lot}
          subtitle={`${hovered.vendor ?? ''} / ${hovered.product ?? ''}`}
          rows={[
            { label: t('trend.date'), value: (hovered.date ?? '').slice(0, 16).replace('T', ' ') },
            { label: 'BIN1', value: `${hovered.bin1Yield}%` },
            ...(hovered.q1Yield !== null
              ? [{ label: 'Q1 (CP)', value: `${hovered.q1Yield}%` }] : []),
            { label: t('trend.wafers'), value: String(hovered.waferCount) },
            ...(hovered.judgement
              ? [{
                  label: t('trend.verdict'),
                  value: hovered.judgement,
                  tone: VERDICT_TONE[hovered.judgement] ?? ('default' as const),
                }]
              : []),
          ]}
          footer={hovered.dateIsTestDate ? undefined : t('trend.uploadTime')}
        />
      )}
    </div>
  )
}
