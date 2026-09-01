import type { ReactNode } from 'react'

export interface TooltipRow {
  label: string
  value: string
  /** Renders the value in the accent or a status colour. */
  tone?: 'default' | 'success' | 'warning' | 'error' | 'muted'
}

interface ChartTooltipProps {
  x: number
  y: number
  title: string
  subtitle?: string
  rows: TooltipRow[]
  footer?: ReactNode
  /** Container width, so a tooltip near the right edge flips to the left. */
  boundsWidth: number
}

const TONE: Record<string, string> = {
  default: 'text-text-primary',
  success: 'text-success',
  warning: 'text-warning',
  error: 'text-error',
  muted: 'text-text-muted',
}

const WIDTH = 210

/**
 * The hover card for the charts on this page.
 *
 * Replaces the SVG `<title>` element the charts started with: that renders as
 * the browser's own tooltip, which waits a second before appearing, cannot be
 * styled, and drops every line break on some platforms — so a five-line summary
 * arrived as one run-on string.
 *
 * Positioned by the caller in container coordinates and flipped near the right
 * edge so it never leaves the panel.
 */
export default function ChartTooltip({
  x, y, title, subtitle, rows, footer, boundsWidth,
}: ChartTooltipProps) {
  const flip = x + WIDTH + 16 > boundsWidth
  return (
    <div
      className="pointer-events-none absolute z-20 border border-border-light bg-white px-3 py-2 shadow-md"
      style={{
        width: WIDTH,
        left: flip ? undefined : x + 12,
        right: flip ? boundsWidth - x + 12 : undefined,
        top: Math.max(4, y - 12),
      }}
    >
      <div className="font-heading text-[13px] font-bold text-text-primary">{title}</div>
      {subtitle && <div className="mt-0.5 text-[11px] text-text-muted">{subtitle}</div>}
      <div className="mt-1.5 flex flex-col gap-0.5">
        {rows.map((r) => (
          <div key={r.label} className="flex items-baseline justify-between gap-3">
            <span className="text-[11px] text-text-tertiary">{r.label}</span>
            <span className={`text-[12px] font-semibold tabular-nums ${TONE[r.tone ?? 'default']}`}>
              {r.value}
            </span>
          </div>
        ))}
      </div>
      {footer && <div className="mt-1.5 text-[11px] text-text-muted">{footer}</div>}
    </div>
  )
}
