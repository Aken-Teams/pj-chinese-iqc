import { useState, useEffect, useRef } from 'react'
import { ChevronDown, Search } from 'lucide-react'
import type { HistoryRow } from '@/services/history'

function lotLabel(lot: HistoryRow) {
  return `${lot.vendor} / ${lot.product} / ${lot.lotId}`
}

const STATUS_COLOR: Record<string, string> = {
  PASS: 'text-success',
  FAIL: 'text-error',
  WARN: 'text-warning',
}

interface LotSearchSelectProps {
  lots: HistoryRow[]
  selectedLotId: number | null
  /** Fallback for the trigger label when the selected lot isn't in `lots`
   * (e.g. after a server-side search replaced the list with a subset). */
  selectedLot?: HistoryRow | null
  placeholder: string
  onSelect: (lot: HistoryRow) => void
  className?: string
  /** 'left' (default) aligns dropdown to left edge; 'right' aligns to right edge (for top-right placements) */
  align?: 'left' | 'right'
  /** Label shown for lots that haven't had 執行審核 run yet. */
  notReviewedLabel?: string
  /**
   * When provided, searching is delegated to the parent (server-side) instead
   * of filtering the local `lots` array — so the picker can reach every lot,
   * not just the page already loaded. Called debounced as the user types.
   */
  onSearch?: (query: string) => void
}

export default function LotSearchSelect({
  lots,
  selectedLotId,
  selectedLot,
  placeholder,
  onSelect,
  className = '',
  align = 'left',
  notReviewedLabel = '未審核',
  onSearch,
}: LotSearchSelectProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Keep the latest onSearch in a ref so the debounce effect can depend only on
  // `query`/`open` and never re-fire from the parent re-rendering (which would
  // loop: fetch → setLots → re-render → fetch …).
  const onSearchRef = useRef(onSearch)
  onSearchRef.current = onSearch

  useEffect(() => {
    if (!onSearchRef.current || !open) return
    const id = setTimeout(() => onSearchRef.current?.(query), 250)
    return () => clearTimeout(id)
  }, [query, open])

  // Server-side search: parent already returns the filtered `lots`, so don't
  // filter again locally. Local (client) mode keeps the substring filter.
  const filtered = onSearch
    ? lots
    : query
      ? lots.filter(l => lotLabel(l).toLowerCase().includes(query.toLowerCase()))
      : lots

  const selected = lots.find(l => l.id === selectedLotId)
    ?? (selectedLot && selectedLot.id === selectedLotId ? selectedLot : undefined)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleOpen = () => {
    setOpen(true)
    setQuery('')
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  const handleSelect = (lot: HistoryRow) => {
    onSelect(lot)
    setOpen(false)
    setQuery('')
  }

  return (
    <div className={`relative ${className}`} ref={ref}>
      {/* Trigger */}
      <button
        type="button"
        onClick={handleOpen}
        className="w-full flex items-center justify-between border border-border-light bg-bg-card px-3 py-2 text-[13px] text-text-primary hover:border-accent/60"
      >
        <span className={`flex items-center gap-2 min-w-0 ${selected ? 'text-text-primary' : 'text-text-muted'}`}>
          {selected ? (
            <>
              <span className="truncate">{lotLabel(selected)}</span>
              {selected.reviewed === false ? (
                <span className="flex-shrink-0 bg-badge-warn px-1.5 py-0.5 text-[10px] font-bold text-warning">
                  {notReviewedLabel}
                </span>
              ) : (
                <span className={`flex-shrink-0 text-[11px] font-bold ${STATUS_COLOR[selected.status] ?? 'text-text-muted'}`}>
                  {selected.status}
                </span>
              )}
            </>
          ) : (
            placeholder
          )}
        </span>
        <ChevronDown size={14} className="text-text-muted flex-shrink-0 ml-2" />
      </button>

      {/* Dropdown */}
      {open && (
        <div className={`absolute z-50 top-full ${align === 'right' ? 'right-0' : 'left-0'} w-full min-w-[320px] mt-1 bg-white border border-border-light shadow-md`}>
          {/* Search */}
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border-light">
            <Search size={13} className="text-text-muted flex-shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === 'Escape' && setOpen(false)}
              placeholder="搜尋批號、料號、廠商..."
              className="flex-1 text-[13px] outline-none bg-transparent text-text-primary placeholder:text-text-muted"
            />
          </div>
          {/* Options */}
          <ul className="max-h-[240px] overflow-y-auto">
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-[13px] text-text-muted">無符合結果</li>
            ) : (
              filtered.map(lot => (
                <li
                  key={lot.id}
                  onClick={() => handleSelect(lot)}
                  className={`px-3 py-2 text-[13px] cursor-pointer flex items-center justify-between hover:bg-bg-page ${lot.id === selectedLotId ? 'bg-bg-page font-semibold' : ''}`}
                >
                  <span className="truncate">{lotLabel(lot)}</span>
                  {lot.reviewed === false ? (
                    <span className="ml-3 flex-shrink-0 bg-badge-warn px-1.5 py-0.5 text-[10px] font-bold text-warning">
                      {notReviewedLabel}
                    </span>
                  ) : (
                    <span className={`text-[11px] font-bold ml-3 flex-shrink-0 ${STATUS_COLOR[lot.status] ?? 'text-text-muted'}`}>
                      {lot.status}
                    </span>
                  )}
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  )
}
