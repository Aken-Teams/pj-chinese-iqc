import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Sparkles, Loader2, RefreshCw } from 'lucide-react'
import { getCrossLotSummary } from '@/services/crossLot'

interface AiReadingProps {
  lotIds: number[]
  paramName: string
}

/**
 * The model's reading of the comparison, on demand.
 *
 * Not generated automatically: the request costs a few seconds of the local
 * gateway, and the selection changes with every tick while a comparison is
 * being assembled. Asking for it explicitly also makes it clear the words came
 * from a model rather than from the data itself.
 *
 * Cleared whenever the selection or parameter changes, so a summary is never
 * left sitting beside charts it no longer describes.
 */
export default function AiReading({ lotIds, paramName }: AiReadingProps) {
  const { t, i18n } = useTranslation('analysis')
  const [summary, setSummary] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const key = `${lotIds.join(',')}|${paramName}`
  useEffect(() => {
    setSummary(null); setError('')
  }, [key])

  const run = async () => {
    setLoading(true); setError('')
    try {
      const res = await getCrossLotSummary(lotIds, paramName, i18n.language)
      setSummary(res.summary)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  const ready = lotIds.length > 0 && !!paramName

  return (
    <section className="bg-bg-card p-6">
      <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="flex items-center gap-2 font-heading font-bold">
          <Sparkles size={15} className="text-accent" />
          {t('ai.title')}
        </h3>
        <span className="text-[12px] text-text-muted">{t('ai.desc')}</span>
        <button
          type="button"
          onClick={run}
          disabled={!ready || loading}
          className="ml-auto flex items-center gap-1.5 bg-accent px-4 py-1.5 font-heading text-[11px] font-bold uppercase tracking-[1px] text-white hover:bg-accent/90 disabled:opacity-40"
        >
          {loading ? <Loader2 size={13} className="animate-spin" />
            : summary ? <RefreshCw size={13} /> : <Sparkles size={13} />}
          {loading ? t('ai.running') : summary ? t('ai.again') : t('ai.run')}
        </button>
      </div>

      {error && (
        <div className="bg-badge-fail px-4 py-2 text-[13px] font-medium text-error">
          {t('ai.failed', { error })}
        </div>
      )}

      {!error && !summary && !loading && (
        <p className="py-6 text-center text-sm text-text-muted">{t('ai.empty')}</p>
      )}

      {summary && (
        <>
          {/* The model writes **bold** for its key point; rendered rather than
              shown as asterisks, but nothing else is interpreted as markup. */}
          <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-text-primary">
            {summary.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
              part.startsWith('**') && part.endsWith('**')
                ? <strong key={i}>{part.slice(2, -2)}</strong>
                : <span key={i}>{part}</span>)}
          </p>
          <p className="mt-3 text-[11px] text-text-muted">{t('ai.disclaimer')}</p>
        </>
      )}
    </section>
  )
}
