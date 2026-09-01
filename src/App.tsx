import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import AppLayout from '@/components/layout/AppLayout'
import SettingsLayout from '@/components/layout/SettingsLayout'
import LoginPage from '@/pages/LoginPage'
import DashboardPage from '@/pages/DashboardPage'
import UploadPage from '@/pages/UploadPage'
import ReviewPage from '@/pages/ReviewPage'
import ReviewDetailPage from '@/pages/ReviewDetailPage'
import ComparePage from '@/pages/ComparePage'
import HistoryPage from '@/pages/HistoryPage'
import AnalyticsPage from '@/pages/AnalyticsPage'
import ManualPage from '@/pages/ManualPage'
import AdminAiUsagePage from '@/pages/AdminAiUsagePage'
import CrossLotPage from '@/pages/CrossLotPage'
import SettingsPage from '@/pages/SettingsPage'
import VendorsPage from '@/pages/settings/VendorsPage'
import RulesPage from '@/pages/settings/RulesPage'
import SpecsPage from '@/pages/settings/SpecsPage'
import VendorScoresPage from '@/pages/settings/VendorScoresPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<AppLayout />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/upload" element={<UploadPage />} />
          <Route path="/review" element={<ReviewPage />} />
          <Route path="/review/:lotId/wafer/:waferId" element={<ReviewDetailPage />} />
          <Route path="/compare" element={<ComparePage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/analytics" element={<AnalyticsPage />} />
          <Route path="/cross-lot" element={<CrossLotPage />} />
          <Route path="/manual" element={<ManualPage />} />
          <Route path="/admin/ai-usage" element={<AdminAiUsagePage />} />
          <Route path="/settings" element={<SettingsLayout />}>
            <Route index element={<SettingsPage />} />
            <Route path="vendors" element={<VendorsPage />} />
            <Route path="rules" element={<RulesPage />} />
            <Route path="specs" element={<SpecsPage />} />
            <Route path="scores" element={<VendorScoresPage />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
