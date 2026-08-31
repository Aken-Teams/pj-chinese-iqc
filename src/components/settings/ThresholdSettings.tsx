import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2, Check } from 'lucide-react'
import { getThresholds, updateThreshold, type ReviewThreshold } from '@/services/review'
import { siteLabel } from '@/config/sites'
import InfoHint from '@/components/ui/InfoHint'

/**
 * The PASS / WARN cut-offs, one line per site.
 *
 * These were the literals 95 and 98 written into two routers, and matched
 * neither site: 無錫's own rule is 90 / 80. Each site keeps its own row so one
 * can move without disturbing the other.
 *
 * Kept to a single strip on purpose — it is a two-number setting sitting above
 * the rules it governs, not a section of its own. The reasoning lives in the
 * hint rather than in paragraphs around the inputs, and Save appears only once
 * a value has actually changed.
 *
 * Percentages on screen, fractions on the wire: the API works in 0..1 because
 * that is what a yield is.
 */
export default function ThresholdSettings() {
  const { t } = useTranslation('settings')
  const [rows, setRows] = useState<ReviewThreshold[] | null>(null)
  const [saving, setSaving] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const [error, setError] = useState('')
  const original = useRef<Record<string, ReviewThreshold>>({})

  const key = (r: ReviewThreshold) => r.domain ?? '__default__'

  useEffect(() => {
    getThresholds()
      .then((list) => {
        original.current = Object.fromEntries(list.map((r) => [key(r), { ...r }]))
        setRows(list)
      })
      .catch(() => setRows([]))
  }, [])

  const dirty = (r: ReviewThreshold) => {
    const was = original.current[key(r)]
    return !!was && (was.passMin !== r.passMin || was.warnMin !== r.warnMin)
  }

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
      original.current[key(r)] = { ...r }
      setSaved(key(r))
      window.setTimeout(() => setSaved(null), 1800)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally { setSaving(null) }
  }

  if (rows === null) {
    return (
      <div className="mt-5 flex h-[46px] items-center px-4">
        <Loader2 size={16} className="animate-spin text-accent" />
      </div>
    )
  }
  if (rows.length === 0) return null

  return (
    <div className="mt-5 flex flex-col gap-px">
      {rows.map((r) => (
        <div
          key={key(r)}
          className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-border-light bg-bg-card px-4 py-2.5"
        >
          <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.5px] text-text-tertiary">
            {t('thresholds.title')}
            <InfoHint
              title={t('thresholds.title')}
              lines={[t('thresholds.desc'), `— ${t('thresholds.basisNote')}`]}
            />
          </span>

          <span className="text-[13px] font-semibold text-text-primary">
            {r.domain ? siteLabel(r.domain) : t('thresholds.allSites')}
          </span>

          <Field
            label={t('thresholds.passMin')}
            value={r.passMin}
            onChange={(v) => edit(r, 'passMin', v)}
          />
          <Field
            label={t('thresholds.warnMin')}
            value={r.warnMin}
            onChange={(v) => edit(r, 'warnMin', v)}
          />

          <span className="text-[12px] text-text-muted">
            {t('thresholds.holdBelow', { warn: (r.warnMin * 100).toFixed(1) })}
          </span>

          <div className="ml-auto flex items-center gap-2">
            {saved === key(r) && (
              <span className="flex items-center gap-1 text-[12px] text-success">
                <Check size={13} /> {t('thresholds.savedOk')}
              </span>
            )}
            {dirty(r) && (
              <button
                type="button"
                onClick={() => save(r)}
                disabled={saving === key(r)}
                className="flex items-center gap-1.5 bg-accent px-3 py-1 font-heading text-[11px] font-bold uppercase tracking-[1px] text-white hover:bg-accent/90 disabled:opacity-50"
              >
                {saving === key(r) && <Loader2 size={12} className="animate-spin" />}
                {t('thresholds.save')}
              </button>
            )}
          </div>
        </div>
      ))}

      {error && (
        <div className="bg-badge-fail px-4 py-1.5 text-[12px] font-medium text-error">
          {error}
        </div>
      )}
    </div>
  )
}

function Field({ label, value, onChange }: {
  label: string
  value: number
  onChange: (pct: string) => void
}) {
  return (
    <label className="flex items-center gap-1.5">
      <span className="text-[12px] text-text-secondary">{label}</span>
      <input
        type="number" min={0} max={100} step={0.1}
        value={(value * 100).toFixed(1)}
        onChange={(e) => onChange(e.target.value)}
        className="w-[68px] border border-border-light bg-bg-page px-2 py-1 text-right text-[13px] tabular-nums outline-none focus:border-accent/60"
      />
      <span className="text-[12px] text-text-muted">%</span>
    </label>
  )
}
