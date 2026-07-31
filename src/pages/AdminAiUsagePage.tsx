import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Loader2, Coins, Cpu, ArrowDownToLine, ArrowUpFromLine } from 'lucide-react'
import PageHeader from '@/components/layout/PageHeader'
import { useAuthStore } from '@/store/authStore'
import { SITE_LABELS, siteLabel } from '@/config/sites'
import {
  getAiUsageSummary,
  getRecentAiUsage,
  type AiUsageSummary,
  type AiUsageRecentResponse,
} from '@/services/admin'

function n(v: number): string {
  return v.toLocaleString()
}

const RECENT_PAGE_SIZE = 10

export default function AdminAiUsagePage() {
  const { t } = useTranslation('admin')
  const { user } = useAuthStore()
  const [summary, setSummary] = useState<AiUsageSummary | null>(null)
  const [recent, setRecent] = useState<AiUsageRecentResponse | null>(null)
  const [site, setSite] = useState('')
  const [recentPage, setRecentPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Summary reloads when the site scope changes.
  useEffect(() => {
    if (user?.role !== 'admin') return
    getAiUsageSummary(30, site)
      .then(setSummary)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }, [user, site])

  // Recent-calls table is paginated (10/page) and site-scoped.
  useEffect(() => {
    if (user?.role !== 'admin') return
    getRecentAiUsage(recentPage, RECENT_PAGE_SIZE, site).then(setRecent).catch(() => {})
  }, [user, site, recentPage])

  // Defense in depth — backend also enforces admin (403).
  if (user && user.role !== 'admin') {
    return <Navigate to="/dashboard" replace />
  }

  const featureLabel = (key: string) => t(`features.${key}`, { defaultValue: key })
  const maxDaily = Math.max(1, ...(summary?.daily.map((d) => d.totalTokens) ?? [0]))

  const cards = summary ? [
    { icon: Coins, label: t('cards.calls'), value: n(summary.totals.calls) },
    { icon: Cpu, label: t('cards.totalTokens'), value: n(summary.totals.totalTokens) },
    { icon: ArrowDownToLine, label: t('cards.inputTokens'), value: n(summary.totals.promptTokens) },
    { icon: ArrowUpFromLine, label: t('cards.outputTokens'), value: n(summary.totals.completionTokens) },
    { icon: Coins, label: t('cards.estCost'), value: `${summary.totals.estCost.toFixed(4)} ${summary.totals.currency}` },
  ] : []

  return (
    <div className="p-12">
      <div className="flex items-start justify-between">
        <PageHeader title={t('title')} subtitle={t('subtitle')} />
        <select
          value={site}
          onChange={(e) => { setSite(e.target.value); setRecentPage(1) }}
          className="bg-bg-card border border-border-light px-3 py-2 text-sm text-text-primary outline-none focus:border-accent cursor-pointer"
        >
          <option value="">{t('allSites')}</option>
          {Object.keys(SITE_LABELS).map((code) => (
            <option key={code} value={code}>{siteLabel(code)}</option>
          ))}
        </select>
      </div>

      {error && <div className="mt-4 bg-badge-fail text-error text-sm px-4 py-2.5 font-medium">{error}</div>}

      {loading ? (
        <div className="mt-10 flex justify-center"><Loader2 size={32} className="animate-spin text-accent" /></div>
      ) : summary ? (
        <>
          {/* Totals */}
          <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-5">
            {cards.map(({ icon: Icon, label, value }) => (
              <div key={label} className="bg-bg-card p-4">
                <div className="flex items-center gap-2 text-text-tertiary">
                  <Icon size={14} />
                  <span className="text-[11px] font-bold uppercase tracking-[0.5px]">{label}</span>
                </div>
                <div className="mt-1.5 font-heading text-2xl font-bold text-text-primary">{value}</div>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[12px] text-text-muted">{t('costNote')}</p>

          {/* Breakdown by feature */}
          <div className="mt-6 bg-bg-card p-6">
            <h3 className="mb-4 font-heading font-bold">{t('byFeature')}</h3>
            <BreakdownTable rows={summary.byFeature} labelFn={featureLabel} currency={summary.currency} t={t} />
          </div>

          {/* Breakdown by model */}
          <div className="mt-6 bg-bg-card p-6">
            <h3 className="mb-4 font-heading font-bold">{t('byModel')}</h3>
            <BreakdownTable rows={summary.byModel} labelFn={(k) => k} currency={summary.currency} t={t} />
          </div>

          {/* Daily trend (last 30d) */}
          <div className="mt-6 bg-bg-card p-6">
            <h3 className="mb-4 font-heading font-bold">{t('daily')}</h3>
            {summary.daily.length === 0 ? (
              <div className="text-[13px] text-text-muted">{t('empty')}</div>
            ) : (
              <div className="flex flex-col gap-1.5">
                {summary.daily.map((d) => (
                  <div key={d.date} className="flex items-center gap-3">
                    <span className="w-24 shrink-0 text-[12px] text-text-secondary">{d.date}</span>
                    <div className="flex-1 bg-bg-page h-4">
                      <div className="h-4 bg-accent/70" style={{ width: `${(d.totalTokens / maxDaily) * 100}%` }} />
                    </div>
                    <span className="w-28 shrink-0 text-right text-[12px] font-semibold text-text-primary">
                      {n(d.totalTokens)} ({d.calls})
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recent calls — paginated (10/page), site-labelled */}
          <div className="mt-6 bg-bg-card p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-heading font-bold">{t('recent')}</h3>
              {recent && recent.total > 0 && (
                <span className="text-[12px] text-text-muted">
                  {(recent.page - 1) * recent.pageSize + 1}–{Math.min(recent.page * recent.pageSize, recent.total)} / {recent.total}
                </span>
              )}
            </div>
            {!recent || recent.items.length === 0 ? (
              <div className="text-[13px] text-text-muted">{t('empty')}</div>
            ) : (
              <>
                <table className="w-full">
                  <thead>
                    <tr>
                      {['time', 'site', 'feature', 'model', 'user', 'input', 'output', 'total'].map((h) => (
                        <th key={h} className="pb-3 text-left text-[11px] font-bold uppercase tracking-[0.5px] text-text-tertiary">
                          {t(`cols.${h}`)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {recent.items.map((r) => (
                      <tr key={r.id} className="border-t border-border-light">
                        <td className="py-2.5 text-[13px] text-text-secondary">{r.timestamp}</td>
                        <td className="py-2.5 text-[13px] text-text-secondary">{r.domain ? siteLabel(r.domain) : '—'}</td>
                        <td className="py-2.5 text-[13px] text-text-primary">{featureLabel(r.feature)}</td>
                        <td className="py-2.5 text-[13px] text-text-secondary">{r.model}</td>
                        <td className="py-2.5 text-[13px] text-text-secondary">{r.userName ?? '—'}</td>
                        <td className="py-2.5 text-[13px] text-text-primary">{n(r.promptTokens)}</td>
                        <td className="py-2.5 text-[13px] text-text-primary">{n(r.completionTokens)}</td>
                        <td className="py-2.5 text-[13px] font-semibold text-text-primary">{n(r.totalTokens)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {recent.totalPages > 1 && (
                  <div className="mt-4 flex justify-end gap-1">
                    <button
                      onClick={() => setRecentPage((p) => Math.max(1, p - 1))}
                      disabled={recentPage <= 1}
                      className="border border-border-light bg-bg-card px-3 py-1.5 text-[12px] text-text-secondary hover:bg-bg-page disabled:opacity-30"
                    >{t('prev')}</button>
                    <span className="px-3 py-1.5 text-[12px] font-semibold text-text-primary">{recent.page} / {recent.totalPages}</span>
                    <button
                      onClick={() => setRecentPage((p) => Math.min(recent.totalPages, p + 1))}
                      disabled={recentPage >= recent.totalPages}
                      className="border border-border-light bg-bg-card px-3 py-1.5 text-[12px] text-text-secondary hover:bg-bg-page disabled:opacity-30"
                    >{t('next')}</button>
                  </div>
                )}
              </>
            )}
          </div>
        </>
      ) : null}
    </div>
  )
}

function BreakdownTable({
  rows, labelFn, currency, t,
}: {
  rows: { key: string; calls: number; promptTokens: number; completionTokens: number; totalTokens: number; estCost: number }[]
  labelFn: (key: string) => string
  currency: string
  t: (k: string) => string
}) {
  if (rows.length === 0) return <div className="text-[13px] text-text-muted">{t('empty')}</div>
  return (
    <table className="w-full">
      <thead>
        <tr>
          {['name', 'calls', 'input', 'output', 'total', 'cost'].map((h) => (
            <th key={h} className="pb-3 text-left text-[11px] font-bold uppercase tracking-[0.5px] text-text-tertiary">
              {t(`cols.${h}`)}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.key} className="border-t border-border-light">
            <td className="py-2.5 text-[13px] font-semibold text-text-primary">{labelFn(r.key)}</td>
            <td className="py-2.5 text-[13px] text-text-secondary">{n(r.calls)}</td>
            <td className="py-2.5 text-[13px] text-text-primary">{n(r.promptTokens)}</td>
            <td className="py-2.5 text-[13px] text-text-primary">{n(r.completionTokens)}</td>
            <td className="py-2.5 text-[13px] font-semibold text-text-primary">{n(r.totalTokens)}</td>
            <td className="py-2.5 text-[13px] text-text-secondary">{r.estCost.toFixed(4)} {currency}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
