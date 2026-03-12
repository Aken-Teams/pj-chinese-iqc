import { useState } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Cpu, User, EyeOff, Eye, Shield } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { login as apiLogin } from '@/services/auth'

export default function LoginPage() {
  const { t } = useTranslation('login')
  const navigate = useNavigate()
  const { isAuthenticated, login } = useAuthStore()
  const [employeeId, setEmployeeId] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />
  }

  const doLogin = async (id: string, pwd: string) => {
    setError('')
    setLoading(true)
    try {
      const res = await apiLogin(id, pwd)
      login({
        id: res.user.id,
        name: res.user.name,
        role: res.user.role,
        department: res.user.department || '',
        email: res.user.email || '',
        employeeId: res.user.employeeId,
      }, res.token)
      navigate('/dashboard')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('loginFailed'))
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    doLogin(employeeId, password)
  }

  const handleQuickLogin = () => {
    setEmployeeId('admin')
    setPassword('admin123')
    doLogin('admin', 'admin123')
  }

  return (
    <div className="flex h-screen">
      {/* Left panel - Branding */}
      <div className="w-[560px] bg-bg-sidebar flex flex-col justify-between px-[60px] py-20 shrink-0">
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-3">
              <Cpu size={32} className="text-accent" />
              <span className="font-heading text-[22px] font-bold tracking-[2px] text-text-on-dark">
                IQC SYSTEM
              </span>
            </div>
            <div className="flex items-center gap-2 pl-[44px]">
              <div className="w-[3px] h-[18px] bg-accent shrink-0" />
              <span className="text-[18px] font-semibold text-text-secondary tracking-wide">
                {t('clientName')}
              </span>
            </div>
          </div>
          <h2 className="font-heading text-[36px] font-bold text-white leading-[1.2] whitespace-pre-line mt-4">
            {t('tagline')}
          </h2>
          <p className="text-[15px] text-text-tertiary leading-[1.6] mt-2">
            {t('description')}
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <a
            href="https://www.zh-aoi.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[13px] font-semibold text-text-tertiary hover:text-accent transition-colors"
          >
            Powered by 智合科技 @ 2026
          </a>
          <span className="text-[12px] text-text-secondary">
            {t('version')}
          </span>
        </div>
      </div>

      {/* Right panel - Form */}
      <div className="flex-1 bg-bg-page flex items-center justify-center px-20">
        <form onSubmit={handleSubmit} className="w-[400px] bg-bg-card p-12 flex flex-col gap-7">
          <div className="flex flex-col gap-2">
            <h2 className="font-heading text-[28px] font-bold text-text-primary">
              {t('signIn')}
            </h2>
            <p className="text-sm text-text-secondary">{t('signInSubtitle')}</p>
          </div>

          {error && (
            <div className="bg-badge-fail text-error text-sm px-4 py-2.5 font-medium">
              {error}
            </div>
          )}

          {/* Employee ID */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-semibold text-text-tertiary tracking-[1px] uppercase">
              {t('employeeId')}
            </label>
            <div className="flex items-center bg-bg-page border border-border-light px-3 py-2.5">
              <User size={16} className="text-text-tertiary mr-3 shrink-0" />
              <input
                type="text"
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value)}
                placeholder={t('employeeIdPlaceholder')}
                className="flex-1 bg-transparent outline-none text-sm text-text-primary placeholder:text-text-tertiary"
              />
            </div>
          </div>

          {/* Password */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-semibold text-text-tertiary tracking-[1px] uppercase">
              {t('password')}
            </label>
            <div className="flex items-center bg-bg-page border border-border-light px-3 py-2.5">
              <Shield size={16} className="text-text-tertiary mr-3 shrink-0" />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t('passwordPlaceholder')}
                className="flex-1 bg-transparent outline-none text-sm text-text-primary placeholder:text-text-tertiary"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="text-text-tertiary hover:text-text-primary cursor-pointer"
              >
                {showPassword ? <Eye size={16} /> : <EyeOff size={16} />}
              </button>
            </div>
          </div>

          {/* Sign In */}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-accent text-white font-heading text-[15px] font-bold tracking-[1px] uppercase py-3.5 hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50"
          >
            {loading ? '...' : t('signInButton')}
          </button>

          {/* Divider */}
          <div className="flex items-center gap-4">
            <div className="flex-1 h-px bg-border-light" />
            <span className="text-[12px] text-text-muted">{t('or')}</span>
            <div className="flex-1 h-px bg-border-light" />
          </div>

          {/* Quick Login */}
          <button
            type="button"
            onClick={handleQuickLogin}
            className="w-full bg-bg-page border border-border-light text-text-secondary font-heading text-[13px] font-semibold tracking-[1px] py-3 flex items-center justify-center gap-2 hover:bg-border-light transition-colors cursor-pointer"
          >
            <Shield size={16} />
            {t('quickLogin')}
          </button>
        </form>
      </div>
    </div>
  )
}
