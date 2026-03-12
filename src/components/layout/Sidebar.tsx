import { useTranslation } from 'react-i18next'
import { NavLink, useLocation } from 'react-router-dom'
import {
  Cpu, LayoutGrid, Upload, FileSearch, GitCompare,
  History, ChartNoAxesColumn, Settings,
} from 'lucide-react'
import { ROUTES } from '@/config/routes'
import { useAppStore } from '@/store/appStore'
import { useAuthStore } from '@/store/authStore'

const navItems = [
  { icon: LayoutGrid, labelKey: 'nav.dashboard', to: ROUTES.DASHBOARD },
  { icon: Upload, labelKey: 'nav.upload', to: ROUTES.UPLOAD },
  { icon: FileSearch, labelKey: 'nav.review', to: ROUTES.REVIEW },
  { icon: GitCompare, labelKey: 'nav.compare', to: ROUTES.COMPARE },
  { icon: History, labelKey: 'nav.history', to: ROUTES.HISTORY },
  { icon: ChartNoAxesColumn, labelKey: 'nav.analytics', to: ROUTES.ANALYTICS },
  { icon: Settings, labelKey: 'nav.settings', to: ROUTES.SETTINGS },
]

export default function Sidebar() {
  const { t, i18n } = useTranslation()
  const location = useLocation()
  const collapsed = useAppStore((s) => s.sidebarCollapsed)
  const logout = useAuthStore((s) => s.logout)

  const cycleLang = () => {
    const langs = ['zh-CN', 'zh-TW', 'en']
    const idx = langs.indexOf(i18n.language)
    i18n.changeLanguage(langs[(idx + 1) % langs.length])
  }

  const langLabel: Record<string, string> = {
    'zh-CN': '简',
    'zh-TW': '繁',
    en: 'EN',
  }

  return (
    <aside
      className={`flex flex-col bg-bg-sidebar h-screen sticky top-0 transition-all ${
        collapsed ? 'w-14' : 'w-[260px]'
      }`}
    >
      {/* Logo */}
      <div className={`flex items-center gap-3 px-7 pt-10 pb-8 ${collapsed ? 'px-4 justify-center' : ''}`}>
        <Cpu size={24} className="text-accent shrink-0" />
        {!collapsed && (
          <span className="font-heading text-base font-bold tracking-[2px] text-text-on-dark">
            IQC SYSTEM
          </span>
        )}
      </div>

      {/* Nav */}
      <nav className="flex flex-col gap-1 px-4 flex-1">
        {navItems.map(({ icon: Icon, labelKey, to }) => {
          const isActive = location.pathname === to ||
            (to === ROUTES.REVIEW && location.pathname.startsWith('/review/'))
          return (
            <NavLink
              key={to}
              to={to}
              className={`flex items-center gap-3.5 px-3 py-2.5 transition-colors ${
                isActive
                  ? 'bg-bg-dark-surface text-accent'
                  : 'text-text-tertiary hover:text-text-on-dark'
              } ${collapsed ? 'justify-center px-0' : ''}`}
            >
              <Icon size={20} className="shrink-0" />
              {!collapsed && (
                <span className={`font-heading text-[13px] tracking-[1px] uppercase ${
                  isActive ? 'font-semibold' : 'font-medium'
                }`}>
                  {t(labelKey)}
                </span>
              )}
            </NavLink>
          )
        })}
      </nav>

      {/* Bottom: Language + Logout */}
      <div className={`px-4 pb-6 flex flex-col gap-2 ${collapsed ? 'items-center' : ''}`}>
        <button
          onClick={cycleLang}
          className="flex items-center gap-2 px-3 py-2 text-text-tertiary hover:text-text-on-dark transition-colors cursor-pointer"
        >
          <span className="font-heading text-[11px] tracking-[1px] font-semibold">
            {langLabel[i18n.language] || '简'}
          </span>
          {!collapsed && (
            <span className="font-body text-[11px] text-text-muted">
              {t(`language.${i18n.language === 'zh-CN' ? 'zhCN' : i18n.language === 'zh-TW' ? 'zhTW' : 'en'}`)}
            </span>
          )}
        </button>
        <button
          onClick={logout}
          className="flex items-center gap-2 px-3 py-2 text-text-muted hover:text-error transition-colors cursor-pointer text-[11px] font-heading tracking-[1px]"
        >
          {collapsed ? '×' : 'LOGOUT'}
        </button>
      </div>
    </aside>
  )
}
