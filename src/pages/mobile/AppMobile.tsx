import { useState, useRef, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useParticipants } from '../../hooks/useParticipants';
import { useAgenda } from '../../hooks/useAgenda';
import { useContrats } from '../../hooks/useContrats';
import { useCompteRenduSeance } from '../../hooks/useCompteRenduSeance';
import BilanStepper from '../../components/bilan/BilanStepper';
import ModalSelectionTests from '../../components/bilan/ModalSelectionTests';
import DicteePostSeance from '../../components/DicteePostSeance';
import MarkdownRendu from '../../components/ui/MarkdownRendu';
import type { Bilan, Participant } from '../../types';
import { v4 as uuidv4 } from 'uuid';
import { supabase, getAuthHeader } from '../../lib/supabase';
import {
  DEFAULTS_SETTINGS,
  EVENT_SETTINGS_PRATICIEN,
  chargerSettingsPraticien,
  enregistrerSettingsPraticien,
  hydraterSettingsPraticien,
  type SettingsPraticien,
} from '../../lib/settingsPraticien';
import { validerSiret } from '../../lib/siret';
import { avecConsentement, erreurConsentementCreation, normaliserRgpd } from '../../lib/consentementRgpd';
import type { RgpdConsent } from '../../types';
import { initialesPraticien } from '../../lib/initiales';
import { getContreIndications } from '../../lib/anamnese';
import { libelleAge } from '../../lib/age';
import { URLS_MOBILE, ecranMobileDepuisUrl } from '../../lib/routesMobile';
import BarreNavigationMobile from '../../components/layout/BarreNavigationMobile';
import ModalRepriseBrouillon from '../../components/bilan/ModalRepriseBrouillon';
import { useEtatSession } from '../../hooks/useEtatSession';
import { ecrireEtatSession, effacerEtatSession, lireEtatSession } from '../../lib/etatSession';
import { getBrouillonParticipant, sauvegarderBrouillonParticipant, supprimerBrouillonParticipant } from '../../hooks/useBrouillonParticipant';
import { getBrouillon, supprimerBrouillon } from '../../hooks/useBrouillonBilan';

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDateLong(d: Date) {
  return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
}

