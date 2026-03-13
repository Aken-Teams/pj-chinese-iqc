import { useState, useEffect, useRef } from 'react'
import { ChevronDown, Search } from 'lucide-react'
import type { Product } from '@/services/vendors'

interface Props {
  products: Product[]
  selectedProductId: number | null
  onSelect: (id: number | null) => void
  placeholder?: string
  className?: string
}

export default function ProductSearchSelect({
  products,
  selectedProductId,
  onSelect,
  placeholder = '請選擇產品',
  className = '',
}: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const selected = products.find(p => p.id === selectedProductId)
  const displayLabel = selected ? `[${selected.vendor_code}] ${selected.product_code}` : ''

  const filtered = query
    ? products.filter(p =>
        `${p.vendor_code} ${p.product_code}`.toLowerCase().includes(query.toLowerCase())
      )
    : products

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

  const handleSelect = (id: number | null) => {
    onSelect(id)
    setOpen(false)
    setQuery('')
  }

  return (
    <div className={`relative ${className}`} ref={ref}>
      <button
        type="button"
        onClick={handleOpen}
        className="w-full flex items-center justify-between border border-border-light bg-bg-card px-3 py-2 text-[13px] text-text-primary hover:border-accent/60 min-w-[200px]"
      >
        <span className={displayLabel ? 'text-text-primary' : 'text-text-muted'}>
          {displayLabel || placeholder}
        </span>
        <ChevronDown size={14} className="text-text-muted flex-shrink-0 ml-2" />
      </button>

      {open && (
        <div className="absolute z-50 top-full left-0 w-full min-w-[240px] mt-1 bg-white border border-border-light shadow-md">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border-light">
            <Search size={13} className="text-text-muted flex-shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === 'Escape' && setOpen(false)}
              placeholder="搜尋廠商 / 產品..."
              className="flex-1 text-[13px] outline-none bg-transparent text-text-primary placeholder:text-text-muted"
            />
          </div>
          <ul className="max-h-[240px] overflow-y-auto">
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-[13px] text-text-muted">無符合結果</li>
            ) : (
              filtered.map(p => (
                <li
                  key={p.id}
                  onClick={() => handleSelect(p.id)}
                  className={`px-3 py-2 text-[13px] cursor-pointer hover:bg-bg-page flex items-center gap-2 ${
                    p.id === selectedProductId ? 'bg-bg-page font-semibold text-text-primary' : 'text-text-secondary'
                  }`}
                >
                  <span className="text-[11px] text-text-muted font-mono">[{p.vendor_code}]</span>
                  <span>{p.product_code}</span>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  )
}
