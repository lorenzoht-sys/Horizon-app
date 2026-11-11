import { useParticipants } from '../../../hooks/useParticipants';
import { initialesPraticien } from '../../../lib/initiales';
import { URLS_MOBILE } from '../../../lib/routesMobile';
import { C, usePraticienSettings } from './communs';

// ── Composants UI réutilisables ───────────────────────────────────────────────



export function SectionMobile({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-ink-2)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8, paddingLeft: 4 }}>
        {titre}
      </div>
      <div style={{ background: 'white', borderRadius: 12, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
        {children}
      </div>
    </div>
  );
}

export function ItemMobile({ icon, label, onClick }: { icon: string; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      width: '100%', display: 'flex', alignItems: 'center', gap: 14,
      padding: '13px 16px', background: 'none', border: 'none',
      borderBottom: `1px solid #F4FAFA`, cursor: 'pointer', textAlign: 'left',
    }}>
      <i className={`ti ${icon}`} style={{ fontSize: 20, color: C.primary }} aria-hidden="true" />
      <span style={{ fontSize: 15, fontWeight: 500, color: C.text, flex: 1 }}>{label}</span>
      <i className="ti ti-chevron-right" style={{ fontSize: 16, color: '#D0DCDC' }} aria-hidden="true" />
    </button>
  );
}

// ── EcranPlus ─────────────────────────────────────────────────────────────────

export function EcranPlus({ onLogout, onNaviguer }: { onLogout: () => void; onNaviguer: (url: string) => void }) {
  const { settings } = usePraticienSettings();
  // Seul point d'accès mobile à /archives (route fusionnée, voir
  // routesMobile.ts) : sans lui, un bénéficiaire archivé restait invisible
  // et « Désarchiver » n'était atteignable que depuis sa fiche, elle-même
  // introuvable.
  const { participantsArchives } = useParticipants();
  // Meme regle que la Sidebar : les vraies initiales, ou une silhouette.
  // Ce calcul repliait sur « P » quand le prenom manquait. Voir
  // src/lib/initiales.ts.
  const initiales = initialesPraticien(settings.prenom, settings.nom);

  // L'export / import JSON a été RETIRÉ de cet écran (2026-09-13). Il lisait
  // et écrivait l'ancien stockage localStorage, abandonné depuis le passage à
  // Supabase : l'export sortait un fichier vide ou périmé, et l'import
  // écrasait des clés que plus rien ne lit. Rendre l'onglet « Plus »
  // atteignable l'aurait remis entre les mains du praticien.

  return (
    <div style={{ paddingTop: 'calc(env(safe-area-inset-top, 44px) + 12px)', paddingLeft: 16, paddingRight: 16, paddingBottom: 16 }}>

      {/* Profil praticien */}
      <div style={{ background: C.dark, borderRadius: 14, padding: '16px', display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <div style={{ width: 44, height: 44, borderRadius: '50%', background: C.primary, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 700, color: 'white', flexShrink: 0 }}>
          {initiales || (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-label="Identité non renseignée">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          )}
        </div>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'white' }}>
            {settings.prenom || 'Praticien'}{settings.nom ? ` ${settings.nom}` : ''}
          </div>
          {settings.titre && <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>{settings.titre}</div>}
        </div>
      </div>

      {/* Section Mon activité */}
      {/* Carte, bibliothèque : leur URL desktop. Sous 768 px elle affiche
          l'écran « bientôt en version mobile » — et au-dessus, l'écran lui-même.
          « Agenda complet » retiré (2026-10-25) : l'agenda a son onglet dans la
          barre du bas, qui remplace Tournée. */}
      <SectionMobile titre="Mon activité">
        <ItemMobile icon="ti-map-pin" label="Carte bénéficiaires" onClick={() => onNaviguer('/map')} />
      </SectionMobile>

      {/* Section Bénéficiaires */}
      <SectionMobile titre="Bénéficiaires">
        <ItemMobile
          icon="ti-archive"
          label={`Bénéficiaires archivés${participantsArchives.length > 0 ? ` (${participantsArchives.length})` : ''}`}
          onClick={() => onNaviguer(URLS_MOBILE.archives)}
        />
        <ItemMobile icon="ti-building" label="Structures" onClick={() => onNaviguer('/structures')} />
      </SectionMobile>

      {/* Section Contenu */}
      <SectionMobile titre="Contenu">
        <ItemMobile icon="ti-dumbbell" label="Bibliothèque exercices" onClick={() => onNaviguer('/bibliotheque')} />
      </SectionMobile>

      {/* Section Compte */}
      <SectionMobile titre="Compte">
        <ItemMobile icon="ti-settings" label="Paramètres" onClick={() => onNaviguer(URLS_MOBILE.parametres)} />
      </SectionMobile>

      {/* Déconnexion */}
      <button onClick={onLogout} style={{
        width: '100%', padding: '14px 16px', marginTop: 8,
        background: 'none', border: `1px solid ${C.border}`,
        borderRadius: 12, cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: 14,
        color: '#E85050', fontSize: 15,
      }}>
        <i className="ti ti-logout" style={{ fontSize: 20 }} aria-hidden="true" />
        Déconnexion
      </button>

      <div style={{ textAlign: 'center', marginTop: 20, fontSize: 11, color: C.muted }}>
        Horizon v1.0
      </div>
    </div>
  );
}