function formatDateCourt(d: string) {
  return new Date(d + 'T12:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

function ouvrirMaps(adresse: string) {
  window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(adresse)}`, '_blank');
}

const C = { // colors
  dark:    'var(--color-ink)',
  primary: 'var(--color-teal)',
  green:   '#1ca48c',
  bg:      'var(--color-bg)',
  border:  '#E0EEEE',
  text:    '#032c28',
  muted:   '#8FA8A8',
};

const card: React.CSSProperties = {
  background: 'white', borderRadius: 12,
  border: `1px solid ${C.border}`, padding: '12px 14px', marginBottom: 8,
};

// ── Hook paramètres praticien (Supabase) ─────────────────────────────────────

// Cet ecran avait ses propres valeurs par defaut, sa propre requete et ses
// propres ecritures du cache — un dixieme lecteur de reglages, reste en
// dehors de la consolidation. Il portait treize champs sur seize : ni
// `numeroTVA`, ni `fraisKmDefaut`, ni `logoPraticien`. Tout passe desormais
// par `settingsPraticien`, comme les ecrans desktop.
function usePraticienSettings() {
  const [settings, setSettings] = useState<SettingsPraticien>(chargerSettingsPraticien);
  const [loading, setLoading] = useState(true);
  // Renseigne uniquement si la BASE est injoignable — pas si la fiche
  // n'existe pas encore. Voir `EchecHydratation`. L'ecran de reglages s'en
  // sert pour interdire l'enregistrement : sauvegarder un formulaire qu'on
  // n'a pas pu pre-remplir ecraserait la fiche avec des champs vides.
  const [echecChargement, setEchecChargement] = useState(false);

  useEffect(() => {
    void (async () => {
      const resultat = await hydraterSettingsPraticien();
      if (!resultat.ok && resultat.echec === 'erreur') {
        console.error('[Mobile] Hydratation des reglages en echec :', resultat.message);
        setEchecChargement(true);
      }
      setSettings(chargerSettingsPraticien());
      setLoading(false);
    })();
  }, []);

  // Rester synchrone avec les autres ecrans : `ecrireCacheSettingsPraticien`
  // emet cet evenement a chaque ecriture du cache.
  useEffect(() => {
    const handler = () => setSettings(chargerSettingsPraticien());
    window.addEventListener(EVENT_SETTINGS_PRATICIEN, handler);
    return () => window.removeEventListener(EVENT_SETTINGS_PRATICIEN, handler);
  }, []);

  async function sauvegarderSettings(form: SettingsPraticien) {
    if (!supabase) throw new Error('Supabase non configuré');
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Non connecté');
    // Base d'abord, cache ensuite — l'ordre est garanti par le module.
    await enregistrerSettingsPraticien(form, user.id);
    setSettings(form);
  }

  return { settings, loading, echecChargement, sauvegarderSettings };
}

// ── Composants UI réutilisables ───────────────────────────────────────────────



function SectionMobile({ titre, children }: { titre: string; children: React.ReactNode }) {
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

function ItemMobile({ icon, label, onClick }: { icon: string; label: string; onClick: () => void }) {
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

function InfoSection({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <div style={{ background: 'white', borderRadius: 12, border: `1px solid ${C.border}`, padding: '14px 16px' }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: C.primary, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
        {titre}
      </div>
      {children}
    </div>
  );
}

// La barre du bas vit dans components/layout/BarreNavigationMobile.tsx : elle
// est partagée avec le cadre commun, qui la montre sous 768 px sur les écrans
// fusionnés (la fiche bénéficiaire).

// Ces écrans n'existent qu'en version desktop. Le praticien y accède en
// tournant son téléphone : la bascule à 768 px est un usage voulu, pas un
// défaut (voir App.tsx).
const MESSAGE_PAYSAGE = 'Tournez votre téléphone en paysage pour afficher cet écran 🔄';

// ── EcranAujourdhui ───────────────────────────────────────────────────────────

function EcranAujourdhui({ onVoirFiche }: { onVoirFiche: (id: string) => void; onNaviguerSaisie?: () => void }) {
  const { participants } = useParticipants();
  const { seances: allSeances, seancesDuJour } = useAgenda();
  const { contratsARenouveler } = useContrats();
  const { settings: praticienSettings } = usePraticienSettings();
  const today = new Date().toISOString().slice(0, 10);
  const seances = seancesDuJour(today);
  const prenom = praticienSettings.prenom || 'Praticien';

  const now = new Date();
  const lundiOffset = now.getDay() === 0 ? -6 : 1 - now.getDay();
  const lundi = new Date(now); lundi.setDate(now.getDate() + lundiOffset);
  const dim = new Date(lundi); dim.setDate(lundi.getDate() + 6);
  const seancesSemaine = allSeances.filter(s =>
    s.date >= lundi.toISOString().slice(0, 10) &&
    s.date <= dim.toISOString().slice(0, 10) &&
    s.statut !== 'annulee'
  );

  const il90jFmt = (() => { const d = new Date(); d.setDate(d.getDate() - 90); return d.toISOString().slice(0, 10); })();
  const bilansAFaire = participants.filter(p =>
    p.bilans.length === 0 || p.bilans.every(b => b.date < il90jFmt)
  );

  const currentTimeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const prochaineSeance = seances.find(s => s.statut === 'planifiee' && s.heureDebut >= currentTimeStr)
    ?? seances.find(s => s.statut === 'planifiee');

  const statCard: React.CSSProperties = {
    background: 'white', borderRadius: 16, padding: '16px 20px',
    boxShadow: '0 2px 10px rgba(13,43,43,0.07)',
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  };
  const divider: React.CSSProperties = { width: 1, height: 36, background: C.border };

  return (
    <div style={{ minHeight: '100vh', background: '#F0F4F4' }}>

      {/* ── HEADER ─────────────────────────────────────────────── */}
      <div style={{ background: C.dark, paddingTop: 'calc(env(safe-area-inset-top, 44px) + 18px)', paddingLeft: 20, paddingRight: 20, paddingBottom: 22 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <img src="/logo-horizon.png?v=2" alt="Horizon" style={{ height: 22, marginBottom: 12 }}
              onError={e => { (e.target as HTMLImageElement).src = '/logo-horizon.svg'; }} />
            <div style={{ fontSize: 22, fontWeight: 800, color: 'white', lineHeight: 1.2 }}>Bonjour {prenom} 👋</div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', marginTop: 5 }}>{formatDateLong(new Date())}</div>
          </div>
          <div style={{ background: C.primary, borderRadius: 24, padding: '6px 14px', fontSize: 13, fontWeight: 700, color: 'white', marginTop: 2, flexShrink: 0 }}>
            {seances.length} séance{seances.length !== 1 ? 's' : ''}
          </div>
        </div>
      </div>

      <div style={{ padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* ── STATS ──────────────────────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={statCard}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 22 }}>👥</span>
              <div>
                <div style={{ fontSize: 24, fontWeight: 800, color: C.primary, lineHeight: 1 }}>{participants.length}</div>
                <div style={{ fontSize: 11, color: C.muted, marginTop: 3 }}>bénéficiaires actifs</div>
              </div>
            </div>
            <div style={divider} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 22 }}>📊</span>
              <div>
                <div style={{ fontSize: 24, fontWeight: 800, color: C.primary, lineHeight: 1 }}>{bilansAFaire.length}</div>
                <div style={{ fontSize: 11, color: C.muted, marginTop: 3 }}>bilans à faire</div>
              </div>
            </div>
          </div>

          <div style={statCard}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 22 }}>📅</span>
              <div>
                <div style={{ fontSize: 24, fontWeight: 800, color: C.primary, lineHeight: 1 }}>{seancesSemaine.length}</div>
                <div style={{ fontSize: 11, color: C.muted, marginTop: 3 }}>cette semaine</div>
              </div>
            </div>
            <div style={divider} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 22 }}>⏰</span>
              <div>
                <div style={{ fontSize: 24, fontWeight: 800, color: contratsARenouveler.length > 0 ? '#F59E0B' : C.primary, lineHeight: 1 }}>
                  {contratsARenouveler.length}
                </div>
                <div style={{ fontSize: 11, color: C.muted, marginTop: 3 }}>contrat fin proche</div>
              </div>
            </div>
          </div>
        </div>

        {/* ── PROCHAINE SÉANCE ──────────────────────────────────── */}
        {prochaineSeance && (() => {
          const p = participants.find(x => x.id === prochaineSeance.participantId);
          const ciInfo = p ? getContreIndications(p) : { actif: false, detail: null };
          const contreIndDetail = ciInfo.detail ?? undefined;
          const hasCI = ciInfo.actif;
          const adresse = [p?.adresseRue, p?.adresseVille].filter(Boolean).join(', ');
          return (
            <div style={{ background: '#E8F8F8', borderRadius: 16, padding: '16px', border: `1px solid ${C.primary}33` }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.primary, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
                Prochaine séance
              </div>
              <div style={{ fontSize: 17, fontWeight: 700, color: C.text, marginBottom: 4 }}>
                🕙 {prochaineSeance.heureDebut} · {p?.prenom} {p?.nom}
              </div>
              {adresse && (
                <div style={{ fontSize: 13, color: 'var(--color-ink-2)', marginBottom: hasCI ? 8 : 14 }}>📍 {adresse}</div>
              )}
              {hasCI && contreIndDetail && (
                <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '7px 10px', marginBottom: 14, fontSize: 12, color: '#B91C1C', fontWeight: 600 }}>
                  ⚠️ {contreIndDetail}
                </div>
              )}
              <div style={{ display: 'flex', gap: 8 }}>
                {adresse && (
                  <button onClick={() => ouvrirMaps(adresse)}
                    style={{ flex: 1, padding: '11px', background: 'white', border: `1.5px solid ${C.primary}`, borderRadius: 10, fontSize: 13, fontWeight: 700, color: C.primary, cursor: 'pointer' }}>
                    🗺️ Itinéraire
                  </button>
                )}
                <button onClick={() => p && onVoirFiche(p.id)}
                  style={{ flex: 1, padding: '11px', background: C.primary, border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 700, color: 'white', cursor: 'pointer' }}>
                  📋 Fiche →
                </button>
              </div>
            </div>
          );
        })()}

        {/* ── TIMELINE ou ÉTAT VIDE ─────────────────────────────── */}
        {seances.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '36px 20px' }}>
            <i className="ti ti-calendar-off" style={{ fontSize: 54, color: '#BDD0D0', display: 'block', marginBottom: 14 }} />
            <div style={{ fontSize: 16, fontWeight: 600, color: '#7A9A9A', marginBottom: 6 }}>Aucune séance aujourd'hui</div>
            <div style={{ fontSize: 13, color: C.muted }}>Profitez-en pour avancer sur vos bilans</div>
          </div>
        ) : (
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-ink-2)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
              Aujourd'hui
            </div>
            <div style={{ background: 'white', borderRadius: 16, overflow: 'hidden', boxShadow: '0 2px 10px rgba(13,43,43,0.07)' }}>
              {seances.map((seance, index) => {
                const p = participants.find(x => x.id === seance.participantId);
                const estEnCours = seance.heureDebut <= currentTimeStr && seance.heureFin > currentTimeStr;
                const icon = seance.statut === 'realisee' ? '✅'
                  : seance.statut === 'annulee' ? '❌'
                  : estEnCours ? '🔵' : '⬜';
                return (
                  <div key={seance.id}>
                    <div onClick={() => p && onVoirFiche(p.id)}
                      style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px', cursor: p ? 'pointer' : 'default', background: estEnCours ? '#F0FAFA' : 'white' }}>
                      <span style={{ fontSize: 15, flexShrink: 0 }}>{icon}</span>
                      <span style={{ fontSize: 13, color: C.muted, flexShrink: 0, width: 38 }}>{seance.heureDebut}</span>
                      <span style={{ fontSize: 14, fontWeight: estEnCours ? 700 : 500, color: C.text, flex: 1 }}>
                        {p?.prenom} {p?.nom}
                      </span>
                      <i className="ti ti-chevron-right" style={{ fontSize: 15, color: '#D0DCDC' }} />
                    </div>
                    {index < seances.length - 1 && <div style={{ height: 1, background: '#F0F4F4', marginLeft: 16 }} />}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── ALERTES ───────────────────────────────────────────── */}
        {contratsARenouveler.length > 0 && (
          <div style={{ background: '#FEF3C7', border: '1px solid #FCD34D', borderRadius: 12, padding: '12px 14px', fontSize: 13, color: '#92400E', fontWeight: 600 }}>
            ⏰ {contratsARenouveler.length} contrat{contratsARenouveler.length > 1 ? 's' : ''} à renouveler bientôt
          </div>
        )}

      </div>
    </div>
  );
}

// ── EcranPatients ─────────────────────────────────────────────────────────────

type FiltrePatients = 'tous' | 'ci' | 'bilan' | 'seance';

function EcranPatients({ onVoirFiche }: { onVoirFiche: (id: string) => void }) {
  const { participants } = useParticipants();
  const { seances } = useAgenda();
  const [q, setQ] = useState('');
  const [filtre, setFiltre] = useState<FiltrePatients>('tous');
  const today = new Date().toISOString().slice(0, 10);
  const il90jFmt = (() => { const d = new Date(); d.setDate(d.getDate() - 90); return d.toISOString().slice(0, 10); })();

  function hasCI(p: import('../../types').Participant): boolean {
    return getContreIndications(p).actif;
  }

  const baseFiltered = participants.filter(p =>
    `${p.prenom} ${p.nom}`.toLowerCase().includes(q.toLowerCase())
  );

  const filtered = baseFiltered.filter(p => {
    if (filtre === 'ci')     return hasCI(p);
    if (filtre === 'bilan')  return p.bilans.length === 0 || p.bilans.every(b => b.date < il90jFmt);
    if (filtre === 'seance') return seances.some(s => s.participantId === p.id && s.date === today && s.statut === 'planifiee');
    return true;
  });

  const FILTRES: { id: FiltrePatients; label: string }[] = [
    { id: 'tous',   label: 'Tous' },
    { id: 'ci',     label: '⚠️ CI' },
    { id: 'bilan',  label: '📊 Bilan' },
    { id: 'seance', label: '📅 Aujourd\'hui' },
  ];

  return (
    <div>
      <div style={{ background: 'white', paddingTop: 'calc(env(safe-area-inset-top, 44px) + 12px)', paddingLeft: 16, paddingRight: 16, paddingBottom: 12, borderBottom: `1px solid ${C.border}`, position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: C.text, marginBottom: 10 }}>Mes bénéficiaires</div>
        <input type="search" placeholder="Rechercher..." value={q} onChange={e => setQ(e.target.value)}
          style={{ width: '100%', padding: '10px 14px', border: `1px solid ${C.border}`, borderRadius: 10, fontSize: 14, background: C.bg, outline: 'none', boxSizing: 'border-box', marginBottom: 10 }} />
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
          {FILTRES.map(f => (
            <button key={f.id} onClick={() => setFiltre(f.id)} style={{
              flexShrink: 0, padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: 'none',
              background: filtre === f.id ? C.primary : C.bg,
              color: filtre === f.id ? 'white' : 'var(--color-ink-2)',
            }}>{f.label}</button>
          ))}
        </div>
      </div>

      <div style={{ padding: '8px 16px' }}>
        {filtered.length === 0 && (
          <div style={{ color: C.muted, textAlign: 'center', padding: 30 }}>Aucun bénéficiaire trouvé</div>
        )}
        {filtered.map(p => {
          const prochaine = seances.filter(s => s.participantId === p.id && s.date >= today && s.statut === 'planifiee').sort((a, b) => a.date.localeCompare(b.date))[0];
          const ci = hasCI(p);
          return (
            <div key={p.id} onClick={() => onVoirFiche(p.id)} style={{ ...card, display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', position: 'relative' }}>
              <div style={{ width: 42, height: 42, borderRadius: '50%', background: C.primary, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, color: 'white', flexShrink: 0 }}>
                {p.prenom[0]}{p.nom[0]}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: C.text, display: 'flex', alignItems: 'center', gap: 6 }}>
                  {p.prenom} {p.nom}
                  {ci && <span style={{ fontSize: 13 }} title="Contre-indications actives">⚠️</span>}
                </div>
                <div style={{ fontSize: 12, color: C.muted, marginTop: 1 }}>
                  {libelleAge(p.dateNaissance)}{prochaine ? ` · ${formatDateCourt(prochaine.date)}` : ''}
                </div>
                {(p.contexteClinic || p.pathologie) && (
                  <div style={{ fontSize: 11, color: 'var(--color-ink-2)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.contexteClinic || p.pathologie}
                  </div>
                )}
              </div>
              <i className="ti ti-chevron-right" style={{ fontSize: 18, color: '#D0DCDC' }} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── EcranSaisie ───────────────────────────────────────────────────────────────

function ChoixSaisie({ onPatient, onBilan }: { onPatient: () => void; onBilan: () => void }) {
  const btn: React.CSSProperties = { width: '100%', display: 'flex', alignItems: 'center', gap: 14, padding: 16, background: 'white', border: `1px solid ${C.border}`, borderRadius: 12, marginBottom: 10, cursor: 'pointer', textAlign: 'left' };
  return (
    <div style={{ paddingTop: 'calc(env(safe-area-inset-top, 44px) + 12px)', paddingLeft: 20, paddingRight: 20, paddingBottom: 20 }}>
      <div style={{ fontSize: 18, fontWeight: 700, color: C.text, marginBottom: 20 }}>Que saisir ?</div>
      <button onClick={onBilan} style={btn}>
        <span style={{ fontSize: 28 }}>📋</span>
        <div><div style={{ fontSize: 15, fontWeight: 600, color: C.text }}>Nouveau bilan</div><div style={{ fontSize: 12, color: C.muted }}>Bilan initial ou trimestriel</div></div>
        <i className="ti ti-chevron-right" style={{ fontSize: 18, color: '#D0DCDC', marginLeft: 'auto' }} />
      </button>
      <button onClick={onPatient} style={btn}>
        <span style={{ fontSize: 28 }}>👤</span>
        <div><div style={{ fontSize: 15, fontWeight: 600, color: C.text }}>Nouveau bénéficiaire</div><div style={{ fontSize: 12, color: C.muted }}>Créer une fiche bénéficiaire</div></div>
        <i className="ti ti-chevron-right" style={{ fontSize: 18, color: '#D0DCDC', marginLeft: 'auto' }} />
      </button>
    </div>
  );
}

// ── Nouveau patient mobile ─────────────────────────────────────────────────────

// Même bloc et mêmes règles que le formulaire complet
// (ParticipantForm.tsx) : le libellé de la case principale est identique, et
// la validation passe par src/lib/consentementRgpd.ts.
function BlocConsentementMobile({ rgpd, onRgpdChange, droitImage, onDroitImageChange }: {
  rgpd: RgpdConsent;
  onRgpdChange: (rgpd: RgpdConsent) => void;
  droitImage: boolean;
  onDroitImageChange: (v: boolean) => void;
}) {
  const { settings } = usePraticienSettings();
  const cases = [
    { key: 'consentementObtenu', label: 'Le bénéficiaire a été informé et a consenti' },
    { key: 'droitAcces',         label: "Droit d'accès expliqué" },
    { key: 'droitRectification', label: 'Droit de rectification expliqué' },
    { key: 'droitEffacement',    label: "Droit à l'effacement expliqué" },
  ] as const;
  const ligne: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, color: C.text, padding: '7px 0', cursor: 'pointer' };
  const caseACocher: React.CSSProperties = { width: 20, height: 20, accentColor: 'var(--color-teal)', flexShrink: 0 };

  return (
    <div style={{ background: 'white', border: `1px solid ${rgpd.consentementObtenu ? C.border : '#FCD34D'}`, borderRadius: 12, padding: '14px 16px', marginBottom: 14 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-ink-2)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>
        🔒 Consentement RGPD *
      </div>
      <div style={{ background: C.bg, borderRadius: 8, padding: '8px 10px', fontSize: 12, color: '#4A6080', lineHeight: 1.5, marginBottom: 8 }}>
        <strong>À lire au bénéficiaire :</strong> « Dans le cadre de votre suivi en APA, je collecte vos données personnelles et de santé.
        Utilisées uniquement pour votre suivi. Droits d'accès, rectification, effacement : {settings.email || 'votre praticien'} »
      </div>
      {cases.map(({ key, label }) => (
        <label key={key} style={ligne}>
          <input type="checkbox" checked={rgpd[key]} style={caseACocher}
            onChange={e => {
              const coche = e.target.checked;
              onRgpdChange(key === 'consentementObtenu'
                ? avecConsentement(rgpd, coche, new Date().toISOString().slice(0, 10))
                : { ...rgpd, [key]: coche });
            }} />
          {label}
        </label>
      ))}
      <label style={ligne}>
        <input type="checkbox" checked={droitImage} style={caseACocher} onChange={e => onDroitImageChange(e.target.checked)} />
        Droit à l'image accordé (photos/vidéos en séance)
      </label>
      <div style={{ fontSize: 12, color: C.muted, margin: '8px 0 6px' }}>Mode de recueil</div>
      <div style={{ display: 'flex', gap: 6 }}>
        {(['oral_note', 'ecrit', 'numerique'] as const).map(m => (
          <button key={m} type="button" onClick={() => onRgpdChange({ ...rgpd, methodeConsentement: m })}
            style={{
              flex: 1, padding: '8px 4px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
              border: `1px solid ${rgpd.methodeConsentement === m ? C.primary : C.border}`,
              background: rgpd.methodeConsentement === m ? C.primary : 'white',
              color: rgpd.methodeConsentement === m ? 'white' : '#4A6080',
            }}>
            {m === 'oral_note' ? 'Oral noté' : m === 'ecrit' ? 'Écrit' : 'Numérique'}
          </button>
        ))}
      </div>
      {!rgpd.consentementObtenu && (
        <div style={{ fontSize: 12, color: '#B45309', fontWeight: 600, marginTop: 10 }}>
          ⚠️ Obligatoire pour créer la fiche : sans consentement, les données de santé ne peuvent pas être collectées légalement.
        </div>
      )}
    </div>
  );
}

// Brouillon PARTAGÉ avec le formulaire complet (ParticipantFormPage, même clé) :
// tourner le téléphone en paysage reprend la saisie dans le formulaire
// complet, et inversement. Le consentement reste obligatoire des deux côtés —
// le formulaire complet normalise le `rgpd` du brouillon et refuse la
// création sans lui (src/lib/consentementRgpd.ts, testé).
const CLE_BROUILLON_CREATION = 'nouveau';

function texteBrouillon(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function NouveauPatientMobile({ onBack: retourParent, onCree }: { onBack: () => void; onCree: (participantId: string) => void }) {
  const { addParticipant } = useParticipants();
  const [brouillon] = useState<Record<string, unknown>>(() => getBrouillonParticipant(CLE_BROUILLON_CREATION)?.data ?? {});
  const [form, setForm] = useState(() => ({
    prenom: texteBrouillon(brouillon.prenom),
    nom: texteBrouillon(brouillon.nom),
    dateNaissance: texteBrouillon(brouillon.dateNaissance),
    telephone: texteBrouillon(brouillon.telephone),
    pathologie: texteBrouillon(brouillon.pathologie),
  }));
  const [rgpd, setRgpd] = useState<RgpdConsent>(() => normaliserRgpd(brouillon.rgpd as Partial<RgpdConsent> | undefined));
  const [droitImage, setDroitImage] = useState<boolean>(brouillon.droitImage === true);
  const [enregistrement, setEnregistrement] = useState(false);

  // Écrit à chaque changement, sans délai : c'est ce brouillon qui survit à la
  // rotation. Fusionné avec l'existant, pour ne rien perdre de ce que le
  // formulaire complet y a mis (anamnèse, organisation…).
  useEffect(() => {
    const existant = getBrouillonParticipant(CLE_BROUILLON_CREATION);
    const saisieVide = !form.prenom && !form.nom && !form.dateNaissance && !form.telephone && !form.pathologie && !rgpd.consentementObtenu;
    if (!existant && saisieVide) return;
    sauvegarderBrouillonParticipant(CLE_BROUILLON_CREATION, existant?.step ?? 0, {
      ...(existant?.data ?? {}),
      ...form,
      pathologie: form.pathologie || undefined,
      rgpd,
      droitImage,
    });
  }, [form, rgpd, droitImage]);

  // Abandon explicite : le brouillon ne doit pas réapparaître, comme le
  // bouton « Annuler » du formulaire complet.
  function onBack() {
    supprimerBrouillonParticipant(CLE_BROUILLON_CREATION);
    retourParent();
  }
  const label: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: 'var(--color-ink-2)', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: 6 };
  const input: React.CSSProperties = { width: '100%', padding: '12px 14px', border: `1px solid ${C.border}`, borderRadius: 10, fontSize: 15, outline: 'none', marginBottom: 14, boxSizing: 'border-box' };

  async function sauvegarder() {
    if (enregistrement) return;
    if (!form.prenom.trim() || !form.nom.trim() || !form.dateNaissance) {
      toast.error('Prénom, nom et date de naissance requis');
      return;
    }
    // Ce formulaire n'enregistrait AUCUN consentement. Même règle que le
    // formulaire complet désormais : bloquant à la création.
    const erreurRgpd = erreurConsentementCreation(rgpd);
    if (erreurRgpd) {
      toast.error(erreurRgpd);
      return;
    }
    setEnregistrement(true);
    try {
      // Attendu, et plus lancé sans `await` : le succès s'affichait même
      // quand l'enregistrement échouait.
      // Ce que le formulaire complet a mis dans le brouillon partagé (anamnèse,
      // organisation…) n'est repris QUE pour la même personne : un brouillon
      // abandonné ne doit pas prêter ses données de santé à un autre
      // bénéficiaire.
      const donneesBrouillon = getBrouillonParticipant(CLE_BROUILLON_CREATION)?.data ?? {};
      const memePersonne =
        texteBrouillon(donneesBrouillon.prenom).trim().toLowerCase() === form.prenom.trim().toLowerCase() &&
        texteBrouillon(donneesBrouillon.nom).trim().toLowerCase() === form.nom.trim().toLowerCase();
      const cree = await addParticipant({
        ...(memePersonne ? donneesBrouillon : {}),
        prenom: form.prenom.trim(),
        nom: form.nom.trim(),
        dateNaissance: form.dateNaissance,
        telephone: form.telephone || undefined,
        pathologie: form.pathologie || undefined,
        dateCreation: new Date().toISOString(),
        rgpd,
        droitImage,
        bilans: [],
        token: uuidv4().slice(0, 12),
      } as any);
      supprimerBrouillonParticipant(CLE_BROUILLON_CREATION);
      toast.success(`${form.prenom} ${form.nom} créé(e) ✅`);
      onCree(cree.id);
    } catch (err) {
      console.error('[Mobile] Création bénéficiaire en échec :', err);
      toast.error("La fiche n'a pas pu être créée, réessayez");
    } finally {
      setEnregistrement(false);
    }
  }

  return (
    <div style={{ paddingTop: 'calc(env(safe-area-inset-top, 44px) + 12px)', paddingLeft: 16, paddingRight: 16, paddingBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
          <i className="ti ti-arrow-left" style={{ fontSize: 22, color: C.text }} />
        </button>
        <div style={{ fontSize: 18, fontWeight: 700, color: C.text }}>Nouveau bénéficiaire</div>
      </div>

      <label style={label}>Prénom *</label>
      <input value={form.prenom} onChange={e => setForm(f => ({ ...f, prenom: e.target.value }))} placeholder="Marie" style={input} />

      <label style={label}>Nom *</label>
      <input value={form.nom} onChange={e => setForm(f => ({ ...f, nom: e.target.value }))} placeholder="Dupont" style={input} />

      <label style={label}>Date de naissance *</label>
      <input type="date" value={form.dateNaissance} onChange={e => setForm(f => ({ ...f, dateNaissance: e.target.value }))} style={input} />

      <label style={label}>Téléphone</label>
      <input type="tel" value={form.telephone} onChange={e => setForm(f => ({ ...f, telephone: e.target.value }))} placeholder="06 00 00 00 00" style={input} />

      <label style={label}>Pathologie / contexte</label>
      <input value={form.pathologie} onChange={e => setForm(f => ({ ...f, pathologie: e.target.value }))} placeholder="Ex : arthrose genou droit" style={input} />

      <BlocConsentementMobile rgpd={rgpd} onRgpdChange={setRgpd} droitImage={droitImage} onDroitImageChange={setDroitImage} />

      <button onClick={sauvegarder} disabled={enregistrement}
        style={{ width: '100%', padding: 16, background: rgpd.consentementObtenu ? C.primary : '#8FA8A8', color: 'white', border: 'none', borderRadius: 12, fontSize: 16, fontWeight: 700, cursor: enregistrement ? 'wait' : 'pointer', marginTop: 8 }}>
        {enregistrement ? 'Enregistrement…' : '✅ Créer le bénéficiaire'}
      </button>
    </div>
  );
}

// ── Nouveau bilan mobile ───────────────────────────────────────────────────────

// Deux écrans, deux URL : le choix du bénéficiaire (/?onglet=saisie&mode=bilan)
// et le bilan lui-même (/participant/:id/bilan/new — la même que le desktop,
// pour qu'une rotation affiche le même bilan).

function ChoixBeneficiaireBilanMobile({ onBack, onChoisir }: { onBack: () => void; onChoisir: (participantId: string) => void }) {
  const { participants } = useParticipants();
  const [participantId, setParticipantId] = useState('');
  const label: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: 'var(--color-ink-2)', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: 6 };

  return (
    <div style={{ paddingTop: 'calc(env(safe-area-inset-top, 44px) + 12px)', paddingLeft: 16, paddingRight: 16, paddingBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
          <i className="ti ti-arrow-left" style={{ fontSize: 22, color: C.text }} />
        </button>
        <div style={{ fontSize: 18, fontWeight: 700, color: C.text }}>Nouveau bilan</div>
      </div>

      <label style={label}>Sélectionner le bénéficiaire</label>
      <select value={participantId} onChange={e => setParticipantId(e.target.value)}
        style={{ width: '100%', padding: '12px 14px', border: `1px solid ${C.border}`, borderRadius: 10, fontSize: 15, background: 'white', color: C.text, outline: 'none', marginBottom: 20 }}>
        <option value="">Choisir un bénéficiaire...</option>
        {participants.map(p => (
          <option key={p.id} value={p.id}>{p.prenom} {p.nom}</option>
        ))}
      </select>

      <button
        onClick={() => { if (participantId) onChoisir(participantId); }}
        disabled={!participantId}
        style={{ width: '100%', padding: 16, background: participantId ? C.primary : '#D0DCDC', color: 'white', border: 'none', borderRadius: 12, fontSize: 16, fontWeight: 700, cursor: participantId ? 'pointer' : 'not-allowed' }}>
        Commencer le bilan →
      </button>
    </div>
  );
}

function BilanMobile({ participantId, onTermine }: { participantId: string; onTermine: () => void }) {
  // Lecture ET écritures sur la même instance du hook : la sélection des tests
  // doit se refléter aussitôt dans `participant`.
  const { participants, loading, addBilan, updateParticipant } = useParticipants();
  const [testsIgnores, setTestsIgnores] = useState(false);
  const [brouillonSauve] = useState(() => getBrouillon(participantId));
  const [reprise, setReprise] = useState<'a_decider' | 'reprendre' | 'recommencer'>(() => (brouillonSauve ? 'a_decider' : 'recommencer'));
  const participant = participants.find(p => p.id === participantId);

  if (!participant) return <EcranChargement loading={loading} texteIntrouvable="Bénéficiaire introuvable" onBack={onTermine} />;

  // Brouillon existant — saisie interrompue, ou retour en portrait après une
  // rotation. Ce bilan repartait d'un formulaire vide, dont la PREMIÈRE frappe
  // écrasait le brouillon sauvegardé. Même choix que le bilan desktop.
  if (brouillonSauve && reprise === 'a_decider') {
    return (
      <div style={{ paddingTop: 'calc(env(safe-area-inset-top, 44px) + 12px)', paddingLeft: 16, paddingRight: 16, paddingBottom: 16 }}>
        <ModalRepriseBrouillon
          brouillon={brouillonSauve}
          participantNom={`${participant.prenom} ${participant.nom}`}
          onReprendre={() => setReprise('reprendre')}
          onRecommencer={() => { supprimerBrouillon(participant.id); setReprise('recommencer'); }}
          onFermer={onTermine}
        />
      </div>
    );
  }

  const premierBilanSansTests = participant.bilans.length === 0 && (!participant.testsActifs || participant.testsActifs.length === 0);
  if (premierBilanSansTests && !testsIgnores) {
    return (
      <ModalSelectionTests
        participant={participant}
        onValider={async tests => { await updateParticipant(participant.id, { testsActifs: tests }); }}
        // « Annuler » ne faisait rien : le praticien restait bloqué sur la
        // modale. Même comportement que le bilan desktop (NewBilan) :
        // continuer avec tous les tests.
        onCancel={() => setTestsIgnores(true)}
      />
    );
  }

  return (
    <div style={{ paddingTop: 'calc(env(safe-area-inset-top, 44px) + 12px)', paddingLeft: 16, paddingRight: 16, paddingBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <button onClick={onTermine} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
          <i className="ti ti-arrow-left" style={{ fontSize: 22, color: C.text }} />
        </button>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>Bilan — {participant.prenom} {participant.nom}</div>
          <div style={{ fontSize: 12, color: C.muted }}>Bilan n° {participant.bilans.length + 1}</div>
        </div>
      </div>
      <BilanStepper
        participant={participant}
        onSave={async (bilan: Omit<Bilan, 'id'>) => {
          await addBilan(participant.id, bilan);
          toast.success('Bilan enregistré ✅');
          onTermine();
        }}
        onCancel={onTermine}
        brouillon={reprise === 'reprendre' ? brouillonSauve : null}
      />
    </div>
  );
}

// ── EcranTournee ──────────────────────────────────────────────────────────────

function EcranTournee() {
  const { participants } = useParticipants();
  const { seancesDuJour, changerStatut } = useAgenda();
  const today = new Date().toISOString().slice(0, 10);
  const seances = seancesDuJour(today);
  // Dictée ouverte conservée si l'interface est remplacée (rotation) : son
  // contenu, lui, est conservé par DicteePostSeance.
  const [dicteeParticipantId, setDicteeParticipantId] = useEtatSession<string | null>('tournee_dictee', null);
  const dicteeParticipant = participants.find(x => x.id === dicteeParticipantId) ?? null;
  const { ajouterCompteRendu } = useCompteRenduSeance(dicteeParticipant?.id ?? '');

  return (
    <div>
      <div style={{ background: 'white', paddingTop: 'calc(env(safe-area-inset-top, 44px) + 12px)', paddingLeft: 16, paddingRight: 16, paddingBottom: 16, borderBottom: `1px solid ${C.border}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: C.text }}>Ma tournée</div>
            <div style={{ fontSize: 12, color: C.muted }}>{seances.length} bénéficiaire{seances.length !== 1 ? 's' : ''} · {formatDateLong(new Date())}</div>
          </div>
        </div>
        {seances.length > 0 && (
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <div style={{ flex: 1, background: '#DCFCE7', borderRadius: 10, padding: '8px', textAlign: 'center' }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: '#166534' }}>{seances.filter(s => s.statut === 'realisee').length}/{seances.length}</div>
              <div style={{ fontSize: 10, color: '#166534' }}>réalisées</div>
            </div>
            <div style={{ flex: 1, background: '#E8F8F8', borderRadius: 10, padding: '8px', textAlign: 'center' }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: C.primary }}>{seances.reduce((acc, s) => acc + s.dureeMinutes, 0)} min</div>
              <div style={{ fontSize: 10, color: C.primary }}>durée totale</div>
            </div>
            <div style={{ flex: 1, background: '#FEF3C7', borderRadius: 10, padding: '8px', textAlign: 'center' }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: '#92400E' }}>{seances[seances.length - 1]?.heureFin ?? '—'}</div>
              <div style={{ fontSize: 10, color: '#92400E' }}>fin estimée</div>
            </div>
          </div>
        )}
        {seances.filter(s => s.adresse).length > 1 && (
          <button
            onClick={() => toast(MESSAGE_PAYSAGE, { icon: 'ℹ️' })}
            style={{ width: '100%', marginTop: 10, padding: '10px', background: C.dark, color: 'white', border: 'none', borderRadius: 10, fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <i className="ti ti-route" style={{ fontSize: 16 }} />
            Optimiser l'itinéraire
          </button>
        )}
      </div>

      <div style={{ padding: '8px 16px' }}>
        {seances.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: C.muted }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🗺️</div>
            Aucune séance aujourd'hui
          </div>
        ) : seances.map((s, i) => {
          const p = participants.find(x => x.id === s.participantId);
          return (
            <div key={s.id} style={card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <span style={{ width: 26, height: 26, borderRadius: '50%', background: C.primary, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: 'white', flexShrink: 0 }}>{i + 1}</span>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 600, color: C.text }}>{p?.prenom} {p?.nom}</div>
                    <div style={{ fontSize: 12, color: C.muted }}>{s.heureDebut} · {s.dureeMinutes} min</div>
                  </div>
                </div>
                {s.adresse && (
                  <button onClick={() => ouvrirMaps(s.adresse)}
                    style={{ background: '#E8F8F8', border: 'none', borderRadius: 8, padding: '8px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 700, color: C.primary }}>
                    <i className="ti ti-map-pin" style={{ fontSize: 15 }} />Maps
                  </button>
                )}
              </div>
              {s.adresse && <div style={{ fontSize: 12, color: C.muted, marginBottom: 10 }}>📍 {s.adresse}</div>}
              <button onClick={() => { if (s.statut !== 'realisee') { changerStatut(s.id, 'realisee'); toast.success('Séance réalisée ✅'); } }}
                style={{ width: '100%', padding: 9, background: s.statut === 'realisee' ? '#DCFCE7' : C.primary, color: s.statut === 'realisee' ? '#166534' : 'white', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: s.statut === 'realisee' ? 'default' : 'pointer' }}>
                {s.statut === 'realisee' ? '✅ Réalisée' : '✓ Marquer réalisée'}
              </button>
              {s.statut === 'realisee' && p && (
                <button
                  onClick={() => setDicteeParticipantId(p.id)}
                  style={{ marginTop: 6, width: '100%', padding: '8px', background: C.bg, border: `1px dashed ${C.primary}`, borderRadius: 8, fontSize: 12, fontWeight: 700, color: C.primary, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                  🎙️ Dicter le compte-rendu
                </button>
              )}
            </div>
          );
        })}
      </div>

      {dicteeParticipant && (
        <DicteePostSeance
          participant={dicteeParticipant}
          onClose={() => setDicteeParticipantId(null)}
          onSave={async (data) => { await ajouterCompteRendu(data); }}
        />
      )}
    </div>
  );
}

// ── EcranSettings ─────────────────────────────────────────────────────────────

const CLE_SESSION_PARAMETRES = 'parametres_praticien';

function EcranSettings({ onBack: retourParent }: { onBack: () => void }) {
  const inp: React.CSSProperties = { width: '100%', padding: '12px 14px', border: `1px solid ${C.border}`, borderRadius: 10, fontSize: 15, outline: 'none', marginBottom: 14, boxSizing: 'border-box', background: 'white' };
  const lbl: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: 'var(--color-ink-2)', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: 6 };

  const { settings: praticienData, loading, echecChargement, sauvegarderSettings } = usePraticienSettings();
  // Saisie en cours retrouvée après une rotation : elle prime sur le
  // pré-remplissage depuis la base.
  const [saisieRestauree] = useState(() => lireEtatSession<SettingsPraticien>(CLE_SESSION_PARAMETRES));
  const [form, setForm] = useState<SettingsPraticien>(saisieRestauree ?? DEFAULTS_SETTINGS);
  const [saving, setSaving] = useState(false);
  const [showConfirmReset, setShowConfirmReset] = useState(false);

  // Pré-remplir le formulaire dès que Supabase a répondu
  useEffect(() => {
    if (!loading && !saisieRestauree) setForm(praticienData);
  }, [loading]); // eslint-disable-line react-hooks/exhaustive-deps

  // Jamais tant que le formulaire porte encore les valeurs par défaut : elles
  // seraient restaurées à la place des vrais réglages.
  useEffect(() => {
    if (saisieRestauree || form !== DEFAULTS_SETTINGS) ecrireEtatSession(CLE_SESSION_PARAMETRES, form);
  }, [form, saisieRestauree]);

  // Retour explicite ou réglages enregistrés : rien à reprendre.
  function onBack() {
    effacerEtatSession(CLE_SESSION_PARAMETRES);
    retourParent();
  }

  function set(field: string, value: string) { setForm((f) => ({ ...f, [field]: value })); }

  async function sauvegarder() {
    // Le formulaire n'a pas pu etre pre-rempli : l'enregistrer ecraserait la
    // fiche avec des champs vides. On refuse plutot que de perdre la donnee.
    if (echecChargement) {
      toast.error("Vos réglages n'ont pas pu être chargés. Rechargez la page avant d'enregistrer.");
      return;
    }
    if (!form.prenom.trim() || !form.nom.trim()) { toast.error('Prénom et nom requis'); return; }

    // Meme validation que les reglages desktop et l'onboarding. Le SIRET
    // reste facultatif ici — un salarie de structure n'en a pas — mais s'il
    // est saisi, il doit etre juste : c'est cet ecran, sans aucun controle,
    // qui a laisse entrer un numero a 15 chiffres.
    const controleSiret = validerSiret(form.siret);
    if (form.siret.trim() && !controleSiret.valide) {
      toast.error(controleSiret.message!);
      return;
    }

    setSaving(true);
    try {
      await sauvegarderSettings({ ...form, siret: controleSiret.siret });
      toast.success('Paramètres enregistrés ✅');
      onBack();
    } catch {
      toast.error('Erreur lors de l\'enregistrement');
    } finally {
      setSaving(false);
    }
  }

  function reinitialiserDonnees() {
    localStorage.setItem('mouvtrack_demo_cleared', '1');
    // `mouvtrack_indispos_pierre` garde son nom historique VOLONTAIREMENT :
    // c'est une liste de purge, et plus rien n'ecrit cette cle. La renommer
    // cesserait de nettoyer celle que les navigateurs existants portent
    // reellement — le contraire du but recherche.
    ['mouvtrack_participants', 'mouvtrack_seances', 'mouvtrack_contrats',
     'mouvtrack_zones', 'notes_seances', 'mouvtrack_indispos_pierre',
     'mouvtrack_question_templates'].forEach(k => localStorage.removeItem(k));
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.startsWith('brouillon_bilan_') || key.startsWith('bilan_en_cours_'))) toRemove.push(key);
    }
    toRemove.forEach(k => localStorage.removeItem(k));
    toast.success('Données supprimées — rechargement…');
    setTimeout(() => window.location.reload(), 800);
  }

  return (
    <div style={{ minHeight: '100vh', background: C.bg }}>
      <div style={{ background: C.dark, paddingTop: 'calc(env(safe-area-inset-top, 44px) + 12px)', paddingLeft: 16, paddingRight: 16, paddingBottom: 16 }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginBottom: 12 }}>
          <i className="ti ti-arrow-left" style={{ fontSize: 20, color: 'rgba(255,255,255,0.7)' }} aria-hidden="true" />
        </button>
        <div style={{ fontSize: 18, fontWeight: 700, color: 'white' }}>Paramètres</div>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>Profil et informations professionnelles</div>
      </div>

      <div style={{ padding: 16, paddingBottom: 40 }}>

        {echecChargement && (
          <div style={{
            background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 12,
            padding: '12px 14px', marginBottom: 12, fontSize: 13, color: '#B91C1C', lineHeight: 1.5,
          }}>
            Vos réglages n'ont pas pu être chargés depuis le serveur. L'enregistrement
            est désactivé pour ne pas écraser votre fiche — rechargez la page.
          </div>
        )}

        <InfoSection titre="Mon profil">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 0 }}>
            <div>
              <label style={lbl}>Prénom *</label>
              <input value={form.prenom} onChange={e => set('prenom', e.target.value)} placeholder="Marie" style={inp} />
            </div>
            <div>
              <label style={lbl}>Nom *</label>
              <input value={form.nom} onChange={e => set('nom', e.target.value)} placeholder="Durand" style={inp} />
            </div>
          </div>
          <label style={lbl}>Titre professionnel</label>
          <input value={form.titre} onChange={e => set('titre', e.target.value)} placeholder="Enseignant APA" style={inp} />
          <label style={lbl}>Email</label>
          <input type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="marie.durand@exemple.fr" style={inp} />
          <label style={lbl}>Téléphone</label>
          <input type="tel" value={form.telephone} onChange={e => set('telephone', e.target.value)} placeholder="06 12 34 56 78" style={{ ...inp, marginBottom: 0 }} />
        </InfoSection>

        <div style={{ height: 12 }} />

        <InfoSection titre="Informations légales">
          <label style={lbl}>Numéro SIRET</label>
          <input value={form.siret} onChange={e => set('siret', e.target.value)} placeholder="XXX XXX XXX XXXXX" style={inp} />
          <label style={lbl}>Numéro SAP</label>
          <input value={form.numeroSAP} onChange={e => set('numeroSAP', e.target.value)} placeholder="SAP XXXXXXXXX" style={inp} />
          <label style={lbl}>Ville de signature</label>
          <input value={form.villeSignature} onChange={e => set('villeSignature', e.target.value)} placeholder="Paris" style={inp} />
          <label style={lbl}>Tarif horaire (€)</label>
          <input type="number" value={form.tarifHoraire} onChange={e => set('tarifHoraire', e.target.value)} placeholder="45" style={{ ...inp, marginBottom: 0 }} />
        </InfoSection>

        <div style={{ height: 12 }} />

        <button onClick={sauvegarder} disabled={saving || loading || echecChargement}
          style={{ width: '100%', padding: 16, background: saving || loading || echecChargement ? '#8FA8A8' : C.primary, color: 'white', border: 'none', borderRadius: 12, fontSize: 16, fontWeight: 700, cursor: saving || loading || echecChargement ? 'not-allowed' : 'pointer', marginTop: 16 }}>
          {saving ? 'Enregistrement...' : loading ? 'Chargement...' : '💾 Enregistrer'}
        </button>

        {/* Zone danger */}
        <div style={{ marginTop: 28, borderTop: `1px solid ${C.border}`, paddingTop: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#E85050', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
            Zone danger
          </div>
          <div style={{ background: 'white', borderRadius: 12, border: '1px solid #FECACA', padding: '14px 16px' }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 4 }}>
              🗑️ Supprimer les données bénéficiaires
            </div>
            <div style={{ fontSize: 12, color: C.muted, marginBottom: 12, lineHeight: 1.5 }}>
              Supprime tous les bénéficiaires, bilans, contrats et séances. Les exercices et paramètres sont conservés.
            </div>
            <button onClick={() => setShowConfirmReset(true)} style={{ padding: '10px 16px', background: 'none', border: '1px solid #E85050', borderRadius: 10, color: '#E85050', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
              Réinitialiser les données
            </button>
          </div>
        </div>
      </div>

      {/* Modal de confirmation */}
      {showConfirmReset && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 24 }}>
          <div style={{ background: 'white', borderRadius: 16, padding: 24, width: '100%', maxWidth: 340 }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: C.text, marginBottom: 10 }}>
              ⚠️ Confirmer la suppression
            </div>
            <p style={{ fontSize: 14, color: '#4A6080', lineHeight: 1.6, marginBottom: 20 }}>
              Tous les <strong>bénéficiaires, bilans, contrats et séances</strong> seront supprimés.<br />
              Les exercices et paramètres sont conservés.<br />
              <strong style={{ color: '#E85050' }}>Cette action est irréversible.</strong>
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setShowConfirmReset(false)} style={{ flex: 1, padding: '12px', background: 'none', border: `1px solid ${C.border}`, borderRadius: 10, fontSize: 14, fontWeight: 600, color: C.muted, cursor: 'pointer' }}>
                Annuler
              </button>
              <button onClick={reinitialiserDonnees} style={{ flex: 1, padding: '12px', background: '#E85050', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, color: 'white', cursor: 'pointer' }}>
                Confirmer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── EcranPlus ─────────────────────────────────────────────────────────────────

