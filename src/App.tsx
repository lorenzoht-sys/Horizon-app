import { lazy, Suspense, useState, useEffect, useRef } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { PageTransition } from './components/ui/PageTransition';
import { supabase } from './lib/supabase';
import { setCurrentUserId, loadAllBrouillonsFromSupabase } from './hooks/useBrouillonBilan';
import { useDevice } from './hooks/useDevice';
import AppMobile from './pages/mobile/AppMobile';
import { Toaster } from 'sonner';
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
const AssistantPage      = lazy(() => import('./pages/AssistantPage'));
const EditBilan          = lazy(() => import('./pages/EditBilan'));
const MapPage            = lazy(() => import('./pages/MapPage'));
const AgendaPage         = lazy(() => import('./pages/AgendaPage'));
const TourneePage        = lazy(() => import('./pages/TourneePage'));
const ZonesPage          = lazy(() => import('./pages/ZonesPage'));
const ExercicesPage      = lazy(() => import('./pages/ExercicesPage'));
const StatsPage          = lazy(() => import('./pages/StatsPage'));
const StructureDetail    = lazy(() => import('./pages/StructureDetail'));
const PortailStructure   = lazy(() => import('./pages/PortailStructure'));
const ComparaisonPage    = lazy(() => import('./pages/ComparaisonPage'));
const ContratNouveauPage = lazy(() => import('./pages/ContratNouveauPage'));
const BilanDetail        = lazy(() => import('./pages/BilanDetail'));
const NewBilan           = lazy(() => import('./pages/NewBilan'));
const ProgrammePage      = lazy(() => import('./pages/ProgrammePage'));
const ParticipantFormPage = lazy(() => import('./pages/ParticipantFormPage'));
const PolitiqueConfidentialite = lazy(() => import('./pages/PolitiqueConfidentialite'));
const MentionsLegales     = lazy(() => import('./pages/MentionsLegales'));
const CGU                = lazy(() => import('./pages/CGU'));

