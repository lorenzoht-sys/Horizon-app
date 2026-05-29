import { lazy, Suspense, useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { supabase } from './lib/supabase';
import { useDevice } from './hooks/useDevice';
import AppMobile from './pages/mobile/AppMobile';
import { Toaster } from 'react-hot-toast';
import Sidebar from './components/layout/Sidebar';
import Dashboard from './pages/Dashboard';
import ParticipantProfile from './pages/ParticipantProfile';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import SettingsPage from './pages/SettingsPage';
import OnboardingPage from './pages/OnboardingPage';
import PageAccesPatient from './pages/PageAccesPatient';
import EspacePatient from './pages/EspacePatient';
import { BandeauHorsLigne, NotificationMiseAJour } from './components/pwa/PWAComponents';
import ClientView from './pages/ClientView';

// Lazy load : pages lourdes chargées à la demande
const MapPage            = lazy(() => import('./pages/MapPage'));
const AgendaPage         = lazy(() => import('./pages/AgendaPage'));
const TourneePage        = lazy(() => import('./pages/TourneePage'));
const ZonesPage          = lazy(() => import('./pages/ZonesPage'));
const ExercicesPage      = lazy(() => import('./pages/ExercicesPage'));
const StatsPage          = lazy(() => import('./pages/StatsPage'));
const ComparaisonPage    = lazy(() => import('./pages/ComparaisonPage'));
const ContratNouveauPage = lazy(() => import('./pages/ContratNouveauPage'));
const BilanDetail        = lazy(() => import('./pages/BilanDetail'));
const NewBilan           = lazy(() => import('./pages/NewBilan'));
const ProgrammePage      = lazy(() => import('./pages/ProgrammePage'));

function MapFallback() {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="text-gray-400 text-sm">Chargement de la carte…</div>
    </div>
  );
}

// Vérifie si le praticien connecté a déjà rempli son profil
async function needsOnboarding(userId: string): Promise<boolean> {
  if (!supabase) return false;
  try {
    const { data } = await (supabase as unknown as {
      from: (t: string) => { select: (c: string) => { eq: (col: string, val: string) => { single: () => Promise<{ data: { prenom?: string } | null }> } } }
    })
      .from('praticiens')
      .select('prenom')
      .eq('id', userId)
      .single();
    return !data?.prenom;
  } catch {
    return true;
  }
}

export default function App() {
  const { isMobile }    = useDevice();
  const [isLoggedIn, setIsLoggedIn]       = useState(false);
  const [authLoading, setAuthLoading]     = useState(true);
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    if (!supabase) {
      setIsLoggedIn(localStorage.getItem('isLoggedIn') === 'true');
      setAuthLoading(false);
      return;
    }

    // Vérification de la session existante au démarrage
    supabase.auth.getSession()
      .then(async ({ data: { session } }) => {
        if (session) {
          setIsLoggedIn(true);
          setShowOnboarding(await needsOnboarding(session.user.id));
        }
        setAuthLoading(false);
      })
      .catch(() => setAuthLoading(false));

    // Écoute des changements d'auth
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session) {
        // Vider les paramètres d'un éventuel utilisateur précédent
        localStorage.removeItem('settings_praticien');
        localStorage.removeItem('isLoggedIn');
        setIsLoggedIn(true);
        setShowOnboarding(await needsOnboarding(session.user.id));
      } else if (event === 'SIGNED_OUT') {
        localStorage.removeItem('settings_praticien');
        localStorage.removeItem('isLoggedIn');
        setIsLoggedIn(false);
        setShowOnboarding(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Utilisé uniquement pour la connexion de secours (identifiants codés en dur)
  function handleLogin() {
    setIsLoggedIn(true);
  }

  function handleLogout() {
    if (supabase) {
      void supabase.auth.signOut();
    } else {
      localStorage.removeItem('isLoggedIn');
    }
    setIsLoggedIn(false);
    setShowOnboarding(false);
  }

  if (authLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#0D2B2B' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🌊</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#2BBFBF', marginBottom: 8 }}>Horizon</div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>Chargement…</div>
        </div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <BandeauHorsLigne />
      <NotificationMiseAJour />
      <Toaster position="top-right" toastOptions={{ style: { borderRadius: 12, fontSize: 14 } }} />
      <Routes>
        {/* Pages d'authentification */}
        <Route path="/login" element={
          isLoggedIn ? <Navigate to="/" replace /> : <LoginPage onLogin={handleLogin} />
        } />
        <Route path="/register" element={
          isLoggedIn ? <Navigate to="/" replace /> : <RegisterPage />
        } />
        <Route path="/forgot-password" element={
          isLoggedIn ? <Navigate to="/" replace /> : <ForgotPasswordPage />
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
              <>
                {/* Onboarding plein écran — affiché si le profil praticien est vide */}
                {showOnboarding && (
                  <OnboardingPage onComplete={() => setShowOnboarding(false)} />
                )}

                {!showOnboarding && (
                  isMobile ? (
                    <AppMobile onLogout={handleLogout} />
                  ) : (
                    <div className="flex min-h-screen" style={{ background: '#F4FAFA' }}>
                      <Sidebar onLogout={handleLogout} />
                      <div style={{ marginLeft: 220, flex: 1, minHeight: '100vh', background: '#FFFFFF' }}>
                        <Routes>
                          <Route path="/" element={<Dashboard />} />
                          <Route path="/participant/:id" element={<ParticipantProfile />} />
                          <Route path="/participant/:id/bilan/new" element={
                            <Suspense fallback={<MapFallback />}><NewBilan /></Suspense>
                          } />
                          <Route path="/participant/:id/bilan/:bilanId" element={
                            <Suspense fallback={<MapFallback />}><BilanDetail /></Suspense>
                          } />
                          <Route path="/participant/:id/programme" element={
                            <Suspense fallback={<MapFallback />}><ProgrammePage /></Suspense>
                          } />
                          <Route path="/participant/:id/contrat/nouveau" element={
                            <Suspense fallback={<MapFallback />}><ContratNouveauPage /></Suspense>
                          } />
                          <Route path="/participant/:id/comparaison" element={
                            <Suspense fallback={<MapFallback />}><ComparaisonPage /></Suspense>
                          } />
                          <Route path="/exercices" element={
                            <Suspense fallback={<MapFallback />}><ExercicesPage /></Suspense>
                          } />
                          <Route path="/stats" element={
                            <Suspense fallback={<MapFallback />}><StatsPage /></Suspense>
                          } />
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
                )}
              </>
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
