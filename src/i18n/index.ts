import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'

import zhCNCommon from './locales/zh-CN/common.json'
import zhCNLogin from './locales/zh-CN/login.json'
import zhCNDashboard from './locales/zh-CN/dashboard.json'
import zhCNUpload from './locales/zh-CN/upload.json'
import zhCNReview from './locales/zh-CN/review.json'
import zhCNCompare from './locales/zh-CN/compare.json'
import zhCNHistory from './locales/zh-CN/history.json'
import zhCNAnalytics from './locales/zh-CN/analytics.json'
import zhCNSettings from './locales/zh-CN/settings.json'

import zhTWCommon from './locales/zh-TW/common.json'
import zhTWLogin from './locales/zh-TW/login.json'
import zhTWDashboard from './locales/zh-TW/dashboard.json'
import zhTWUpload from './locales/zh-TW/upload.json'
import zhTWReview from './locales/zh-TW/review.json'
import zhTWCompare from './locales/zh-TW/compare.json'
import zhTWHistory from './locales/zh-TW/history.json'
import zhTWAnalytics from './locales/zh-TW/analytics.json'
import zhTWSettings from './locales/zh-TW/settings.json'

import enCommon from './locales/en/common.json'
import enLogin from './locales/en/login.json'
import enDashboard from './locales/en/dashboard.json'
import enUpload from './locales/en/upload.json'
import enReview from './locales/en/review.json'
import enCompare from './locales/en/compare.json'
import enHistory from './locales/en/history.json'
import enAnalytics from './locales/en/analytics.json'
import enSettings from './locales/en/settings.json'

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      'zh-CN': {
        common: zhCNCommon, login: zhCNLogin, dashboard: zhCNDashboard,
        upload: zhCNUpload, review: zhCNReview, compare: zhCNCompare,
        history: zhCNHistory, analytics: zhCNAnalytics, settings: zhCNSettings,
      },
      'zh-TW': {
        common: zhTWCommon, login: zhTWLogin, dashboard: zhTWDashboard,
        upload: zhTWUpload, review: zhTWReview, compare: zhTWCompare,
        history: zhTWHistory, analytics: zhTWAnalytics, settings: zhTWSettings,
      },
      en: {
        common: enCommon, login: enLogin, dashboard: enDashboard,
        upload: enUpload, review: enReview, compare: enCompare,
        history: enHistory, analytics: enAnalytics, settings: enSettings,
      },
    },
    fallbackLng: 'zh-CN',
    defaultNS: 'common',
    interpolation: { escapeValue: false },
  })

export default i18n
