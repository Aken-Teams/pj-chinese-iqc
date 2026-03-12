import { useTranslation } from 'react-i18next'
import PageHeader from '@/components/layout/PageHeader'
import { Sparkles, TriangleAlert, CircleX } from 'lucide-react'

const correlationParams = ['VTH', 'RDS', 'BVDS', 'IDSS', 'IGSS']
const correlationData = [
  [1.0, 0.72, 0.15, 0.08, 0.22],
  [0.72, 1.0, 0.31, 0.12, 0.18],
  [0.15, 0.31, 1.0, 0.65, 0.28],
  [0.08, 0.12, 0.65, 1.0, 0.35],
  [0.22, 0.18, 0.28, 0.35, 1.0],
]

const histogramHeights = [15, 30, 50, 70, 90, 95, 85, 60, 35, 20]

// Mock scatter data points for SPC chart — 15 points across the chart area
const scatterPoints = [
  { x: 5, y: 42 },
  { x: 11, y: 50 },
  { x: 17, y: 46 },
  { x: 23, y: 55 },
  { x: 29, y: 48 },
  { x: 35, y: 40 },
  { x: 41, y: 52 },
  { x: 47, y: 58 },
  { x: 53, y: 44 },
  { x: 59, y: 50 },
  { x: 65, y: 38 },
  { x: 71, y: 54 },
  { x: 77, y: 47 },
  { x: 83, y: 51 },
  { x: 91, y: 45 },
]

function getCellColor(value: number, isDiagonal: boolean): string {
  if (isDiagonal) return 'bg-accent text-white'
  if (value > 0.7) return 'bg-[#D4B8A8]'
  if (value >= 0.3) return 'bg-[#E8DCD0]'
  return 'bg-bar-track'
}

