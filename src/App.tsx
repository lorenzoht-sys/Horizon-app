import { lazy, Suspense, useState, useEffect, useRef } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { PageTransition } from './components/ui/PageTransition';
import { supabase, typeLienAuth, erreurLienAuth } from './lib/supabase';
import { setCurrentUserId, loadAllBrouillonsFromSupabase } from './hooks/useBrouillonBilan';
import { useDevice } from './hooks/useDevice';
import AppMobile from './pages/mobile/AppMobile';
import { Toaster } from 'sonner';
import Sidebar from './components/layout/Sidebar';
import Dashboard from './pages/Dashboard';
import ParticipantProfile from './pages/ParticipantProfile';
import LoginPage from './pages/LoginPage';
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
const TourneePage        = lazy(() => import('./pages/TourneePage'));
const AgendaV2Page       = lazy(() => import('./pages/AgendaV2Page'));
const ZonesPage          = lazy(() => import('./pages/ZonesPage'));
const BibliothequePage   = lazy(() => import('./pages/BibliothequePage'));
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
const AdminComptesPage   = lazy(() => import('./pages/AdminComptesPage'));
import ResetPasswordPage from './pages/ResetPasswordPage';

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
            <Route path="/bibliotheque" element={<PageTransition><Suspense fallback={<MapFallback />}><BibliothequePage /></Suspense></PageTransition>} />
            <Route path="/stats" element={<PageTransition><Suspense fallback={<MapFallback />}><StatsPage /></Suspense></PageTransition>} />
            <Route path="/structures/:id" element={<PageTransition><Suspense fallback={<MapFallback />}><StructureDetail /></Suspense></PageTransition>} />
            <Route path="/settings" element={<PageTransition><SettingsPage /></PageTransition>} />
            {/* Administration des comptes (étape 4 des rôles). La route est
                déclarée pour tous : c'est la PAGE qui affiche « réservée aux
                administrateurs » à un non-admin, et surtout le SERVEUR qui
                refuse toute action admin.* en 403. Router côté client n'est
                pas une protection — n'en faire dépendre aucune. */}
            <Route path="/admin/comptes" element={<PageTransition><Suspense fallback={<MapFallback />}><AdminComptesPage /></Suspense></PageTransition>} />
            <Route path="/zones" element={<PageTransition><Suspense fallback={<MapFallback />}><ZonesPage /></Suspense></PageTransition>} />
            <Route path="/tournee" element={<PageTransition><Suspense fallback={<MapFallback />}><TourneePage /></Suspense></PageTransition>} />
            <Route path="/agenda-v2" element={<PageTransition><Suspense fallback={<MapFallback />}><AgendaV2Page /></Suspense></PageTransition>} />
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

  // Verrou de récupération / invitation.
  //
  // Une session ouverte par un lien email EST une session valide : sans ce
  // verrou, le porteur du lien entrerait dans l'application sans avoir
  // jamais prouvé qu'il connaît le mot de passe. Tant qu'il est levé,
  // `isLoggedIn` reste faux et toute route renvoie vers /reset-password.
  //
  // Persisté dans localStorage, et pas seulement en mémoire : la session
  // Supabase, elle, survit à la fermeture de l'onglet. Sans trace durable,
  // il suffirait de fermer puis rouvrir l'application pour se retrouver
  // connecté sans être passé par la définition du mot de passe — le trou
  // exact que ce verrou existe pour fermer.
  //
  // `erreurLienAuth` prime sur tout : quand Supabase a REFUSÉ le lien, il
  // n'y a aucune session de récupération à protéger. Armer le verrou dans ce
  // cas enfermerait l'utilisateur sur une page dont il ne peut plus rien
  // faire, puisque toute autre route y renvoie.
  const [enRecuperation, setEnRecuperation] = useState(
    () => erreurLienAuth === null
      && (typeLienAuth !== null || localStorage.getItem('horizon_recuperation') === 'true'),
  );

  // Vrai une fois le mot de passe défini ET la session rétablie : sert
  // uniquement à quitter /reset-password. Voir la route plus bas.
  const [redefinitionTerminee, setRedefinitionTerminee] = useState(false);

  // L'abonnement onAuthStateChange est posé une seule fois (effet à deps
  // vides) : il capturerait `enRecuperation` à sa valeur du premier rendu
  // et ne la verrait jamais changer. Après définition du mot de passe, il
  // continuerait d'ignorer les SIGNED_IN suivants — une reconnexion
  // ultérieure ne mettrait plus l'état à jour. La ref, elle, reste à jour.
  const enRecuperationRef = useRef(enRecuperation);
  useEffect(() => { enRecuperationRef.current = enRecuperation; }, [enRecuperation]);

  // Persiste le drapeau dès l'ouverture du lien, sans attendre l'événement
  // PASSWORD_RECOVERY : entre le chargement et l'émission, un onglet fermé
  // laisserait une session valide sans trace du verrou.
  useEffect(() => {
    if (typeLienAuth !== null) {
      localStorage.setItem('horizon_recuperation', 'true');
      return;
    }
    // Lien refusé : on efface un éventuel drapeau resté d'une tentative
    // précédente abandonnée. Sinon le verrou survit au lien qui l'a créé.
    if (erreurLienAuth !== null) localStorage.removeItem('horizon_recuperation');
  }, []);

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
        // Course volontairement tranchée ici : `getSession()` renvoie la
        // session de récupération comme n'importe quelle autre, et
        // arriverait à la connecter avant même que l'événement
        // PASSWORD_RECOVERY soit émis. Le relevé du fragment fait au
        // chargement (typeLienAuth) est la seule source fiable.
        if (session && !enRecuperationRef.current) {
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
      // Pour un lien de récupération ou d'invitation, auth-js n'émet QUE
      // PASSWORD_RECOVERY, jamais SIGNED_IN (GoTrueClient : `redirectType
      // === 'recovery' ? 'PASSWORD_RECOVERY' : 'SIGNED_IN'`). Ne traiter que
      // SIGNED_IN laissait donc l'utilisateur sur la page de connexion, avec
      // une session pourtant ouverte.
      if (event === 'PASSWORD_RECOVERY') {
        localStorage.setItem('horizon_recuperation', 'true');
        setEnRecuperation(true);
        setIsLoggedIn(false);
        return;
      }
      // Pendant le verrou, une session qui s'ouvre ne doit pas connecter :
      // c'est la session de récupération elle-même.
      if (enRecuperationRef.current) return;

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
        {/* Inscription autonome RETIRÉE le 2026-08-29 (étape 4).
            Cette route était publique : n'importe qui pouvait se créer un
            compte praticien, ce qui vidait de son sens le contrôle des
            comptes par un admin. Un compte inconnu avait d'ailleurs été
            trouvé en production.
            RegisterPage.tsx est CONSERVÉE volontairement : elle sera
            réutilisée comme page « définir mon mot de passe » au bout du
            lien d'invitation (option 2, voir docs/PLAN-BETA.md). Ne pas la
            supprimer, et ne pas remettre cette route en l'état. */}
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

        {/* Définition du mot de passe (lien `recovery` ou `invite`).
            Déclarée AVANT le catch-all `path="*"`, sinon celui-ci l'avale et
            renvoie vers /login — c'est exactement ce qui se passait avant
            que cette route existe. Hors zone protégée : l'utilisateur n'est
            volontairement PAS considéré comme connecté à ce stade. */}
        <Route path="/reset-password" element={
          redefinitionTerminee ? (
            // Le mot de passe est défini ET la session est rétablie : on quitte.
            // Sans cette sortie, l'URL restait /reset-password et la route
            // réaffichait le formulaire, bouton réarmé, sans rien qui signale
            // le succès — d'où l'impression d'un clic sans effet, puis un
            // second clic refusé en 422 (`same_password`).
            <Navigate to="/" replace />
          ) : (typeLienAuth !== null || erreurLienAuth !== null || enRecuperation) ? (
            <ResetPasswordPage
              typeLien={typeLienAuth}
              erreurLien={erreurLienAuth}
              onMotDePasseDefini={async () => {
                // Le mot de passe est défini : le verrou tombe, et la session
                // déjà ouverte devient une session ordinaire.
                localStorage.removeItem('horizon_recuperation');
                setEnRecuperation(false);

                // L'ordre compte. On ne bascule `redefinitionTerminee` qu'une
                // fois `isLoggedIn` et `showOnboarding` établis : plus tôt, le
                // catch-all verrait `isLoggedIn` encore faux et renverrait sur
                // /login — un aller-retour visible juste après un succès.
                if (supabase) {
                  const { data } = await supabase.auth.getSession();
                  if (data.session) {
                    setCurrentUserId(data.session.user.id);
                    setShowOnboarding(await needsOnboarding(data.session.user.id));
                    setIsLoggedIn(true);
                  }
                }
                // Si la session a disparu entre-temps, le catch-all enverra
                // sur /login : le praticien se connectera avec son nouveau
                // mot de passe. C'est le bon mode d'échec.
                setRedefinitionTerminee(true);
              }}
            />
          ) : (
            // Ni lien, ni verrou en cours : personne n'a de mot de passe à
            // définir ici. C'est cette garde qui manquait — sans elle, la
            // route servait le formulaire à quiconque tapait l'URL, et le
            // formulaire fantôme obtenu au bout d'un lien mort a été pris
            // pour la preuve d'un lien réutilisable.
            <Navigate to="/login" replace />
          )
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
            // Le verrou passe avant tout le reste : tant que le mot de passe
            // n'est pas redéfini, aucune autre page n'est atteignable, y
            // compris en tapant une URL à la main.
            enRecuperation ? (
              <Navigate to="/reset-password" replace />
            ) : isLoggedIn ? (
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
