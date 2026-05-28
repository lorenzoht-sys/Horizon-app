import { lazy, Suspense, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useDevice } from './hooks/useDevice';
import AppMobile from './pages/mobile/AppMobile';
import { Toaster } from 'react-hot-toast';
import Sidebar from './components/layout/Sidebar';
import Dashboard from './pages/Dashboard';
import ParticipantProfile from './pages/ParticipantProfile';
import NewBilan from './pages/NewBilan';
import BilanDetail from './pages/BilanDetail';
import ClientView from './pages/ClientView';
import ProgrammePage from './pages/ProgrammePage';
import ExercicesPage from './pages/ExercicesPage';
import LoginPage from './pages/LoginPage';
import SettingsPage from './pages/SettingsPage';
import ContratNouveauPage from './pages/ContratNouveauPage';
import ComparaisonPage from './pages/ComparaisonPage';
import StatsPage from './pages/StatsPage';
import PageAccesPatient from './pages/PageAccesPatient';
import EspacePatient from './pages/EspacePatient';
import OnboardingModal from './components/OnboardingModal';
import { BandeauHorsLigne, NotificationMiseAJour } from './components/pwa/PWAComponents';

// Lazy load : Leaflet est lourd (~150kb) — chargé uniquement sur /map, /tournee, /zones
const MapPage    = lazy(() => import('./pages/MapPage'));
const AgendaPage = lazy(() => import('./pages/AgendaPage'));
const TourneePage = lazy(() => import('./pages/TourneePage'));
const ZonesPage  = lazy(() => import('./pages/ZonesPage'));

function MapFallback() {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="text-gray-400 text-sm">Chargement de la carte…</div>
    </div>
  );
}

export default function App() {
  const { isMobile } = useDevice();
  const [isLoggedIn, setIsLoggedIn] = useState(() =>
    localStorage.getItem('isLoggedIn') === 'true'
  );
  const [showOnboarding, setShowOnboarding] = useState(() =>
    isLoggedIn &&
    !localStorage.getItem('settings_praticien') &&
    !localStorage.getItem('onboarding_complete')
  );

  function handleLogin() {
    setIsLoggedIn(true);
    if (!localStorage.getItem('settings_praticien') && !localStorage.getItem('onboarding_complete')) {
      setShowOnboarding(true);
    }
  }

  function handleLogout() {
    localStorage.removeItem('isLoggedIn');
    setIsLoggedIn(false);
  }

  return (
    <BrowserRouter>
      <BandeauHorsLigne />
      <NotificationMiseAJour />
      <Toaster position="top-right" toastOptions={{ style: { borderRadius: 12, fontSize: 14 } }} />
      <Routes>
        {/* Page de connexion */}
        <Route path="/login" element={
          isLoggedIn ? <Navigate to="/" replace /> : <LoginPage onLogin={handleLogin} />
        } />

        {/* Vue client : pas de sidebar */}
        <Route path="/client/:token" element={<ClientView />} />

        {/* Espace patient — public, sans auth praticien */}
        <Route path="/patient" element={<PageAccesPatient />} />
        <Route path="/patient/:id" element={<EspacePatient />} />

        {/* Interface pro — protégée */}
        <Route
          path="*"
          element={
            isLoggedIn ? (
              isMobile ? (
                <AppMobile onLogout={handleLogout} />
              ) : (
              <div className="flex min-h-screen" style={{ background: '#F4FAFA' }}>
                {showOnboarding && <OnboardingModal onClose={() => setShowOnboarding(false)} />}

                {/* Sidebar fixe */}
                <Sidebar
                  onShowOnboarding={() => setShowOnboarding(true)}
                  onLogout={handleLogout}
                />

                {/* Zone contenu */}
                <div style={{ marginLeft: 220, flex: 1, minHeight: '100vh', background: '#FFFFFF' }}>
                  <Routes>
                    <Route path="/" element={<Dashboard />} />
                    <Route path="/participant/:id" element={<ParticipantProfile />} />
                    <Route path="/participant/:id/bilan/new" element={<NewBilan />} />
                    <Route path="/participant/:id/bilan/:bilanId" element={<BilanDetail />} />
                    <Route path="/participant/:id/programme" element={<ProgrammePage />} />
                    <Route path="/participant/:id/contrat/nouveau" element={<ContratNouveauPage />} />
                    <Route path="/participant/:id/comparaison" element={<ComparaisonPage />} />
                    <Route path="/exercices" element={<ExercicesPage />} />
                    <Route path="/stats" element={<StatsPage />} />
                    <Route path="/settings" element={<SettingsPage />} />
                    <Route path="/zones" element={
                      <Suspense fallback={<MapFallback />}><ZonesPage /></Suspense>
                    } />
                    <Route path="/agenda" element={
                      <Suspense fallback={<MapFallback />}><AgendaPage /></Suspense>
                    } />
                    <Route path="/tournee" element={
                      <Suspense fallback={<MapFallback />}><TourneePage /></Suspense>
                    } />
                    <Route path="/map" element={
                      <Suspense fallback={<MapFallback />}><MapPage /></Suspense>
                    } />
                  </Routes>
                </div>
              </div>
              )
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
