import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ChevronLeft, ChevronRight, Sparkles } from 'lucide-react'

// Check if a cell is inside the wafer circle (radius 6.5 centered at 6.5, 6.5)
function isInsideWafer(row: number, col: number): boolean {
  const cx = 6.5
  const cy = 6.5
  const r = 6.5
  const dx = col - cx
  const dy = row - cy
  return dx * dx + dy * dy <= r * r
}

// Check if a cell is a fail die (Bin2)
function isBin2(row: number, col: number): boolean {
  return row === 3 && col === 10
}

const electricalParams = [
  { param: 'VTH', avg: '-0.72', stdev: '0.03', min: '-0.81', max: '-0.65', maxWarning: false },
  { param: 'RDS(on)', avg: '28.5', stdev: '2.1', min: '24.2', max: '33.8', maxWarning: false },
  { param: 'BVDS', avg: '-24.3', stdev: '0.8', min: '-26.1', max: '-22.5', maxWarning: false },
  { param: 'IDSS', avg: '0.45', stdev: '0.12', min: '0.21', max: '0.78', maxWarning: true },
]

const binDistribution = [
  { label: 'Bin1', count: 203, height: 120, colorClass: 'bg-success' },
  { label: 'Bin2', count: 1, height: 4, colorClass: 'bg-text-primary' },
  { label: 'Bin3', count: 0, height: 0, colorClass: 'bg-text-primary' },
  { label: 'Bin4', count: 0, height: 0, colorClass: 'bg-text-primary' },
]

export default function ReviewDetailPage() {
  const { t } = useTranslation('review')
  const navigate = useNavigate()
  const _params = useParams()

  return (
    <div className="p-9 pl-11 flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/review')}
            className="text-text-secondary hover:text-accent cursor-pointer"
          >
            <ArrowLeft size={20} />
          </button>
          <h1 className="font-heading text-xl font-bold text-text-primary">
            {t('detail.title', { defaultValue: 'Review Detail' })} — JI30050A-250108 / W01
          </h1>
        </div>
        <div className="flex gap-2">
          <button className="bg-bg-card border border-border-light px-3 py-1.5 text-sm text-text-secondary flex items-center gap-1 hover:text-text-primary cursor-pointer">
            <ChevronLeft size={16} />
            Prev Wafer
          </button>
          <button className="bg-bg-card border border-border-light px-3 py-1.5 text-sm text-text-secondary flex items-center gap-1 hover:text-text-primary cursor-pointer">
            Next Wafer
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* Top Row */}
      <div className="flex gap-5 h-[380px]">
        {/* Wafer Map */}
        <div className="flex-1 bg-bg-card p-5 flex flex-col">
          <h3 className="font-heading font-bold mb-3">Wafer Map — W01</h3>
          <div className="flex-1 flex items-center justify-center">
            <div className="inline-grid gap-px" style={{ gridTemplateColumns: 'repeat(14, 20px)' }}>
              {Array.from({ length: 14 }, (_, row) =>
                Array.from({ length: 14 }, (_, col) => {
                  const inside = isInsideWafer(row, col)
                  const fail = isBin2(row, col)
                  let cellClass = 'bg-transparent'
                  if (inside) {
                    cellClass = fail ? 'bg-text-primary' : 'bg-success'
                  }
                  return (
                    <div
                      key={`${row}-${col}`}
                      className={`w-5 h-5 ${cellClass}`}
                    />
                  )
                })
              )}
            </div>
          </div>
          {/* Legend */}
          <div className="flex gap-4 mt-2">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 bg-success" />
              <span className="text-[11px] text-text-secondary">Bin1 Pass</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 bg-text-primary" />
              <span className="text-[11px] text-text-secondary">Bin2 Fail</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 border border-border-light" />
              <span className="text-[11px] text-text-secondary">No Die</span>
            </div>
          </div>
        </div>

        {/* Wafer Statistics */}
        <div className="w-[380px] bg-bg-card p-5 flex flex-col gap-4">
          {/* Stats grid */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col">
              <span className="text-[10px] text-text-muted uppercase tracking-wider">Total Dies</span>
              <span className="font-heading text-2xl font-bold text-text-primary">204</span>
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] text-text-muted uppercase tracking-wider">Bin1 Pass</span>
              <span className="font-heading text-2xl font-bold text-success">203</span>
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] text-text-muted uppercase tracking-wider">Bin1 Yield</span>
              <span className="font-heading text-2xl font-bold text-success">99.51%</span>
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] text-text-muted uppercase tracking-wider">Fail Count</span>
              <span className="font-heading text-2xl font-bold text-error">1</span>
            </div>
          </div>

          {/* Divider */}
          <div className="h-px bg-border-light" />

          {/* Electrical Parameters Table */}
          <div className="flex flex-col gap-2">
            <h4 className="font-heading font-bold text-sm">Electrical Parameters</h4>
            <table className="w-full">
              <thead>
                <tr className="text-[10px] text-text-muted uppercase tracking-wider">
                  <th className="text-left py-1 font-medium">Param</th>
                  <th className="text-right py-1 font-medium">Avg</th>
                  <th className="text-right py-1 font-medium">Stdev</th>
                  <th className="text-right py-1 font-medium">Min</th>
                  <th className="text-right py-1 font-medium">Max</th>
                </tr>
              </thead>
              <tbody>
                {electricalParams.map((row) => (
                  <tr key={row.param} className="border-t border-border-light">
                    <td className="text-[12px] font-semibold text-text-primary py-1.5">{row.param}</td>
                    <td className="text-[12px] text-text-secondary text-right py-1.5">{row.avg}</td>
                    <td className="text-[12px] text-text-secondary text-right py-1.5">{row.stdev}</td>
                    <td className="text-[12px] text-text-secondary text-right py-1.5">{row.min}</td>
                    <td className={`text-[12px] text-right py-1.5 ${row.maxWarning ? 'text-warning font-semibold' : 'text-text-secondary'}`}>
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
      <div className="flex gap-5 h-[200px]">
        {/* AI Review Summary */}
        <div className="flex-1 bg-bg-card p-5 overflow-hidden">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles size={16} className="text-accent" />
            <h3 className="font-heading font-bold text-sm">AI Review Summary</h3>
          </div>
          <p className="text-[13px] text-text-secondary leading-relaxed">
            W01 Bin1 良率 99.51%，整体表现良好。VTH 平均值 -0.72V 位于规格中心，分布稳定 (σ=0.03V)。边缘区域检测到 1 颗 Bin2 不良，位于 (3,10)，建议观察后续批次同位置趋势。RDS(on) 平均值 28.5Ω 在规格范围内，但 Stdev 偏高需关注。
          </p>
        </div>

        {/* Bin Distribution */}
        <div className="w-[340px] bg-bg-card p-5">
          <h3 className="font-heading font-bold text-sm mb-3">Bin Distribution</h3>
          <div className="flex items-end gap-3 h-[130px]">
            {binDistribution.map((bin) => (
              <div key={bin.label} className="flex-1 flex flex-col items-center">
                <span className="text-[11px] font-semibold text-text-secondary mb-1">{bin.count}</span>
                <div
                  className={`w-full ${bin.colorClass}`}
                  style={{ height: `${bin.height}px` }}
                />
                <span className="text-[10px] text-text-muted mt-1">{bin.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
