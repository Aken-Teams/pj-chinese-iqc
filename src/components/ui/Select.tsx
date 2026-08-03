import { useState, useEffect, useRef } from 'react'
import { ChevronDown, Check } from 'lucide-react'

export interface SelectOption {
  value: string
  label: string
}

interface SelectProps {
  options: SelectOption[]
  value: string
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  className?: string
  align?: 'left' | 'right'
}

/**
 * App-styled dropdown to replace native <select> (whose option popup is
 * browser/OS-rendered and can't be themed). Matches SearchSelect's look, minus
 * the search box — for short value/label option lists.
 */
export default function Select({
  options,
  value,
  onChange,
  placeholder = '--',
  disabled = false,
  className = '',
  align = 'left',
}: SelectProps) {
  const [open, setOpen] = useState(false)
  // Placement is computed on open so the menu never spills past the viewport:
  // it flips upward when there isn't room below, and caps its height to fit.
  const [placement, setPlacement] = useState({ up: false, maxH: 260 })
  const ref = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)

  const selected = options.find((o) => o.value === value)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const toggle = () => {
    if (disabled) return
    if (!open) {
      const rect = btnRef.current?.getBoundingClientRect()
      if (rect) {
        const margin = 8
        const desired = Math.min(260, options.length * 38 + 8)
        const below = window.innerHeight - rect.bottom - margin
        const above = rect.top - margin
        const up = below < desired && above > below
        setPlacement({ up, maxH: Math.max(120, Math.min(260, up ? above : below)) })
      }
    }
    setOpen((v) => !v)
  }

  const handleSelect = (v: string) => {
    onChange(v)
    setOpen(false)
  }

  return (
    <div className={`relative ${className}`} ref={ref}>
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
        disabled={disabled}
        className={`w-full flex items-center justify-between border bg-white px-3 py-2 text-[13px] text-text-primary transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
          open ? 'border-accent' : 'border-border-light hover:border-accent/60'
        }`}
      >
        <span className={`truncate ${selected ? 'text-text-primary' : 'text-text-muted'}`}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown
          size={14}
          className={`text-text-muted flex-shrink-0 ml-2 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <ul
          style={{ maxHeight: placement.maxH }}
          className={`absolute z-50 ${placement.up ? 'bottom-full mb-1' : 'top-full mt-1'} ${align === 'right' ? 'right-0' : 'left-0'} w-full min-w-[160px] overflow-y-auto bg-white border border-border-light shadow-md py-1`}
        >
          {options.map((o) => {
            const active = o.value === value
            return (
              <li
                key={o.value}
                onClick={() => handleSelect(o.value)}
                className={`flex items-center justify-between gap-2 px-3 py-2 text-[13px] cursor-pointer ${
                  active ? 'bg-bg-page font-semibold text-text-primary' : 'text-text-secondary hover:bg-bg-page'
                }`}
              >
                <span className="truncate">{o.label}</span>
                {active && <Check size={14} className="text-accent flex-shrink-0" />}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
