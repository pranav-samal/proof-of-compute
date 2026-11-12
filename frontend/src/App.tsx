import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppLayout } from './components/layout/AppLayout';
import { LandingPage } from './pages/LandingPage';
import { MarketplacePage } from './pages/MarketplacePage';
import { SubmitJobPage } from './pages/SubmitJobPage';
import { DashboardPage } from './pages/DashboardPage';
import { JobDetailsPage } from './pages/JobDetailsPage';
import { ProviderConsolePage } from './pages/ProviderConsolePage';
import { VerifierConsolePage } from './pages/VerifierConsolePage';
import { ReceiptPage } from './pages/ReceiptPage';
import { SimulationPage } from './pages/SimulationPage';
import { VerificationPage } from './pages/VerificationPage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<LandingPage />} />
          <Route path="/marketplace" element={<MarketplacePage />} />
          <Route path="/submit-job" element={<SubmitJobPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/jobs" element={<JobDetailsPage />} />
          <Route path="/jobs/:jobId" element={<JobDetailsPage />} />
          <Route path="/provider" element={<ProviderConsolePage />} />
          <Route path="/verifier" element={<VerifierConsolePage />} />
          <Route path="/receipt" element={<ReceiptPage />} />
          <Route path="/receipt/:jobId" element={<ReceiptPage />} />
          <Route path="/simulation" element={<SimulationPage />} />
          <Route path="/verification" element={<VerificationPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
