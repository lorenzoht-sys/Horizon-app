import { useLocation, useNavigate } from 'react-router-dom';
import { URLS_MOBILE, ongletDepuisUrl, type OngletMobile } from '../../lib/routesMobile';
import { IconHome, IconMap2, IconMenu2, IconPlus, IconUsers, type TablerIcon } from '@tabler/icons-react';

// Barre du bas, partagée par l'interface mobile (AppMobile) et par le cadre
// commun sous 768 px (App.tsx), qui y remplace la barre latérale. Mêmes
// onglets, mêmes URL : passer d'un écran mobile à un écran fusionné ne se
// voit pas.

// « Assistant » retiré de la barre (chantier « retrait de l'Assistant de la
// navigation mobile ») : l'assistant sort du périmètre mobile, retrait
// définitif prévu dans un chantier séparé. EcranAssistant et /assistant
// restent en place (voir AppMobile.tsx) : accessible par lien direct
// seulement — plus depuis cette barre ni depuis EcranPlus (jamais listé
// là), voir ParticipantProfile.tsx pour l'autre point d'entrée mobile
// (masqué sous 768px, pas retiré : encore utilisé par le desktop).
const ONGLETS: { id: OngletMobile; Icone: TablerIcon; label: string; url: string; principal?: boolean }[] = [
  { id: 'accueil',       Icone: IconHome,   label: 'Accueil',   url: URLS_MOBILE.accueil },
  { id: 'beneficiaires', Icone: IconUsers,  label: 'Bénéfic.',  url: URLS_MOBILE.beneficiaires },
  { id: 'saisie',        Icone: IconPlus,   label: 'Créer',     url: URLS_MOBILE.saisie, principal: true },
  // « Agenda » remplacé par « Carte » le 2026-11-24 (arbitrage de Pierre) : les rendez-vous se gèrent
  // depuis l'accueil et le « + » ; l'agenda reste dans « Plus ».
  { id: 'carte',         Icone: IconMap2,   label: 'Carte',     url: URLS_MOBILE.carte },
  { id: 'plus',          Icone: IconMenu2,  label: 'Plus',      url: URLS_MOBILE.plus },
];

const PRIMAIRE = 'var(--color-teal)';
const ATTENUE = '#8FA8A8';

export default function BarreNavigationMobile() {
  const location = useLocation();
  const navigate = useNavigate();
  const actif = ongletDepuisUrl(location.pathname, location.search);

  return (
    <nav
      aria-label="Navigation principale"
      style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        maxWidth: 480, margin: '0 auto',
        background: 'white',
        boxShadow: '0 -2px 20px rgba(13,43,43,0.08)',
        display: 'flex', padding: 'calc(8px + env(safe-area-inset-bottom)) 0 8px',
        zIndex: 100,
      }}
    >
      {ONGLETS.map(item => {
        const estActif = actif === item.id;
        return (
          <button
            key={item.id}
            onClick={() => navigate(item.url)}
            aria-current={estActif ? 'page' : undefined}
            style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0' }}
          >
            {item.principal ? (
              <div style={{ width: 48, height: 48, borderRadius: '50%', background: PRIMAIRE, display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: -20, boxShadow: '0 4px 12px rgba(43,191,191,0.4)' }}>
                <IconPlus size={22} style={{ color: 'white' }} aria-hidden="true" />
              </div>
            ) : (
              <item.Icone size={22} style={{ color: estActif ? PRIMAIRE : ATTENUE }} aria-hidden="true" />
            )}
            <span style={{ fontSize: 10, fontWeight: estActif ? 700 : 400, color: estActif ? PRIMAIRE : ATTENUE }}>
              {item.label}
            </span>
            {estActif && !item.principal && (
              <span style={{ width: 4, height: 4, borderRadius: '50%', background: PRIMAIRE, marginTop: 1 }} />
            )}
          </button>
        );
      })}
    </nav>
  );
}
