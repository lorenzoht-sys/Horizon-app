import { useLocation, useNavigate } from 'react-router-dom';
import SettingsPage from '../SettingsPage';
import { URLS_MOBILE, ecranMobileDepuisUrl } from '../../lib/routesMobile';
import BarreNavigationMobile from '../../components/layout/BarreNavigationMobile';
import { BilanMobile, ChoixBeneficiaireBilanMobile } from './ecrans/BilanMobile';
import { EcranAgenda } from './ecrans/EcranAgenda';
import { EcranAssistant } from './ecrans/EcranAssistant';
import { EcranAujourdhui } from './ecrans/EcranAujourdhui';
import { EcranPatients } from './ecrans/EcranPatients';
import { EcranPlus } from './ecrans/EcranPlus';
import { ModifierBeneficiaireMobile } from './ecrans/EditPatientMobile';
import { ChoixSaisie, NouveauPatientMobile } from './ecrans/NouveauPatientMobile';
import { C } from './ecrans/communs';

// Écran sans version téléphone (pas encore fusionné, ou desktop seulement).
//
// Le message invitait à tourner le téléphone. Une fois l'app installée, cette
// invitation ne mène nulle part : les deux manifestes PWA verrouillent
// l'orientation en portrait (vite.config.ts et public/manifest-patient.webmanifest,
// `orientation: 'portrait'`), le système refuse donc la bascule. On annonce l'absence de version mobile
// plutôt que de promettre un geste sans effet, et on nomme le seul endroit où
// l'écran existe réellement aujourd'hui : un ordinateur.
function EcranPaysage({ onRetour }: { onRetour: () => void }) {
  return (
    <div style={{ paddingTop: 'calc(env(safe-area-inset-top, 44px) + 48px)', paddingLeft: 24, paddingRight: 24, paddingBottom: 24, textAlign: 'center' }}>
      <div style={{ fontSize: 52, marginBottom: 14 }} aria-hidden="true">💻</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: C.text, marginBottom: 8 }}>Bientôt en version mobile</div>
      <div style={{ fontSize: 14, color: '#4A6080', lineHeight: 1.6, marginBottom: 28 }}>
        Cet écran n'a pas encore de version téléphone. En attendant, il reste accessible depuis un ordinateur.
      </div>
      <button onClick={onRetour} style={{ padding: '12px 20px', background: 'white', border: `1.5px solid ${C.primary}`, color: C.primary, borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
        ← Retour
      </button>
    </div>
  );
}

// ── App Mobile principal ──────────────────────────────────────────────────────

interface Props { onLogout: () => void }

// L'écran affiché se lit dans l'URL (src/lib/routesMobile.ts), et non plus dans
// un état en mémoire : une rotation, un lien ou le bouton « retour » du
// téléphone retrouvent l'écran. La fiche bénéficiaire n'arrive jamais ici —
// App.tsx la sert par l'interface unique, même sous 768 px.
export default function AppMobile({ onLogout }: Props) {
  const location = useLocation();
  const navigate = useNavigate();
  const ecran = ecranMobileDepuisUrl(location.pathname, location.search);
  const voirFiche = (id: string) => navigate(URLS_MOBILE.fiche(id));

  const shell: React.CSSProperties = { maxWidth: 480, margin: '0 auto', minHeight: '100vh', background: C.bg, fontFamily: "var(--font-sans)" };

  let contenu: React.ReactNode = null;
  let avecBarre = true;

  switch (ecran.ecran) {
    case 'accueil':
      contenu = <EcranAujourdhui onVoirFiche={voirFiche} />;
      break;
    case 'beneficiaires':
      contenu = <EcranPatients onVoirFiche={voirFiche} />;
      break;
    case 'saisie':
      contenu = <ChoixSaisie onPatient={() => navigate(URLS_MOBILE.nouveauBeneficiaire)} onBilan={() => navigate(URLS_MOBILE.choixBeneficiaireBilan)} />;
      break;
    case 'agenda':
      // `key` : un nouveau lien daté (seconde notification, écran déjà
      // ouvert) doit repositionner le jour — l'état initial n'est lu qu'au
      // montage. La navigation interne (flèches, vue Mois) ne touche pas
      // l'URL, donc ne remonte jamais l'écran.
      contenu = <EcranAgenda key={ecran.date ?? ''} dateInitiale={ecran.date} />;
      break;
    case 'assistant':
      contenu = <EcranAssistant preSelectedPatientId={ecran.beneficiaireId} onOuvrirSettings={() => navigate(URLS_MOBILE.parametres)} />;
      break;
    case 'plus':
      contenu = <EcranPlus onLogout={onLogout} onNaviguer={url => navigate(url)} />;
      break;
    case 'paysage': {
      const retour = ecran.retour;
      contenu = <EcranPaysage onRetour={() => navigate(retour)} />;
      break;
    }
    case 'parametres':
      // Fusion (chantier « fusion des paramètres ») : rend SettingsPage
      // (desktop) directement, sans passer par estRouteInterfaceUnique —
      // volontaire, pour garder avecBarre=false (EcranSettings masquait
      // déjà la barre de navigation ici, un choix voulu pour un écran de
      // formulaire ; passer par estRouteInterfaceUnique aurait fait
      // réapparaître la barre via DesktopContent, qui ne permet pas de
      // l'exclure route par route). Le lien de retour est fourni par
      // SettingsPage lui-même (voir src/pages/SettingsPage.tsx).
      avecBarre = false;
      contenu = <SettingsPage />;
      break;
    case 'nouveauBeneficiaire':
      avecBarre = false;
      contenu = <NouveauPatientMobile onBack={() => navigate(URLS_MOBILE.saisie)} onCree={voirFiche} />;
      break;
    case 'modifierBeneficiaire': {
      const id = ecran.participantId;
      avecBarre = false;
      contenu = <ModifierBeneficiaireMobile participantId={id} onBack={() => voirFiche(id)} />;
      break;
    }
    case 'nouveauBilan': {
      const id = ecran.participantId;
      avecBarre = false;
      contenu = id
        ? <BilanMobile participantId={id} onTermine={() => voirFiche(id)} />
        : <ChoixBeneficiaireBilanMobile onBack={() => navigate(URLS_MOBILE.saisie)} onChoisir={pid => navigate(URLS_MOBILE.nouveauBilan(pid))} />;
      break;
    }
  }

  return (
    <div style={{ ...shell, display: 'flex', flexDirection: 'column' }}>
      {/* Clé = URL : un changement d'écran repart d'un état neuf, comme avant. */}
      <div key={location.pathname + location.search} style={{ flex: 1, overflowY: 'auto', paddingBottom: avecBarre ? 80 : 0 }}>
        {contenu}
      </div>
      {avecBarre && <BarreNavigationMobile />}
    </div>
  );
}
