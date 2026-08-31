import { useState, useRef } from 'react'
import { AlertCircle } from 'lucide-react'

interface InfoHintProps {
  /** Lines of the tooltip. A line starting with '—' renders as a dim note. */
  lines: string[]
  title?: string
  className?: string
}

/**
 * A small marker beside a page title that explains, on hover, which data the
 * page actually reads.
 *
 * CP 審核 and 規格比較 both say "規格" but read entirely different tables, which
 * is what led 徐州 to ask why the review screen never showed the spec they had
 * sent. Naming the source on the page itself answers that without anyone having
 * to ask.
 */
export default function InfoHint({ lines, title, className = '' }: InfoHintProps) {
  const [open, setOpen] = useState(false)
  const timer = useRef<number | undefined>(undefined)

  // A short close delay keeps the panel usable when the pointer crosses the gap
  // between the icon and the panel itself.
  const show = () => { window.clearTimeout(timer.current); setOpen(true) }
  const hide = () => { timer.current = window.setTimeout(() => setOpen(false), 120) }

  return (
    <span
      className={`relative inline-flex ${className}`}
      onMouseEnter={show}
      onMouseLeave={hide}
    >
      <button
        type="button"
        aria-label={title}
        onFocus={show}
        onBlur={hide}
        onClick={() => setOpen((v) => !v)}
        className="text-text-muted hover:text-accent focus:text-accent focus:outline-none"
      >
        <AlertCircle size={17} />
      </button>

      {open && (
        <span
          role="tooltip"
          className="absolute left-0 top-full z-50 mt-2 w-[380px] border border-border-light bg-white p-3.5 text-left shadow-md"
        >
          {title && (
            <span className="mb-1.5 block font-heading text-[12px] font-bold uppercase tracking-[0.5px] text-text-tertiary">
              {title}
            </span>
          )}
          {lines.map((line, i) => (
            <span
              key={i}
              className={`block text-[12.5px] leading-relaxed ${
                line.startsWith('—') ? 'mt-1.5 text-text-muted' : 'text-text-secondary'
              }`}
            >
              {line}
            </span>
          ))}
        </span>
      )}
    </span>
  )
}
