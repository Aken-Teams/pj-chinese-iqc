import { useState, useEffect, useRef } from 'react'
import { ChevronDown, Search, Check } from 'lucide-react'

export interface MultiSelectItem {
  value: string
  label: string
  /** Shown after the label in a lighter tone — vendor, product, date, counts. */
  hint?: string
  badge?: string
  badgeClass?: string
  /** Extra text the search should match on but that is not displayed. */
  keywords?: string
}

interface MultiSelectProps {
  items: MultiSelectItem[]
  value: string[]
  onChange: (next: string[]) => void
  placeholder?: string
  /** Trigger text once something is picked, e.g. "已選 3 個批次". */
  summary?: (count: number, total: number) => string
  selectAllLabel?: string
  clearLabel?: string
  emptyLabel?: string
  searchPlaceholder?: string
  disabled?: boolean
  className?: string
}

/**
 * A search-and-tick dropdown, shaped like SearchSelect so the two read as the
 * same control.
 *
 * The list stays open while ticking: choosing lots to compare is a several-item
 * decision, and a dropdown that closed after each one would make picking six of
 * eleven a chore.
 */
export default function MultiSelect({
  items,
  value,
  onChange,
  placeholder = '-- 請選擇 --',
  summary,
  selectAllLabel = '全選',
  clearLabel = '清除',
  emptyLabel = '無符合結果',
  searchPlaceholder = '搜尋...',
  disabled = false,
  className = '',
}: MultiSelectProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const q = query.trim().toLowerCase()
  const filtered = q
    ? items.filter((i) =>
        `${i.label} ${i.hint ?? ''} ${i.keywords ?? ''}`.toLowerCase().includes(q))
    : items

  const toggle = (v: string) =>
    onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v])

  // Select-all acts on what is on screen, so a search narrows what it takes —
  // otherwise a filtered list with an "all" button would be lying about scope.
  const visible = filtered.map((i) => i.value)
  const allVisibleChosen = visible.length > 0 && visible.every((v) => value.includes(v))

  const label = value.length === 0
    ? placeholder
    : summary
      ? summary(value.length, items.length)
      : `${value.length} / ${items.length}`

  return (
    <div className={`relative ${className}`} ref={ref}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          if (disabled) return
          setOpen((v) => !v)
          setQuery('')
          setTimeout(() => inputRef.current?.focus(), 0)
        }}
        className="flex w-full items-center justify-between border border-border-light bg-white px-3 py-2 text-[13px] text-text-primary hover:border-accent/60 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <span className={value.length ? 'truncate text-text-primary' : 'truncate text-text-muted'}>
          {label}
        </span>
        <ChevronDown size={14} className="ml-2 flex-shrink-0 text-text-muted" />
      </button>

      {open && (
        <div className="absolute top-full left-0 z-50 mt-1 w-full min-w-[360px] border border-border-light bg-white shadow-md">
          <div className="flex items-center gap-2 border-b border-border-light px-3 py-2">
            <Search size={13} className="flex-shrink-0 text-text-muted" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
              placeholder={searchPlaceholder}
              className="flex-1 bg-transparent text-[13px] text-text-primary outline-none placeholder:text-text-muted"
            />
            <button
              type="button"
              onClick={() => onChange(
                allVisibleChosen
                  ? value.filter((v) => !visible.includes(v))
                  : [...new Set([...value, ...visible])],
              )}
              className="flex-shrink-0 text-[12px] text-accent hover:underline"
            >
              {allVisibleChosen ? clearLabel : selectAllLabel}
            </button>
          </div>

          <ul className="max-h-[300px] overflow-y-auto">
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-[13px] text-text-muted">{emptyLabel}</li>
            ) : (
              filtered.map((item) => {
                const on = value.includes(item.value)
                return (
                  <li
                    key={item.value}
                    onClick={() => toggle(item.value)}
                    className={`flex cursor-pointer items-center gap-2.5 px-3 py-2 text-[13px] hover:bg-bg-page ${
                      on ? 'bg-bg-page' : ''
                    }`}
                  >
                    <span className={`flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center border ${
                      on ? 'border-accent bg-accent text-white' : 'border-border-light'
                    }`}>
                      {on && <Check size={10} />}
                    </span>
                    <span className="truncate font-medium text-text-primary">{item.label}</span>
                    {item.hint && (
                      <span className="truncate text-[12px] text-text-muted">{item.hint}</span>
                    )}
                    {item.badge && (
                      <span className={`ml-auto flex-shrink-0 px-1.5 py-0.5 text-[10px] font-bold ${item.badgeClass ?? ''}`}>
                        {item.badge}
                      </span>
                    )}
                  </li>
                )
              })
            )}
          </ul>
        </div>
      )}
    </div>
  )
}
