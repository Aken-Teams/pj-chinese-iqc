import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2, Check } from 'lucide-react'
import { getThresholds, updateThreshold, type ReviewThreshold } from '@/services/review'
import { siteLabel } from '@/config/sites'

/**
 * The PASS / WARN cut-offs, per site.
 *
 * These were the literals 95 and 98 written into two routers, and matched
 * neither site: 無錫's own rule is 90 / 80. Each site keeps its own row here so
 * one can move without disturbing the other.
 *
 * Percentages on screen, fractions on the wire — the API works in 0..1 because
 * that is what a yield is.
 */
export default function ThresholdSettings() {
  const { t } = useTranslation('settings')
  const [rows, setRows] = useState<ReviewThreshold[] | null>(null)
  const [saving, setSaving] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    getThresholds().then(setRows).catch(() => setRows([]))
  }, [])

  const key = (r: ReviewThreshold) => r.domain ?? '__default__'

  const edit = (r: ReviewThreshold, field: 'passMin' | 'warnMin', pct: string) => {
    const v = Number(pct)
    if (Number.isNaN(v)) return
    setRows((prev) => (prev ?? []).map((x) =>
      key(x) === key(r) ? { ...x, [field]: v / 100 } : x))
  }

  const save = async (r: ReviewThreshold) => {
    if (!(0 < r.warnMin && r.warnMin <= r.passMin && r.passMin <= 1)) {
      setError(t('thresholds.invalid'))
      return
    }
    setSaving(key(r)); setError('')
    try {
      await updateThreshold(r)
      setSaved(key(r))
      window.setTimeout(() => setSaved(null), 2000)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally { setSaving(null) }
  }

  return (
    <div className="mt-6 bg-bg-card p-6">
      <h2 className="font-heading text-sm font-bold uppercase tracking-[1px]">
        {t('thresholds.title')}
      </h2>
      <p className="mt-1 text-[13px] text-text-secondary">{t('thresholds.desc')}</p>

      {error && (
        <div className="mt-4 bg-badge-fail px-4 py-2 text-[13px] font-medium text-error">
          {error}
        </div>
      )}

      {rows === null ? (
        <div className="flex justify-center py-8">
          <Loader2 size={20} className="animate-spin text-accent" />
        </div>
      ) : (
        <div className="mt-5 flex flex-col gap-3">
          {rows.map((r) => (
            <div key={key(r)} className="flex flex-wrap items-end gap-4 border-b border-border-light pb-3 last:border-0">
              <div className="w-[110px]">
                <span className="text-[10px] font-semibold uppercase tracking-[1px] text-text-muted">
                  {t('thresholds.site')}
                </span>
                <div className="mt-0.5 text-sm font-medium text-text-primary">
                  {r.domain ? siteLabel(r.domain) : t('thresholds.allSites')}
                </div>
              </div>
              <label className="flex flex-col gap-1">
                <span className="text-[10px] font-semibold uppercase tracking-[1px] text-text-muted">
                  {t('thresholds.passMin')}
                </span>
                <div className="flex items-center gap-1">
                  <input
                    type="number" min={0} max={100} step={0.1}
                    value={(r.passMin * 100).toFixed(1)}
                    onChange={(e) => edit(r, 'passMin', e.target.value)}
                    className="w-[90px] border border-border-light bg-bg-page px-2 py-1.5 text-[13px] tabular-nums outline-none focus:border-accent/60"
                  />
                  <span className="text-[13px] text-text-muted">%</span>
                </div>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[10px] font-semibold uppercase tracking-[1px] text-text-muted">
                  {t('thresholds.warnMin')}
                </span>
                <div className="flex items-center gap-1">
                  <input
                    type="number" min={0} max={100} step={0.1}
                    value={(r.warnMin * 100).toFixed(1)}
                    onChange={(e) => edit(r, 'warnMin', e.target.value)}
                    className="w-[90px] border border-border-light bg-bg-page px-2 py-1.5 text-[13px] tabular-nums outline-none focus:border-accent/60"
                  />
                  <span className="text-[13px] text-text-muted">%</span>
                </div>
              </label>
              <div className="flex-1 min-w-[220px] text-[12px] leading-snug text-text-muted">
                {t('thresholds.explain', {
                  pass: (r.passMin * 100).toFixed(1),
                  warn: (r.warnMin * 100).toFixed(1),
                })}
              </div>
              <button
                type="button"
                onClick={() => save(r)}
                disabled={saving === key(r)}
                className="flex items-center gap-1.5 bg-accent px-4 py-1.5 font-heading text-[11px] font-bold uppercase tracking-[1px] text-white hover:bg-accent/90 disabled:opacity-50"
              >
                {saving === key(r) ? <Loader2 size={13} className="animate-spin" />
                  : saved === key(r) ? <Check size={13} /> : null}
                {t('thresholds.save')}
              </button>
            </div>
          ))}
        </div>
      )}

      <p className="mt-4 text-[11px] text-text-muted">{t('thresholds.basisNote')}</p>
    </div>
  )
}
