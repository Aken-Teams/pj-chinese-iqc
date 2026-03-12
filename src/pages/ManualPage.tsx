import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown, ChevronRight } from 'lucide-react'
import PageHeader from '@/components/layout/PageHeader'

interface Step {
  label: string
  desc: string
}

const SECTION_IDS = ['upload', 'review', 'compare', 'history', 'analytics', 'settings']

export default function ManualPage() {
  const { t } = useTranslation('manual')
  const [openIds, setOpenIds] = useState<Set<string>>(new Set(['upload']))

  const toggle = (id: string) => {
    setOpenIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="p-12">
      <PageHeader title={t('title')} subtitle={t('subtitle')} />

      <div className="mt-8 flex flex-col gap-3">
        {SECTION_IDS.map((id, index) => {
          const isOpen = openIds.has(id)
          const steps = t(`${id}.steps`, { returnObjects: true }) as Step[]
          const notes = t(`${id}.notes`, { returnObjects: true, defaultValue: [] }) as string[]

          return (
            <div key={id} className="bg-bg-card">
              {/* Section header — clickable */}
              <button
                type="button"
                onClick={() => toggle(id)}
                className="w-full flex items-center gap-4 px-6 py-4 text-left hover:bg-bg-dark-surface/30 transition-colors"
              >
                <span className="font-heading text-[11px] font-bold tracking-[2px] text-accent w-5 shrink-0">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <div className="flex-1 min-w-0">
                  <span className="font-heading text-[14px] font-semibold text-text-primary tracking-[0.5px]">
                    {t(`${id}.title`)}
                  </span>
                  <span className="ml-3 text-[12px] text-text-secondary">
                    {t(`${id}.subtitle`)}
                  </span>
                </div>
                {isOpen
                  ? <ChevronDown size={16} className="text-text-tertiary shrink-0" />
                  : <ChevronRight size={16} className="text-text-tertiary shrink-0" />
                }
              </button>

              {/* Expandable content */}
              {isOpen && (
                <div className="px-6 pb-6 border-t border-border-light">
                  <div className="mt-5 flex flex-col gap-4">
                    {Array.isArray(steps) && steps.map((step, i) => (
                      <div key={i} className="flex gap-4">
                        <div className="flex flex-col items-center shrink-0">
                          <div className="w-6 h-6 bg-accent flex items-center justify-center">
                            <span className="font-heading text-[10px] font-bold text-white">
                              {i + 1}
                            </span>
                          </div>
                          {i < steps.length - 1 && (
                            <div className="w-px flex-1 bg-border-light mt-1" />
                          )}
                        </div>
                        <div className="pb-4 min-w-0">
                          <p className="font-heading text-[12px] font-bold uppercase tracking-[0.5px] text-text-primary">
                            {step.label}
                          </p>
                          <p className="mt-1 text-[13px] text-text-secondary leading-relaxed">
                            {step.desc}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>

                  {Array.isArray(notes) && notes.length > 0 && (
                    <div className="mt-2 bg-bg-dark-surface/10 border-l-2 border-accent/50 px-4 py-3 flex flex-col gap-1.5">
                      {notes.map((note, i) => (
                        <p key={i} className="text-[12px] text-text-secondary leading-relaxed">
                          <span className="text-accent font-bold mr-1.5">!</span>
                          {note}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
