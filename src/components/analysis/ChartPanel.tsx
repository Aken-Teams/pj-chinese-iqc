import { useState, useEffect, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Maximize2, X } from 'lucide-react'

interface ChartPanelProps {
  title: string
  desc?: string
  /** Warnings and hints that belong beside the title. */
  notes?: ReactNode
  children: ReactNode
  className?: string
}

/**
 * A titled chart that can be opened full-screen.
 *
 * Side by side, two charts share the width and each gets about half of it,
 * which is enough to compare them but tight for reading an individual point.
 * The expand button trades the comparison for the detail without navigating
 * away, so the parameter selected upstairs still applies when it closes.
 *
 * The chart is rendered twice rather than moved, because the SVGs size
 * themselves to their container — a single instance handed to a dialog would
 * keep the small layout's proportions.
 */
export default function ChartPanel({
  title, desc, notes, children, className = '',
}: ChartPanelProps) {
  const { t } = useTranslation('analysis')
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  const header = (
    <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <h3 className="font-heading font-bold">{title}</h3>
      {desc && <span className="text-[12px] text-text-muted">{desc}</span>}
      {notes}
    </div>
  )

  return (
    <>
      <section className={`relative bg-bg-card p-6 ${className}`}>
        <button
          type="button"
          onClick={() => setOpen(true)}
          title={t('panel.expand')}
          aria-label={t('panel.expand')}
          className="absolute right-4 top-4 flex h-7 w-7 items-center justify-center text-text-muted hover:bg-bg-page hover:text-accent"
        >
          <Maximize2 size={15} />
        </button>
        {header}
        {children}
      </section>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-6"
          onClick={() => setOpen(false)}
        >
          <div
            className="max-h-[92vh] w-full max-w-[1400px] overflow-auto bg-bg-card p-8"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label={t('panel.close')}
              className="absolute right-8 top-8 flex h-8 w-8 items-center justify-center text-text-muted hover:text-text-primary"
            >
              <X size={18} />
            </button>
            {header}
            {children}
          </div>
        </div>
      )}
    </>
  )
}