function EcranPlus({ onLogout, onNaviguer }: { onLogout: () => void; onNaviguer: (url: string) => void }) {
  const { settings } = usePraticienSettings();
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
      {/* Agenda, carte, bibliothèque : leur URL desktop. Sous 768 px elle affiche
          l'invitation à tourner le téléphone — et en paysage, l'écran lui-même. */}
      <SectionMobile titre="Mon activité">
        <ItemMobile icon="ti-route" label="Tournée du jour" onClick={() => onNaviguer(URLS_MOBILE.tournee)} />
        <ItemMobile icon="ti-calendar" label="Agenda complet" onClick={() => onNaviguer('/agenda-v2')} />
        <ItemMobile icon="ti-map-pin" label="Carte bénéficiaires" onClick={() => onNaviguer('/map')} />
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

// ── Détail bilan mobile ────────────────────────────────────────────────────────

function DetailBilanMobile({ bilan, onBack }: { bilan: import('../../types').Bilan; onBack: () => void }) {
  const TESTS = [
    { label: 'Équilibre Droit',  val: bilan.equilibre.droite,       unite: 's' },
    { label: 'Équilibre Gauche', val: bilan.equilibre.gauche,       unite: 's' },
    { label: 'Chair Stand 30s',  val: bilan.chairStand30,           unite: ' rép.' },
    { label: 'HandGrip Droit',   val: bilan.handGrip.droite,        unite: ' kg' },
    { label: 'HandGrip Gauche',  val: bilan.handGrip.gauche,        unite: ' kg' },
    { label: 'TUG 3m',           val: bilan.tug3m,                  unite: 's' },
    { label: 'Souplesse',        val: bilan.souplesse.valeur,       unite: ' cm' },
    { label: 'TM6 Distance',     val: bilan.tm6.distanceMetres,     unite: ' m' },
    { label: 'TM6 FC avant',     val: bilan.tm6.fcAvant,            unite: ' bpm' },
    { label: 'TM6 FC après',     val: bilan.tm6.fcApres,            unite: ' bpm' },
    { label: 'SpO2 avant',       val: bilan.tm6.spo2Avant,          unite: '%' },
    { label: 'Mémoire imm.',     val: bilan.memoire.scoreImmediat,  unite: '/5' },
    { label: 'Mémoire dif.',     val: bilan.memoire.scoreDiffere,   unite: '/5' },
  ].filter(t => t.val !== null && t.val !== undefined);

  const dateLabel = new Date(bilan.date + 'T12:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <div>
      <div style={{ background: C.dark, paddingTop: 'calc(env(safe-area-inset-top, 44px) + 12px)', paddingLeft: 16, paddingRight: 16, paddingBottom: 16 }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginBottom: 12 }}>
          <i className="ti ti-arrow-left" style={{ fontSize: 20, color: 'rgba(255,255,255,0.7)' }} />
        </button>
        <div style={{ fontSize: 18, fontWeight: 700, color: 'white' }}>
          {bilan.type === 'initial' ? 'Bilan initial' : `Bilan T${bilan.trimestre}`}
        </div>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 4 }}>{dateLabel}</div>
      </div>

      <div style={{ padding: 16 }}>

        {TESTS.length > 0 && (
          <>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Résultats des tests</div>
            <div style={{ background: 'white', borderRadius: 12, border: `1px solid ${C.border}`, overflow: 'hidden', marginBottom: 16 }}>
              {TESTS.map((t, i) => (
                <div key={t.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '11px 14px', borderBottom: i < TESTS.length - 1 ? `1px solid ${C.border}` : 'none' }}>
                  <span style={{ fontSize: 13, color: C.muted }}>{t.label}</span>
                  <span style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{t.val}{t.unite}</span>
                </div>
              ))}
            </div>
          </>
        )}

        {bilan.notesProfessionnelles && (
          <>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Notes professionnelles</div>
            <div style={{ background: 'white', borderRadius: 12, border: `1px solid ${C.border}`, padding: '12px 14px', marginBottom: 16, fontSize: 14, color: C.text, lineHeight: 1.6 }}>
              {bilan.notesProfessionnelles}
            </div>
          </>
        )}

        {bilan.objectifsSuivants && (
          <>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Objectifs suivants</div>
            <div style={{ background: 'white', borderRadius: 12, border: `1px solid ${C.border}`, padding: '12px 14px', marginBottom: 16, fontSize: 14, color: C.text, lineHeight: 1.6 }}>
              {bilan.objectifsSuivants}
            </div>
          </>
        )}

        {bilan.interpretationIA && (
          <>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Analyse IA</div>
            <div style={{ background: '#E8F8F8', borderRadius: 12, border: `1px solid ${C.primary}30`, padding: '12px 14px', marginBottom: 10, fontSize: 14, color: C.text, lineHeight: 1.6 }}>
              <MarkdownRendu>{bilan.interpretationIA.textePro}</MarkdownRendu>
            </div>
            {bilan.interpretationIA.pointsForts.length > 0 && (
              <div style={{ background: 'white', borderRadius: 12, border: `1px solid ${C.border}`, padding: '12px 14px', marginBottom: 10 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#1D9E75', marginBottom: 6 }}>✅ Points forts</div>
                {bilan.interpretationIA.pointsForts.map((p, i) => <div key={i} style={{ fontSize: 13, color: C.text, marginBottom: 3 }}>· {p}</div>)}
              </div>
            )}
            {bilan.interpretationIA.pointsATravail.length > 0 && (
              <div style={{ background: 'white', borderRadius: 12, border: `1px solid ${C.border}`, padding: '12px 14px', marginBottom: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#E8A020', marginBottom: 6 }}>⚡ À travailler</div>
                {bilan.interpretationIA.pointsATravail.map((p, i) => <div key={i} style={{ fontSize: 13, color: C.text, marginBottom: 3 }}>· {p}</div>)}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Modification fiche patient mobile ────────────────────────────────────────

function EditPatientMobile({ participant, onBack: retourParent }: { participant: import('../../types').Participant; onBack: () => void }) {
  const { updateParticipant } = useParticipants();
  const [loading, setLoading] = useState(false);
  // Conservée si l'interface est remplacée (rotation du téléphone).
  const [form, setForm, effacerSaisie] = useEtatSession(`modifier_beneficiaire_${participant.id}`, () => ({
    prenom:                  participant.prenom ?? '',
    nom:                     participant.nom ?? '',
    dateNaissance:           participant.dateNaissance ?? '',
    taille:                  participant.taille ? String(participant.taille) : '',
    poids:                   participant.poids ? String(participant.poids) : '',
    telephone:               participant.telephone ?? '',
    email:                   participant.email ?? '',
    adresseRue:              participant.adresseRue ?? '',
    adresseCodePostal:       participant.adresseCodePostal ?? '',
    adresseVille:            participant.adresseVille ?? '',
    contexteClinic:          participant.contexteClinic ?? '',
    antecedentsMedicaux:     participant.antecedentsMedicaux ?? '',
    antecedentsChirurgicaux: participant.antecedentsChirurgicaux ?? '',
    allergies:               participant.allergies ?? '',
  }));

  // Retour explicite ou fiche enregistrée : rien à reprendre.
  function onBack() {
    effacerSaisie();
    retourParent();
  }

  function setF(field: string, value: string) {
    setForm(f => ({ ...f, [field]: value }));
  }

  async function sauvegarder() {
    if (!form.prenom.trim() || !form.nom.trim()) { toast.error('Prénom et nom requis'); return; }
    setLoading(true);
    try {
      await updateParticipant(participant.id, {
        prenom: form.prenom.trim(),
        nom: form.nom.trim(),
        dateNaissance: form.dateNaissance || participant.dateNaissance,
        taille: form.taille ? Number(form.taille) : undefined,
        poids: form.poids ? Number(form.poids) : undefined,
        telephone: form.telephone || undefined,
        email: form.email || undefined,
        adresseRue: form.adresseRue || undefined,
        adresseCodePostal: form.adresseCodePostal || undefined,
        adresseVille: form.adresseVille || undefined,
        contexteClinic: form.contexteClinic || undefined,
        antecedentsMedicaux: form.antecedentsMedicaux || undefined,
        antecedentsChirurgicaux: form.antecedentsChirurgicaux || undefined,
        allergies: form.allergies || undefined,
      });
      toast.success('Fiche mise à jour ✅');
      onBack();
    } catch (err) {
      console.error('Erreur mise à jour fiche:', err);
      toast.error('Erreur lors de la sauvegarde, réessayez');
    } finally {
      setLoading(false);
    }
  }

  const inp: React.CSSProperties = {
    width: '100%', padding: '11px 14px', border: `1.5px solid ${C.border}`,
    borderRadius: 10, fontSize: 14, outline: 'none', background: 'white',
    boxSizing: 'border-box', marginBottom: 12, fontFamily: 'inherit',
  };
  const lbl: React.CSSProperties = {
    fontSize: 11, fontWeight: 700, color: 'var(--color-ink-2)',
    textTransform: 'uppercase', letterSpacing: '0.04em',
    display: 'block', marginBottom: 5,
  };
  const sec: React.CSSProperties = {
    fontSize: 11, fontWeight: 700, color: 'var(--color-ink-2)',
    textTransform: 'uppercase', letterSpacing: '0.06em',
    marginBottom: 8, paddingLeft: 4,
  };
  const box: React.CSSProperties = {
    background: 'white', borderRadius: 12, border: `1px solid ${C.border}`,
    padding: '14px 16px', marginBottom: 16,
  };

  return (
    <div style={{ minHeight: '100vh', background: C.bg, paddingBottom: 40 }}>
      <div style={{ background: C.dark, paddingTop: 'calc(env(safe-area-inset-top, 44px) + 12px)', paddingLeft: 16, paddingRight: 16, paddingBottom: 16 }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginBottom: 12 }}>
          <i className="ti ti-arrow-left" style={{ fontSize: 20, color: 'rgba(255,255,255,0.7)' }} aria-hidden="true" />
        </button>
        <div style={{ fontSize: 18, fontWeight: 700, color: 'white' }}>Modifier la fiche</div>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>{participant.prenom} {participant.nom}</div>
      </div>

      <div style={{ padding: 16 }}>

        <div style={sec}>Identité</div>
        <div style={box}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
            <div>
              <label style={lbl}>Prénom *</label>
              <input value={form.prenom} onChange={e => setF('prenom', e.target.value)} style={{ ...inp, marginBottom: 0 }} />
            </div>
            <div>
              <label style={lbl}>Nom *</label>
              <input value={form.nom} onChange={e => setF('nom', e.target.value)} style={{ ...inp, marginBottom: 0 }} />
            </div>
          </div>
          <label style={lbl}>Date de naissance</label>
          <input type="date" value={form.dateNaissance} onChange={e => setF('dateNaissance', e.target.value)} style={inp} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={lbl}>Taille (cm)</label>
              <input type="number" value={form.taille} onChange={e => setF('taille', e.target.value)} placeholder="170" style={{ ...inp, marginBottom: 0 }} />
            </div>
            <div>
              <label style={lbl}>Poids (kg)</label>
              <input type="number" value={form.poids} onChange={e => setF('poids', e.target.value)} placeholder="70" style={{ ...inp, marginBottom: 0 }} />
            </div>
          </div>
        </div>

        <div style={sec}>Contact</div>
        <div style={box}>
          <label style={lbl}>Téléphone</label>
          <input type="tel" value={form.telephone} onChange={e => setF('telephone', e.target.value)} placeholder="06 00 00 00 00" style={inp} />
          <label style={lbl}>Email</label>
          <input type="email" value={form.email} onChange={e => setF('email', e.target.value)} placeholder="patient@email.com" style={{ ...inp, marginBottom: 0 }} />
        </div>

        <div style={sec}>Adresse</div>
        <div style={box}>
          <label style={lbl}>Rue</label>
          <input value={form.adresseRue} onChange={e => setF('adresseRue', e.target.value)} placeholder="12 rue des Acacias" style={inp} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 10 }}>
            <div>
              <label style={lbl}>Code postal</label>
              <input value={form.adresseCodePostal} onChange={e => setF('adresseCodePostal', e.target.value)} placeholder="75001" style={{ ...inp, marginBottom: 0 }} />
            </div>
            <div>
              <label style={lbl}>Ville</label>
              <input value={form.adresseVille} onChange={e => setF('adresseVille', e.target.value)} placeholder="Paris" style={{ ...inp, marginBottom: 0 }} />
            </div>
          </div>
        </div>

        <div style={sec}>Santé</div>
        <div style={box}>
          <label style={lbl}>Contexte clinique / pathologie</label>
          <textarea value={form.contexteClinic} onChange={e => setF('contexteClinic', e.target.value)} placeholder="Ex : PTH droite, diabète T2..." rows={2}
            style={{ ...inp, resize: 'none' }} />
          <label style={lbl}>Antécédents médicaux</label>
          <textarea value={form.antecedentsMedicaux} onChange={e => setF('antecedentsMedicaux', e.target.value)} placeholder="HTA, diabète T2..." rows={2}
            style={{ ...inp, resize: 'none' }} />
          <label style={lbl}>Antécédents chirurgicaux</label>
          <textarea value={form.antecedentsChirurgicaux} onChange={e => setF('antecedentsChirurgicaux', e.target.value)} placeholder="PTH droite 2023..." rows={2}
            style={{ ...inp, resize: 'none' }} />
          <label style={lbl}>Allergies</label>
          <input value={form.allergies} onChange={e => setF('allergies', e.target.value)} placeholder="Allergies connues..." style={{ ...inp, marginBottom: 0 }} />
        </div>

        <button onClick={sauvegarder} disabled={!form.prenom || !form.nom || loading}
          style={{
            width: '100%', padding: '14px',
            background: !form.prenom || !form.nom ? '#E0EEEE' : C.primary,
            color: !form.prenom || !form.nom ? C.muted : 'white',
            border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 700,
            cursor: !form.prenom || !form.nom ? 'not-allowed' : 'pointer',
          }}>
          {loading ? 'Enregistrement...' : '💾 Enregistrer les modifications'}
        </button>

      </div>
    </div>
  );
}

// ── EcranAssistant ────────────────────────────────────────────────────────────

function buildAssistantPrompt(patient: import('../../types').Participant | null, history: { role: string; content: string }[], question: string): string {
  const base = `Tu es un assistant clinique expert en Activité Physique Adaptée (APA), spécialisé dans l'accompagnement des enseignants APA libéraux en France.
Tu réponds UNIQUEMENT en français. Tu es concis, professionnel, pratique.
Tu ne fais jamais de diagnostic médical.`;

  const patientCtx = patient
    ? (() => {
        const age = libelleAge(patient.dateNaissance);
        const bi = patient.bilans.find(b => b.type === 'initial') ?? null;
        const ciInfoExport = getContreIndications(patient, bi);
        const ci = ciInfoExport.actif ? (ciInfoExport.detail ?? 'non précisées') : 'aucune';
        const pathologies = [patient.pathologie, patient.antecedentsMedicaux].filter(Boolean).join(' / ') || 'non renseigné';
        return `\n\nPATIENT : ${patient.prenom} ${patient.nom}, ${age}. Pathologies : ${pathologies}. Contre-indications : ${ci}.`;
      })()
    : '';

  const prior = history.length > 0
    ? '\n\nÉCHANGES PRÉCÉDENTS:\n' + history.map(m => `${m.role === 'user' ? 'Q' : 'R'}: ${m.content}`).join('\n')
    : '';

  return `${base}${patientCtx}${prior}\n\n---\nQUESTION:\n${question}`;
}

function EcranAssistant({
  preSelectedPatientId,
  onOuvrirSettings,
}: {
  preSelectedPatientId?: string | null;
  onOuvrirSettings: () => void;
}) {
  const { participants } = useParticipants();
  type Msg = { role: 'user' | 'assistant'; content: string };
  // Conversation conservée si l'interface est remplacée (rotation). Une réponse
  // encore en attente à ce moment-là est perdue ; la question, non.
  const [selectedPatientId, setSelectedPatientId] = useEtatSession<string | null>('assistant_mobile_beneficiaire', null);
  const selectedPatient = participants.find(p => p.id === selectedPatientId) ?? null;
  const setSelectedPatient = (p: Participant | null) => setSelectedPatientId(p ? p.id : null);
  const [messages, setMessages] = useEtatSession<Msg[]>('assistant_mobile_messages', []);
  const [input, setInput] = useEtatSession('assistant_mobile_saisie', '');
  const [loading, setLoading] = useState(false);
  const [showSheet, setShowSheet] = useState(false);
  const [searchQ, setSearchQ] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (preSelectedPatientId && participants.length > 0) {
      const p = participants.find(x => x.id === preSelectedPatientId);
      if (p) setSelectedPatientId(p.id);
    }
  }, [preSelectedPatientId, participants, setSelectedPatientId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  async function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: trimmed }]);
    setLoading(true);
    try {
      const prompt = buildAssistantPrompt(selectedPatient, messages, trimmed);
      const res = await fetch('/api/claude', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await getAuthHeader()) },
        body: JSON.stringify({ prompt }),
      });
      const data = await res.json();
      const responseText: string = data.text ?? (data.error ? `Erreur : ${data.error}` : 'Pas de réponse.');
      setMessages(prev => [...prev, { role: 'assistant', content: responseText }]);
      if (supabase) {
        try {
          await supabase.from('assistant_logs').insert({
            patient_id: selectedPatient?.id ?? null,
            question: trimmed,
            reponse: responseText,
          });
        } catch { /* non bloquant */ }
      }
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', content: `Erreur : ${err instanceof Error ? err.message : String(err)}` }]);
    } finally {
      setLoading(false);
    }
  }

  const filteredPatients = searchQ.trim()
    ? participants.filter(p => `${p.prenom} ${p.nom}`.toLowerCase().includes(searchQ.toLowerCase())).slice(0, 8)
    : participants.slice(0, 10);

  const ciTexte = selectedPatient ? getContreIndications(selectedPatient).detail : null;

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: C.bg }}>

      {/* Header */}
      <div style={{ background: C.dark, paddingTop: 'calc(env(safe-area-inset-top, 44px) + 12px)', paddingLeft: 16, paddingRight: 16, paddingBottom: 14, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: 'white' }}>🤖 Mon assistant</div>
          <button
            onClick={onOuvrirSettings}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.5)', padding: 6 }}
          >
            <i className="ti ti-settings" style={{ fontSize: 18 }} />
          </button>
        </div>
        {/* Sélecteur patient */}
        <button
          onClick={() => setShowSheet(true)}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '10px 12px', background: selectedPatient ? 'rgba(43,191,191,0.15)' : 'rgba(255,255,255,0.07)',
            border: `1px solid ${selectedPatient ? 'rgba(43,191,191,0.4)' : 'rgba(255,255,255,0.12)'}`,
            borderRadius: 10, cursor: 'pointer', color: 'white',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            {selectedPatient ? (
              <>
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: C.primary, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: 'white', flexShrink: 0 }}>
                  {selectedPatient.prenom[0]}{selectedPatient.nom[0]}
                </div>
                <div style={{ textAlign: 'left', minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'white' }}>{selectedPatient.prenom} {selectedPatient.nom}</div>
                  {ciTexte && <div style={{ fontSize: 11, color: '#F87171' }}>⚠️ CI active</div>}
                </div>
              </>
            ) : (
              <>
                <i className="ti ti-search" style={{ fontSize: 15, color: 'rgba(255,255,255,0.4)' }} />
                <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>Sélectionner un patient (optionnel)</span>
              </>
            )}
          </div>
          {selectedPatient ? (
            <button
              onClick={e => { e.stopPropagation(); setSelectedPatient(null); }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.4)', padding: 4, flexShrink: 0 }}
            >
              ✕
            </button>
          ) : (
            <i className="ti ti-chevron-right" style={{ fontSize: 14, color: 'rgba(255,255,255,0.3)' }} />
          )}
        </button>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {messages.length === 0 && !loading && (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: C.muted }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🤖</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: C.text, marginBottom: 6 }}>Mon assistant APA</div>
            <div style={{ fontSize: 13, lineHeight: 1.6, marginBottom: 20 }}>
              {selectedPatient
                ? `Contexte : ${selectedPatient.prenom} ${selectedPatient.nom}. Posez votre question.`
                : 'Posez une question générale ou sélectionnez un patient pour un contexte personnalisé.'}
            </div>
            {[
              '💊 Analyser les contre-indications',
              '🏋️ Suggérer un programme',
              '📊 Interpréter un test',
            ].map((s, i) => (
              <button key={i} onClick={() => setInput(s.slice(3))}
                style={{ display: 'block', width: '100%', padding: '10px 14px', marginBottom: 6, background: 'white', border: `1px solid ${C.border}`, borderRadius: 10, fontSize: 13, color: C.text, cursor: 'pointer', textAlign: 'left' }}>
                {s}
              </button>
            ))}
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
            <div style={{
              maxWidth: '82%', padding: '11px 14px', fontSize: 14, lineHeight: 1.6,
              borderRadius: msg.role === 'user' ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
              background: msg.role === 'user' ? C.primary : 'white',
              color: msg.role === 'user' ? 'white' : C.text,
              border: msg.role === 'assistant' ? `1px solid ${C.border}` : 'none',
              whiteSpace: 'pre-wrap',
            }}>
              {msg.content}
            </div>
          </div>
        ))}
        {loading && (
          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <div style={{ background: 'white', border: `1px solid ${C.border}`, borderRadius: '12px 12px 12px 2px', padding: '11px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 18, animation: 'spin 1s linear infinite' }}>⟳</span>
              <span style={{ fontSize: 13, color: C.muted }}>Réflexion en cours…</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Zone saisie */}
      <div style={{ background: 'white', borderTop: `1px solid ${C.border}`, padding: '10px 14px', paddingBottom: 'calc(10px + env(safe-area-inset-bottom, 0px))', flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input); } }}
            placeholder="Posez votre question…"
            rows={1}
            disabled={loading}
            style={{
              flex: 1, padding: '10px 12px', border: `1px solid ${C.border}`, borderRadius: 10,
              fontSize: 14, outline: 'none', resize: 'none', fontFamily: 'inherit',
              background: C.bg, lineHeight: 1.5, maxHeight: 100,
            }}
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || loading}
            style={{
              width: 44, height: 44, borderRadius: 10, border: 'none', cursor: 'pointer',
              background: input.trim() && !loading ? C.primary : '#D0DCDC',
              color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}
          >
            <i className="ti ti-send" style={{ fontSize: 17 }} />
          </button>
        </div>
      </div>

      {/* Bottom sheet sélecteur patient */}
      {showSheet && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200 }}
          onClick={() => setShowSheet(false)}>
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'white', borderRadius: '20px 20px 0 0', maxHeight: '70vh', display: 'flex', flexDirection: 'column' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ padding: '16px 16px 8px' }}>
              <div style={{ width: 40, height: 4, borderRadius: 2, background: '#E5E7EB', margin: '0 auto 14px' }} />
              <div style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 10 }}>Sélectionner un bénéficiaire</div>
              <input
                type="search"
                value={searchQ}
                onChange={e => setSearchQ(e.target.value)}
                placeholder="Rechercher…"
                autoFocus
                style={{ width: '100%', padding: '10px 14px', border: `1px solid ${C.border}`, borderRadius: 10, fontSize: 14, background: C.bg, outline: 'none', boxSizing: 'border-box' }}
              />
            </div>
            <div style={{ overflowY: 'auto', flex: 1, padding: '0 16px 20px', paddingBottom: 'calc(20px + env(safe-area-inset-bottom, 0px))' }}>
              {selectedPatient && (
                <button
                  onClick={() => { setSelectedPatient(null); setShowSheet(false); }}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', marginBottom: 6, background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, cursor: 'pointer', textAlign: 'left' }}
                >
                  <span style={{ fontSize: 16 }}>✕</span>
                  <span style={{ fontSize: 13, color: '#DC2626', fontWeight: 600 }}>Retirer le contexte bénéficiaire</span>
                </button>
              )}
              {filteredPatients.map(p => (
                <button key={p.id} onClick={() => { setSelectedPatient(p); setSearchQ(''); setShowSheet(false); }}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '11px 12px', marginBottom: 4, background: selectedPatient?.id === p.id ? '#E8F8F8' : 'white', border: `1px solid ${selectedPatient?.id === p.id ? C.primary : C.border}`, borderRadius: 10, cursor: 'pointer', textAlign: 'left' }}>
                  <div style={{ width: 36, height: 36, borderRadius: '50%', background: C.primary, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: 'white', flexShrink: 0 }}>
                    {p.prenom[0]}{p.nom[0]}
                  </div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{p.prenom} {p.nom}</div>
                    <div style={{ fontSize: 12, color: C.muted }}>{libelleAge(p.dateNaissance)}{p.pathologie ? ` · ${p.pathologie.slice(0, 20)}` : ''}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Écrans de routage ─────────────────────────────────────────────────────────

function EcranChargement({ loading, texteIntrouvable, onBack }: { loading: boolean; texteIntrouvable: string; onBack: () => void }) {
  return (
    <div style={{ paddingTop: 'calc(env(safe-area-inset-top, 44px) + 48px)', paddingLeft: 24, paddingRight: 24, textAlign: 'center', color: C.muted, fontSize: 14 }}>
      <div style={{ marginBottom: 16 }}>{loading ? 'Chargement…' : texteIntrouvable}</div>
      {!loading && (
        <button onClick={onBack} style={{ padding: '10px 18px', background: 'white', border: `1.5px solid ${C.primary}`, color: C.primary, borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
          ← Retour
        </button>
      )}
    </div>
  );
}

// Écran desktop seulement. L'URL est déjà celle de la version paysage : il
// suffit de tourner le téléphone.
function EcranPaysage({ onRetour }: { onRetour: () => void }) {
  return (
    <div style={{ paddingTop: 'calc(env(safe-area-inset-top, 44px) + 48px)', paddingLeft: 24, paddingRight: 24, paddingBottom: 24, textAlign: 'center' }}>
      <div style={{ fontSize: 52, marginBottom: 14 }} aria-hidden="true">🔄</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: C.text, marginBottom: 8 }}>Écran disponible en mode paysage</div>
      <div style={{ fontSize: 14, color: '#4A6080', lineHeight: 1.6, marginBottom: 28 }}>
        Cet écran n'a pas encore de version téléphone. Tournez votre téléphone : il s'affichera directement.
      </div>
      <button onClick={onRetour} style={{ padding: '12px 20px', background: 'white', border: `1.5px solid ${C.primary}`, color: C.primary, borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
        ← Retour
      </button>
    </div>
  );
}

function ModifierBeneficiaireMobile({ participantId, onBack }: { participantId: string; onBack: () => void }) {
  const { participants, loading } = useParticipants();
  const participant: Participant | undefined = participants.find(p => p.id === participantId);
  if (!participant) return <EcranChargement loading={loading} texteIntrouvable="Bénéficiaire introuvable" onBack={onBack} />;
  return <EditPatientMobile participant={participant} onBack={onBack} />;
}

function DetailBilanMobileRoute({ participantId, bilanId, onBack }: { participantId: string; bilanId: string; onBack: () => void }) {
  const { participants, loading } = useParticipants();
  const bilan = participants.find(p => p.id === participantId)?.bilans.find(b => b.id === bilanId);
  if (!bilan) return <EcranChargement loading={loading} texteIntrouvable="Bilan introuvable" onBack={onBack} />;
  return <DetailBilanMobile bilan={bilan} onBack={onBack} />;
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
    case 'tournee':
      contenu = <EcranTournee />;
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
      avecBarre = false;
      contenu = <EcranSettings onBack={() => navigate(URLS_MOBILE.plus)} />;
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
    case 'detailBilan': {
      const { participantId, bilanId } = ecran;
      avecBarre = false;
      contenu = <DetailBilanMobileRoute participantId={participantId} bilanId={bilanId} onBack={() => voirFiche(participantId)} />;
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
