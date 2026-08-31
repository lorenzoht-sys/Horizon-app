import { useState, useRef, useEffect } from 'react';
import { toast } from 'sonner';
import { useParticipants } from '../../hooks/useParticipants';
import { useAgenda } from '../../hooks/useAgenda';
import { useContrats } from '../../hooks/useContrats';
import { useCompteRenduSeance } from '../../hooks/useCompteRenduSeance';
import BilanStepper from '../../components/bilan/BilanStepper';
import ModalSelectionTests from '../../components/bilan/ModalSelectionTests';
import DicteePostSeance from '../../components/DicteePostSeance';
import ModalEspacePatient from '../../components/participant/ModalEspacePatient';
import MarkdownRendu from '../../components/ui/MarkdownRendu';
import type { Bilan } from '../../types';
import { v4 as uuidv4 } from 'uuid';
import { supabase, getAuthHeader } from '../../lib/supabase';
import {
  CLE_SETTINGS_PRATICIEN,
  DEFAULTS_SETTINGS,
  EVENT_SETTINGS_PRATICIEN,
  chargerSettingsPraticien,
  enregistrerSettingsPraticien,
  hydraterSettingsPraticien,
  type SettingsPraticien,
} from '../../lib/settingsPraticien';
import { validerSiret } from '../../lib/siret';
import { getContreIndications, getObjectifsActivites, formatMomentsTraitement, getAntecedentIcon, getAntecedentTitre, getAntecedentSousLigne, getTraitementsActifs, getTraitementsArretes } from '../../lib/anamnese';

// ── Helpers ───────────────────────────────────────────────────────────────────

function calcAge(d: string) {
  const a = new Date(), b = new Date(d);
  let age = a.getFullYear() - b.getFullYear();
  if (a.getMonth() < b.getMonth()) age--;
  return age;
}

function formatDateLong(d: Date) {
  return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
}

