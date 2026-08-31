import type { ReactNode } from 'react'

interface PageHeaderProps {
  title: string
  subtitle?: string
  actions?: ReactNode
  /** Rendered immediately after the title — an InfoHint marker, usually. */
  titleAfter?: ReactNode
}

export default function PageHeader({ title, subtitle, actions, titleAfter }: PageHeaderProps) {
  return (
    <div className="flex items-start justify-between">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="font-heading text-[28px] font-bold text-text-primary">{title}</h1>
          {titleAfter}
        </div>
        {subtitle && (
          <p className="text-sm text-text-secondary mt-1">{subtitle}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-3">{actions}</div>}
    </div>
  )
}
