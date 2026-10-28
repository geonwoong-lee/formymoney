import { Navigate, Route, Routes } from 'react-router-dom'
import './App.css'
import { AppLayout } from './components/AppLayout'
import { AboutPage } from './pages/AboutPage'
import { AlternativesPage } from './pages/AlternativesPage'
import { BankDetailPage } from './pages/BankDetailPage'
import { BanksPage } from './pages/BanksPage'
import { CashflowPage } from './pages/CashflowPage'
import { ConditionsPage } from './pages/ConditionsPage'
import { HomePage } from './pages/HomePage'
import { AuthPage } from './pages/AuthPage'
import { MyPage } from './pages/MyPage'

function App() {
  return (
    <AppLayout>
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
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppLayout>
  )
}

export default App