function formatDateCourt(d: string) {
  return new Date(d + 'T12:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

function ouvrirMaps(adresse: string) {
  window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(adresse)}`, '_blank');
}

function formatPhone(tel: string): string {
  const digits = String(tel).replace(/\D/g, '');
  // Normalise +33XXXXXXXXX → 0XXXXXXXXX
  const norm = digits.startsWith('33') && digits.length === 11 ? '0' + digits.slice(2) : digits;
  if (norm.length === 10) return norm.replace(/(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/, '$1 $2 $3 $4 $5');
  return String(tel);
}

function telHref(tel: string): string {
  const digits = String(tel).replace(/\D/g, '');
  const local = digits.startsWith('33') && digits.length === 11 ? digits.slice(2) : digits.replace(/^0/, '');
  return `tel:+33${local}`;
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

function InfoLigne({ icon, texte }: { icon: string; texte: string }) {
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13, color: '#4A6080', marginBottom: 6 }}>
      <i className={`ti ${icon}`} style={{ fontSize: 16, color: C.primary, flexShrink: 0, marginTop: 1 }} aria-hidden="true" />
      <span>{texte}</span>
    </div>
  );
}


// ── Bottom Nav ────────────────────────────────────────────────────────────────

const NAV = [
  { id: 'aujourdhui', icon: 'ti-home',       label: 'Accueil' },
  { id: 'patients',   icon: 'ti-users',      label: 'Bénéfic.' },
  { id: 'saisie',     icon: 'ti-plus',       label: 'Saisie', principal: true },
  { id: 'tournee',    icon: 'ti-route',      label: 'Tournée' },
  { id: 'assistant',  icon: 'ti-robot',      label: 'Assistant' },
];

function BottomNav({ onglet, onChange }: { onglet: string; onChange: (id: string) => void }) {
  return (
    <div style={{
      position: 'fixed', bottom: 0, left: 0, right: 0,
      maxWidth: 480, margin: '0 auto',
      background: 'white',
      boxShadow: '0 -2px 20px rgba(13,43,43,0.08)',
      display: 'flex', padding: 'calc(8px + env(safe-area-inset-bottom)) 0 8px',
      zIndex: 100,
    }}>
      {NAV.map(item => {
        const isActive = onglet === item.id;
        return (
          <button key={item.id} onClick={() => onChange(item.id)}
            style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0' }}>
            {item.principal ? (
              <div style={{ width: 48, height: 48, borderRadius: '50%', background: C.primary, display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: -20, boxShadow: '0 4px 12px rgba(43,191,191,0.4)' }}>
                <i className="ti ti-plus" style={{ fontSize: 22, color: 'white' }} />
              </div>
            ) : (
              <i className={`ti ${item.icon}`} style={{ fontSize: 22, color: isActive ? C.primary : C.muted }} />
            )}
            <span style={{ fontSize: 10, fontWeight: isActive ? 700 : 400, color: isActive ? C.primary : C.muted }}>
              {item.label}
            </span>
            {isActive && !item.principal && (
              <span style={{ width: 4, height: 4, borderRadius: '50%', background: C.primary, marginTop: 1 }} />
            )}
          </button>
        );
      })}
    </div>
  );
}

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
            <img src="/logo-horizon.png.png?v=2" alt="Horizon" style={{ height: 22, marginBottom: 12 }}
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
                  {calcAge(p.dateNaissance)} ans{prochaine ? ` · ${formatDateCourt(prochaine.date)}` : ''}
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

type ModeSaisie = 'choix' | 'patient' | 'bilan';

function EcranSaisie({ onVoirFiche }: { onVoirFiche?: (id: string) => void }) {
  const [mode, setMode] = useState<ModeSaisie>('choix');
  const back = () => setMode('choix');
  if (mode === 'patient') return <NouveauPatientMobile onBack={back} />;
  if (mode === 'bilan')   return <NouveauBilanMobile onBack={back} onVoirFiche={onVoirFiche} />;
  return <ChoixSaisie onPatient={() => setMode('patient')} onBilan={() => setMode('bilan')} />;
}



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

function NouveauPatientMobile({ onBack }: { onBack: () => void }) {
  const { addParticipant } = useParticipants();
  const [form, setForm] = useState({ prenom: '', nom: '', dateNaissance: '', telephone: '', pathologie: '' });
  const label: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: 'var(--color-ink-2)', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: 6 };
  const input: React.CSSProperties = { width: '100%', padding: '12px 14px', border: `1px solid ${C.border}`, borderRadius: 10, fontSize: 15, outline: 'none', marginBottom: 14, boxSizing: 'border-box' };

  function sauvegarder() {
    if (!form.prenom.trim() || !form.nom.trim() || !form.dateNaissance) {
      toast.error('Prénom, nom et date de naissance requis');
      return;
    }
    addParticipant({
      prenom: form.prenom.trim(),
      nom: form.nom.trim(),
      dateNaissance: form.dateNaissance,
      telephone: form.telephone || undefined,
      pathologie: form.pathologie || undefined,
      dateCreation: new Date().toISOString(),
      bilans: [],
      token: uuidv4().slice(0, 12),
    } as any);
    toast.success(`${form.prenom} ${form.nom} créé(e) ✅`);
    onBack();
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

      <button onClick={sauvegarder}
        style={{ width: '100%', padding: 16, background: C.primary, color: 'white', border: 'none', borderRadius: 12, fontSize: 16, fontWeight: 700, cursor: 'pointer', marginTop: 8 }}>
        ✅ Créer le bénéficiaire
      </button>
    </div>
  );
}

// ── Nouveau bilan mobile ───────────────────────────────────────────────────────

function NouveauBilanMobile({ onBack, onVoirFiche }: { onBack: () => void; onVoirFiche?: (id: string) => void }) {
  const { participants, addBilan, updateParticipant } = useParticipants();
  const [participantId, setParticipantId] = useState('');
  const [etape, setEtape] = useState<'choix' | 'bilan'>('choix');

  const participant = participants.find(p => p.id === participantId);

  if (etape === 'bilan' && participant) {
    const premierBilanSansTests = participant.bilans.length === 0 && (!participant.testsActifs || participant.testsActifs.length === 0);
    if (premierBilanSansTests) {
      return (
        <ModalSelectionTests
          participant={participant}
          onValider={async tests => { await updateParticipant(participant.id, { testsActifs: tests }); }}
          onCancel={() => {}}
        />
      );
    }
    return (
      <div style={{ paddingTop: 'calc(env(safe-area-inset-top, 44px) + 12px)', paddingLeft: 16, paddingRight: 16, paddingBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <button onClick={() => setEtape('choix')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
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
            if (onVoirFiche) {
              onVoirFiche(participant.id);
            } else {
              onBack();
            }
          }}
          onCancel={() => setEtape('choix')}
        />
      </div>
    );
  }

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
        onClick={() => { if (participantId) setEtape('bilan'); }}
        disabled={!participantId}
        style={{ width: '100%', padding: 16, background: participantId ? C.primary : '#D0DCDC', color: 'white', border: 'none', borderRadius: 12, fontSize: 16, fontWeight: 700, cursor: participantId ? 'pointer' : 'not-allowed' }}>
        Commencer le bilan →
      </button>
    </div>
  );
}

// ── EcranTournee ──────────────────────────────────────────────────────────────

function EcranTournee() {
  const { participants } = useParticipants();
  const { seancesDuJour, changerStatut } = useAgenda();
  const today = new Date().toISOString().slice(0, 10);
  const seances = seancesDuJour(today);
  const [dicteeParticipant, setDicteeParticipant] = useState<import('../../types').Participant | null>(null);
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
            onClick={() => toast('Optimisation disponible depuis l\'ordinateur 💻', { icon: 'ℹ️' })}
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
                  onClick={() => setDicteeParticipant(p)}
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
          onClose={() => setDicteeParticipant(null)}
          onSave={async (data) => { await ajouterCompteRendu(data); }}
        />
      )}
    </div>
  );
}

// ── EcranSettings ─────────────────────────────────────────────────────────────

function EcranSettings({ onBack }: { onBack: () => void }) {
  const inp: React.CSSProperties = { width: '100%', padding: '12px 14px', border: `1px solid ${C.border}`, borderRadius: 10, fontSize: 15, outline: 'none', marginBottom: 14, boxSizing: 'border-box', background: 'white' };
  const lbl: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: 'var(--color-ink-2)', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: 6 };

  const { settings: praticienData, loading, echecChargement, sauvegarderSettings } = usePraticienSettings();
  const [form, setForm] = useState<SettingsPraticien>(DEFAULTS_SETTINGS);
  const [saving, setSaving] = useState(false);
  const [showConfirmReset, setShowConfirmReset] = useState(false);

  // Pré-remplir le formulaire dès que Supabase a répondu
  useEffect(() => {
    if (!loading) setForm(praticienData);
  }, [loading]); // eslint-disable-line react-hooks/exhaustive-deps

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

function EcranPlus({ onLogout, onOuvrirSettings, onNaviguerOnglet }: { onLogout: () => void; onOuvrirSettings: () => void; onNaviguerOnglet: (id: string) => void }) {
  const { settings } = usePraticienSettings();
  const initiales = `${(settings.prenom || 'P')[0]}${(settings.nom || '')[0] || ''}`;
  const [showImportConfirm, setShowImportConfirm] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const BACKUP_KEYS = [
    'mouvtrack_participants', 'mouvtrack_contrats', 'mouvtrack_seances',
    'notes_seances', 'mouvtrack_exercices', CLE_SETTINGS_PRATICIEN,
    'mouvtrack_zones', 'mouvtrack_question_templates',
  ];

  function exporterDonnees() {
    const data: Record<string, string> = { _version: '1', _date: new Date().toISOString() };
    BACKUP_KEYS.forEach(k => { const v = localStorage.getItem(k); if (v !== null) data[k] = v; });
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `horizon-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Données exportées avec succès ✅');
  }

  function importerDonnees(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result as string);
        BACKUP_KEYS.forEach(k => { if (typeof data[k] === 'string') localStorage.setItem(k, data[k]); });
        toast.success('Import réussi — rechargement…');
        setTimeout(() => window.location.reload(), 800);
      } catch {
        toast.error('Fichier invalide');
      }
    };
    reader.readAsText(file);
  }

  return (
    <div style={{ paddingTop: 'calc(env(safe-area-inset-top, 44px) + 12px)', paddingLeft: 16, paddingRight: 16, paddingBottom: 16 }}>

      {/* Profil praticien */}
      <div style={{ background: C.dark, borderRadius: 14, padding: '16px', display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <div style={{ width: 44, height: 44, borderRadius: '50%', background: C.primary, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 700, color: 'white', flexShrink: 0 }}>
          {initiales}
        </div>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'white' }}>
            {settings.prenom || 'Praticien'}{settings.nom ? ` ${settings.nom}` : ''}
          </div>
          {settings.titre && <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>{settings.titre}</div>}
        </div>
      </div>

      {/* Section Mon activité */}
      <SectionMobile titre="Mon activité">
        <ItemMobile icon="ti-route" label="Tournée du jour" onClick={() => onNaviguerOnglet('tournee')} />
        <ItemMobile icon="ti-calendar" label="Agenda complet" onClick={() => toast('Accessible depuis l\'ordinateur 💻', { icon: 'ℹ️' })} />
        <ItemMobile icon="ti-map-pin" label="Carte bénéficiaires" onClick={() => toast('Accessible depuis l\'ordinateur 💻', { icon: 'ℹ️' })} />
      </SectionMobile>

      {/* Section Contenu */}
      <SectionMobile titre="Contenu">
        <ItemMobile icon="ti-dumbbell" label="Bibliothèque exercices" onClick={() => toast('Accessible depuis l\'ordinateur 💻', { icon: 'ℹ️' })} />
      </SectionMobile>

      {/* Section Gestion */}
      <SectionMobile titre="Gestion">
        <ItemMobile icon="ti-download" label="Exporter mes données (JSON)" onClick={exporterDonnees} />
        <ItemMobile icon="ti-upload" label="Importer des données" onClick={() => setShowImportConfirm(true)} />
      </SectionMobile>

      {/* Section Compte */}
      <SectionMobile titre="Compte">
        <ItemMobile icon="ti-settings" label="Paramètres" onClick={onOuvrirSettings} />
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

      {/* Input fichier caché pour l'import */}
      <input ref={fileInputRef} type="file" accept=".json" style={{ display: 'none' }}
        onChange={e => { const f = e.target.files?.[0]; if (f) importerDonnees(f); e.target.value = ''; }} />

      {/* Modal confirmation import */}
      {showImportConfirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 24 }}>
          <div style={{ background: 'white', borderRadius: 16, padding: 24, width: '100%', maxWidth: 340 }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: C.text, marginBottom: 10 }}>
              📥 Importer des données
            </div>
            <p style={{ fontSize: 14, color: '#4A6080', lineHeight: 1.6, marginBottom: 20 }}>
              Cette action <strong>remplacera toutes vos données actuelles</strong>.<br />
              <strong style={{ color: '#E85050' }}>Continuer ?</strong>
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setShowImportConfirm(false)} style={{ flex: 1, padding: '12px', background: 'none', border: `1px solid ${C.border}`, borderRadius: 10, fontSize: 14, fontWeight: 600, color: C.muted, cursor: 'pointer' }}>
                Annuler
              </button>
              <button onClick={() => { setShowImportConfirm(false); fileInputRef.current?.click(); }}
                style={{ flex: 1, padding: '12px', background: C.primary, border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, color: 'white', cursor: 'pointer' }}>
                Confirmer
              </button>
            </div>
          </div>
        </div>
      )}
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

