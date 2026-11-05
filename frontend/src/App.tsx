import { lazy, Suspense } from 'react'
import { Route, Routes, useLocation } from 'react-router-dom'
import './App.css'
import './pages/SavingsPages.css'
import { AppLayout } from './components/AppLayout'
import { ScreenBoundary } from './components/ScreenBoundary'
import { HomePage } from './pages/HomePage'
import { NotFoundPage } from './pages/NotFoundPage'

// Every screen except the home one is fetched when it is first opened, so the first visit does not download all of them.
function page<T extends Record<string, React.ComponentType>>(load: () => Promise<T>, name: keyof T) {
  return lazy(async () => ({ default: (await load())[name] }))
}

const AboutPage = page(() => import('./pages/AboutPage'), 'AboutPage')
const AlternativesPage = page(() => import('./pages/AlternativesPage'), 'AlternativesPage')
const BankDetailPage = page(() => import('./pages/BankDetailPage'), 'BankDetailPage')
const BanksPage = page(() => import('./pages/BanksPage'), 'BanksPage')
const CashflowPage = page(() => import('./pages/CashflowPage'), 'CashflowPage')
const ConditionsPage = page(() => import('./pages/ConditionsPage'), 'ConditionsPage')
const DailyPage = page(() => import('./pages/DailyPage'), 'DailyPage')
const MarketPage = page(() => import('./pages/MarketPage'), 'MarketPage')
const MaturityPage = page(() => import('./pages/MaturityPage'), 'MaturityPage')
const GeneralSavingsPage = page(() => import('./pages/GeneralSavingsPage'), 'GeneralSavingsPage')
const AdminPage = page(() => import('./pages/AdminPage'), 'AdminPage')
const ProductDetailPage = page(() => import('./pages/ProductDetailPage'), 'ProductDetailPage')
const RentLoansPage = page(() => import('./pages/RentLoansPage'), 'RentLoansPage')
const YouthPoliciesPage = page(() => import('./pages/YouthPoliciesPage'), 'YouthPoliciesPage')
const PrivacyPage = page(() => import('./pages/LegalPages'), 'PrivacyPage')
const ServiceTermsPage = page(() => import('./pages/LegalPages'), 'ServiceTermsPage')
const TermsPage = page(() => import('./pages/TermsPage'), 'TermsPage')
const MySavingsPage = page(() => import('./pages/MySavingsPage'), 'MySavingsPage')
const SharePage = page(() => import('./pages/SharePage'), 'SharePage')
const AuthPage = page(() => import('./pages/AuthPage'), 'AuthPage')
const MyPage = page(() => import('./pages/MyPage'), 'MyPage')

function App() {
  const { pathname } = useLocation()
  return (
    <AppLayout>
      <ScreenBoundary key={pathname}>
      <Suspense fallback={<p className="page page--loading" role="status">화면을 불러오는 중이에요…</p>}>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/auth" element={<AuthPage />} />
        <Route path="/me" element={<MyPage />} />
        <Route path="/conditions" element={<ConditionsPage />} />
        <Route path="/banks" element={<BanksPage />} />
        <Route path="/banks/:bankId" element={<BankDetailPage />} />
        <Route path="/cashflow" element={<CashflowPage />} />
        <Route path="/alternatives" element={<AlternativesPage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/daily" element={<DailyPage />} />
        <Route path="/market" element={<MarketPage />} />
        <Route path="/maturity" element={<MaturityPage />} />
        <Route path="/share" element={<SharePage />} />
        <Route path="/my-savings" element={<MySavingsPage />} />
        <Route path="/general-savings" element={<GeneralSavingsPage />} />
        <Route path="/rent-loans" element={<RentLoansPage />} />
        <Route path="/youth-policies" element={<YouthPoliciesPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/product" element={<ProductDetailPage />} />
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/service-terms" element={<ServiceTermsPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
      </Suspense>
      </ScreenBoundary>
    </AppLayout>
  )
}

export default App