export default function AnalyticsPage() {
  const { t } = useTranslation('analytics')

  return (
    <div className="p-9 pl-11 flex flex-col gap-6">
      <PageHeader
        title={t('title', { defaultValue: 'Analytics & AI' })}
        actions={
          <div className="flex items-center gap-3">
            <select className="bg-bg-card border border-border-light px-3 py-2 text-sm text-text-secondary">
              <option>VTH (V)</option>
            </select>
            <select className="bg-bg-card border border-border-light px-3 py-2 text-sm text-text-secondary">
              <option>All Vendors</option>
            </select>
          </div>
        }
      />

      {/* Top Row */}
      <div className="flex gap-5">
        {/* SPC Control Chart */}
        <div className="flex-1 bg-bg-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-heading font-bold">SPC Control Chart — VTH</h3>
            <div className="flex gap-4">
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 bg-success" />
                <span className="text-[11px] text-text-secondary">Mean</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 bg-[#E8A849]" />
                <span className="text-[11px] text-text-secondary">±2σ</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 bg-error" />
                <span className="text-[11px] text-text-secondary">UCL/LCL</span>
              </div>
            </div>
          </div>

          {/* Chart Zones */}
          <div className="relative">
            {/* UCL zone */}
            <div className="h-8 bg-[#FFEBEE] flex items-center justify-end pr-3">
              <span className="text-[10px] font-semibold text-error">UCL 2.50</span>
            </div>
            {/* +2σ zone */}
            <div className="h-10 bg-[#FFF3E0] flex items-center justify-end pr-3">
              <span className="text-[10px] font-semibold text-[#E8A849]">+2σ</span>
            </div>
            {/* +1σ zone */}
            <div className="h-12 bg-[#E8F5E9]" />
            {/* Mean line */}
            <div className="h-1 bg-success flex items-center justify-end pr-3 relative">
              <span className="text-[10px] font-semibold text-success absolute -top-3 right-3">Mean 1.75</span>
            </div>
            {/* -1σ zone */}
            <div className="h-12 bg-[#E8F5E9]" />
            {/* -2σ zone */}
            <div className="h-10 bg-[#FFF3E0] flex items-center justify-end pr-3">
              <span className="text-[10px] font-semibold text-[#E8A849]">-2σ</span>
            </div>
            {/* LCL zone */}
            <div className="h-8 bg-[#FFEBEE] flex items-center justify-end pr-3">
              <span className="text-[10px] font-semibold text-error">LCL 1.00</span>
            </div>

            {/* Scatter data points overlay */}
            <div className="absolute inset-0 pointer-events-none">
              {scatterPoints.map((pt, i) => (
                <div
                  key={i}
                  className="absolute w-2 h-2 bg-accent rounded-full"
                  style={{ left: `${pt.x}%`, top: `${pt.y}%`, transform: 'translate(-50%, -50%)' }}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Right Column — same height as SPC chart */}
        <div className="w-[340px] bg-bg-card p-5 flex flex-col">
          <h3 className="font-heading font-bold mb-3">Distribution — VTH</h3>
          {/* Stats row */}
          <div className="flex gap-4 mb-4">
            <div className="flex flex-col">
              <span className="text-[10px] text-text-muted uppercase tracking-wider">Mean</span>
              <span className="text-sm font-bold text-text-primary">1.75V</span>
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] text-text-muted uppercase tracking-wider">Stdev</span>
              <span className="text-sm font-bold text-text-primary">0.12V</span>
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] text-text-muted uppercase tracking-wider">Cpk</span>
              <span className="text-sm font-bold text-success">1.85</span>
            </div>
          </div>
          {/* Histogram — stretches to fill remaining height */}
          <div className="flex items-end gap-1 flex-1">
            {histogramHeights.map((h, i) => {
              const isCenterRange = i >= 3 && i <= 6
              return (
                <div
                  key={i}
                  className={`flex-1 ${isCenterRange ? 'bg-accent' : 'bg-bar-track'}`}
                  style={{ height: `${h}%` }}
                />
              )
            })}
          </div>
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
            {/* Warning Anomaly */}
            <div className="bg-badge-warn p-3 flex items-start gap-3">
              <div className="w-8 h-8 bg-[#E8A849] flex items-center justify-center flex-shrink-0">
                <TriangleAlert size={16} className="text-white" />
              </div>
              <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="text-[12px] font-bold text-warning">Parameter Drift: VTH</span>
                  <span className="text-[10px] text-text-muted">3 hours ago</span>
                </div>
                <span className="text-[11px] text-text-secondary">
                  VTH mean has shifted +0.05V over the last 20 wafers, approaching the +2σ control limit.
                </span>
                <span className="text-[10px] font-semibold text-[#E8A849]">Confidence: 87%</span>
              </div>
            </div>

            {/* Danger Anomaly */}
            <div className="bg-badge-fail p-3 flex items-start gap-3">
              <div className="w-8 h-8 bg-error flex items-center justify-center flex-shrink-0">
                <CircleX size={16} className="text-white" />
              </div>
              <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="text-[12px] font-bold text-error">Wafer Map Pattern: Edge Cluster</span>
                  <span className="text-[10px] text-text-muted">5 hours ago</span>
                </div>
                <span className="text-[11px] text-text-secondary">
                  Detected systematic edge-cluster pattern on wafers W08–W12, suggesting potential edge-ring degradation.
                </span>
                <span className="text-[10px] font-semibold text-error">Confidence: 94%</span>
              </div>
            </div>
          </div>
        </div>

        {/* Correlation Matrix */}
        <div className="w-[400px] bg-bg-card p-5">
          <h3 className="font-heading font-bold mb-3">Parameter Correlation Matrix</h3>
          <div className="flex flex-col gap-px">
            {/* Header row */}
            <div className="flex gap-px">
              <div className="h-9 w-14" />
              {correlationParams.map((p) => (
                <div
                  key={p}
                  className="h-9 flex-1 flex items-center justify-center text-[11px] font-semibold text-text-secondary"
                >
                  {p}
                </div>
              ))}
            </div>
            {/* Data rows */}
            {correlationData.map((row, ri) => (
              <div key={ri} className="flex gap-px">
                <div className="h-9 w-14 flex items-center justify-start text-[11px] font-semibold text-text-secondary">
                  {correlationParams[ri]}
                </div>
                {row.map((val, ci) => (
                  <div
                    key={ci}
                    className={`h-9 flex-1 flex items-center justify-center text-[11px] font-semibold ${getCellColor(val, ri === ci)}`}
                  >
                    {val.toFixed(2)}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
