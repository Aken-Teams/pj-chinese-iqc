import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import ChartTooltip from './ChartTooltip'
import type { SpcSeries } from '@/services/crossLot'

interface SpcChartProps {
  spc: SpcSeries
  paramName: string
  unit?: string | null
}

const OOC_COLOR: Record<string, string> = {
  ucl: 'var(--color-error)',
  lcl: 'var(--color-error)',
  run: 'var(--color-warning)',
  trend: '#7c5cbf',
}

/**
 * X-bar control chart: one point per wafer, in test order.
 *
 * Distinct from the yield trend beside it. That one asks whether a lot met the
 * site's acceptance threshold; this one asks whether the process is behaving,
 * with limits derived from the data itself rather than from a target. A run of
 * wafers can sit inside spec and still be drifting, which is what the run and
 * trend rules catch — on 東部高科's three lots they flag the shift the box plot
 * shows, while every lot passes on yield.
 *
 * The rules are the ones on the requirement's own legend: beyond 3σ, seven
 * points on one side of the mean, six points moving in one direction.
 */
export default function SpcChart({ spc, paramName, unit }: SpcChartProps) {
  const { t } = useTranslation('analysis')
  const [hover, setHover] = useState<number | null>(null)

  const points = spc.dataPoints
  if (points.length < 2) {
    return <p className="py-10 text-center text-sm text-text-muted">{t('spc.tooFew')}</p>
  }

  const W = 900
  const H = 360
  const PAD = { top: 18, right: 74, bottom: 46, left: 68 }
  const plotW = W - PAD.left - PAD.right
  const plotH = H - PAD.top - PAD.bottom

  const values = points.map((p) => p.value)
  const lo = Math.min(...values, spc.lcl)
  const hi = Math.max(...values, spc.ucl)
  const pad = (hi - lo || 1) * 0.1
  const yLo = lo - pad
  const yHi = hi + pad
  const toY = (v: number) => PAD.top + plotH - ((v - yLo) / (yHi - yLo)) * plotH
  const toX = (i: number) => PAD.left + (i / Math.max(points.length - 1, 1)) * plotW

  const fmt = (v: number) =>
    Math.abs(v) >= 10000 || (Math.abs(v) !== 0 && Math.abs(v) < 0.01)
      ? v.toExponential(3)
      : v.toFixed(4)

  const path = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${toX(i).toFixed(1)} ${toY(p.value).toFixed(1)}`)
    .join(' ')

  // Bands rather than lines alone: a point's zone should be readable from where
  // it sits, without measuring it against a legend.
  const band = (from: number, to: number, fill: string) => {
    const y1 = toY(Math.min(to, yHi))
    const y2 = toY(Math.max(from, yLo))
    if (y2 <= y1) return null
    return <rect x={PAD.left} y={y1} width={plotW} height={y2 - y1} fill={fill} opacity={0.5} />
  }

  const limit = (v: number, label: string, colour: string, dash: string) => (
    <g key={label}>
      <line x1={PAD.left} y1={toY(v)} x2={W - PAD.right} y2={toY(v)}
            stroke={colour} strokeWidth={1} strokeDasharray={dash} />
      <text x={W - PAD.right + 5} y={toY(v) + 4} fontSize="9.5" fill={colour}>
        {label} {fmt(v)}
      </text>
    </g>
  )

  // A label per wafer would overlap immediately; the ends and the middle are
  // enough to place the series in time.
  const dateLabels = [0, Math.floor(points.length / 2), points.length - 1]
    .filter((v, i, a) => a.indexOf(v) === i)
    .map((i) => ({ x: toX(i), label: (spc.labels[i]?.date ?? '').slice(0, 10) }))

  const hovered = hover !== null ? points[hover] : null
  const hoveredLabel = hover !== null ? spc.labels[hover] : null
  const slot = plotW / Math.max(points.length, 1)

  return (
    <div className="relative overflow-x-auto">
      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-text-muted">
        <Legend colour="var(--color-accent)" label={t('spc.mean')} />
        <Legend colour="var(--color-badge-warn)" label="±2σ" />
        <Legend colour="var(--color-error)" label="UCL / LCL" />
        <Legend colour={OOC_COLOR.run} label={t('spc.rule.run')} />
        <Legend colour={OOC_COLOR.trend} label={t('spc.rule.trend')} />
      </div>

      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ minWidth: 620 }}
           onMouseLeave={() => setHover(null)}>
        {band(spc.lcl, spc.ucl, 'var(--color-badge-warn)')}
        {band(spc.sigma2Lower, spc.sigma2Upper, 'var(--color-badge-pass)')}
        {band(yLo, spc.lcl, 'var(--color-badge-fail)')}
        {band(spc.ucl, yHi, 'var(--color-badge-fail)')}

        {limit(spc.ucl, 'UCL', 'var(--color-error)', '5 3')}
        {limit(spc.sigma2Upper, '+2σ', 'var(--color-warning)', '3 3')}
        {limit(spc.grandMean, t('spc.mean'), 'var(--color-accent)', '')}
        {limit(spc.sigma2Lower, '−2σ', 'var(--color-warning)', '3 3')}
        {limit(spc.lcl, 'LCL', 'var(--color-error)', '5 3')}

        <text x={PAD.left - 8} y={toY(yHi) + 10} textAnchor="end" fontSize="9.5"
              fill="var(--color-text-muted)">{fmt(yHi)}</text>
        <text x={PAD.left - 8} y={toY(yLo)} textAnchor="end" fontSize="9.5"
              fill="var(--color-text-muted)">{fmt(yLo)}</text>

        <path d={path} fill="none" stroke="var(--color-accent)" strokeWidth={0.8} opacity={0.45} />

        {points.map((p, i) => (
          <g key={spc.labels[i]?.key ?? i} onMouseEnter={() => setHover(i)}
             style={{ cursor: 'pointer' }}>
            <rect x={toX(i) - slot / 2} y={PAD.top} width={Math.max(slot, 8)} height={plotH}
                  fill="transparent" />
            <circle cx={toX(i)} cy={toY(p.value)} r={hover === i ? 5 : p.isOoc ? 3.4 : 2.6}
                    fill={p.isOoc ? OOC_COLOR[p.oocReason ?? 'ucl'] : 'var(--color-accent)'}
                    opacity={p.isOoc ? 1 : 0.75} />
          </g>
        ))}

        {dateLabels.map((d) => (
          <text key={d.label + d.x} x={d.x} y={H - PAD.bottom + 18} textAnchor="middle"
                fontSize="10" fill="var(--color-text-muted)">{d.label}</text>
        ))}

        <text x={PAD.left} y={12} fontSize="11" fill="var(--color-text-tertiary)">
          {paramName}{unit ? ` (${unit})` : ''}
        </text>
      </svg>

      {hovered && hoveredLabel && (
        <ChartTooltip
          xPct={(toX(hover!) / W) * 100}
          yPct={(toY(hovered.value) / H) * 100}
          title={`${hoveredLabel.lot} · ${hoveredLabel.wafer}`}
          subtitle={(hoveredLabel.date ?? '').slice(0, 10)}
          rows={[
            { label: t('spc.value'), value: fmt(hovered.value) },
            { label: t('spc.mean'), value: fmt(spc.grandMean), tone: 'muted' },
            { label: 'UCL / LCL', value: `${fmt(spc.ucl)} / ${fmt(spc.lcl)}`, tone: 'muted' },
          ]}
          footer={hovered.isOoc
            ? t(`spc.rule.${hovered.oocReason}`)
            : t('spc.inControl')}
        />
      )}
    </div>
  )
}

function Legend({ colour, label }: { colour: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="inline-block h-2.5 w-2.5" style={{ backgroundColor: colour }} />
      {label}
    </span>
  )
}
