import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { NavLink, useLocation } from 'react-router-dom'
import {
  BookOpen, ChartNoAxesColumn, ChevronDown, Coins, Cpu, FileSearch, GitCompare, History, LayoutGrid, LogOut, PanelLeftClose, PanelLeftOpen, Settings, TrendingUp, Upload,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { ROUTES } from '@/config/routes'
import { useAppStore } from '@/store/appStore'
import { useAuthStore } from '@/store/authStore'

interface NavItem {
  icon: LucideIcon
  labelKey: string
  to: string
  adminOnly?: boolean
}

// Grouped so users can tell which features belong together. One group is
// expanded at a time (accordion); the group of the current page opens by default.
const navGroups: { id: string; titleKey: string; items: NavItem[] }[] = [
  {
    id: 'operations',
    titleKey: 'navGroup.operations',
    items: [
      { icon: LayoutGrid, labelKey: 'nav.dashboard', to: ROUTES.DASHBOARD },
      { icon: Upload, labelKey: 'nav.upload', to: ROUTES.UPLOAD },
      { icon: FileSearch, labelKey: 'nav.review', to: ROUTES.REVIEW },
      { icon: GitCompare, labelKey: 'nav.compare', to: ROUTES.COMPARE },
    ],
  },
  {
    id: 'analysis',
    titleKey: 'navGroup.analysis',
    items: [
      { icon: History, labelKey: 'nav.history', to: ROUTES.HISTORY },
      { icon: ChartNoAxesColumn, labelKey: 'nav.analytics', to: ROUTES.ANALYTICS },
      // Cross-lot work sits apart from 分析 & AI on purpose: that page is scoped
      // to one lot throughout, and this one to a product over a period.
      { icon: TrendingUp, labelKey: 'nav.crossLot', to: ROUTES.CROSS_LOT },
    ],
  },
  {
    id: 'system',
    titleKey: 'navGroup.system',
    items: [
      { icon: BookOpen, labelKey: 'nav.manual', to: ROUTES.MANUAL },
      { icon: Coins, labelKey: 'nav.aiUsage', to: ROUTES.ADMIN_AI_USAGE, adminOnly: true },
      { icon: Settings, labelKey: 'nav.settings', to: ROUTES.SETTINGS },
    ],
  },
]

export default function Sidebar() {
  const { t, i18n } = useTranslation()
  const location = useLocation()
  const collapsed = useAppStore((s) => s.sidebarCollapsed)
  const toggleSidebar = useAppStore((s) => s.toggleSidebar)
  const { user, logout } = useAuthStore()

  const isRouteActive = (to: string) =>
    location.pathname === to ||
    (to === ROUTES.REVIEW && location.pathname.startsWith('/review/')) ||
    (to === ROUTES.SETTINGS && location.pathname.startsWith('/settings'))

  // Which group holds the current page — that one opens by default.
  const activeGroupId =
    navGroups.find((g) => g.items.some((i) => isRouteActive(i.to)))?.id ?? navGroups[0].id
  const [expandedGroup, setExpandedGroup] = useState<string | null>(activeGroupId)
  // Navigating to a page auto-opens its group.
  useEffect(() => { setExpandedGroup(activeGroupId) }, [activeGroupId])

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

  const visibleItems = (items: NavItem[]) =>
    items.filter((i) => !i.adminOnly || user?.role === 'admin')

  // Non-empty groups (after admin filtering) — shared by both layouts.
  const groupsToShow = navGroups
    .map((g) => ({ ...g, items: visibleItems(g.items) }))
    .filter((g) => g.items.length > 0)

  const renderItem = ({ icon: Icon, labelKey, to }: NavItem) => {
    const isActive = isRouteActive(to)
    return (
      <div key={to} className="relative group">
        <NavLink
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
        {collapsed && (
          <div className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-2 z-50 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
            <div className={`border-l-2 px-3 py-1.5 whitespace-nowrap bg-bg-dark-surface shadow-lg ${
              isActive ? 'border-accent' : 'border-text-tertiary'
            }`}>
              <span className="font-heading text-[11px] tracking-[1px] uppercase text-text-on-dark">
                {t(labelKey)}
              </span>
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <aside
      className={`flex flex-col bg-bg-sidebar h-screen sticky top-0 transition-all ${
        collapsed ? 'w-14' : 'w-[260px]'
      }`}
    >
      {/* Logo + Toggle */}
      <div className={`flex items-center pt-10 pb-8 ${collapsed ? 'flex-col gap-4 px-0' : 'px-7 gap-3'}`}>
        <div className={`flex items-center gap-3 flex-1 min-w-0 ${collapsed ? 'justify-center' : ''}`}>
          <Cpu size={24} className="text-accent shrink-0" />
          {!collapsed && (
            <span className="font-heading text-base font-bold tracking-[2px] text-text-on-dark">
              IQC SYSTEM
            </span>
          )}
        </div>
        <button
          onClick={toggleSidebar}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="text-text-tertiary hover:text-text-on-dark transition-colors cursor-pointer shrink-0"
        >
          {collapsed
            ? <PanelLeftOpen size={16} />
            : <PanelLeftClose size={16} />
          }
        </button>
      </div>

      {/* Nav — collapsed: flat icons; expanded: accordion groups */}
      <nav className={`flex flex-col gap-1 px-4 flex-1 ${collapsed ? 'overflow-visible' : 'overflow-y-auto'}`}>
        {collapsed
          ? groupsToShow.map((group, gi) => {
              const open = expandedGroup === group.id
              return (
                <div key={group.id} className="flex flex-col gap-1">
                  {gi > 0 && <div className="h-px bg-bg-dark-surface mx-2 mt-2" />}
                  <button
                    onClick={() => setExpandedGroup(open ? null : group.id)}
                    title={t(group.titleKey)}
                    className={`text-center font-heading text-[11px] font-bold uppercase tracking-[0.5px] pt-1 transition-colors cursor-pointer ${
                      open ? 'text-text-tertiary' : 'text-text-muted hover:text-text-tertiary'
                    }`}
                  >
                    {t(`${group.titleKey}Short`)}
                  </button>
                  {open && group.items.map(renderItem)}
                </div>
              )
            })
          : groupsToShow.map((group) => {
              const open = expandedGroup === group.id
              return (
                <div key={group.id} className="flex flex-col">
                  <button
                    onClick={() => setExpandedGroup(open ? null : group.id)}
                    className="flex items-center justify-between px-3 py-2 mt-1.5 text-text-muted hover:text-text-tertiary transition-colors cursor-pointer"
                  >
                    <span className="font-heading text-[13px] font-bold uppercase tracking-[2px]">
                      {t(group.titleKey)}
                    </span>
                    <ChevronDown size={14} className={`transition-transform ${open ? '' : '-rotate-90'}`} />
                  </button>
                  {open && <div className="flex flex-col gap-1">{group.items.map(renderItem)}</div>}
                </div>
              )
            })}
      </nav>

      {/* Bottom: User + Language + Logout */}
      <div className={`px-4 pb-6 flex flex-col gap-2 ${collapsed ? 'items-center' : ''}`}>
        {/* User info */}
        {user && (
          <div className={`flex items-center gap-3 px-3 py-2 ${collapsed ? 'justify-center px-0' : ''}`}>
            <div className="w-8 h-8 bg-accent flex items-center justify-center shrink-0">
              <span className="font-heading text-xs font-bold text-white">
                {user.name.charAt(0).toUpperCase()}
              </span>
            </div>
            {!collapsed && (
              <div className="flex flex-col min-w-0">
                <span className="text-[12px] font-semibold text-text-on-dark truncate">
                  {user.name}
                </span>
                <span className="text-[10px] text-text-muted truncate">
                  {user.employeeId}
                </span>
              </div>
            )}
          </div>
        )}

        <div className="h-px bg-bg-dark-surface mx-3" />

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
          className="flex items-center gap-2 px-3 py-2 text-text-muted hover:text-error transition-colors cursor-pointer"
        >
          <LogOut size={14} className="shrink-0" />
          {!collapsed && (
            <span className="text-[11px] font-heading tracking-[1px]">LOGOUT</span>
          )}
        </button>
      </div>
    </aside>
  )
}
