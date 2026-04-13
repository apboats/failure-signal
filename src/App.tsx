import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AppShell } from './components/layout/AppShell'
import { Dashboard } from './pages/Dashboard'
import { InstitutionDetail } from './pages/InstitutionDetail'
import { AlertsConfig } from './pages/AlertsConfig'
import { HistoricalAnalysis } from './pages/HistoricalAnalysis'
import { TradingSignals } from './pages/TradingSignals'
import { Portfolio } from './pages/Portfolio'

export default function App() {
  return (
    <BrowserRouter>
      <AppShell>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/institution/:id" element={<InstitutionDetail />} />
          <Route path="/signals" element={<TradingSignals />} />
          <Route path="/portfolio" element={<Portfolio />} />
          <Route path="/alerts" element={<AlertsConfig />} />
          <Route path="/history" element={<HistoricalAnalysis />} />
        </Routes>
      </AppShell>
    </BrowserRouter>
  )
}
