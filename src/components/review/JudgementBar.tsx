import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CheckCircle, AlertTriangle, XCircle, Loader2, Undo2 } from 'lucide-react'
import { confirmJudgement, type LotReviewSummary } from '@/services/review'

interface JudgementBarProps {
  lotId: number
  summary: LotReviewSummary
  onChange: () => void
}

const TONE: Record<string, { text: string; bg: string; border: string }> = {
  PASS: { text: 'text-success', bg: 'bg-badge-pass', border: 'border-success/40' },
  WARN: { text: 'text-warning', bg: 'bg-badge-warn', border: 'border-warning/40' },
  HOLD: { text: 'text-error', bg: 'bg-badge-fail', border: 'border-error/40' },
}

function Icon({ verdict, size = 20 }: { verdict: string; size?: number }) {
  if (verdict === 'PASS') return <CheckCircle size={size} className="text-success" />
  if (verdict === 'WARN') return <AlertTriangle size={size} className="text-warning" />
  return <XCircle size={size} className="text-error" />
}

/**
 * The lot's verdict, and the place a person signs off on it.
 *
 * The two sites asked for the same thing in different words: the system judges
 * against a yield threshold and flags warnings, and a person makes the final
 * call. So the computed verdict and the confirmed one are shown side by side
 * rather than one replacing the other — re-running the review moves the left
 * half and leaves the right half alone.
 */
export default function JudgementBar({ lotId, summary, onChange }: JudgementBarProps) {
  const { t } = useTranslation('review')
  const [pending, setPending] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const system = summary.judgement
  const confirmed = summary.confirmedJudgement
  if (!system && !confirmed) return null

  const shown = confirmed ?? system ?? 'HOLD'
  const tone = TONE[shown] ?? TONE.HOLD

  const submit = async (verdict: string | null) => {
    setBusy(true); setError('')
    try {
      await confirmJudgement(lotId, verdict, note || undefined)
      setPending(null); setNote('')
      onChange()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally { setBusy(false) }
  }

  const pct = (v: number | null | undefined) =>
    v === null || v === undefined ? '—' : (v * 100).toFixed(2)

  return (
    <div className={`mt-5 border ${tone.border} ${tone.bg} px-5 py-4`}>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="flex items-center gap-3">
          <Icon verdict={shown} size={26} />
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.5px] text-text-tertiary">
              {t('judge.title')}
            </div>
            <div className={`font-heading text-[22px] font-bold ${tone.text}`}>
              {t(`judge.${shown}`)} · {pct(summary.judgedYield)}%
            </div>
          </div>
        </div>

        <div className="text-[12px] leading-relaxed text-text-secondary">
          <div>
            {t('judge.systemSays')}:{' '}
            <span className="font-semibold">{system ? t(`judge.${system}`) : '—'}</span>
          </div>
          <div className="text-text-muted">
            {t('judge.threshold', {
              pass: pct(summary.passMin), warn: pct(summary.warnMin),
            })}
          </div>
        </div>

        <div className="ml-auto flex items-center gap-3">
          {confirmed ? (
            <>
              <span className="text-[12px] text-text-secondary">
                {t('judge.confirmBy', {
                  who: summary.confirmedBy ?? '—',
                  when: (summary.confirmedAt ?? '').replace('T', ' ').slice(0, 16),
                })}
              </span>
              <button
                type="button"
                onClick={() => submit(null)}
                disabled={busy}
                className="flex items-center gap-1.5 border border-border-light bg-bg-card px-3 py-1.5 text-[12px] text-text-secondary hover:bg-bg-page disabled:opacity-50"
              >
                {busy ? <Loader2 size={13} className="animate-spin" /> : <Undo2 size={13} />}
                {t('judge.withdraw')}
              </button>
            </>
          ) : pending === null ? (
            <>
              <span className="text-[12px] text-text-muted">{t('judge.notConfirmed')}</span>
              <button
                type="button"
                onClick={() => setPending(system ?? 'HOLD')}
                className="bg-accent px-4 py-2 font-heading text-[11px] font-bold uppercase tracking-[1px] text-white hover:bg-accent/90"
              >
                {t('judge.confirmAction')}
              </button>
            </>
          ) : null}
        </div>
      </div>

      {pending !== null && !confirmed && (
        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-border-light pt-4">
          {/* The system's verdict is pre-selected, but a person can disagree —
              that is the whole point of the step. */}
          {(['PASS', 'WARN', 'HOLD'] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setPending(v)}
              className={`flex items-center gap-1.5 border px-3 py-1.5 text-[12px] font-semibold ${
                pending === v
                  ? `${TONE[v].border} ${TONE[v].bg} ${TONE[v].text}`
                  : 'border-border-light bg-bg-card text-text-secondary hover:bg-bg-page'
              }`}
            >
              <Icon verdict={v} size={14} />
              {t(`judge.${v}`)}
            </button>
          ))}
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t('judge.note')}
            className="min-w-[220px] flex-1 border border-border-light bg-bg-card px-3 py-1.5 text-[13px] outline-none focus:border-accent/60"
          />
          <button
            type="button"
            onClick={() => submit(pending)}
            disabled={busy}
            className="bg-accent px-4 py-1.5 font-heading text-[11px] font-bold uppercase tracking-[1px] text-white hover:bg-accent/90 disabled:opacity-50"
          >
            {busy ? <Loader2 size={13} className="animate-spin" /> : t('judge.save')}
          </button>
          <button
            type="button"
            onClick={() => { setPending(null); setNote('') }}
            className="px-3 py-1.5 text-[12px] text-text-muted hover:text-text-primary"
          >
            {t('judge.cancel')}
          </button>
        </div>
      )}

      {(error || summary.confirmNote) && (
        <div className="mt-3 text-[12px]">
          {error && <span className="text-error">{error}</span>}
          {!error && summary.confirmNote && (
            <span className="text-text-secondary">「{summary.confirmNote}」</span>
          )}
        </div>
      )}

      <p className="mt-3 text-[11px] text-text-muted">
        {summary.reviewed === false ? t('judge.notReviewed') : t('judge.advisory')}
      </p>
    </div>
  )
}
