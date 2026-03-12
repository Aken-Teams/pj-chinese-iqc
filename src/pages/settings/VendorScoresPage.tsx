import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { RefreshCw, TrendingUp } from 'lucide-react'
import PageHeader from '@/components/layout/PageHeader'
import { getVendorScores, calculateVendorScores, type VendorScore } from '@/services/vendors'

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
  const icons: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' }
  if (rank <= 3) {
    return <span className="text-lg">{icons[rank]}</span>
  }
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

  useEffect(() => {
    setLoading(true)
    getVendorScores(period)
      .then(setScores)
      .catch(() => setScores([]))
      .finally(() => setLoading(false))
  }, [period])

  async function recalculate() {
    setLoading(true)
    try {
      const result = await calculateVendorScores(period)
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

      {/* Score formula hint */}
      <p className="text-xs text-text-muted">{t('scores.scoreFormula')}</p>

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
