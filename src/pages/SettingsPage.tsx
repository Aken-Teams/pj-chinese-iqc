import { useTranslation } from 'react-i18next'
import { User, Palette, Info } from 'lucide-react'
import PageHeader from '@/components/layout/PageHeader'

export default function SettingsPage() {
  const { t, i18n } = useTranslation('settings')

  const languages = [
    { code: 'zh-CN', label: '简体中文' },
    { code: 'zh-TW', label: '繁體中文' },
    { code: 'en', label: 'English' },
  ] as const

  const placeholderSections = [
    { icon: User, titleKey: 'profile', descKey: 'profileDesc' },
    { icon: Palette, titleKey: 'theme', descKey: 'themeDesc' },
    { icon: Info, titleKey: 'about', descKey: 'aboutDesc' },
  ] as const

  return (
    <div className="p-12">
      <PageHeader title={t('title')} />

      {/* Language */}
      <div className="mt-7 bg-bg-card p-6">
        <h2 className="font-heading text-sm font-bold uppercase tracking-[1px]">
          {t('language')}
        </h2>
        <p className="mt-1 text-[13px] text-text-secondary">{t('languageDesc')}</p>
        <div className="mt-4 flex gap-3">
          {languages.map(({ code, label }) => (
            <button
              key={code}
              onClick={() => i18n.changeLanguage(code)}
              className={`px-5 py-2.5 text-sm font-medium transition-colors cursor-pointer ${
                i18n.language === code
                  ? 'bg-accent text-white'
                  : 'bg-bg-page text-text-primary border border-border-light hover:bg-border-light'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Placeholder sections */}
      <div className="mt-5 flex flex-col gap-4">
        {placeholderSections.map(({ icon: Icon, titleKey, descKey }) => (
          <div key={titleKey} className="bg-bg-card p-6 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Icon size={20} className="text-text-muted" />
              <div>
                <h2 className="font-heading text-sm font-bold uppercase tracking-[1px]">
                  {t(titleKey)}
                </h2>
                <p className="mt-0.5 text-[13px] text-text-secondary">{t(descKey)}</p>
              </div>
            </div>
            <span className="text-[11px] font-bold text-text-muted uppercase tracking-[1px]">
              {t('comingSoon')}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
