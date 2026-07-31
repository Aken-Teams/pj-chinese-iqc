import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import PageHeader from '@/components/layout/PageHeader'
import { Sparkles, TrendingUp, TrendingDown, Loader2 } from 'lucide-react'
import { getDashboard, type DashboardData, type TrendPeriod } from '@/services/dashboard'
import { useAuthStore } from '@/store/authStore'
import { SITE_LABELS, siteLabel } from '@/config/sites'

const PERIODS: TrendPeriod[] = ['14d', '30d', '6m']

interface HoveredBar {
  vendorName: string
  color: string
  label: string
  value: number
  left: number
  top: number
}

export default function DashboardPage() {
  const { t, i18n } = useTranslation('dashboard')
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const isAdmin = user?.role === 'admin'
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState<TrendPeriod>('14d')
  // Admin can scope the whole dashboard to one site ('' = all sites).
  const [site, setSite] = useState('')
  const [hiddenVendors, setHiddenVendors] = useState<Set<string>>(new Set())
  const [hovered, setHovered] = useState<HoveredBar | null>(null)
  const plotRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const res = await getDashboard(i18n.language, period, site)
          if (cancelled) return
          setData(res)
          setLoading(false)
          return
        } catch {
          if (cancelled) return
          if (attempt < 2) await new Promise(r => setTimeout(r, 2000))
        }
      }
      if (!cancelled) setLoading(false)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [period, i18n.language, site])

  const toggleVendor = (name: string) => {
    setHiddenVendors(prev => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 size={32} className="animate-spin text-accent" />
      </div>
    )
  }

  if (!data) {
    return (
      <div className="p-6 pl-8 flex flex-col gap-4">
        <PageHeader title={t('title')} />
        <div className="text-center text-text-muted py-16">
          {t('noData')}
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 pl-8 flex flex-col gap-4">
      <PageHeader
        title={t('title')}
        actions={
          isAdmin ? (
            <select
              className="bg-bg-card border border-border-light px-3 py-2 text-sm text-text-primary outline-none focus:border-accent cursor-pointer"
              value={site}
              onChange={(e) => setSite(e.target.value)}
            >
              <option value="">{t('allSites')}</option>
              {Object.keys(SITE_LABELS).map((code) => (
                <option key={code} value={code}>{siteLabel(code)}</option>
              ))}
            </select>
          ) : (
            user?.domain ? (
              <span className="border border-border-light bg-bg-page px-3 py-2 text-sm font-semibold text-text-secondary">
                {siteLabel(user.domain)}
              </span>
            ) : undefined
          )
        }
      />

      {/* KPI Cards */}
      <div className="flex gap-3">
        {data.kpis.map((kpi, i) => (
          <div key={i} className="flex-1 bg-bg-card p-3 px-4 flex flex-col gap-0.5">
            <span className="text-[10px] font-bold text-text-tertiary tracking-[1px] uppercase">
              {t(kpi.labelKey)}
            </span>
            <span className="font-heading text-[22px] font-bold text-text-primary leading-tight">
              {kpi.value}
            </span>
            <span className={`text-[11px] font-semibold flex items-center gap-1 ${
              kpi.deltaType === 'positive' ? 'text-success' :
              kpi.deltaType === 'negative' ? 'text-error' : 'text-accent'
            }`}>
              {kpi.deltaType === 'positive' ? <TrendingUp size={12} /> :
               kpi.deltaType === 'negative' ? <TrendingDown size={12} /> : null}
              {kpi.delta}
            </span>
          </div>
        ))}
      </div>

      {/* Charts Row */}
      <div className="flex gap-4">
        {/* Yield Trend Chart */}
        <div className="flex-1 bg-bg-card p-5 flex flex-col min-w-0">
          <div className="flex items-center justify-between mb-3 shrink-0 gap-2">
            <h3 className="font-heading text-sm font-bold">{t('yieldTrend')}</h3>
            <div className="flex items-center gap-0.5 bg-bar-track p-0.5">
              {PERIODS.map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={`px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                    period === p
                      ? 'bg-bg-card text-text-primary'
                      : 'text-text-muted hover:text-text-secondary'
                  }`}
                >
                  {t(`trendPeriod.${p}`)}
                </button>
              ))}
            </div>
          </div>
          {data.yieldTrend.months.length > 0 ? (() => {
            const allVendors = data.yieldTrend.vendors
            const months = data.yieldTrend.months
            const visibleVendors = allVendors.filter(v => !hiddenVendors.has(v.name))
            // Dynamic Y-axis: floor min value to nearest 5, ceiling at 100
            const allVals = visibleVendors
              .flatMap(v => v.data)
              .filter((v): v is number => v !== null)
            const minVal = allVals.length > 0 ? Math.min(...allVals) : 95
            const yMin = Math.max(0, Math.floor(minVal / 5) * 5)
            const yMax = 100
            const yMid = Math.round((yMin + yMax) / 2)

            // Percent-based Y mapping (for target line + grid)
            const yPct = (v: number) =>
              (1 - (v - yMin) / (yMax - yMin)) * 100
            const barHeightPct = (v: number) =>
              Math.max(0, ((v - yMin) / (yMax - yMin)) * 100)

            const hasTarget = 99 >= yMin && 99 < yMax

            // X-axis label step: show ~6-7 labels max
            const labelStep = Math.max(1, Math.ceil(months.length / 7))

            return (
            <>
              <div className="flex flex-1 gap-2 min-h-0">
                {/* Y-axis labels */}
                <div className="flex flex-col justify-between items-end pb-5 shrink-0">
                  <span className="text-[9px] text-text-muted">{yMax}%</span>
                  <span className="text-[9px] text-text-muted">{yMid}%</span>
                  <span className="text-[9px] text-text-muted">{yMin}%</span>
                </div>
                {/* Plot + X labels */}
                <div className="flex-1 flex flex-col min-w-0">
                  <div ref={plotRef} className="relative flex-1 min-h-0">
                    {/* Grid (below bars) */}
                    <svg
                      viewBox="0 0 100 100"
                      preserveAspectRatio="none"
                      className="absolute inset-0 w-full h-full pointer-events-none"
                    >
                      {[0, 50, 100].map((y) => (
                        <line
                          key={`grid-${y}`}
                          x1="0"
                          y1={y}
                          x2="100"
                          y2={y}
                          stroke="currentColor"
                          strokeOpacity="0.08"
                          strokeWidth="1"
                          vectorEffect="non-scaling-stroke"
                        />
                      ))}
                    </svg>
                    {/* Grouped bars */}
                    <div className="absolute inset-0 flex items-end gap-[2px] px-[2px]">
                      {months.map((m, i) => (
                        <div
                          key={`col-${i}`}
                          className="flex-1 flex items-end justify-center gap-[1px] h-full min-w-0"
                        >
                          {visibleVendors.length === 0 ? (
                            <div className="flex-1 h-0" />
                          ) : (
                            visibleVendors.map((v) => {
                              const val = v.data[i]
                              if (val === null || val === undefined) {
                                return <div key={v.name} className="flex-1 h-0" />
                              }
                              const h = barHeightPct(val)
                              const isHot =
                                hovered?.vendorName === v.name && hovered?.label === m
                              return (
                                <div
                                  key={v.name}
                                  className="flex-1 cursor-pointer transition-opacity"
                                  style={{
                                    height: `${h}%`,
                                    background: v.color,
                                    opacity: hovered && !isHot ? 0.55 : 1,
                                  }}
                                  onMouseEnter={(e) => {
                                    const plotRect = plotRef.current?.getBoundingClientRect()
                                    if (!plotRect) return
                                    const r = e.currentTarget.getBoundingClientRect()
                                    setHovered({
                                      vendorName: v.name,
                                      color: v.color,
                                      label: m,
                                      value: val,
                                      left:
                                        ((r.left + r.width / 2 - plotRect.left) /
                                          plotRect.width) *
                                        100,
                                      top:
                                        ((r.top - plotRect.top) / plotRect.height) * 100,
                                    })
                                  }}
                                  onMouseLeave={() => setHovered(null)}
                                />
                              )
                            })
                          )}
                        </div>
                      ))}
                    </div>
                    {/* Target line (above bars) */}
                    {hasTarget && (
                      <svg
                        viewBox="0 0 100 100"
                        preserveAspectRatio="none"
                        className="absolute inset-0 w-full h-full pointer-events-none z-10"
                      >
                        <line
                          x1="0"
                          y1={yPct(99)}
                          x2="100"
                          y2={yPct(99)}
                          stroke="#C05A3C"
                          strokeWidth="2"
                          strokeDasharray="8 4"
                          strokeOpacity="1"
                          vectorEffect="non-scaling-stroke"
                        />
                      </svg>
                    )}
                    {/* Tooltip */}
                    {hovered && (
                      <div
                        className="absolute z-20 pointer-events-none bg-bg-card border border-border-light shadow-lg px-2.5 py-1.5 -translate-x-1/2 whitespace-nowrap"
                        style={{
                          left: `${Math.max(6, Math.min(94, hovered.left))}%`,
                          top: `${hovered.top}%`,
                          transform: 'translate(-50%, calc(-100% - 6px))',
                        }}
                      >
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <div
                            className="w-2 h-2 shrink-0"
                            style={{ background: hovered.color }}
                          />
                          <span className="text-[10px] font-semibold text-text-primary">
                            {hovered.vendorName}
                          </span>
                        </div>
                        <div className="text-[9px] text-text-muted leading-tight">
                          {hovered.label}
                        </div>
                        <div
                          className="font-heading text-[13px] font-bold tabular-nums leading-tight"
                          style={{
                            color: hovered.value >= 99 ? '#4A7C59' : '#C05A3C',
                          }}
                        >
                          {hovered.value.toFixed(2)}%
                        </div>
                      </div>
                    )}
                    {/* Target label */}
                    {hasTarget && (
                      <span
                        className="absolute z-10 text-[10px] font-bold text-white pointer-events-none px-1.5 py-0.5 leading-none tabular-nums"
                        style={{
                          top: `${yPct(99)}%`,
                          right: 0,
                          transform: 'translateY(-50%)',
                          background: '#C05A3C',
                        }}
                      >
                        {t('target')} ≥99%
                      </span>
                    )}
                  </div>
                  {/* X-axis labels (auto-thinned) */}
                  <div className="flex mt-1 shrink-0 px-[2px] gap-[2px]">
                    {months.map((m, i) => (
                      <div
                        key={`x-${i}`}
                        className="flex-1 text-center text-[10px] text-text-muted whitespace-nowrap overflow-hidden min-w-0"
                      >
                        {i % labelStep === 0 || i === months.length - 1 ? m : ''}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              {/* Bottom: interactive legend with latest values */}
              <div className="mt-3 pt-3 border-t border-border-light flex flex-wrap items-center gap-x-3 gap-y-2 shrink-0">
                {allVendors.map((v) => {
                  // Find the most recent non-null value for this vendor
                  let latest: number | null = null
                  for (let i = v.data.length - 1; i >= 0; i--) {
                    if (v.data[i] !== null) {
                      latest = v.data[i]
                      break
                    }
                  }
                  const isHidden = hiddenVendors.has(v.name)
                  return (
                    <button
                      key={v.name}
                      onClick={() => toggleVendor(v.name)}
                      className={`flex items-center gap-1.5 px-1.5 py-0.5 transition-opacity cursor-pointer ${
                        isHidden ? 'opacity-40 hover:opacity-60' : 'hover:opacity-80'
                      }`}
                      title={isHidden ? 'Show' : 'Hide'}
                    >
                      <div
                        className={`w-2.5 h-2.5 shrink-0 ${isHidden ? 'border border-current bg-transparent' : ''}`}
                        style={isHidden ? { borderColor: v.color } : { background: v.color }}
                      />
                      <span className="text-[11px] text-text-secondary">{v.name}</span>
                      {latest !== null && (
                        <span
                          className={`font-heading text-[14px] font-bold leading-none tabular-nums ${
                            isHidden
                              ? 'text-text-muted'
                              : latest >= 99
                              ? 'text-success'
                              : 'text-error'
                          }`}
                        >
                          {latest.toFixed(1)}%
                        </span>
                      )}
                    </button>
                  )
                })}
                <div className="ml-auto flex items-center gap-1.5">
                  <span className="text-[10px] text-text-muted">{t('target')}</span>
                  <span className="font-heading text-[14px] font-bold leading-none text-text-tertiary tabular-nums">
                    ≥99.0%
                  </span>
                </div>
              </div>
            </>
            )
          })() : (
            <div className="flex-1 flex items-center justify-center text-text-muted text-sm">
              {t('noTrendData')}
            </div>
          )}
        </div>

        {/* Right Column */}
        <div className="w-[280px] flex flex-col gap-4">
          {/* Vendor Performance */}
          <div className="bg-bg-card p-4 flex flex-col gap-3">
            <h3 className="font-heading text-sm font-bold">{t('vendorPerformance')}</h3>
            {data.vendorPerf.length > 0 ? data.vendorPerf.map((v, i) => (
              <div key={i} className="flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`w-5 h-5 flex items-center justify-center text-[10px] font-bold text-white ${
                      i === 0 ? 'bg-accent' : 'bg-text-muted'
                    }`}>{i + 1}</span>
                    <span className="text-[12px] font-semibold text-text-primary">{v.name}</span>
                  </div>
                  <span className="text-[12px] font-bold text-text-primary">{v.yield}%</span>
                </div>
                <div className="h-1.5 bg-bar-track w-full">
                  <div
                    className="h-full"
                    style={{
                      width: `${Math.max(Math.min(v.yield, 100), 0)}%`,
                      background: v.yield >= 99 ? '#4A7C59' : '#C05A3C',
                    }}
                  />
                </div>
              </div>
            )) : (
              <p className="text-text-muted text-[12px]">{t('noVendorData')}</p>
            )}
          </div>

          {/* AI Insights */}
          <div className="bg-bg-card p-4 flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <Sparkles size={14} className="text-accent" />
              <h3 className="font-heading text-sm font-bold">{t('aiInsights')}</h3>
            </div>
            {data.aiInsights.length > 0 ? data.aiInsights.map((insight, i) => (
              <div key={i} className={`p-2.5 flex flex-col gap-0.5 ${
                insight.severity === 'warning' ? 'bg-badge-warn' :
                insight.severity === 'danger' ? 'bg-badge-fail' : 'bg-badge-pass'
              }`}>
                <span className={`text-[11px] font-bold ${
                  insight.severity === 'warning' ? 'text-warning' :
                  insight.severity === 'danger' ? 'text-error' : 'text-success'
                }`}>{insight.title}</span>
                <span className="text-[11px] text-text-secondary leading-snug">{insight.description}</span>
              </div>
            )) : (
              <p className="text-text-muted text-[12px]">{t('noInsights')}</p>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Row */}
      <div className="flex gap-4">
        {/* Recent Activity */}
        <div className="flex-1 bg-bg-card p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-heading text-sm font-bold">{t('recentActivity')}</h3>
            <button
              onClick={() => navigate('/history')}
              className="text-[11px] text-accent font-semibold hover:underline cursor-pointer"
            >
              {t('actions.viewAll', { ns: 'common' })}
            </button>
          </div>
          <div className="flex flex-col">
            {data.recentActivity.length > 0 ? data.recentActivity.map((act, i) => (
              <div key={i} className={`flex items-center justify-between py-2 ${
                i > 0 ? 'border-t border-border-light' : ''
              }`}>
                <div className="flex flex-col">
                  <span className="text-[12px] text-text-primary">{act.action}</span>
                  <span className="text-[11px] text-text-muted">{act.user}</span>
                </div>
                <span className="text-[11px] text-text-muted whitespace-nowrap ml-4">{act.time}</span>
              </div>
            )) : (
              <p className="text-text-muted text-[12px] py-2">{t('noActivity')}</p>
            )}
          </div>
        </div>

        {/* Cpk Panel */}
        <div className="w-[280px] bg-bg-card p-4 flex flex-col gap-2">
          <h3 className="font-heading text-sm font-bold">{t('cpk')}</h3>
          {data.cpkData.length > 0 ? (() => {
            const maxCpk = Math.max(...data.cpkData.map(d => d.value))
            const scale = Math.ceil(maxCpk / 5) * 5 // round up to nearest 5
            const refPct = (1.33 / scale) * 100
            return (
              <div className="flex flex-col gap-2">
                {/* Scale reference */}
                <div className="flex items-center justify-between text-[9px] text-text-muted">
                  <span>0</span>
                  <span>Cpk 1.33</span>
                  <span>{scale}</span>
                </div>
                {data.cpkData.map((item, i) => (
                  <div key={i} className="flex flex-col gap-0.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-medium text-text-secondary truncate mr-2">{item.param}</span>
                      <span className={`text-[11px] font-bold whitespace-nowrap ${
                        item.value >= 1.33 ? 'text-success' : item.value >= 1.0 ? 'text-warning' : 'text-error'
                      }`}>{item.value.toFixed(2)}</span>
                    </div>
                    <div className="relative h-2 bg-bar-track w-full">
                      {/* 1.33 reference line */}
                      <div
                        className="absolute top-0 h-full w-px bg-text-muted/40 z-10"
                        style={{ left: `${refPct}%` }}
                      />
                      <div
                        className="h-full relative z-0"
                        style={{
                          width: `${Math.min((item.value / scale) * 100, 100)}%`,
                          background: item.value >= 1.33 ? '#4A7C59' : item.value >= 1.0 ? '#C05A3C' : '#B54A4A',
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )
          })() : (
            <p className="text-text-muted text-[12px]">{t('noCpkData')}</p>
          )}
        </div>
      </div>
    </div>
  )
}
