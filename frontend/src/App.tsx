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
const EmbedSavingsPage = page(() => import('./pages/EmbedSavingsPage'), 'EmbedSavingsPage')
const WidgetGuidePage = page(() => import('./pages/WidgetGuidePage'), 'WidgetGuidePage')
const BusinessPage = page(() => import('./pages/BusinessPage'), 'BusinessPage')
const ConditionStatsPage = page(() => import('./pages/ConditionStatsPage'), 'ConditionStatsPage')
const EarlyExitPage = page(() => import('./pages/EarlyExitPage'), 'EarlyExitPage')
const MySavingsPage = page(() => import('./pages/MySavingsPage'), 'MySavingsPage')
const SharePage = page(() => import('./pages/SharePage'), 'SharePage')
const AuthPage = page(() => import('./pages/AuthPage'), 'AuthPage')
const MyPage = page(() => import('./pages/MyPage'), 'MyPage')

// 위젯이 아닌 화면이 다른 사이트의 iframe 안에서 열렸는지. 그렇다면 로그인·내 정보 같은 화면을 눌리게 꾀는 것(클릭재킹)을 막으려고 내용을 보이지 않는다.
// 호스팅의 frame-ancestors 설정이 1차 방어이고, 이것은 설정이 빠졌을 때를 위한 2차 방어다.
function framedByAnotherPage() {
  try {
    return window.self !== window.top
  } catch {
    return true  // 다른 출처의 부모는 읽을 수 없어 예외가 나므로 갇힌 것으로 본다
  }
}

function App() {
  const { pathname } = useLocation()
  // 다른 사이트의 <iframe>에 들어가는 위젯은 바탕화면·작업표시줄·머니독·통계 동의 없이 계산기만 보인다.
  if (pathname.startsWith('/embed/')) {
    return <ScreenBoundary key={pathname}>
      <Suspense fallback={<p role="status">불러오는 중이에요…</p>}>
        <Routes>
          <Route path="/embed/savings" element={<EmbedSavingsPage />} />
          <Route path="*" element={<p role="alert">없는 위젯 주소예요.</p>} />
        </Routes>
      </Suspense>
    </ScreenBoundary>
  }
  if (framedByAnotherPage()) {
    return <main className="page" role="alert">
      <h1>Very Rich?</h1>
      <p>이 화면은 다른 페이지 안에서는 열지 않아요.</p>
      <p><a href={window.location.href} target="_blank" rel="noreferrer">새 창에서 열기</a></p>
    </main>
  }
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
        <Route path="/early-exit" element={<EarlyExitPage />} />
        <Route path="/condition-stats" element={<ConditionStatsPage />} />
        <Route path="/business" element={<BusinessPage />} />
        <Route path="/widget" element={<WidgetGuidePage />} />
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
