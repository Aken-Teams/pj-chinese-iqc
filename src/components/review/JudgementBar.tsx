import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CheckCircle, AlertTriangle, XCircle, Loader2, Undo2 } from 'lucide-react'
import InfoHint from '@/components/ui/InfoHint'
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
 * The lot's verdict, and where a person signs off on it.
 *
 * Both sites asked for the same thing in different words: the system judges
 * against a yield threshold and flags, a person makes the final call. The
 * computed verdict and the confirmed one therefore sit side by side rather than
 * one replacing the other — re-running the review moves the left half and
 * leaves the right half alone.
 *
 * Kept to one line: the numbers behind it are already in the cards below, so
 * this only has to say the verdict and offer the sign-off. The threshold and
 * the advisory note live in the hint instead of taking two rows of their own.
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
  const pct = (v: number | null | undefined) =>
    v === null || v === undefined ? '—' : (v * 100).toFixed(2)

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

  return (
    <div className={`mt-5 border ${tone.border} ${tone.bg}`}>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-2.5">
        <Icon verdict={shown} size={20} />
        <span className={`font-heading text-[18px] font-bold ${tone.text}`}>
          {t(`judge.${shown}`)} · {pct(summary.judgedYield)}%
        </span>

        <span className="flex items-center gap-1.5 text-[12px] text-text-secondary">
          {t('judge.systemSays')} <b>{system ? t(`judge.${system}`) : '—'}</b>
          <InfoHint
            title={t('judge.title')}
            lines={[
              t('judge.threshold', { pass: pct(summary.passMin), warn: pct(summary.warnMin) }),
              `— ${summary.reviewed === false ? t('judge.notReviewed') : t('judge.advisory')}`,
            ]}
          />
        </span>

        {/* A confirmed verdict that differs from the computed one is the whole
            reason this step exists, so say so rather than showing one number. */}
        {confirmed && confirmed !== system && (
          <span className="bg-bg-card px-2 py-0.5 text-[11px] font-semibold text-text-secondary">
            {t('judge.overridden', { from: t(`judge.${system ?? 'HOLD'}`) })}
          </span>
        )}

        <div className="ml-auto flex items-center gap-3">
          {confirmed ? (
            <>
              <span className="text-[12px] text-text-secondary">
                {summary.confirmedBy ?? '—'}
                <span className="text-text-muted">
                  {' · '}{(summary.confirmedAt ?? '').replace('T', ' ').slice(5, 16)}
                </span>
                {summary.confirmNote && (
                  <span className="text-text-muted">{' · 「'}{summary.confirmNote}{'」'}</span>
                )}
              </span>
              <button
                type="button"
                onClick={() => submit(null)}
                disabled={busy}
                title={t('judge.withdraw')}
                aria-label={t('judge.withdraw')}
                className="flex h-7 w-7 items-center justify-center text-text-muted hover:bg-bg-card hover:text-accent disabled:opacity-50"
              >
                {busy ? <Loader2 size={14} className="animate-spin" /> : <Undo2 size={14} />}
              </button>
            </>
          ) : pending === null ? (
            <>
              <span className="text-[12px] text-text-muted">{t('judge.notConfirmed')}</span>
              <button
                type="button"
                onClick={() => setPending(system ?? 'HOLD')}
                className="bg-accent px-3.5 py-1.5 font-heading text-[11px] font-bold uppercase tracking-[1px] text-white hover:bg-accent/90"
              >
                {t('judge.confirmAction')}
              </button>
            </>
          ) : null}
        </div>
      </div>

      {pending !== null && !confirmed && (
        <div className="flex flex-wrap items-center gap-2.5 border-t border-border-light px-4 py-2.5">
          {(['PASS', 'WARN', 'HOLD'] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setPending(v)}
              className={`flex items-center gap-1.5 border px-2.5 py-1 text-[12px] font-semibold ${
                pending === v
                  ? `${TONE[v].border} ${TONE[v].bg} ${TONE[v].text}`
                  : 'border-border-light bg-bg-card text-text-secondary hover:bg-bg-page'
              }`}
            >
              <Icon verdict={v} size={13} />
              {t(`judge.${v}`)}
            </button>
          ))}
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t('judge.note')}
            className="min-w-[200px] flex-1 border border-border-light bg-bg-card px-3 py-1 text-[13px] outline-none focus:border-accent/60"
          />
          <button
            type="button"
            onClick={() => submit(pending)}
            disabled={busy}
            className="bg-accent px-3.5 py-1 font-heading text-[11px] font-bold uppercase tracking-[1px] text-white hover:bg-accent/90 disabled:opacity-50"
          >
            {busy ? <Loader2 size={12} className="animate-spin" /> : t('judge.save')}
          </button>
          <button
            type="button"
            onClick={() => { setPending(null); setNote('') }}
            className="px-2 py-1 text-[12px] text-text-muted hover:text-text-primary"
          >
            {t('judge.cancel')}
          </button>
        </div>
      )}

      {error && (
        <div className="border-t border-border-light px-4 py-1.5 text-[12px] text-error">
          {error}
        </div>
      )}
    </div>
  )
}
