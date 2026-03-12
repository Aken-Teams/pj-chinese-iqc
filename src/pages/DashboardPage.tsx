import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import PageHeader from '@/components/layout/PageHeader'
import { Sparkles, TrendingUp, TrendingDown, Bell, Loader2 } from 'lucide-react'
import { getDashboard, type DashboardData } from '@/services/dashboard'

export default function DashboardPage() {
  const { t, i18n } = useTranslation('dashboard')
  const navigate = useNavigate()
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const res = await getDashboard(i18n.language)
          setData(res)
          setLoading(false)
          return
        } catch {
          if (attempt < 2) await new Promise(r => setTimeout(r, 2000))
        }
      }
      setLoading(false)
    }
    load()
  }, [])

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
          <div className="flex items-center gap-3">
            <select className="bg-bg-card border border-border-light px-3 py-1.5 text-sm text-text-secondary">
              <option>{t('period')}</option>
            </select>
            <button className="p-2 text-text-tertiary hover:text-text-primary">
              <Bell size={18} />
            </button>
          </div>
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
        <div className="flex-1 bg-bg-card p-5 flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-heading text-sm font-bold">{t('yieldTrend')}</h3>
            <div className="flex gap-4">
              {data.yieldTrend.vendors.map((v, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5" style={{ background: v.color }} />
                  <span className="text-[11px] text-text-secondary">{v.name}</span>
                </div>
              ))}
            </div>
          </div>
          {data.yieldTrend.months.length > 0 ? (
            <>
              <div className="flex flex-1 gap-2 min-h-0">
                {/* Y-axis labels */}
                <div className="flex flex-col justify-between items-end pr-1 pb-5 shrink-0">
                  <span className="text-[9px] text-text-muted">100%</span>
                  <span className="text-[9px] text-text-muted">97.5%</span>
                  <span className="text-[9px] text-text-muted">95%</span>
                </div>
                {/* Bars */}
                <div className="flex items-end gap-4 flex-1">
                  {data.yieldTrend.months.map((month, mi) => (
                    <div key={mi} className="flex flex-col items-center gap-1 h-full" style={{ width: Math.max(60, 100 / data.yieldTrend.months.length) }}>
                      <div className="flex gap-1 items-end w-full justify-center flex-1">
                        {data.yieldTrend.vendors.map((v, vi) => {
                          const val = v.data[mi]
                          const pct = ((val - 95) / 5) * 100
                          return (
                            <div
                              key={vi}
                              className="w-[24px]"
                              style={{ height: `${Math.max(pct, 5)}%`, background: v.color }}
                              title={`${v.name}: ${val}%`}
                            />
                          )
                        })}
                      </div>
                      <span className="text-[10px] text-text-muted">{month}</span>
                    </div>
                  ))}
                </div>
              </div>
              {/* Bottom stats strip */}
              <div className="mt-3 pt-3 border-t border-border-light flex items-center gap-6 shrink-0">
                {data.yieldTrend.vendors.map((v) => {
                  const latest = v.data[v.data.length - 1]
                  return (
                    <div key={v.name} className="flex flex-col gap-0.5">
                      <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 shrink-0" style={{ background: v.color }} />
                        <span className="text-[10px] text-text-muted">{v.name}</span>
                      </div>
                      <span className={`font-heading text-[18px] font-bold leading-none ${latest >= 99 ? 'text-success' : 'text-error'}`}>
                        {latest.toFixed(1)}<span className="text-[12px]">%</span>
                      </span>
                    </div>
                  )
                })}
                <div className="ml-auto flex flex-col gap-0.5 items-end">
                  <span className="text-[10px] text-text-muted">{t('target')}</span>
                  <span className="font-heading text-[18px] font-bold leading-none text-text-tertiary">
                    ≥99.0<span className="text-[12px]">%</span>
                  </span>
                </div>
              </div>
            </>
          ) : (
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
                      width: `${((v.yield - 95) / 5) * 100}%`,
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
