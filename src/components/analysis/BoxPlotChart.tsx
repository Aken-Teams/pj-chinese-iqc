import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import ChartTooltip from './ChartTooltip'
import type { BoxPlot } from '@/services/crossLot'

interface BoxPlotChartProps {
  boxes: BoxPlot[]
  paramName: string
}

/**
 * One box per lot, side by side, on a shared scale.
 *
 * This is what makes a shifted lot visible: 東部高科's three lots all pass at
 * 98.4-98.9%, so the yield trend says nothing, but 1ACX02's BVDSS_DEL1 sits a
 * full unit above its neighbours. Reading three histograms one after another
 * would not show that; three boxes on one axis does.
 */
export default function BoxPlotChart({ boxes, paramName }: BoxPlotChartProps) {
  const { t } = useTranslation('analysis')
  const [hover, setHover] = useState<number | null>(null)

  if (!boxes.length) {
    return <p className="py-10 text-center text-sm text-text-muted">{t('box.empty')}</p>
  }

  const W = 900
  const H = 380
  const PAD = { top: 26, right: 78, bottom: 58, left: 72 }
  const plotW = W - PAD.left - PAD.right
  const plotH = H - PAD.top - PAD.bottom

  // Limits join the data in setting the scale: a limit off the top of the chart
  // cannot warn anyone.
  const candidates = boxes.flatMap((b) => [
    b.whiskerLow, b.whiskerHigh, ...b.outliers,
    ...(b.lower !== null ? [b.lower] : []),
    ...(b.upper !== null ? [b.upper] : []),
  ])
  const rawMin = Math.min(...candidates)
  const rawMax = Math.max(...candidates)
  const pad = (rawMax - rawMin || 1) * 0.08
  const lo = rawMin - pad
  const hi = rawMax + pad
  const toY = (v: number) => PAD.top + plotH - ((v - lo) / (hi - lo)) * plotH

  const slot = plotW / boxes.length
  const boxW = Math.min(52, slot * 0.5)
  const centre = (i: number) => PAD.left + slot * (i + 0.5)

  const ticks = Array.from({ length: 5 }, (_, i) => lo + ((hi - lo) * i) / 4)
  const fmt = (v: number | null) =>
    v === null ? '—'
      : Math.abs(v) >= 10000 || (Math.abs(v) !== 0 && Math.abs(v) < 0.01)
        ? v.toExponential(3)
        : v.toFixed(Math.abs(v) < 10 ? 4 : 2)

  // Spec limits are only drawn across the whole chart when every box agrees on
  // them. Comparing two products means two sets of limits, and one line drawn
  // from the first box would be wrong for the rest — so those get a tick beside
  // their own box instead.
  const sameLimits = (key: 'lower' | 'upper') => {
    const vals = boxes.map((b) => b[key])
    return vals.every((v) => v !== null && v === vals[0]) ? (vals[0] as number) : null
  }
  const sharedLower = sameLimits('lower')
  const sharedUpper = sameLimits('upper')

  const hovered = hover !== null ? boxes[hover] : null

  return (
    <div className="relative overflow-x-auto">
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ minWidth: 620 }}
           onMouseLeave={() => setHover(null)}>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={PAD.left} y1={toY(v)} x2={W - PAD.right} y2={toY(v)}
                  stroke="var(--color-border-light)" strokeDasharray="4 3" />
            <text x={PAD.left - 8} y={toY(v) + 4} textAnchor="end" fontSize="10"
                  fill="var(--color-text-muted)">{fmt(v)}</text>
          </g>
        ))}

        {sharedLower !== null && sharedLower >= lo && sharedLower <= hi && (
          <g>
            <line x1={PAD.left} y1={toY(sharedLower)} x2={W - PAD.right} y2={toY(sharedLower)}
                  stroke="var(--color-error)" strokeWidth={1} strokeDasharray="6 3" opacity={0.7} />
            <text x={W - PAD.right + 6} y={toY(sharedLower) + 4} fontSize="10"
                  fill="var(--color-error)">LSL</text>
          </g>
        )}
        {sharedUpper !== null && sharedUpper >= lo && sharedUpper <= hi && (
          <g>
            <line x1={PAD.left} y1={toY(sharedUpper)} x2={W - PAD.right} y2={toY(sharedUpper)}
                  stroke="var(--color-error)" strokeWidth={1} strokeDasharray="6 3" opacity={0.7} />
            <text x={W - PAD.right + 6} y={toY(sharedUpper) + 4} fontSize="10"
                  fill="var(--color-error)">USL</text>
          </g>
        )}

        {boxes.map((b, i) => {
          const cx = centre(i)
          const outOfSpec =
            (b.lower !== null && b.q1 < b.lower) || (b.upper !== null && b.q3 > b.upper)
          const stroke = outOfSpec ? 'var(--color-error)' : 'var(--color-accent)'
          const active = hover === i
          return (
            <g key={b.lotId} onMouseEnter={() => setHover(i)} style={{ cursor: 'pointer' }}>
              {/* A full-height catcher so the pointer does not have to land on
                  the box itself, which can be only a few pixels tall. */}
              <rect x={cx - slot / 2} y={PAD.top} width={slot} height={plotH}
                    fill={active ? 'var(--color-bg-page)' : 'transparent'} opacity={0.6} />

              {/* Each box's own limits, where they differ between lots. */}
              {sharedLower === null && b.lower !== null && b.lower >= lo && b.lower <= hi && (
                <line x1={cx - boxW * 0.8} y1={toY(b.lower)} x2={cx + boxW * 0.8} y2={toY(b.lower)}
                      stroke="var(--color-error)" strokeWidth={1} strokeDasharray="4 2" opacity={0.8} />
              )}
              {sharedUpper === null && b.upper !== null && b.upper >= lo && b.upper <= hi && (
                <line x1={cx - boxW * 0.8} y1={toY(b.upper)} x2={cx + boxW * 0.8} y2={toY(b.upper)}
                      stroke="var(--color-error)" strokeWidth={1} strokeDasharray="4 2" opacity={0.8} />
              )}

              <line x1={cx} y1={toY(b.whiskerHigh)} x2={cx} y2={toY(b.q3)} stroke={stroke} />
              <line x1={cx} y1={toY(b.q1)} x2={cx} y2={toY(b.whiskerLow)} stroke={stroke} />
              <line x1={cx - boxW / 4} y1={toY(b.whiskerHigh)} x2={cx + boxW / 4}
                    y2={toY(b.whiskerHigh)} stroke={stroke} />
              <line x1={cx - boxW / 4} y1={toY(b.whiskerLow)} x2={cx + boxW / 4}
                    y2={toY(b.whiskerLow)} stroke={stroke} />
              <rect x={cx - boxW / 2} y={toY(b.q3)} width={boxW}
                    height={Math.max(toY(b.q1) - toY(b.q3), 1)}
                    fill={stroke} fillOpacity={active ? 0.3 : 0.16}
                    stroke={stroke} strokeWidth={active ? 1.6 : 1} />
              <line x1={cx - boxW / 2} y1={toY(b.median)} x2={cx + boxW / 2}
                    y2={toY(b.median)} stroke={stroke} strokeWidth={2} />
              {b.outliers.map((o, k) => (
                <circle key={k} cx={cx} cy={toY(o)} r={1.6} fill={stroke} opacity={0.5} />
              ))}
              <text x={cx} y={H - PAD.bottom + 18} textAnchor="middle" fontSize="10"
                    fill="var(--color-text-secondary)">
                {b.lot.length > 12 ? `${b.lot.slice(0, 11)}…` : b.lot}
              </text>
              <text x={cx} y={H - PAD.bottom + 32} textAnchor="middle" fontSize="9"
                    fill="var(--color-text-muted)">
                {(b.date ?? '').slice(0, 10)}
              </text>
            </g>
          )
        })}

        <text x={PAD.left} y={16} fontSize="11" fill="var(--color-text-tertiary)">
          {paramName}{boxes[0]?.unit ? ` (${boxes[0].unit})` : ''}
        </text>
      </svg>

      {hovered && hover !== null && (
        <ChartTooltip
          xPct={(centre(hover) / W) * 100}
          yPct={(toY(hovered.median) / H) * 100}
          title={hovered.lot}
          subtitle={`${hovered.vendor ?? ''} / ${hovered.product ?? ''} · ${(hovered.date ?? '').slice(0, 10)}`}
          // Paired rather than one line per statistic: ten rows made the card
          // taller than the box it described.
          rows={[
            { label: t('box.median'), value: fmt(hovered.median) },
            { label: 'Q1 – Q3', value: `${fmt(hovered.q1)} – ${fmt(hovered.q3)}` },
            { label: t('box.range'), value: `${fmt(hovered.min)} – ${fmt(hovered.max)}` },
            { label: t('box.meanSd'), value: `${fmt(hovered.mean)} ± ${fmt(hovered.stdev)}`, tone: 'muted' },
            ...(hovered.lower !== null || hovered.upper !== null
              ? [{ label: t('box.spec'), value: `${fmt(hovered.lower)} – ${fmt(hovered.upper)}`, tone: 'muted' as const }]
              : []),
          ]}
          footer={t('box.footer', {
            n: hovered.n.toLocaleString(), outliers: hovered.outlierCount,
          })}
        />
      )}
    </div>
  )
}
