import { useTranslation } from 'react-i18next'
import { Sun, Moon, Monitor, Info } from 'lucide-react'
import PageHeader from '@/components/layout/PageHeader'
import { useAuthStore } from '@/store/authStore'
import { useAppStore, type Theme } from '@/store/appStore'

const themeOptions: { value: Theme; icon: typeof Sun; labelKey: string }[] = [
  { value: 'light', icon: Sun, labelKey: 'themeLight' },
  { value: 'dark', icon: Moon, labelKey: 'themeDark' },
  { value: 'system', icon: Monitor, labelKey: 'themeSystem' },
]

export default function SettingsPage() {
  const { t, i18n } = useTranslation('settings')
  const user = useAuthStore((s) => s.user)
  const { theme, setTheme } = useAppStore()

  const languages = [
    { code: 'zh-CN', label: '简体中文' },
    { code: 'zh-TW', label: '繁體中文' },
    { code: 'en', label: 'English' },
  ] as const

  const profileFields = [
    { labelKey: 'name', value: user?.name },
    { labelKey: 'employeeId', value: user?.employeeId },
    { labelKey: 'role', value: t('roleAdmin') },
    { labelKey: 'department', value: user?.department },
    { labelKey: 'email', value: user?.email },
  ]

  return (
    <div className="p-9 pl-11 flex flex-col gap-5">
      <PageHeader title={t('title')} />

      {/* Profile */}
      <div className="bg-bg-card p-6">
        <h2 className="font-heading text-sm font-bold uppercase tracking-[1px]">
          {t('profile')}
        </h2>
        <p className="mt-1 text-[13px] text-text-secondary">{t('profileDesc')}</p>
        <div className="mt-5 flex items-start gap-6">
          {/* Avatar */}
          <div className="w-16 h-16 bg-accent flex items-center justify-center shrink-0">
            <span className="font-heading text-xl font-bold text-white">
              {user?.name?.charAt(0)?.toUpperCase() || 'U'}
            </span>
          </div>
          {/* Fields */}
          <div className="flex-1 grid grid-cols-2 gap-x-10 gap-y-4">
            {profileFields.map(({ labelKey, value }) => (
              <div key={labelKey} className="flex flex-col gap-0.5">
                <span className="text-[10px] font-semibold text-text-muted uppercase tracking-[1px]">
                  {t(labelKey)}
                </span>
                <span className="text-sm text-text-primary font-medium">
                  {value || '—'}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Theme */}
      <div className="bg-bg-card p-6">
        <h2 className="font-heading text-sm font-bold uppercase tracking-[1px]">
          {t('theme')}
        </h2>
        <p className="mt-1 text-[13px] text-text-secondary">{t('themeDesc')}</p>
        <div className="mt-4 flex gap-3">
          {themeOptions.map(({ value, icon: Icon, labelKey }) => (
            <button
              key={value}
              onClick={() => setTheme(value)}
              className={`flex items-center gap-2 px-5 py-2.5 text-sm font-medium transition-colors cursor-pointer ${
                theme === value
                  ? 'bg-accent text-white'
                  : 'bg-bg-page text-text-primary border border-border-light hover:bg-border-light'
              }`}
            >
              <Icon size={16} />
              {t(labelKey)}
            </button>
          ))}
        </div>
      </div>

      {/* Language */}
      <div className="bg-bg-card p-6">
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

      {/* About */}
      <div className="bg-bg-card p-6 flex items-center gap-4">
        <Info size={20} className="text-text-muted shrink-0" />
        <div>
          <h2 className="font-heading text-sm font-bold uppercase tracking-[1px]">
            {t('about')}
          </h2>
          <p className="mt-0.5 text-[13px] text-text-secondary">{t('aboutDesc')}</p>
        </div>
      </div>
    </div>
  )
}
