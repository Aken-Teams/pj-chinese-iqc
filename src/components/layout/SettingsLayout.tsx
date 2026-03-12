import { NavLink, Outlet } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ROUTES } from '@/config/routes'

const tabs = [
  { to: ROUTES.SETTINGS, labelKey: 'nav.general', end: true },
  { to: ROUTES.SETTINGS_VENDORS, labelKey: 'nav.vendors' },
  { to: ROUTES.SETTINGS_RULES, labelKey: 'nav.rules' },
  { to: ROUTES.SETTINGS_SPECS, labelKey: 'nav.specs' },
]

export default function SettingsLayout() {
  const { t } = useTranslation('settings')

  return (
    <div className="flex flex-col h-full">
      {/* Sub-navigation tab bar */}
      <div className="border-b border-border-light px-10 pt-8 flex gap-0">
        {tabs.map(({ to, labelKey, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `px-5 py-3 font-heading text-[13px] font-bold uppercase tracking-[1px] transition-colors border-b-2 -mb-px ${
                isActive
                  ? 'border-accent text-accent'
                  : 'border-transparent text-text-tertiary hover:text-text-primary'
              }`
            }
          >
            {t(labelKey)}
          </NavLink>
        ))}
      </div>

      {/* Page content */}
      <div className="flex-1 overflow-auto">
        <Outlet />
      </div>
    </div>
  )
}