function DesktopContent({ onLogout }: { onLogout: () => void }) {
  const location = useLocation();
  const [scrolled, setScrolled] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => setScrolled(el.scrollTop > 8);
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div className="flex min-h-screen" style={{ background: 'var(--color-bg)' }}>
      <Sidebar onLogout={onLogout} />
      <div
        ref={scrollRef}
        style={{ marginLeft: 220, flex: 1, height: '100vh', overflowY: 'auto', background: 'var(--color-bg)', position: 'relative' }}
      >
        {/* Topbar scroll effect */}
        <div
          className="sticky top-0 z-40 transition-all duration-200 pointer-events-none"
          style={{
            height: 56,
            background: scrolled ? 'rgba(255,255,255,0.80)' : 'transparent',
            backdropFilter: scrolled ? 'blur(16px) saturate(180%)' : 'none',
            WebkitBackdropFilter: scrolled ? 'blur(16px) saturate(180%)' : 'none',
            borderBottom: scrolled ? '1px solid rgba(0,0,0,0.06)' : '1px solid transparent',
            boxShadow: scrolled ? 'var(--shadow-xs)' : 'none',
            marginBottom: -56,
          }}
        />
        <AnimatePresence mode="wait">
          <Routes location={location} key={location.pathname}>
            <Route path="/" element={<PageTransition><Dashboard /></PageTransition>} />
            <Route path="/participants/nouveau" element={<PageTransition><Suspense fallback={<MapFallback />}><ParticipantFormPage /></Suspense></PageTransition>} />
            <Route path="/participants/:id/modifier" element={<PageTransition><Suspense fallback={<MapFallback />}><ParticipantFormPage /></Suspense></PageTransition>} />
            <Route path="/participant/:id" element={<PageTransition><ParticipantProfile /></PageTransition>} />
            <Route path="/participant/:id/bilan/new" element={<PageTransition><Suspense fallback={<MapFallback />}><NewBilan /></Suspense></PageTransition>} />
            <Route path="/participant/:id/bilan/:bilanId" element={<PageTransition><Suspense fallback={<MapFallback />}><BilanDetail /></Suspense></PageTransition>} />
            <Route path="/participant/:id/bilan/:bilanId/edit" element={<PageTransition><Suspense fallback={<MapFallback />}><EditBilan /></Suspense></PageTransition>} />
            <Route path="/participant/:id/programme" element={<PageTransition><Suspense fallback={<MapFallback />}><ProgrammePage /></Suspense></PageTransition>} />
            <Route path="/participant/:id/contrat/nouveau" element={<PageTransition><Suspense fallback={<MapFallback />}><ContratNouveauPage /></Suspense></PageTransition>} />
            <Route path="/participant/:id/comparaison" element={<PageTransition><Suspense fallback={<MapFallback />}><ComparaisonPage /></Suspense></PageTransition>} />
            <Route path="/assistant" element={<PageTransition><Suspense fallback={<MapFallback />}><AssistantPage /></Suspense></PageTransition>} />
            <Route path="/exercices" element={<PageTransition><Suspense fallback={<MapFallback />}><ExercicesPage /></Suspense></PageTransition>} />
            <Route path="/stats" element={<PageTransition><Suspense fallback={<MapFallback />}><StatsPage /></Suspense></PageTransition>} />
            <Route path="/structures/:id" element={<PageTransition><Suspense fallback={<MapFallback />}><StructureDetail /></Suspense></PageTransition>} />
            <Route path="/settings" element={<PageTransition><SettingsPage /></PageTransition>} />
            <Route path="/zones" element={<PageTransition><Suspense fallback={<MapFallback />}><ZonesPage /></Suspense></PageTransition>} />
            <Route path="/agenda" element={<PageTransition><Suspense fallback={<MapFallback />}><AgendaPage /></Suspense></PageTransition>} />
            <Route path="/tournee" element={<PageTransition><Suspense fallback={<MapFallback />}><TourneePage /></Suspense></PageTransition>} />
            <Route path="/map" element={<PageTransition><Suspense fallback={<MapFallback />}><MapPage /></Suspense></PageTransition>} />
          </Routes>
        </AnimatePresence>
      </div>
    </div>
  );
}

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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from('praticiens')
      .select('titre')
      .eq('id', userId)
      .single();
    return !data?.titre;
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

    // Timeout de sécurité : si Supabase ne répond pas dans les 5 s → on débloque quand même
    const safetyTimer = setTimeout(() => {
      console.warn('[App] getSession timeout — déblocage forcé');
      setAuthLoading(false);
    }, 5000);

    const checkSession = async () => {
      try {
        const result = await Promise.race([
          supabase!.auth.getSession(),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('timeout')), 4500)
          ),
        ]);
        const session = (result as { data: { session: import('@supabase/supabase-js').Session | null } }).data.session;
        if (session) {
          setCurrentUserId(session.user.id);
          // Restaurer les brouillons cloud dans localStorage (cross-device / après expiration)
          void loadAllBrouillonsFromSupabase(session.user.id);
          setIsLoggedIn(true);
          needsOnboarding(session.user.id).then(setShowOnboarding);
        }
      } catch (err) {
        console.error('[App] getSession failed:', err);
        // Pas de session connue → on reste sur /login
      } finally {
        clearTimeout(safetyTimer);
        setAuthLoading(false);
      }
    };

    void checkSession();

    // Écoute des changements d'auth (callback synchrone pour éviter les races)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) {
        setCurrentUserId(session.user.id);
        // Restaurer les brouillons cloud dans localStorage (après logout ou changement d'appareil)
        void loadAllBrouillonsFromSupabase(session.user.id);
        localStorage.removeItem('settings_praticien');
        localStorage.removeItem('isLoggedIn');
        setIsLoggedIn(true);
        needsOnboarding(session.user.id).then(setShowOnboarding);
      } else if (event === 'SIGNED_OUT') {
        // Ne pas effacer les brouillons ici — ils sont isolés par userId et
        // survivent à une expiration de session pour être repris à la reconnexion.
        setCurrentUserId(null);
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
    // Ne pas effacer les brouillons : ils sont isolés par userId (brouillon_bilan_{userId}_*)
    // et seront restaurés depuis Supabase à la prochaine connexion.
    if (supabase) {
      void supabase.auth.signOut();
    } else {
      setCurrentUserId(null);
      localStorage.removeItem('isLoggedIn');
    }
    setIsLoggedIn(false);
    setShowOnboarding(false);
  }

  if (authLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'var(--color-ink)' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🌊</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--color-teal)', marginBottom: 8 }}>Horizon</div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>Chargement…</div>
        </div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <BandeauHorsLigne />
      <NotificationMiseAJour />
      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            background: '#1C2B24',
            border: '0.5px solid rgba(43,184,154,0.25)',
            color: '#fff',
            fontFamily: 'Plus Jakarta Sans, sans-serif',
            fontSize: '13px',
            borderRadius: '12px',
            boxShadow: '0 4px 24px rgba(0,0,0,0.18)',
          },
        }}
        richColors
      />
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

        {/* Pages légales — publiques, sans auth */}
        <Route path="/politique-confidentialite" element={
          <Suspense fallback={null}><PolitiqueConfidentialite /></Suspense>
        } />
        <Route path="/mentions-legales" element={
          <Suspense fallback={null}><MentionsLegales /></Suspense>
        } />
        <Route path="/cgu" element={
          <Suspense fallback={null}><CGU /></Suspense>
        } />

        {/* Vue client : pas de sidebar */}
        <Route path="/client/:token" element={<ClientView />} />

        {/* Espace patient — public, sans auth praticien */}
        <Route path="/patient" element={<PageAccesPatient />} />
        <Route path="/patient/:id" element={<EspacePatient />} />

        {/* Portail structure — public, sans auth praticien */}
        <Route path="/structure/:token" element={
          <Suspense fallback={null}><PortailStructure /></Suspense>
        } />
        <Route path="/structure/:token/patient/:patientId" element={
          <Suspense fallback={null}><PortailStructure /></Suspense>
        } />

        {/* Onboarding — route protégée, uniquement si titre non encore renseigné */}
        <Route path="/onboarding" element={
          !isLoggedIn
            ? <Navigate to="/login" replace />
            : !showOnboarding
              ? <Navigate to="/" replace />
              : <OnboardingPage onComplete={() => setShowOnboarding(false)} />
        } />

        {/* Interface pro — protégée */}
        <Route
          path="*"
          element={
            isLoggedIn ? (
              showOnboarding ? (
                <Navigate to="/onboarding" replace />
              ) : (
                  isMobile ? (
                    <AppMobile onLogout={handleLogout} />
                  ) : (
                    <DesktopContent onLogout={handleLogout} />
                  )
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