function EditPatientMobile({ participant, onBack }: { participant: import('../../types').Participant; onBack: () => void }) {
  const { updateParticipant } = useParticipants();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
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
  });

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

// ── Fiche patient mobile ───────────────────────────────────────────────────────

function FichePatientMobile({ participantId, onBack, onOpenAssistant }: { participantId: string; onBack: () => void; onOpenAssistant?: (id: string) => void }) {
  const { participants, addBilan, updateParticipant } = useParticipants();
  const { seances } = useAgenda();
  const { contratActifDeParticipant } = useContrats();
  const { ajouterCompteRendu, compteRendus } = useCompteRenduSeance(participantId);
  const p = participants.find(x => x.id === participantId);
  const [onglet, setOnglet] = useState('infos');
  const [bilanDetail, setBilanDetail] = useState<import('../../types').Bilan | null>(null);
  const [showEdit, setShowEdit] = useState(false);
  const [showDictee, setShowDictee] = useState(false);
  const [showNewBilan, setShowNewBilan] = useState(false);
  const [showEspacePatient, setShowEspacePatient] = useState(false);
  if (!p) return null;
  if (bilanDetail) return <DetailBilanMobile bilan={bilanDetail} onBack={() => setBilanDetail(null)} />;
  if (showEdit) return <EditPatientMobile participant={p} onBack={() => setShowEdit(false)} />;
  if (showNewBilan) {
    if (p.bilans.length === 0 && (!p.testsActifs || p.testsActifs.length === 0)) {
      return (
        <ModalSelectionTests
          participant={p}
          onValider={async tests => { await updateParticipant(p.id, { testsActifs: tests }); }}
          onCancel={() => {}}
        />
      );
    }
    return (
    <div style={{ paddingTop: 'calc(env(safe-area-inset-top, 44px) + 12px)', paddingLeft: 16, paddingRight: 16, paddingBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <button onClick={() => setShowNewBilan(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
          <i className="ti ti-arrow-left" style={{ fontSize: 22, color: C.text }} />
        </button>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>Nouveau bilan</div>
          <div style={{ fontSize: 12, color: C.muted }}>{p.prenom} {p.nom}</div>
        </div>
      </div>
      <BilanStepper
        participant={p}
        onSave={async (bilan: Omit<Bilan, 'id'>) => {
          await addBilan(p.id, bilan);
          toast.success('Bilan enregistré ✅');
          setShowNewBilan(false);
        }}
        onCancel={() => setShowNewBilan(false)}
      />
    </div>
    );
  }

  const bilanInitial = p.bilans.find(b => b.type === 'initial') ?? null;
  const contreIndicationsTexte: string | null = getContreIndications(p, bilanInitial).detail;

  const sortedBilans = [...p.bilans].sort((a, b) => b.date.localeCompare(a.date));
  const contrat = contratActifDeParticipant(participantId);
  const today = new Date().toISOString().slice(0, 10);
  const prochaineSeance = seances
    .filter(s => s.participantId === participantId && s.date >= today && s.statut === 'planifiee')
    .sort((a, b) => a.date.localeCompare(b.date))[0];

  const ONGLETS = [
    { id: 'infos',   label: 'Infos' },
    { id: 'sante',   label: 'Santé' },
    { id: 'bilans',  label: 'Bilans' },
    { id: 'contrat', label: 'Contrat' },
    { id: 'journal', label: 'Journal' },
    { id: 'ia',      label: '🤖 IA' },
  ];

  const actionBtn: React.CSSProperties = {
    flex: 1, minHeight: 64,
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 5,
    background: 'white', border: `1px solid ${C.border}`, borderRadius: 12, cursor: 'pointer',
    boxShadow: '0 1px 4px rgba(13,43,43,0.06)',
  };

  return (
    <div style={{ minHeight: '100vh', background: '#F0F4F4' }}>
      <div style={{ background: C.dark, paddingTop: 'calc(env(safe-area-inset-top, 44px) + 12px)', paddingLeft: 16, paddingRight: 16, paddingBottom: 16 }}>

        {/* Ligne 1 : flèche + avatar + nom + crayon */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, flexShrink: 0 }}>
            <i className="ti ti-arrow-left" style={{ fontSize: 20, color: 'rgba(255,255,255,0.6)' }} aria-hidden="true" />
          </button>
          <div style={{ width: 44, height: 44, borderRadius: '50%', background: C.primary, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 700, color: 'white', flexShrink: 0 }}>
            {p.prenom[0]}{p.nom[0]}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'white', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {p.prenom} {p.nom}
            </div>
          </div>
          <button onClick={() => setShowEdit(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6, flexShrink: 0 }} aria-label="Modifier">
            <i className="ti ti-pencil" style={{ fontSize: 18, color: 'rgba(255,255,255,0.5)' }} />
          </button>
        </div>

        {/* Ligne 2 : âge · taille · poids */}
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginTop: 7, paddingLeft: 68 }}>
          {calcAge(p.dateNaissance)} ans
          {p.taille ? ` · ${p.taille} cm` : ''}
          {p.poids ? ` · ${p.poids} kg` : ''}
        </div>

        {/* Badge CI */}
        {contreIndicationsTexte && (
          <div style={{ marginTop: 8, paddingLeft: 68 }}>
            <div style={{ display: 'inline-block', background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '5px 10px', fontSize: 12, color: '#FCA5A5', fontWeight: 600 }}>
              ⚠️ {contreIndicationsTexte}
            </div>
          </div>
        )}

        {/* Dernier bilan discret */}
        {sortedBilans[0] && (
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.28)', marginTop: 6, paddingLeft: 68 }}>
            Dernier bilan : {new Date(sortedBilans[0].date + 'T12:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}
          </div>
        )}
      </div>

      {/* Actions rapides */}
      <div style={{ display: 'flex', gap: 10, padding: '14px 16px', background: 'white', borderBottom: `1px solid ${C.border}` }}>
        <button onClick={() => setShowEspacePatient(true)} style={{ ...actionBtn, background: C.primary, border: 'none' }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
            <rect x="3" y="14" width="7" height="7"/><path d="M14 14h7v7"/>
          </svg>
          <span style={{ fontSize: 11, color: 'white', fontWeight: 700 }}>Espace bénéficiaire</span>
        </button>
        <button onClick={() => { setOnglet('journal'); setShowDictee(true); }} style={actionBtn}>
          <i className="ti ti-microphone" style={{ fontSize: 22, color: C.primary }} />
          <span style={{ fontSize: 11, color: C.text, fontWeight: 600 }}>Note</span>
        </button>
        {(p.adresseRue || p.adresseVille) && (
          <button
            onClick={() => ouvrirMaps([p.adresseRue, p.adresseCodePostal, p.adresseVille].filter(Boolean).join(' '))}
            style={actionBtn}>
            <i className="ti ti-map-pin" style={{ fontSize: 22, color: C.primary }} />
            <span style={{ fontSize: 11, color: C.text, fontWeight: 600 }}>Maps</span>
          </button>
        )}
      </div>

      {/* Onglets scrollables */}
      <div style={{ display: 'flex', background: 'white', borderBottom: `1px solid ${C.border}`, position: 'sticky', top: 0, zIndex: 10, overflowX: 'auto' }}>
        {ONGLETS.map(o => (
          <button key={o.id} onClick={() => setOnglet(o.id)}
            style={{ flexShrink: 0, padding: '12px 16px', background: 'none', border: 'none', borderBottom: `2px solid ${onglet === o.id ? C.primary : 'transparent'}`, color: onglet === o.id ? C.primary : '#9CA3AF', fontWeight: onglet === o.id ? 700 : 400, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' }}>
            {o.label}
          </button>
        ))}
      </div>

      <div style={{ padding: 16 }}>

        {onglet === 'infos' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

            <InfoSection titre="Coordonnées">
              {p.telephone && (
                <a href={telHref(String(p.telephone))} style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 13, color: '#4A6080', marginBottom: 8, textDecoration: 'none' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.primary} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.72 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.63 1.4h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 9.91a16 16 0 0 0 6.29 6.29l1.88-1.88a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
                  </svg>
                  <span style={{ flex: 1, minWidth: 0, wordBreak: 'break-all', fontWeight: 500 }}>
                    {formatPhone(String(p.telephone))}
                  </span>
                </a>
              )}
              {(p.adresseRue || p.adresseVille) && (
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13, color: '#4A6080', marginBottom: 8 }}>
                  <i className="ti ti-map-pin" style={{ fontSize: 16, color: C.primary, flexShrink: 0, marginTop: 2 }} />
                  <a href={`https://maps.google.com/?q=${encodeURIComponent([p.adresseRue, p.adresseCodePostal, p.adresseVille].filter(Boolean).join(' '))}`}
                    target="_blank" rel="noreferrer"
                    style={{ color: '#4A6080', textDecoration: 'none', flex: 1, minWidth: 0 }}>
                    {[p.adresseRue, p.adresseCodePostal, p.adresseVille].filter(Boolean).join(', ')}
                  </a>
                </div>
              )}
              {p.email && (
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 13, color: '#4A6080' }}>
                  <i className="ti ti-mail" style={{ fontSize: 16, color: C.primary, flexShrink: 0 }} />
                  <a href={`mailto:${p.email}`}
                    style={{ color: '#4A6080', textDecoration: 'none', flex: 1, minWidth: 0, wordBreak: 'break-all' }}>
                    {p.email}
                  </a>
                </div>
              )}
              {!p.telephone && !p.email && !p.adresseRue && (
                <div style={{ fontSize: 13, color: C.muted, fontStyle: 'italic' }}>Aucune coordonnée renseignée</div>
              )}
            </InfoSection>

            <InfoSection titre="Informations">
              <InfoLigne icon="ti-calendar" texte={`Né(e) le ${new Date(p.dateNaissance).toLocaleDateString('fr-FR')} · ${calcAge(p.dateNaissance)} ans`} />
              {p.taille && p.poids && (() => {
                const imc = Math.round((p.poids / ((p.taille / 100) ** 2)) * 10) / 10;
                const imcColor = imc < 18.5 ? '#3B82F6' : imc < 25 ? '#22C55E' : imc < 30 ? '#F59E0B' : '#EF4444';
                const imcLabel = imc < 18.5 ? 'Insuf. pond.' : imc < 25 ? 'Normal' : imc < 30 ? 'Surpoids' : 'Obésité';
                return (
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 13, color: '#4A6080', marginBottom: 6 }}>
                    <i className="ti ti-weight" style={{ fontSize: 16, color: C.primary, flexShrink: 0 }} />
                    <span>{p.taille} cm · {p.poids} kg · IMC {imc}</span>
                    <span style={{ background: `${imcColor}20`, color: imcColor, fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10, flexShrink: 0 }}>
                      {imcLabel}
                    </span>
                  </div>
                );
              })()}
              {(p.contexteClinic || p.pathologie) && (
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13, color: '#4A6080', marginTop: p.taille && p.poids ? 0 : 0 }}>
                  <i className="ti ti-stethoscope" style={{ fontSize: 16, color: C.primary, flexShrink: 0, marginTop: 1 }} />
                  <span>{p.contexteClinic || p.pathologie}</span>
                </div>
              )}
            </InfoSection>

            {(() => {
              const { objectifsPatient, activitesSouhaitees } = getObjectifsActivites(p, bilanInitial);
              if (objectifsPatient.length === 0 && activitesSouhaitees.length === 0) return null;
              return (
                <InfoSection titre="Objectifs APA">
                  {objectifsPatient.length > 0 && (
                    <div style={{ marginBottom: 6 }}>
                      {objectifsPatient.map((o, i) => (
                        <span key={i} style={{ display: 'inline-block', background: '#E6F7F5', color: '#0F7265', borderRadius: 10, padding: '2px 8px', margin: '2px', fontSize: 12, fontWeight: 600 }}>{o}</span>
                      ))}
                    </div>
                  )}
                  {activitesSouhaitees.length > 0 && (
                    <div style={{ fontSize: 13, color: '#4A6080' }}>🎯 {activitesSouhaitees.join(' · ')}</div>
                  )}
                </InfoSection>
              );
            })()}
          </div>
        )}

        {onglet === 'sante' && (() => {
          const traitementsActifs = getTraitementsActifs(p.traitements);
          const traitementsArretes = getTraitementsArretes(p.traitements);
          const antecedentsStructures = p.antecedentsMedicauxStructures ?? [];
          const hasAnyData = !!(p.pathologie || p.antecedentsMedicaux || p.antecedentsChirurgicaux || p.allergies
            || traitementsActifs.length || traitementsArretes.length || antecedentsStructures.length);

          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

              {/* Pathologie / contexte */}
              {(p.pathologie || p.antecedentsMedicaux) && (
                <InfoSection titre="Pathologies & contexte médical">
                  {p.pathologie && <div style={{ fontSize: 13, color: '#4A6080', lineHeight: 1.6, marginBottom: p.antecedentsMedicaux ? 6 : 0 }}>🏥 {p.pathologie}</div>}
                  {p.antecedentsMedicaux && <div style={{ fontSize: 13, color: '#4A6080', lineHeight: 1.6 }}>📋 {p.antecedentsMedicaux}</div>}
                </InfoSection>
              )}

              {/* Traitements structurés */}
              {(traitementsActifs.length > 0 || traitementsArretes.length > 0) && (
                <InfoSection titre="Traitements en cours">
                  {traitementsActifs.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {traitementsActifs.map(t => (
                        <div key={t.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13 }}>
                          <span>💊</span>
                          <div style={{ flex: 1 }}>
                            <span style={{ fontWeight: 600, color: '#032c28' }}>{t.nom}</span>
                            {t.dose && <span style={{ color: '#4A6080' }}> · {t.dose}</span>}
                            {t.frequence && <span style={{ color: '#4A6080' }}> · {t.frequence}</span>}
                            {(t.moments?.length ?? 0) > 0 && <span style={{ color: '#4A6080' }}> · {formatMomentsTraitement(t.moments)}</span>}
                            {t.effetSecondaire && <div style={{ fontSize: 12, color: '#8FA8A8' }}>{t.effetSecondaire}</div>}
                          </div>
                          <span style={{ fontSize: 10, fontWeight: 700, color: '#16a34a', background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '2px 6px', borderRadius: 20, whiteSpace: 'nowrap' }}>En cours ✅</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ fontSize: 13, color: '#8FA8A8', fontStyle: 'italic' }}>Aucun traitement en cours</div>
                  )}
                  {traitementsArretes.length > 0 && (
                    <details style={{ marginTop: 10 }}>
                      <summary style={{ fontSize: 12, color: '#8FA8A8', fontWeight: 600, cursor: 'pointer', listStyle: 'none' }}>
                        ▶ Traitements arrêtés ({traitementsArretes.length})
                      </summary>
                      <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {traitementsArretes.map(t => (
                          <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#8FA8A8' }}>
                            <span>💊</span>
                            <span style={{ textDecoration: 'line-through' }}>{t.nom}</span>
                            {t.dose && <span>· {t.dose}</span>}
                            <span style={{ marginLeft: 'auto', fontSize: 10, background: '#f3f4f6', padding: '2px 6px', borderRadius: 20, whiteSpace: 'nowrap' }}>
                              Arrêté le {new Date((t.date_fin ?? '') + 'T12:00').toLocaleDateString('fr-FR')}
                            </span>
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                </InfoSection>
              )}

              {/* Antécédents structurés */}
              {antecedentsStructures.length > 0 && (
                <InfoSection titre="Antécédents médicaux">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {antecedentsStructures.map(a => (
                      <div key={a.id}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                          <span>{getAntecedentIcon(a)}</span>
                          <span style={{ fontWeight: 600, color: '#032c28' }}>{getAntecedentTitre(a)}</span>
                          {a.douleur === 'oui' && (
                            <span style={{ fontSize: 10, color: '#c2410c', background: '#fff7ed', border: '1px solid #fed7aa', padding: '2px 6px', borderRadius: 20 }}>Douleur liée</span>
                          )}
                        </div>
                        {getAntecedentSousLigne(a) && <div style={{ fontSize: 12, color: '#8FA8A8', marginLeft: 24, marginTop: 2 }}>{getAntecedentSousLigne(a)}</div>}
                        {a.notes && <div style={{ fontSize: 12, color: '#8FA8A8', fontStyle: 'italic', marginLeft: 24, marginTop: 2 }}>{a.notes}</div>}
                      </div>
                    ))}
                  </div>
                </InfoSection>
              )}

              {/* Antécédents chirurgicaux texte (ancien format) */}
              {p.antecedentsChirurgicaux && (
                <InfoSection titre="Antécédents chirurgicaux">
                  <div style={{ fontSize: 13, color: '#4A6080', lineHeight: 1.6 }}>✂️ {p.antecedentsChirurgicaux}</div>
                </InfoSection>
              )}

              {/* Allergies */}
              {p.allergies && (
                <InfoSection titre="Allergies">
                  <div style={{ fontSize: 13, color: '#4A6080' }}>⚠️ {p.allergies}</div>
                </InfoSection>
              )}

              {/* Message vide */}
              {!hasAnyData && (
                <div style={{ color: C.muted, textAlign: 'center', padding: 30 }}>Aucune information de santé renseignée</div>
              )}

              {/* Bouton Modifier */}
              <button
                onClick={() => setShowEdit(true)}
                style={{ background: 'white', border: `1.5px solid ${C.primary}`, color: C.primary, borderRadius: 12, padding: '12px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
              >
                ✏️ Modifier les infos santé
              </button>
            </div>
          );
        })()}

        {onglet === 'bilans' && (
          <div>
            {sortedBilans.length === 0 ? (
              <div style={{ color: C.muted, textAlign: 'center', padding: 30 }}>Aucun bilan</div>
            ) : sortedBilans.map((b, i) => (
              <div key={b.id} onClick={() => setBilanDetail(b)} style={{ ...card, cursor: 'pointer' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                  <div>
                    <div style={{ fontWeight: 700, color: C.text, fontSize: 14 }}>
                      📊 {b.type === 'initial' ? 'Bilan initial' : `Bilan T${b.trimestre}`}
                    </div>
                    <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
                      {new Date(b.date + 'T12:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
                    {i === 0 && <span style={{ background: '#E8F8F8', color: C.primary, fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20 }}>Récent</span>}
                    {b.interpretationIA && <span style={{ background: '#DCFCE7', color: '#166534', fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20 }}>🤖 IA</span>}
                    <i className="ti ti-chevron-right" style={{ fontSize: 15, color: '#D0DCDC' }} />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {b.tug3m != null && <span style={{ fontSize: 11, color: C.muted, background: C.bg, padding: '2px 8px', borderRadius: 10 }}>TUG {b.tug3m}s</span>}
                  {b.tm6.borgRPE != null && <span style={{ fontSize: 11, color: C.muted, background: C.bg, padding: '2px 8px', borderRadius: 10 }}>Borg {b.tm6.borgRPE}</span>}
                  {b.chairStand30 != null && <span style={{ fontSize: 11, color: C.muted, background: C.bg, padding: '2px 8px', borderRadius: 10 }}>Chair Stand {b.chairStand30}</span>}
                  {b.handGrip.droite != null && <span style={{ fontSize: 11, color: C.muted, background: C.bg, padding: '2px 8px', borderRadius: 10 }}>Grip {b.handGrip.droite} kg</span>}
                </div>
              </div>
            ))}
            <button
              onClick={() => setShowNewBilan(true)}
              style={{ width: '100%', padding: '12px 16px', marginTop: 4, background: C.primary, color: 'white', border: 'none', borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              ➕ Nouveau bilan
            </button>
          </div>
        )}

        {onglet === 'contrat' && (
          <div>
            {contrat ? (
              <div>
                <InfoSection titre="Contrat actif">
                  <InfoLigne icon="ti-calendar" texte={`${contrat.nbSeancesSemaine} séance${contrat.nbSeancesSemaine > 1 ? 's' : ''}/semaine à ${contrat.heureDebut} · ${contrat.dureeMinutes} min`} />
                  <InfoLigne icon="ti-clock" texte={`${new Date(contrat.dateDebut + 'T12:00').toLocaleDateString('fr-FR')} → ${new Date(contrat.dateFin + 'T12:00').toLocaleDateString('fr-FR')}`} />
                  <div style={{ marginTop: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                      <span style={{ color: C.muted }}>Progression</span>
                      <span style={{ fontWeight: 700, color: C.text }}>{contrat.nombreSeancesRealisees}/{contrat.nombreSeancesTotal}</span>
                    </div>
                    <div style={{ height: 6, background: C.border, borderRadius: 3 }}>
                      <div style={{ height: '100%', width: `${Math.min(100, (contrat.nombreSeancesRealisees / contrat.nombreSeancesTotal) * 100)}%`, background: C.primary, borderRadius: 3 }} />
                    </div>
                  </div>
                </InfoSection>
                {prochaineSeance && (
                  <div style={{ marginTop: 12 }}>
                    <InfoSection titre="Prochaine séance">
                      <InfoLigne icon="ti-calendar" texte={new Date(prochaineSeance.date + 'T12:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })} />
                      <InfoLigne icon="ti-clock" texte={`${prochaineSeance.heureDebut} · ${prochaineSeance.dureeMinutes} min`} />
                    </InfoSection>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '30px 20px' }}>
                <div style={{ fontSize: 36, marginBottom: 10 }}>📋</div>
                <div style={{ fontSize: 14, color: C.muted }}>Aucun contrat actif</div>
              </div>
            )}
          </div>
        )}

        {onglet === 'journal' && (
          <div>
            <button
              onClick={() => setShowDictee(true)}
              style={{
                width: '100%', minHeight: 72, padding: '16px', marginBottom: 14,
                background: C.primary, color: 'white', border: 'none', borderRadius: 14,
                fontSize: 16, fontWeight: 700, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
                boxShadow: '0 4px 16px rgba(43,191,191,0.3)',
              }}
            >
              <span style={{ fontSize: 26 }}>🎙️</span>
              <div style={{ textAlign: 'left' }}>
                <div>Dicter une séance</div>
                <div style={{ fontSize: 12, opacity: 0.8, fontWeight: 400, marginTop: 2 }}>
                  Claude structure vos notes automatiquement
                </div>
              </div>
            </button>

            {compteRendus.length > 0 && (
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-ink-2)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                Séances dictées
              </div>
            )}

            {compteRendus.length === 0 ? (
              <div style={{ color: C.muted, textAlign: 'center', padding: '16px 0' }}>
                Aucune séance dictée — utilisez le bouton ci-dessus
              </div>
            ) : compteRendus.slice(0, 10).map(cr => (
              <div key={cr.id} style={card}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 10, background: '#E8F8F8', color: C.primary, fontWeight: 700, padding: '2px 6px', borderRadius: 6 }}>🎙️ Dictée</span>
                  <span style={{ fontSize: 12, color: C.muted }}>{formatDateCourt(cr.dateSeance)}</span>
                  {cr.progression && <span style={{ fontSize: 11, fontWeight: 700, color: cr.progression === 'en progrès' ? '#16A34A' : C.muted }}>{cr.progression === 'en progrès' ? '📈' : '➡️'} {cr.progression}</span>}
                </div>
                {cr.observations && <div style={{ fontSize: 13, color: C.text }}>"{cr.observations}"</div>}
              </div>
            ))}
          </div>
        )}

        {onglet === 'ia' && (
          <div style={{ padding: '40px 20px', textAlign: 'center' }}>
            <div style={{ fontSize: 44, marginBottom: 14 }}>🤖</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 8 }}>Mon assistant</div>
            <div style={{ fontSize: 13, color: C.muted, marginBottom: 24, lineHeight: 1.6, maxWidth: 280, margin: '0 auto 24px' }}>
              Posez vos questions cliniques APA avec le profil de <strong>{p.prenom}</strong> automatiquement chargé.
            </div>
            <button
              onClick={() => onOpenAssistant?.(p.id)}
              style={{ width: '100%', padding: '15px', background: C.primary, color: 'white', border: 'none', borderRadius: 14, fontSize: 15, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              Ouvrir l'assistant →
            </button>
          </div>
        )}
      </div>

      {showDictee && (
        <DicteePostSeance
          participant={p}
          onClose={() => setShowDictee(false)}
          onSave={async (data) => { await ajouterCompteRendu(data); }}
        />
      )}

      {showEspacePatient && (
        <ModalEspacePatient
          participant={p}
          onClose={() => setShowEspacePatient(false)}
          onUpdate={data => updateParticipant(p.id, data)}
        />
      )}
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
        const age = calcAge(patient.dateNaissance);
        const bi = patient.bilans.find(b => b.type === 'initial') ?? null;
        const ciInfoExport = getContreIndications(patient, bi);
        const ci = ciInfoExport.actif ? (ciInfoExport.detail ?? 'non précisées') : 'aucune';
        const pathologies = [patient.pathologie, patient.antecedentsMedicaux].filter(Boolean).join(' / ') || 'non renseigné';
        return `\n\nPATIENT : ${patient.prenom} ${patient.nom}, ${age} ans. Pathologies : ${pathologies}. Contre-indications : ${ci}.`;
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
  const [selectedPatient, setSelectedPatient] = useState<import('../../types').Participant | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [showSheet, setShowSheet] = useState(false);
  const [searchQ, setSearchQ] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (preSelectedPatientId && participants.length > 0) {
      const p = participants.find(x => x.id === preSelectedPatientId);
      if (p) setSelectedPatient(p);
    }
  }, [preSelectedPatientId, participants]);

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
                    <div style={{ fontSize: 12, color: C.muted }}>{calcAge(p.dateNaissance)} ans{p.pathologie ? ` · ${p.pathologie.slice(0, 20)}` : ''}</div>
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

// ── App Mobile principal ──────────────────────────────────────────────────────

interface Props { onLogout: () => void }

export default function AppMobile({ onLogout }: Props) {
  const [onglet, setOnglet] = useState('aujourdhui');
  const [ficheId, setFicheId] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [assistantPatientId, setAssistantPatientId] = useState<string | null>(null);

  const shell: React.CSSProperties = { maxWidth: 480, margin: '0 auto', minHeight: '100vh', background: C.bg, fontFamily: "var(--font-sans)" };

  if (showSettings) {
    return <div style={shell}><EcranSettings onBack={() => setShowSettings(false)} /></div>;
  }

  if (ficheId) {
    return (
      <div style={shell}>
        <FichePatientMobile
          participantId={ficheId}
          onBack={() => setFicheId(null)}
          onOpenAssistant={(patientId: string) => {
            setAssistantPatientId(patientId);
            setFicheId(null);
            setOnglet('assistant');
          }}
        />
      </div>
    );
  }

  function handleChangeOnglet(id: string) {
    setOnglet(id);
    if (id !== 'assistant') setAssistantPatientId(null);
  }

  return (
    <div style={{ ...shell, display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 80 }}>
        {onglet === 'aujourdhui' && <EcranAujourdhui onVoirFiche={setFicheId} onNaviguerSaisie={() => handleChangeOnglet('saisie')} />}
        {onglet === 'patients'   && <EcranPatients onVoirFiche={setFicheId} />}
        {onglet === 'saisie'     && <EcranSaisie onVoirFiche={setFicheId} />}
        {onglet === 'tournee'    && <EcranTournee />}
        {onglet === 'assistant'  && (
          <EcranAssistant
            preSelectedPatientId={assistantPatientId}
            onOuvrirSettings={() => setShowSettings(true)}
          />
        )}
        {onglet === 'plus' && (
          <EcranPlus onLogout={onLogout} onOuvrirSettings={() => setShowSettings(true)} onNaviguerOnglet={handleChangeOnglet} />
        )}
      </div>
      <BottomNav onglet={onglet} onChange={handleChangeOnglet} />
    </div>
  );
}
