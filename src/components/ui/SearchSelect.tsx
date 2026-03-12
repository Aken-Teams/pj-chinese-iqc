import { useState, useEffect, useRef } from 'react'
import { ChevronDown, Search } from 'lucide-react'

interface SearchSelectProps {
  items: string[]
  value: string
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  className?: string
  align?: 'left' | 'right'
}

export default function SearchSelect({
  items,
  value,
  onChange,
  placeholder = '-- 請選擇 --',
  disabled = false,
  className = '',
  align = 'left',
}: SearchSelectProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const filtered = query
    ? items.filter(item => item.toLowerCase().includes(query.toLowerCase()))
    : items

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleOpen = () => {
    if (disabled) return
    setOpen(true)
    setQuery('')
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  const handleSelect = (item: string) => {
    onChange(item)
    setOpen(false)
    setQuery('')
  }

  return (
    <div className={`relative ${className}`} ref={ref}>
      <button
        type="button"
        onClick={handleOpen}
        disabled={disabled}
        className="w-full flex items-center justify-between border border-border-light bg-bg-card px-3 py-2 text-[13px] text-text-primary hover:border-accent/60 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <span className={value ? 'text-text-primary' : 'text-text-muted truncate'}>
          {value || placeholder}
        </span>
        <ChevronDown size={14} className="text-text-muted flex-shrink-0 ml-2" />
      </button>

      {open && (
        <div className={`absolute z-50 top-full ${align === 'right' ? 'right-0' : 'left-0'} w-full min-w-[220px] mt-1 bg-white border border-border-light shadow-md`}>
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border-light">
            <Search size={13} className="text-text-muted flex-shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === 'Escape' && setOpen(false)}
              placeholder="搜尋參數..."
              className="flex-1 text-[13px] outline-none bg-transparent text-text-primary placeholder:text-text-muted"
            />
          </div>
          <ul className="max-h-[240px] overflow-y-auto">
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-[13px] text-text-muted">無符合結果</li>
            ) : (
              filtered.map(item => (
                <li
                  key={item}
                  onClick={() => handleSelect(item)}
                  className={`px-3 py-2 text-[13px] cursor-pointer hover:bg-bg-page ${item === value ? 'bg-bg-page font-semibold text-text-primary' : 'text-text-secondary'}`}
                >
                  {item}
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  )
}
