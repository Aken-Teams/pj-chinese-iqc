import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { RefreshCw, TrendingUp, Trophy, Award, Star } from 'lucide-react'
import PageHeader from '@/components/layout/PageHeader'
import { getVendorScores, calculateVendorScores, type VendorScore } from '@/services/vendors'
import { useAuthStore } from '@/store/authStore'
import { SITE_LABELS, siteLabel } from '@/config/sites'

function ScoreBar({ score }: { score: number | null }) {
  const pct = Math.min(100, Math.max(0, score ?? 0))
  const color = pct >= 80 ? '#22c55e' : pct >= 60 ? '#f59e0b' : '#ef4444'
  return (
    <div className="flex items-center gap-2">
      <div className="w-20 h-2 bg-bg-page rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <span className="text-sm font-mono font-bold" style={{ color }}>{score?.toFixed(1) ?? '—'}</span>
    </div>
  )
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <Trophy size={18} style={{ color: '#D4A017' }} />
  if (rank === 2) return <Award size={18} style={{ color: '#9E9E9E' }} />
  if (rank === 3) return <Star size={18} style={{ color: '#CD7F32' }} />
  return <span className="text-sm font-mono text-text-muted">#{rank}</span>
}

export default function VendorScoresPage() {
  const { t } = useTranslation('settings')
  const [period, setPeriod] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })
  const [scores, setScores] = useState<VendorScore[]>([])
  const [loading, setLoading] = useState(false)
  const user = useAuthStore((s) => s.user)
  const isAdmin = user?.role === 'admin'
  // Admin can switch site ('' = group-wide); a site user is locked to their own.
  const [site, setSite] = useState('')

  useEffect(() => {
    setLoading(true)
    getVendorScores(period, site)
      .then(setScores)
      .catch(() => setScores([]))
      .finally(() => setLoading(false))
  }, [period, site])

  async function recalculate() {
    setLoading(true)
    try {
      const result = await calculateVendorScores(period, site)
      setScores(result)
    } catch {
      setScores([])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-9 pl-11 flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <PageHeader title={t('scores.title')} subtitle={t('scores.desc')} />
        <div className="flex items-center gap-3">
          {isAdmin ? (
            <select
              className="bg-bg-card border border-border-light px-3 py-2 text-sm text-text-primary outline-none focus:border-accent cursor-pointer"
              value={site}
              onChange={(e) => setSite(e.target.value)}
            >
              <option value="">{t('scores.allSites')}</option>
              {Object.keys(SITE_LABELS).map((code) => (
                <option key={code} value={code}>{siteLabel(code)}</option>
              ))}
            </select>
          ) : (
            user?.domain && (
              <span className="border border-border-light bg-bg-page px-3 py-2 text-sm font-semibold text-text-secondary">
                {siteLabel(user.domain)}
              </span>
            )
          )}
          <input
            type="month"
            className="bg-bg-card border border-border-light px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
          />
          <button
            onClick={recalculate}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-accent text-white text-sm font-medium hover:bg-accent/90 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            {loading ? t('scores.calculating') : t('scores.recalculate')}
          </button>
        </div>
      </div>

      {/* Score formula + current site scope */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <p className="text-xs text-text-muted">{t('scores.scoreFormula')}</p>
        <p className="text-xs font-semibold text-accent">
          {t('scores.siteScopeHint', {
            scope: isAdmin ? (site ? siteLabel(site) : t('scores.allSites')) : siteLabel(user?.domain),
          })}
        </p>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-text-muted text-sm">
          <RefreshCw size={16} className="animate-spin mr-2" /> {t('scores.calculating')}
        </div>
      ) : scores.length === 0 ? (
        <div className="bg-bg-card border border-border-light px-6 py-12 text-center">
          <TrendingUp size={36} className="mx-auto text-text-muted mb-3" />
          <p className="text-sm text-text-muted">{t('scores.noData')}</p>
        </div>
      ) : (
        <div className="bg-bg-card border border-border-light overflow-hidden">
          {/* Table header */}
          <div className="grid grid-cols-[60px_80px_1fr_100px_70px_80px_90px_160px] items-center gap-4 px-5 py-3 border-b border-border-light bg-bg-page">
            {(['rank', 'vendorCode', 'vendorName', 'avgYield', 'lotCount', 'anomalyCount', 'cpkAvg', 'score'] as const).map((key) => (
              <span key={key} className="text-xs font-bold text-text-muted uppercase tracking-[1px]">
                {t(`scores.${key}`)}
              </span>
            ))}
          </div>

          {/* Rows */}
          {scores.map((s) => (
            <div
              key={s.vendorId}
              className="grid grid-cols-[60px_80px_1fr_100px_70px_80px_90px_160px] items-center gap-4 px-5 py-4 border-b border-border-light last:border-b-0 hover:bg-bg-page transition-colors"
            >
              <div className="flex justify-center">
                <RankBadge rank={s.rank} />
              </div>
              <span className="text-sm font-bold text-accent font-heading uppercase tracking-[1px]">
                {s.vendorCode}
              </span>
              <span className="text-sm text-text-primary">{s.vendorName}</span>
              <span className="text-sm font-mono text-text-primary">
                {s.avgYield !== null ? `${(s.avgYield * 100).toFixed(2)}%` : '—'}
              </span>
              <span className="text-sm font-mono text-text-secondary">{s.lotCount}</span>
              <span className={`text-sm font-mono ${s.anomalyCount > 0 ? 'text-error' : 'text-success'}`}>
                {s.anomalyCount}
              </span>
              <span className="text-sm font-mono text-text-primary">
                {s.cpkAvg !== null ? s.cpkAvg.toFixed(3) : '—'}
              </span>
              <ScoreBar score={s.score} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
