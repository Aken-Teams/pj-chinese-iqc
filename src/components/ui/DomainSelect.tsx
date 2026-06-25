import { useState, useEffect, useRef } from 'react'
import { ChevronDown, Building2, Check } from 'lucide-react'
import type { DomainOption } from '@/services/auth'

interface DomainSelectProps {
  items: DomainOption[]
  value: string
  onChange: (code: string) => void
  disabled?: boolean
}

export default function DomainSelect({
  items,
  value,
  onChange,
  disabled = false,
}: DomainSelectProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const selected = items.find((d) => d.code === value)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const select = (code: string) => {
    onChange(code)
    setOpen(false)
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((v) => !v)}
        onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
        className={`w-full flex items-center bg-bg-page border px-3 py-2.5 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
          open ? 'border-accent' : 'border-border-light hover:border-accent/60'
        }`}
      >
        <Building2 size={16} className="text-text-tertiary mr-3 shrink-0" />
        <span className="flex-1 flex items-baseline gap-2 text-left min-w-0">
          <span className="text-sm text-text-primary truncate">
            {selected ? selected.name : '--'}
          </span>
          {selected && (
            <span className="text-[11px] font-medium tracking-wide text-text-muted shrink-0">
              {selected.code}
            </span>
          )}
        </span>
        <ChevronDown
          size={16}
          className={`text-text-tertiary shrink-0 ml-2 transition-transform duration-200 ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>

      {open && (
        <ul className="absolute z-50 top-full left-0 w-full mt-1 bg-bg-card border border-border-light shadow-lg max-h-[260px] overflow-y-auto py-1">
          {items.map((d) => {
            const active = d.code === value
            return (
              <li key={d.code}>
                <button
                  type="button"
                  onClick={() => select(d.code)}
                  className={`w-full flex items-center gap-2 px-3 py-2.5 text-left transition-colors ${
                    active
                      ? 'bg-accent/10 border-l-2 border-accent'
                      : 'border-l-2 border-transparent hover:bg-bg-page'
                  }`}
                >
                  <span
                    className={`flex-1 text-sm truncate ${
                      active ? 'font-semibold text-accent' : 'text-text-primary'
                    }`}
                  >
                    {d.name}
                  </span>
                  <span
                    className={`text-[11px] font-medium tracking-wide shrink-0 ${
                      active ? 'text-accent' : 'text-text-muted'
                    }`}
                  >
                    {d.code}
                  </span>
                  {active && <Check size={14} className="text-accent shrink-0" />}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
