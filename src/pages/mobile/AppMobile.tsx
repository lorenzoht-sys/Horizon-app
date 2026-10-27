import { useState, useMemo, useRef, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  format, addDays, addMonths, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, isSameMonth, isSameDay,
} from 'date-fns';
import { toast } from 'sonner';
import { useParticipants } from '../../hooks/useParticipants';
import { useAgenda } from '../../hooks/useAgenda';
import { useContrats } from '../../hooks/useContrats';
import { useCoursCollectifs } from '../../hooks/useCoursCollectifs';
import { useIndispos } from '../../hooks/useIndispos';
import { useEvenementsAgenda } from '../../hooks/useEvenementsAgenda';
import { useCategoriesSeance } from '../../hooks/useCategoriesSeance';
import ModalCategoriesSeance from '../../components/agenda/ModalCategoriesSeance';
import BilanStepper from '../../components/bilan/BilanStepper';
import ModalSelectionTests from '../../components/bilan/ModalSelectionTests';
import ModalPresenceCoursCollectif from '../../components/agenda/ModalPresenceCoursCollectif';
import ModalCreerSeanceManuelle from '../../components/agenda/ModalCreerSeanceManuelle';
import ModalEditSeance from '../../components/agenda/ModalEditSeance';
import ModalChoixSerie from '../../components/agenda/ModalChoixSerie';
import ModalEvenementAgenda from '../../components/agenda/ModalEvenementAgenda';
import NoteSeanceModal from '../../components/journal/NoteSeanceModal';
import SettingsPage from '../SettingsPage';
import type { Bilan, CoursCollectif, Participant, Seance, EvenementAgenda, CategorieSeance } from '../../types';
import {
  calculerFutures, planEditerUnique, planEditerSerie, planSupprimerUnique, planSupprimerSerie,
  planActionSurSelection, avecInfosDeLaReference, executerOperations, optionsPorteePourAction, type MiseAJourSeance,
} from '../../lib/planificationManuelle';
import { CLE_JOUR_PAR_DOW, LABEL_TYPE_EVENEMENT, formatDate as formatDateAgenda, absenceSignaleeAffichable, couleurCategorieDe, LABEL_TYPE, type ChoixSerie } from '../../lib/agendaCommun';
import { v4 as uuidv4 } from 'uuid';
import { supabase, getAuthHeader } from '../../lib/supabase';
import {
  EVENT_SETTINGS_PRATICIEN,
  chargerSettingsPraticien,
  enregistrerSettingsPraticien,
  hydraterSettingsPraticien,
  type SettingsPraticien,
} from '../../lib/settingsPraticien';
import { avecConsentement, erreurConsentementCreation, normaliserRgpd } from '../../lib/consentementRgpd';
import type { RgpdConsent } from '../../types';
import { initialesPraticien } from '../../lib/initiales';
import { getContreIndications } from '../../lib/anamnese';
import { libelleAge } from '../../lib/age';
import { URLS_MOBILE, ecranMobileDepuisUrl } from '../../lib/routesMobile';
import { idSeanceDepuisRecherche, validerSeanceDuBilan } from '../../lib/liaisonSeanceBilan';
import BarreNavigationMobile from '../../components/layout/BarreNavigationMobile';
import ModalRepriseBrouillon from '../../components/bilan/ModalRepriseBrouillon';
import { useEtatSession } from '../../hooks/useEtatSession';
import { getBrouillonParticipant, sauvegarderBrouillonParticipant, supprimerBrouillonParticipant } from '../../hooks/useBrouillonParticipant';
import { getBrouillon, supprimerBrouillon } from '../../hooks/useBrouillonBilan';
import { formaterDateNaissanceAffichage, masquerSaisieDateNaissance, messageErreurDateNaissance, parserDateNaissanceSaisie } from '../../utils/dateNaissance';
import { contratsDesBeneficiairesActifs } from '../../lib/archivage';
import { buildAssistantPromptMobile, historiquePourIA } from '../../utils/promptAssistant';
import RappelNomsIA from '../../components/ui/RappelNomsIA';
import { identiteDe, masquerIdentiteConnue, reinsererIdentite, versParticipantIA } from '../../utils/pseudonymiserIA';

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDateLong(d: Date) {
  return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
}

function formatMoisAnnee(d: Date) {
  return d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
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

// La barre du bas vit dans components/layout/BarreNavigationMobile.tsx : elle
// est partagée avec le cadre commun, qui la montre sous 768 px sur les écrans
// fusionnés (la fiche bénéficiaire).

// ── EcranAujourdhui ───────────────────────────────────────────────────────────

function EcranAujourdhui({ onVoirFiche }: { onVoirFiche: (id: string) => void; onNaviguerSaisie?: () => void }) {
  // `participants` (tous) sert aux recherches par identifiant ; les compteurs et listes du
  // quotidien n'utilisent que les actifs — un archivé n'est plus suivi.
  const { participants, participantsActifs } = useParticipants();
  const { seances: allSeances, seancesDuJour } = useAgenda();
  // Alerte « contrat fin proche » (équivalent mobile du Dashboard) : un bénéficiaire archivé
  // n'est plus suivi, son contrat n'appelle aucune action (cf. lib/archivage.ts, Dashboard.tsx).
  const { contratsARenouveler: contratsARenouvelerTous } = useContrats();
  const contratsARenouveler = contratsDesBeneficiairesActifs(contratsARenouvelerTous, participants);
  const { settings: praticienSettings } = usePraticienSettings();
  const {
    coursCollectifs, participationsDuCours,
    modifierStatutCours, mettreAJourParticipation,
  } = useCoursCollectifs();
  const [coursSelectionneId, setCoursSelectionneId] = useState<string | null>(null);
  // Couleurs de catégorie du praticien (les mêmes que dans l'agenda) et accès à l'agenda.
  const { categories } = useCategoriesSeance();
  const navigate = useNavigate();
  const today = new Date().toISOString().slice(0, 10);
  const seances = seancesDuJour(today);
  const nbRealisees = seances.filter(s => s.statut === 'realisee').length;
  const categorieDe = (sc: Seance) => categories.find(c => c.id === sc.categorieId);
  // Échéances : les 3 prochains bilans planifiés (posés à la main ou automatiquement) à partir de demain.
  const bilansAVenir = allSeances
    .filter(sc => sc.type !== 'seance' && sc.statut === 'planifiee' && sc.date > today)
    .sort((a, b) => a.date.localeCompare(b.date) || a.heureDebut.localeCompare(b.heureDebut))
    .slice(0, 3);
  // Même filtre que l'agenda desktop (AgendaV2Page) : un cours annulé ne
  // doit pas apparaître dans la timeline du jour.
  const coursDuJour = coursCollectifs
    .filter(c => c.date === today && c.statut !== 'annule')
    .sort((a, b) => a.heureDebut.localeCompare(b.heureDebut));
  const coursSelectionne = coursCollectifs.find(c => c.id === coursSelectionneId) ?? null;
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
  const bilansAFaire = participantsActifs.filter(p =>
    p.bilans.length === 0 || p.bilans.every(b => b.date < il90jFmt)
  );

  const currentTimeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const prochaineSeance = seances.find(s => s.statut === 'planifiee' && s.heureDebut >= currentTimeStr)
    ?? seances.find(s => s.statut === 'planifiee');

  // Timeline du jour : séances individuelles et cours collectifs mêlés,
  // triés par heure — un cours collectif n'a pas de bénéficiaire unique, il
  // ne peut donc pas rejoindre `seances` telle quelle.
  type ItemJour =
    | { kind: 'seance'; heureDebut: string; seance: typeof seances[number] }
    | { kind: 'cours'; heureDebut: string; cours: CoursCollectif; nbInscrits: number };
  const itemsJour: ItemJour[] = [
    ...seances.map(seance => ({ kind: 'seance' as const, heureDebut: seance.heureDebut, seance })),
    ...coursDuJour.map(cours => ({
      kind: 'cours' as const,
      heureDebut: cours.heureDebut,
      cours,
      nbInscrits: participationsDuCours(cours.id).length,
    })),
  ].sort((a, b) => a.heureDebut.localeCompare(b.heureDebut));

  // Tuile de chiffre (accueil) : icône Tabler dans une pastille teintée, chiffre en grand, libellé.
  const Tuile = ({ icone, valeur, libelle, couleur = C.primary }: { icone: string; valeur: number; libelle: string; couleur?: string }) => (
    <div style={{ background: 'white', borderRadius: 16, padding: '14px 14px', boxShadow: '0 2px 10px rgba(13,43,43,0.06)', display: 'flex', alignItems: 'center', gap: 12 }}>
      <span aria-hidden="true" style={{ width: 40, height: 40, borderRadius: 12, background: `${couleur}1F`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <i className={`ti ${icone}`} style={{ fontSize: 20, color: couleur }} />
      </span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 24, fontWeight: 800, color: couleur === C.primary ? C.text : couleur, lineHeight: 1 }}>{valeur}</div>
        <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>{libelle}</div>
      </div>
    </div>
  );
  const titreSection: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: 'var(--color-ink-2)', textTransform: 'uppercase', letterSpacing: '0.08em' };
  const pastilleCategorie = (c: { nom: string; couleur: string }) => (
    <span style={{ background: `${c.couleur}22`, color: C.text, border: `1px solid ${c.couleur}`, borderRadius: 8, padding: '1px 7px', fontSize: 11, fontWeight: 700 }}>{c.nom}</span>
  );

  return (
    <div style={{ minHeight: '100vh', background: '#F0F4F4' }}>

      {/* ── HEADER ─────────────────────────────────────────────── */}
      <div style={{ background: C.dark, borderRadius: '0 0 24px 24px', paddingTop: 'calc(env(safe-area-inset-top, 44px) + 18px)', paddingLeft: 20, paddingRight: 20, paddingBottom: 22 }}>
        <img src="/logo-horizon.png?v=2" alt="Horizon" style={{ height: 22, marginBottom: 14 }}
          onError={e => { (e.target as HTMLImageElement).src = '/logo-horizon.svg'; }} />
        <div style={{ fontSize: 24, fontWeight: 800, color: 'white', lineHeight: 1.2 }}>Bonjour {prenom}</div>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', marginTop: 4, textTransform: 'capitalize' }}>{formatDateLong(new Date())}</div>

        {/* Progression de la journée : séances faites / séances du jour. */}
        <div style={{ marginTop: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 7 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'white' }}>
              {seances.length} séance{seances.length !== 1 ? 's' : ''} aujourd'hui
            </span>
            {seances.length > 0 && (
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>{nbRealisees} faite{nbRealisees !== 1 ? 's' : ''}</span>
            )}
          </div>
          <div role="progressbar" aria-valuemin={0} aria-valuemax={seances.length} aria-valuenow={nbRealisees} aria-label="Séances du jour réalisées"
            style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.15)', overflow: 'hidden' }}>
            <div style={{ width: seances.length ? `${(nbRealisees / seances.length) * 100}%` : '0%', height: '100%', background: C.primary, borderRadius: 3, transition: 'width .3s' }} />
          </div>
        </div>
      </div>

      <div style={{ padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 22 }}>

        {/* ── PROCHAINE SÉANCE ──────────────────────────────────── */}
        {prochaineSeance && (() => {
          const p = participants.find(x => x.id === prochaineSeance.participantId);
          const ciInfo = p ? getContreIndications(p) : { actif: false, detail: null };
          const contreIndDetail = ciInfo.detail ?? undefined;
          const hasCI = ciInfo.actif;
          const adresse = [p?.adresseRue, p?.adresseVille].filter(Boolean).join(', ');
          const cat = categorieDe(prochaineSeance);
          return (
            <div style={{ background: 'white', borderRadius: 18, boxShadow: '0 4px 16px rgba(13,43,43,0.10)', overflow: 'hidden', display: 'flex' }}>
              <span aria-hidden="true" style={{ width: 6, background: cat?.couleur ?? C.primary, flexShrink: 0 }} />
              <div style={{ padding: 16, flex: 1, minWidth: 0 }}>
                <div style={{ ...titreSection, color: C.primary, marginBottom: 8 }}>Prochaine séance</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                  <span style={{ fontSize: 26, fontWeight: 800, color: C.text, lineHeight: 1 }}>{prochaineSeance.heureDebut}</span>
                  <span style={{ fontSize: 16, fontWeight: 700, color: C.text, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p?.prenom} {p?.nom}</span>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                  {cat ? pastilleCategorie(cat) : prochaineSeance.type !== 'seance' && (
                    <span style={{ background: '#EDE9FE', color: '#6D28D9', borderRadius: 8, padding: '1px 7px', fontSize: 11, fontWeight: 700 }}>{LABEL_TYPE[prochaineSeance.type]}</span>
                  )}
                  <span style={{ fontSize: 12, color: C.muted }}>{prochaineSeance.dureeMinutes} min</span>
                </div>
                {prochaineSeance.objectif && (
                  <div style={{ fontSize: 13, color: C.text, marginTop: 8 }}>🎯 {prochaineSeance.objectif}</div>
                )}
                {adresse && (
                  <div style={{ fontSize: 13, color: 'var(--color-ink-2)', marginTop: 8 }}>📍 {adresse}</div>
                )}
                {hasCI && contreIndDetail && (
                  <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '7px 10px', marginTop: 10, fontSize: 12, color: '#B91C1C', fontWeight: 600 }}>
                    ⚠️ {contreIndDetail}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
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
            </div>
          );
        })()}

        {/* ── TIMELINE ou ÉTAT VIDE ─────────────────────────────── */}
        {itemsJour.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '28px 20px', background: 'white', borderRadius: 18, boxShadow: '0 2px 10px rgba(13,43,43,0.06)' }}>
            <i className="ti ti-calendar-off" style={{ fontSize: 48, color: '#BDD0D0', display: 'block', marginBottom: 12 }} />
            <div style={{ fontSize: 16, fontWeight: 600, color: '#7A9A9A', marginBottom: 6 }}>Aucune séance aujourd'hui</div>
            <div style={{ fontSize: 13, color: C.muted }}>Profitez-en pour avancer sur vos bilans</div>
          </div>
        ) : (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={titreSection}>Aujourd'hui</div>
              <button onClick={() => navigate(URLS_MOBILE.agenda)}
                style={{ background: 'none', border: 'none', padding: 0, fontSize: 12, fontWeight: 700, color: C.primary, cursor: 'pointer' }}>
                Agenda →
              </button>
            </div>
            <div style={{ background: 'white', borderRadius: 18, overflow: 'hidden', boxShadow: '0 2px 10px rgba(13,43,43,0.06)' }}>
              {itemsJour.map((item, index) => {
                const isLast = index === itemsJour.length - 1;
                if (item.kind === 'cours') {
                  const { cours, nbInscrits } = item;
                  return (
                    <div key={`cours-${cours.id}`}>
                      <div onClick={() => setCoursSelectionneId(cours.id)}
                        style={{ display: 'flex', alignItems: 'stretch', gap: 12, padding: '12px 16px', cursor: 'pointer', background: '#F6F0FF' }}>
                        <span aria-hidden="true" style={{ width: 4, borderRadius: 2, background: '#7C3AED', flexShrink: 0 }} />
                        <span style={{ fontSize: 13, fontWeight: 700, color: C.text, flexShrink: 0, width: 40 }}>{cours.heureDebut}</span>
                        <span style={{ fontSize: 14, fontWeight: 600, color: C.text, flex: 1, minWidth: 0 }}>
                          👥 {cours.titre}
                          <span style={{ fontSize: 11, fontWeight: 500, color: '#7C3AED' }}> · {nbInscrits} inscrit{nbInscrits !== 1 ? 's' : ''}</span>
                        </span>
                        <i className="ti ti-chevron-right" style={{ fontSize: 15, color: '#D0DCDC', alignSelf: 'center' }} />
                      </div>
                      {!isLast && <div style={{ height: 1, background: '#F0F4F4', marginLeft: 16 }} />}
                    </div>
                  );
                }
                const seance = item.seance;
                const p = participants.find(x => x.id === seance.participantId);
                const estEnCours = seance.heureDebut <= currentTimeStr && seance.heureFin > currentTimeStr;
                const faite = seance.statut === 'realisee';
                const cat = categorieDe(seance);
                return (
                  <div key={seance.id}>
                    <div onClick={() => p && onVoirFiche(p.id)}
                      style={{ display: 'flex', alignItems: 'stretch', gap: 12, padding: '12px 16px', cursor: p ? 'pointer' : 'default', background: estEnCours ? '#F0FAFA' : 'white' }}>
                      <span aria-hidden="true" style={{ width: 4, borderRadius: 2, background: cat?.couleur ?? '#B8C7C7', flexShrink: 0, opacity: faite ? 0.5 : 1 }} />
                      <div style={{ flexShrink: 0, width: 40 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{seance.heureDebut}</div>
                        <div style={{ fontSize: 11, color: C.muted }}>{seance.heureFin}</div>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: estEnCours ? 700 : 600, color: C.text, textDecoration: faite ? 'line-through' : 'none', opacity: faite ? 0.6 : 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {p?.prenom} {p?.nom}
                        </div>
                        {(cat || seance.type !== 'seance') && (
                          <div style={{ marginTop: 3 }}>
                            {cat ? pastilleCategorie(cat) : (
                              <span style={{ background: '#EDE9FE', color: '#6D28D9', borderRadius: 8, padding: '1px 7px', fontSize: 11, fontWeight: 700 }}>{LABEL_TYPE[seance.type]}</span>
                            )}
                          </div>
                        )}
                      </div>
                      {faite ? (
                        <i className="ti ti-circle-check" aria-label="Réalisée" style={{ fontSize: 20, color: C.green, alignSelf: 'center' }} />
                      ) : estEnCours ? (
                        <span style={{ background: C.primary, color: 'white', borderRadius: 8, padding: '3px 8px', fontSize: 11, fontWeight: 700, alignSelf: 'center' }}>En cours</span>
                      ) : (
                        <i className="ti ti-chevron-right" style={{ fontSize: 15, color: '#D0DCDC', alignSelf: 'center' }} />
                      )}
                    </div>
                    {!isLast && <div style={{ height: 1, background: '#F0F4F4', marginLeft: 16 }} />}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── BILANS À VENIR ────────────────────────────────────── */}
        {bilansAVenir.length > 0 && (
          <div>
            <div style={{ ...titreSection, marginBottom: 10 }}>Bilans à venir</div>
            <div style={{ background: 'white', borderRadius: 18, overflow: 'hidden', boxShadow: '0 2px 10px rgba(13,43,43,0.06)' }}>
              {bilansAVenir.map((b, i) => {
                const p = participants.find(x => x.id === b.participantId);
                const cat = categorieDe(b);
                return (
                  <button key={b.id} onClick={() => navigate(URLS_MOBILE.agendaJour(b.date))}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: 'none', border: 'none', borderTop: i === 0 ? 'none' : '1px solid #F0F4F4', cursor: 'pointer', textAlign: 'left' }}>
                    <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: '50%', background: cat?.couleur ?? '#8B5CF6', flexShrink: 0 }} />
                    <span style={{ fontSize: 13, fontWeight: 700, color: C.text, flexShrink: 0, width: 56 }}>{formatDateCourt(b.date)}</span>
                    <span style={{ fontSize: 14, color: C.text, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p?.prenom} {p?.nom}</span>
                    <i className="ti ti-chevron-right" style={{ fontSize: 15, color: '#D0DCDC' }} />
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ── CHIFFRES ──────────────────────────────────────────── */}
        <div>
          <div style={{ ...titreSection, marginBottom: 10 }}>En un coup d'œil</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Tuile icone="ti-users" valeur={participantsActifs.length} libelle="bénéficiaires actifs" />
            <Tuile icone="ti-calendar-week" valeur={seancesSemaine.length} libelle="cette semaine" />
            <Tuile icone="ti-clipboard-check" valeur={bilansAFaire.length} libelle="bilans à faire" />
            <Tuile icone="ti-clock-exclamation" valeur={contratsARenouveler.length} libelle="contrat fin proche" couleur={contratsARenouveler.length > 0 ? '#F59E0B' : C.primary} />
          </div>
        </div>

        {/* ── ALERTES ───────────────────────────────────────────── */}
        {contratsARenouveler.length > 0 && (
          <div style={{ background: '#FEF3C7', border: '1px solid #FCD34D', borderRadius: 14, padding: '12px 14px', fontSize: 13, color: '#92400E', fontWeight: 600 }}>
            ⏰ {contratsARenouveler.length} contrat{contratsARenouveler.length > 1 ? 's' : ''} à renouveler bientôt
          </div>
        )}

      </div>

      {coursSelectionne && (
        <ModalPresenceCoursCollectif
          cours={coursSelectionne}
          participations={participationsDuCours(coursSelectionne.id)}
          participants={participants}
          onMettreAJourParticipation={(participationId, patch) => mettreAJourParticipation(participationId, patch)}
          onModifierStatutCours={async statut => modifierStatutCours(coursSelectionne.id, statut)}
          onClose={() => setCoursSelectionneId(null)}
        />
      )}
    </div>
  );
}

// ── EcranPatients ─────────────────────────────────────────────────────────────

type FiltrePatients = 'tous' | 'ci' | 'bilan' | 'seance';

function EcranPatients({ onVoirFiche }: { onVoirFiche: (id: string) => void }) {
  const { participantsActifs: participants } = useParticipants();
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

  // Date de naissance : saisie au clavier JJ/MM/AAAA. form.dateNaissance
  // reste l'ISO (inchangé, c'est lui qui est écrit dans le brouillon et
  // envoyé à addParticipant) ; ce texte séparé est ce que l'utilisateur voit
  // et tape. Voir src/utils/dateNaissance.ts (même logique que le formulaire
  // complet, ParticipantForm.tsx).
  const [dateNaissanceSaisie, setDateNaissanceSaisie] = useState(
    formaterDateNaissanceAffichage(texteBrouillon(brouillon.dateNaissance)),
  );
  const [dateNaissanceErreur, setDateNaissanceErreur] = useState<string | null>(null);

  function handleChangeDateNaissance(e: React.ChangeEvent<HTMLInputElement>) {
    const masque = masquerSaisieDateNaissance(e.target.value);
    setDateNaissanceSaisie(masque);
    setDateNaissanceErreur(null);
    const resultat = parserDateNaissanceSaisie(masque);
    setForm(f => ({ ...f, dateNaissance: resultat.statut === 'valide' ? resultat.iso : '' }));
  }

  function handleBlurDateNaissance() {
    if (!dateNaissanceSaisie) return; // le contrôle « obligatoire » se fait à la sauvegarde
    setDateNaissanceErreur(messageErreurDateNaissance(parserDateNaissanceSaisie(dateNaissanceSaisie)));
  }

  function validerDateNaissance(): string | null {
    if (form.dateNaissance) return null;
    return dateNaissanceSaisie
      ? messageErreurDateNaissance(parserDateNaissanceSaisie(dateNaissanceSaisie))
      : 'La date de naissance est obligatoire.';
  }

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
    if (!form.prenom.trim() || !form.nom.trim()) {
      toast.error('Prénom et nom requis');
      return;
    }
    const erreurDate = validerDateNaissance();
    if (erreurDate) {
      setDateNaissanceErreur(erreurDate);
      toast.error(erreurDate);
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
      <input
        type="text"
        inputMode="numeric"
        autoComplete="bday"
        placeholder="JJ/MM/AAAA"
        maxLength={10}
        value={dateNaissanceSaisie}
        onChange={handleChangeDateNaissance}
        onBlur={handleBlurDateNaissance}
        style={{ ...input, marginBottom: dateNaissanceErreur ? 4 : 14, borderColor: dateNaissanceErreur ? '#FCA5A5' : C.border }}
      />
      {dateNaissanceErreur && (
        <div style={{ fontSize: 12, color: '#B91C1C', marginBottom: 10 }}>{dateNaissanceErreur}</div>
      )}

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
  const { search: rechercheBilan } = useLocation();
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
          await validerSeanceDuBilan(idSeanceDepuisRecherche(rechercheBilan), participant.id);
          toast.success('Bilan enregistré ✅');
          onTermine();
        }}
        onCancel={onTermine}
        brouillon={reprise === 'reprendre' ? brouillonSauve : null}
      />
    </div>
  );
}

// Carte d'une séance dans l'agenda mobile (vue Jour et listes À venir / Passées). Le bandeau de gauche
// porte la couleur de la catégorie choisie par le praticien (gris sans catégorie) : on lit le planning
// d'un coup d'œil sans ouvrir chaque séance. Les actions rapides évitent la modale pour le quotidien :
// valider une séance réalisée, ouvrir la fiche, ouvrir le bilan lié.
function CarteSeanceAgenda({ seance, participant, categorie, avecDate, onOuvrir, onValider, onFiche, onBilan }: {
  seance: Seance;
  participant: Participant | undefined;
  categorie: CategorieSeance | undefined;
  avecDate?: boolean;
  onOuvrir: () => void;
  onValider: () => void;
  onFiche: () => void;
  onBilan: () => void;
}) {
  const estAnnulee = seance.statut === 'annulee';
  const estBilan = seance.type !== 'seance';
  const couleur = estAnnulee ? '#EF4444' : (categorie?.couleur ?? '#B8C7C7');
  const bouton: React.CSSProperties = { flex: 1, padding: '8px 4px', border: `1px solid ${C.border}`, background: 'white', borderRadius: 8, fontSize: 12, fontWeight: 600, color: C.text, cursor: 'pointer' };
  return (
    <div style={{ ...card, padding: 0, overflow: 'hidden', opacity: estAnnulee ? 0.55 : 1, display: 'flex' }}>
      <span aria-hidden="true" data-testid="bandeau-categorie" style={{ width: 6, background: couleur, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0, padding: '10px 12px' }}>
        <button onClick={onOuvrir} style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{participant?.prenom} {participant?.nom}</div>
              <div style={{ fontSize: 12, color: C.muted }}>
                {avecDate ? `${formatDateAgenda(seance.date)} · ` : ''}{seance.heureDebut} · {seance.dureeMinutes} min
                {estAnnulee ? ' · Annulée' : seance.statut === 'realisee' ? ' · ✅ Réalisée' : ''}
              </div>
            </div>
            {absenceSignaleeAffichable(seance) && (
              <span style={{ background: '#FFF1F2', color: '#BE123C', borderRadius: 8, padding: '4px 8px', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>🚫 Absence</span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
            {categorie ? (
              <span style={{ background: `${categorie.couleur}22`, color: C.text, border: `1px solid ${categorie.couleur}`, borderRadius: 8, padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>{categorie.nom}</span>
            ) : estBilan ? (
              <span style={{ background: '#EDE9FE', color: '#6D28D9', borderRadius: 8, padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>{LABEL_TYPE[seance.type]}</span>
            ) : null}
            {seance.bilanAuto && <span style={{ background: C.bg, color: C.muted, borderRadius: 8, padding: '2px 8px', fontSize: 11 }}>🔄 Automatique</span>}
          </div>
          {seance.objectif && <div style={{ fontSize: 12, color: C.text, marginTop: 6 }}>🎯 {seance.objectif}</div>}
          {seance.notes && <div style={{ fontSize: 12, color: C.muted, marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>📝 {seance.notes}</div>}
        </button>
        {!estAnnulee && (
          <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
            {seance.statut === 'planifiee' && (
              <button onClick={onValider} style={{ ...bouton, background: C.primary, color: 'white', border: 'none' }}>✓ Valider</button>
            )}
            <button onClick={onFiche} style={bouton}>👤 Fiche</button>
            {estBilan && <button onClick={onBilan} style={bouton}>📋 Bilan</button>}
          </div>
        )}
      </div>
    </div>
  );
}

// ── EcranAgenda ────────────────────────────────────────────────────────────────
// Sous-chantier 1 (Agenda mobile) : écran natif, pas de fusion de route — la
// décision (cadrage validé) est que react-big-calendar (AgendaV2Page.tsx,
// desktop) n'est pas utilisé côté mobile. Vue Jour uniquement (MVP) :
// créneaux du jour empilés verticalement, triés par heure. Semaine et Mois :
// sous-chantiers suivants, hors périmètre ici.
//
// Modales réutilisées telles quelles depuis le sous-chantier 0 (extraction
// AgendaV2Page.tsx → src/components/agenda/), sans adaptation : création
// (ModalCreerSeanceManuelle), édition/déplacement à la main/suppression/
// restauration (ModalEditSeance + ModalChoixSerie pour le choix de portée),
// présence aux cours collectifs (ModalPresenceCoursCollectif, déjà utilisée
// dans EcranTournee), consultation/suppression d'un événement
// (ModalEvenementAgenda). Pas de glisser-déposer : éditer = ouvrir la modale,
// changer la date/l'heure dans les champs, enregistrer — même chemin que
// handleEnregistrerSeance côté desktop pour toute édition hors glisser.
//
// Pas de création d'événement depuis cet écran (affichage/suppression
// seulement) : non demandé pour ce sous-chantier, contrairement à la
// création de séance.
//
// Dispo bénéficiaire sélectionné (fond de grille desktop) : omis — pas de
// mécanisme de sélection dans une liste verticale (contrairement au clic sur
// une carte dans la colonne desktop). Seules les indisponibilités du
// praticien sont affichées (encart simple, pas la trame horaire visuelle).

type ItemJour =
  | { kind: 'seance'; heureDebut: string; seance: Seance }
  | { kind: 'cours'; heureDebut: string; cours: CoursCollectif; nbInscrits: number }
  | { kind: 'evenement'; heureDebut: string; evenement: EvenementAgenda };

// `dateInitiale` (AAAA-MM-JJ, déjà validée par ecranMobileDepuisUrl) : jour
// affiché à l'ouverture — lien /agenda?date=… de la notification push
// « absence signalée ». Absente : aujourd'hui, comme avant.
function EcranAgenda({ dateInitiale }: { dateInitiale: string | null }) {
  const { participants, participantsActifs } = useParticipants();
  const { contrats } = useContrats();
  const { seances, modifierSeance, supprimerSeance, creerSeance, detecterConflits } = useAgenda();
  const { indisposDuJour } = useIndispos();
  const { evenements, supprimerEvenement } = useEvenementsAgenda();
  const { categories, creerCategorie, modifierCategorie, supprimerCategorie, definirCategorieBilan } = useCategoriesSeance();
  const [categoriesOuvert, setCategoriesOuvert] = useState(false);
  const navigate = useNavigate();
  const {
    coursCollectifs, modifierStatutCours, mettreAJourParticipation, participationsDuCours,
    recharger: rechargerCoursCollectifs,
  } = useCoursCollectifs();

  const [jour, setJour] = useState(() => {
    if (!dateInitiale) return new Date();
    const [a, m, j] = dateInitiale.split('-').map(Number);
    return new Date(a, m - 1, j);
  });
  const [vue, setVue] = useState<'jour' | 'mois' | 'avenir' | 'passees'>('jour');
  // Listes À venir / Passées : par pages, pour ne pas rendre des années de séances d'un coup.
  const [nbListe, setNbListe] = useState(30);
  const dateStr = format(jour, 'yyyy-MM-dd');
  const jourCle = CLE_JOUR_PAR_DOW[jour.getDay()];

  // Grille du mois affiché (semaines complètes, lundi en premier — même
  // convention que le calendrier desktop, AgendaV2Page.tsx).
  const joursGrilleMois = useMemo(() => eachDayOfInterval({
    start: startOfWeek(startOfMonth(jour), { weekStartsOn: 1 }),
    end: endOfWeek(endOfMonth(jour), { weekStartsOn: 1 }),
  }), [jour]);

  // Compteur de charge par jour (vue Mois) : exclut les séances et cours
  // annulés, qui restent visibles (grisés) en vue Jour via itemsJour mais ne
  // doivent pas gonfler artificiellement la charge affichée sur une case.
  const comptesParJour = useMemo(() => {
    const map = new Map<string, number>();
    const incrementer = (d: string) => map.set(d, (map.get(d) ?? 0) + 1);
    seances.forEach(s => { if (s.statut !== 'annulee') incrementer(s.date); });
    coursCollectifs.forEach(c => { if (c.statut !== 'annule') incrementer(c.date); });
    evenements.forEach(e => incrementer(e.date));
    return map;
  }, [seances, coursCollectifs, evenements]);

  // Jours portant au moins une séance signalée absente par le bénéficiaire,
  // encore actionnable (absenceSignaleeAffichable, agendaCommun.ts — voir
  // sa doc pour la règle).
  const joursAvecAbsenceSignalee = useMemo(() => {
    const set = new Set<string>();
    seances.forEach(s => { if (absenceSignaleeAffichable(s)) set.add(s.date); });
    return set;
  }, [seances]);

  // Indisponibilités : récurrentes par jour de semaine (pas de date propre,
  // cf. Indisponibilite dans types/index.ts) — un même jour de semaine est
  // donc indisponible ou non sur tout le mois, d'où un simple Set des 7 clés.
  const joursSemaineIndisponibles = useMemo(() => {
    const set = new Set<string>();
    (['lun', 'mar', 'mer', 'jeu', 'ven', 'sam', 'dim'] as const).forEach(cle => {
      if (indisposDuJour(cle).length > 0) set.add(cle);
    });
    return set;
  }, [indisposDuJour]);

  const participantMap = useMemo(() => new Map(participants.map(p => [p.id, p])), [participants]);
  function nomBeneficiaireDe(s: Seance): string {
    const p = participantMap.get(s.participantId);
    return p ? `${p.prenom} ${p.nom}` : 'Bénéficiaire';
  }

  // Toutes les séances du jour, y compris annulées (pas seancesDuJour, qui
  // les exclut) : une séance annulée doit rester consultable et restaurable
  // depuis cet écran, exactement comme sur le calendrier desktop
  // (AgendaV2Page.tsx affiche aussi les séances annulées, en grisé).
  const seancesJour = seances
    .filter(s => s.date === dateStr)
    .sort((a, b) => a.heureDebut.localeCompare(b.heureDebut));
  const coursJour = coursCollectifs
    .filter(c => c.date === dateStr && c.statut !== 'annule')
    .sort((a, b) => a.heureDebut.localeCompare(b.heureDebut));
  const evenementsJour = evenements
    .filter(e => e.date === dateStr)
    .sort((a, b) => a.heureDebut.localeCompare(b.heureDebut));
  const indisposJour = indisposDuJour(jourCle as Parameters<typeof indisposDuJour>[0]);

  const itemsJour: ItemJour[] = [
    ...seancesJour.map(seance => ({ kind: 'seance' as const, heureDebut: seance.heureDebut, seance })),
    ...coursJour.map(cours => ({
      kind: 'cours' as const,
      heureDebut: cours.heureDebut,
      cours,
      nbInscrits: participationsDuCours(cours.id).length,
    })),
    ...evenementsJour.map(evenement => ({ kind: 'evenement' as const, heureDebut: evenement.heureDebut, evenement })),
  ].sort((a, b) => a.heureDebut.localeCompare(b.heureDebut));

  const categorieDe = (s: Seance) => categories.find(c => c.id === s.categorieId);

  // Pastilles de couleur de la vue Mois : catégories distinctes du jour (3 au plus), hors annulées.
  const couleursParJour = useMemo(() => {
    const map = new Map<string, string[]>();
    seances.forEach(sc => {
      const c = couleurCategorieDe(sc, categories);
      if (!c || sc.statut === 'annulee') return;
      const l = map.get(sc.date) ?? [];
      if (!l.includes(c) && l.length < 3) map.set(sc.date, [...l, c]);
    });
    return map;
  }, [seances, categories]);

  const aujourdhuiStr = format(new Date(), 'yyyy-MM-dd');
  const listeSeances = useMemo(() => {
    if (vue !== 'avenir' && vue !== 'passees') return [];
    const base = seances.filter(sc => sc.statut !== 'annulee');
    return vue === 'avenir'
      ? base.filter(sc => sc.date >= aujourdhuiStr).sort((a, b) => a.date.localeCompare(b.date) || a.heureDebut.localeCompare(b.heureDebut))
      : base.filter(sc => sc.date < aujourdhuiStr).sort((a, b) => b.date.localeCompare(a.date) || b.heureDebut.localeCompare(a.heureDebut));
  }, [seances, vue, aujourdhuiStr]);

  async function validerSeance(sc: Seance) {
    if (await modifierSeance(sc.id, { statut: 'realisee' })) toast.success('Séance validée');
  }

  const [nouvelleSeanceOuverte, setNouvelleSeanceOuverte] = useState(false);
  const [seanceEditee, setSeanceEditee] = useState<Seance | null>(null);
  const [noteSeanceOuverte, setNoteSeanceOuverte] = useState<Seance | null>(null);
  const [coursSelectionneId, setCoursSelectionneId] = useState<string | null>(null);
  const coursSelectionne = coursCollectifs.find(c => c.id === coursSelectionneId) ?? null;
  const [evenementEdite, setEvenementEdite] = useState<EvenementAgenda | null>(null);
  const [choixSerie, setChoixSerie] = useState<ChoixSerie | null>(null);
  const [choixSerieLoading, setChoixSerieLoading] = useState(false);

  // Réplique exacte de toastConflitSerie / handleEnregistrerSeance /
  // handleSupprimerSeance / handleRestaurerSeance / handleReporterSeance
  // (AgendaV2Page.tsx) : même logique de portée, aucune divergence de
  // comportement entre desktop et cet écran mobile.
  function toastConflitSerie(conflits: { date: string; occupePar: string }[]) {
    const detail = conflits
      .map(c => `${formatDateAgenda(c.date)} (occupé par ${participantMap.get(c.occupePar)?.prenom ?? 'une autre séance'})`)
      .join(', ');
    toast.error(`Action annulée — conflit sur ${conflits.length} semaine${conflits.length > 1 ? 's' : ''} : ${detail}`);
  }

  async function handleEnregistrerSeance(seance: Seance, updates: MiseAJourSeance) {
    const futures = calculerFutures(seances, seance);

    const enregistrerUnique = async () => {
      await executerOperations([planEditerUnique(seance, updates)], modifierSeance, supprimerSeance);
      toast.success('Séance modifiée');
    };

    if (futures.length <= 1) {
      await enregistrerUnique();
      return;
    }

    const dowCible = new Date(updates.date + 'T12:00').getDay();
    setChoixSerie({
      titre: 'Modifier la séance',
      futures,
      seanceRefId: seance.id,
      optionsDisponibles: optionsPorteePourAction({ type: 'editer', dowCible, updates }),
      onUnique: enregistrerUnique,
      onSerie: async () => {
        const plan = planEditerSerie(seances, futures, dowCible, updates);
        if (!plan.ok) { toastConflitSerie(plan.conflits); return; }
        const nb = await executerOperations(avecInfosDeLaReference(plan.operations, seance.id, updates), modifierSeance, supprimerSeance);
        toast.success(`${nb} séances modifiées`);
      },
      onSelection: async (ids) => {
        const plan = planActionSurSelection(seances, ids, { type: 'editer', dowCible, updates });
        if (!plan.ok) { toastConflitSerie(plan.conflits); return; }
        const nb = await executerOperations(avecInfosDeLaReference(plan.operations, seance.id, updates), modifierSeance, supprimerSeance);
        toast.success(`${nb} séance${nb > 1 ? 's' : ''} modifiée${nb > 1 ? 's' : ''}`);
      },
    });
  }

  async function handleRestaurerSeance(seance: Seance) {
    await executerOperations(
      [planEditerUnique(seance, {
        date: seance.date, heureDebut: seance.heureDebut, heureFin: seance.heureFin, dureeMinutes: seance.dureeMinutes,
        statut: 'planifiee', motifAnnulation: undefined, motifAnnulationDetail: undefined,
      })],
      modifierSeance, supprimerSeance,
    );
    toast.success('Séance restaurée');
  }

  async function handleSupprimerSeance(seance: Seance) {
    const futures = calculerFutures(seances, seance);

    if (futures.length <= 1) {
      await executerOperations([planSupprimerUnique(seance)], modifierSeance, supprimerSeance);
      toast.success('Séance supprimée');
      return;
    }

    setChoixSerie({
      titre: 'Supprimer la séance',
      futures,
      seanceRefId: seance.id,
      optionsDisponibles: optionsPorteePourAction({ type: 'supprimer' }),
      onUnique: async () => {
        await executerOperations([planSupprimerUnique(seance)], modifierSeance, supprimerSeance);
        toast.success('Séance supprimée');
      },
      onSerie: async () => {
        const nb = await executerOperations(planSupprimerSerie(futures), modifierSeance, supprimerSeance);
        toast.success(`${nb} séances supprimées`);
      },
      onSelection: async (ids) => {
        const plan = planActionSurSelection(seances, ids, { type: 'supprimer' });
        if (!plan.ok) { toastConflitSerie(plan.conflits); return; }
        const nb = await executerOperations(plan.operations, modifierSeance, supprimerSeance);
        toast.success(`${nb} séance${nb > 1 ? 's' : ''} supprimée${nb > 1 ? 's' : ''}`);
      },
    });
  }

  // Chemin non atteignable dans ModalEditSeance (etapeReport figé à false,
  // voir ModalEditSeance.tsx) — répliqué pour la parité d'API avec
  // AgendaV2Page.tsx, jamais réellement invoqué en pratique.
  async function handleReporterSeance(seance: Seance, nouvelleDate: string) {
    const ok = await modifierSeance(seance.id, { statut: 'reportee' });
    if (!ok) return;
    const participant = participantMap.get(seance.participantId);
    await creerSeance({
      participantId: seance.participantId,
      contratId: seance.contratId,
      type: seance.type,
      date: nouvelleDate,
      heureDebut: seance.heureDebut,
      heureFin: seance.heureFin,
      dureeMinutes: seance.dureeMinutes,
      statut: 'planifiee',
      notes: `Reportée depuis le ${formatDateAgenda(seance.date)}`,
      adresse: seance.adresse,
      coordonnees: seance.coordonnees ?? (participant?.coordonnees ? { lat: participant.coordonnees.lat, lng: participant.coordonnees.lng } : undefined),
    });
    toast.success(`Séance reportée au ${formatDateAgenda(nouvelleDate)}`);
  }

  return (
    <div>
      <div style={{ background: 'white', paddingTop: 'calc(env(safe-area-inset-top, 44px) + 12px)', paddingLeft: 16, paddingRight: 16, paddingBottom: 16, borderBottom: `1px solid ${C.border}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: C.text }}>Agenda</div>
          <button onClick={() => setNouvelleSeanceOuverte(true)}
            style={{ padding: '8px 14px', background: C.primary, color: 'white', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
            + Nouvelle séance
          </button>
        </div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
          {([['jour', 'Jour'], ['mois', 'Mois'], ['avenir', 'À venir'], ['passees', 'Passées']] as const).map(([v, libelle]) => (
            <button key={v} onClick={() => { setVue(v); setNbListe(30); }} aria-pressed={vue === v}
              style={{ flex: 1, padding: '6px 0', background: vue === v ? C.primary : C.bg, color: vue === v ? 'white' : C.text, border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
              {libelle}
            </button>
          ))}
        </div>
        {(vue === 'jour' || vue === 'mois') && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button onClick={() => setJour(d => vue === 'jour' ? addDays(d, -1) : addMonths(d, -1))} aria-label={vue === 'jour' ? 'Jour précédent' : 'Mois précédent'}
            style={{ width: 36, height: 36, background: C.bg, border: 'none', borderRadius: 8, fontSize: 16, color: C.text, cursor: 'pointer' }}>
            ‹
          </button>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.text, textTransform: 'capitalize' }}>{vue === 'jour' ? formatDateLong(jour) : formatMoisAnnee(jour)}</div>
          <button onClick={() => setJour(d => vue === 'jour' ? addDays(d, 1) : addMonths(d, 1))} aria-label={vue === 'jour' ? 'Jour suivant' : 'Mois suivant'}
            style={{ width: 36, height: 36, background: C.bg, border: 'none', borderRadius: 8, fontSize: 16, color: C.text, cursor: 'pointer' }}>
            ›
          </button>
        </div>
        )}
        <button onClick={() => setCategoriesOuvert(true)}
          style={{ marginTop: 10, background: 'none', border: 'none', padding: 0, fontSize: 12, fontWeight: 700, color: C.primary, cursor: 'pointer' }}>
          🎨 Catégories et couleurs
        </button>
      </div>

      {vue === 'avenir' || vue === 'passees' ? (
        <div style={{ padding: '8px 16px' }}>
          {listeSeances.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: C.muted }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>🗓️</div>
              {vue === 'avenir' ? 'Aucune séance à venir' : 'Aucune séance passée'}
            </div>
          ) : (
            <>
              {listeSeances.slice(0, nbListe).map(s => (
                <CarteSeanceAgenda key={s.id} seance={s} avecDate participant={participantMap.get(s.participantId)}
                  categorie={categorieDe(s)}
                  onOuvrir={() => setSeanceEditee(s)} onValider={() => void validerSeance(s)}
                  onFiche={() => navigate(URLS_MOBILE.fiche(s.participantId))}
                  onBilan={() => navigate(URLS_MOBILE.nouveauBilanDeSeance(s.participantId, s.id))} />
              ))}
              {listeSeances.length > nbListe && (
                <button onClick={() => setNbListe(n => n + 30)}
                  style={{ width: '100%', padding: 12, background: 'white', border: `1px solid ${C.border}`, borderRadius: 10, fontSize: 13, fontWeight: 700, color: C.text, cursor: 'pointer' }}>
                  Voir plus ({listeSeances.length - nbListe})
                </button>
              )}
            </>
          )}
        </div>
      ) : vue === 'mois' ? (
        <div style={{ padding: '8px 16px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 4 }}>
            {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((lettre, i) => (
              <div key={i} style={{ textAlign: 'center', fontSize: 11, fontWeight: 700, color: C.muted }}>{lettre}</div>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
            {joursGrilleMois.map(d => {
              const dStr = format(d, 'yyyy-MM-dd');
              const horsMois = !isSameMonth(d, jour);
              const estAujourdhui = isSameDay(d, new Date());
              const compte = comptesParJour.get(dStr) ?? 0;
              const indisponible = joursSemaineIndisponibles.has(CLE_JOUR_PAR_DOW[d.getDay()]);
              const absenceSignalee = joursAvecAbsenceSignalee.has(dStr);
              return (
                <button key={dStr} onClick={() => { setJour(d); setVue('jour'); }} aria-label={formatDateAgenda(dStr)}
                  style={{
                    position: 'relative', aspectRatio: '1', display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center', gap: 2, borderRadius: 8,
                    border: estAujourdhui ? `2px solid ${C.primary}` : '1px solid transparent',
                    background: 'white', cursor: 'pointer', opacity: horsMois ? 0.35 : 1,
                  }}>
                  <span style={{ fontSize: 13, fontWeight: estAujourdhui ? 700 : 500, color: C.text }}>{d.getDate()}</span>
                  {(couleursParJour.get(dStr)?.length ?? 0) > 0 && (
                    <span aria-hidden="true" style={{ display: 'flex', gap: 2 }}>
                      {couleursParJour.get(dStr)!.map(c => <span key={c} style={{ width: 5, height: 5, borderRadius: '50%', background: c }} />)}
                    </span>
                  )}
                  {compte > 0 && (
                    <span data-testid="charge-jour" style={{ fontSize: 10, fontWeight: 700, color: 'white', background: C.primary, borderRadius: 8, minWidth: 16, height: 16, padding: '0 3px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {compte}
                    </span>
                  )}
                  {indisponible && (
                    <span aria-hidden="true" style={{ position: 'absolute', top: 4, right: 4, width: 6, height: 6, borderRadius: '50%', background: '#EF4444' }} />
                  )}
                  {/* Coin opposé à la pastille d'indisponibilité, couleur
                      distincte : les deux peuvent coexister le même jour. */}
                  {absenceSignalee && (
                    <span aria-hidden="true" data-testid="pastille-absence-signalee" style={{ position: 'absolute', top: 4, left: 4, width: 6, height: 6, borderRadius: '50%', background: '#F59E0B' }} />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ) : (
      <div style={{ padding: '8px 16px' }}>
        {indisposJour.length > 0 && (
          <div style={{ background: '#FEF2F2', border: '1px solid #FEE2E2', borderRadius: 10, padding: '10px 12px', marginBottom: 10, fontSize: 12, color: '#991B1B' }}>
            {indisposJour.map(i => (
              <div key={i.id}>🚫 Indisponible {i.heureDebut}–{i.heureFin}{i.label ? ` — ${i.label}` : ''}</div>
            ))}
          </div>
        )}

        {itemsJour.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: C.muted }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🗓️</div>
            Aucun créneau ce jour
          </div>
        ) : itemsJour.map(item => {
          if (item.kind === 'cours') {
            const { cours, nbInscrits } = item;
            const badge = cours.statut === 'realise'
              ? { label: '✅ Réalisé', bg: '#DCFCE7', color: '#166534' }
              : { label: 'Planifié', bg: '#EDE9FE', color: '#6D28D9' };
            return (
              <div key={`cours-${cours.id}`} style={{ ...card, border: '1px solid #EDE9FE' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <span style={{ width: 26, height: 26, borderRadius: '50%', background: '#7C3AED', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, flexShrink: 0 }}>👥</span>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 600, color: C.text }}>{cours.titre}</div>
                      <div style={{ fontSize: 12, color: C.muted }}>{cours.heureDebut} · {cours.dureeMinutes} min · {nbInscrits} inscrit{nbInscrits !== 1 ? 's' : ''}</div>
                    </div>
                  </div>
                  <span style={{ background: badge.bg, color: badge.color, borderRadius: 8, padding: '4px 8px', fontSize: 11, fontWeight: 700, flexShrink: 0, height: 'fit-content' }}>
                    {badge.label}
                  </span>
                </div>
                <button
                  onClick={() => { void rechargerCoursCollectifs(); setCoursSelectionneId(cours.id); }}
                  style={{ width: '100%', padding: 9, background: '#7C3AED', color: 'white', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                  👥 Gérer les présences
                </button>
              </div>
            );
          }
          if (item.kind === 'evenement') {
            const { evenement } = item;
            return (
              <button key={`evenement-${evenement.id}`} onClick={() => setEvenementEdite(evenement)}
                style={{ ...card, border: '1px dashed rgba(0,0,0,0.25)', width: '100%', textAlign: 'left', cursor: 'pointer' }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: evenement.couleur, flexShrink: 0 }} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 15, fontWeight: 600, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{evenement.titre}</div>
                    <div style={{ fontSize: 12, color: C.muted }}>{LABEL_TYPE_EVENEMENT[evenement.type]} · {evenement.heureDebut}–{evenement.heureFin}</div>
                  </div>
                </div>
              </button>
            );
          }
          const s = item.seance;
          return (
            <CarteSeanceAgenda key={s.id} seance={s} participant={participantMap.get(s.participantId)}
              categorie={categorieDe(s)}
              onOuvrir={() => setSeanceEditee(s)} onValider={() => void validerSeance(s)}
              onFiche={() => navigate(URLS_MOBILE.fiche(s.participantId))}
              onBilan={() => navigate(URLS_MOBILE.nouveauBilanDeSeance(s.participantId, s.id))} />
          );
        })}
      </div>
      )}

      {nouvelleSeanceOuverte && (
        <ModalCreerSeanceManuelle
          participants={participantsActifs}
          detecterConflits={detecterConflits}
          initial={{ date: dateStr }}
          onCreer={async data => { await creerSeance(data); }}
          onClose={() => setNouvelleSeanceOuverte(false)}
          categories={categories}
          onGererCategories={() => setCategoriesOuvert(true)}
        />
      )}

      {seanceEditee && (() => {
        const contratEdite = contrats.find(c => c.id === seanceEditee.contratId)
          ?? contrats.find(c => c.participantId === seanceEditee.participantId && c.statut === 'actif')
          ?? null;
        return (
          <ModalEditSeance
            seance={seanceEditee}
            nomBeneficiaire={nomBeneficiaireDe(seanceEditee)}
            seances={seances}
            contrat={contratEdite}
            onSave={updates => handleEnregistrerSeance(seanceEditee, updates)}
            onDelete={() => handleSupprimerSeance(seanceEditee)}
            onRestaurer={() => handleRestaurerSeance(seanceEditee)}
            onReporter={nouvelleDate => handleReporterSeance(seanceEditee, nouvelleDate)}
            onNoteSeance={() => { setNoteSeanceOuverte(seanceEditee); setSeanceEditee(null); }}
            onClose={() => setSeanceEditee(null)}
            categories={categories}
            onGererCategories={() => setCategoriesOuvert(true)}
            onOuvrirFiche={() => navigate(URLS_MOBILE.fiche(seanceEditee.participantId))}
            onOuvrirBilan={() => navigate(URLS_MOBILE.nouveauBilanDeSeance(seanceEditee.participantId, seanceEditee.id))}
          />
        );
      })()}

      {noteSeanceOuverte && (() => {
        const p = participantMap.get(noteSeanceOuverte.participantId);
        return (
          <NoteSeanceModal
            participantId={noteSeanceOuverte.participantId}
            participantNom={p ? `${p.prenom} ${p.nom}` : ''}
            seance={{ id: noteSeanceOuverte.id, date: noteSeanceOuverte.date, heureDebut: noteSeanceOuverte.heureDebut }}
            onClose={() => setNoteSeanceOuverte(null)}
            onMarquerRealisee={() => modifierSeance(noteSeanceOuverte.id, { statut: 'realisee' })}
          />
        );
      })()}

      {coursSelectionne && (
        <ModalPresenceCoursCollectif
          cours={coursSelectionne}
          participations={participationsDuCours(coursSelectionne.id)}
          participants={participants}
          onMettreAJourParticipation={(participationId, patch) => mettreAJourParticipation(participationId, patch)}
          onModifierStatutCours={async statut => {
            const ok = await modifierStatutCours(coursSelectionne.id, statut);
            if (ok) toast.success('Statut du cours mis à jour');
            return ok;
          }}
          onClose={() => setCoursSelectionneId(null)}
        />
      )}

      {evenementEdite && (
        <ModalEvenementAgenda
          evenement={evenementEdite}
          onDelete={async () => {
            await supprimerEvenement(evenementEdite.id);
            toast.success('Événement supprimé');
            setEvenementEdite(null);
          }}
          onClose={() => setEvenementEdite(null)}
        />
      )}

      {categoriesOuvert && (
        <ModalCategoriesSeance
          categories={categories}
          onCreer={(nom, couleur) => creerCategorie(nom, couleur)}
          onModifier={modifierCategorie}
          onSupprimer={supprimerCategorie}
          onDefinirBilan={definirCategorieBilan}
          onClose={() => setCategoriesOuvert(false)}
        />
      )}

      {choixSerie && (
        <ModalChoixSerie
          titre={choixSerie.titre}
          futures={choixSerie.futures}
          seanceRefId={choixSerie.seanceRefId}
          optionsDisponibles={choixSerie.optionsDisponibles}
          avertissementSerie={choixSerie.avertissementSerie}
          loading={choixSerieLoading}
          onUnique={async () => {
            setChoixSerieLoading(true);
            try { await choixSerie.onUnique(); } finally { setChoixSerieLoading(false); setChoixSerie(null); }
          }}
          onSerie={async () => {
            setChoixSerieLoading(true);
            try { await choixSerie.onSerie(); } finally { setChoixSerieLoading(false); setChoixSerie(null); }
          }}
          onSelection={async (ids) => {
            setChoixSerieLoading(true);
            try { await choixSerie.onSelection(ids); } finally { setChoixSerieLoading(false); setChoixSerie(null); }
          }}
          onCancel={() => setChoixSerie(null)}
        />
      )}
    </div>
  );
}

// ── EcranPlus ─────────────────────────────────────────────────────────────────

function EcranPlus({ onLogout, onNaviguer }: { onLogout: () => void; onNaviguer: (url: string) => void }) {
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

  // Date de naissance : saisie au clavier JJ/MM/AAAA, même logique que
  // NouveauPatientMobile ci-dessus et que ParticipantForm.tsx (voir
  // src/utils/dateNaissance.ts) — mais champ non obligatoire ici : une fiche
  // en modification a déjà une date de naissance, la laisser vide au blur
  // garde simplement l'existante (voir sauvegarder ci-dessous).
  const [dateNaissanceSaisie, setDateNaissanceSaisie] = useState(
    formaterDateNaissanceAffichage(participant.dateNaissance ?? ''),
  );
  const [dateNaissanceErreur, setDateNaissanceErreur] = useState<string | null>(null);

  function handleChangeDateNaissance(e: React.ChangeEvent<HTMLInputElement>) {
    const masque = masquerSaisieDateNaissance(e.target.value);
    setDateNaissanceSaisie(masque);
    setDateNaissanceErreur(null);
    const resultat = parserDateNaissanceSaisie(masque);
    setF('dateNaissance', resultat.statut === 'valide' ? resultat.iso : '');
  }

  function handleBlurDateNaissance() {
    if (!dateNaissanceSaisie) return;
    setDateNaissanceErreur(messageErreurDateNaissance(parserDateNaissanceSaisie(dateNaissanceSaisie)));
  }

  // Non obligatoire : une saisie vide garde la date existante (voir
  // sauvegarder). Seule une saisie NON vide mais invalide/incomplète bloque.
  function validerDateNaissance(): string | null {
    if (!dateNaissanceSaisie || form.dateNaissance) return null;
    return messageErreurDateNaissance(parserDateNaissanceSaisie(dateNaissanceSaisie));
  }

  async function sauvegarder() {
    if (!form.prenom.trim() || !form.nom.trim()) { toast.error('Prénom et nom requis'); return; }
    const erreurDate = validerDateNaissance();
    if (erreurDate) {
      setDateNaissanceErreur(erreurDate);
      toast.error(erreurDate);
      return;
    }
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
          <input
            type="text"
            inputMode="numeric"
            autoComplete="bday"
            placeholder="JJ/MM/AAAA"
            maxLength={10}
            value={dateNaissanceSaisie}
            onChange={handleChangeDateNaissance}
            onBlur={handleBlurDateNaissance}
            style={{ ...inp, marginBottom: dateNaissanceErreur ? 4 : 12, borderColor: dateNaissanceErreur ? '#FCA5A5' : C.border }}
          />
          {dateNaissanceErreur && (
            <div style={{ fontSize: 12, color: '#B91C1C', marginBottom: 10 }}>{dateNaissanceErreur}</div>
          )}
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

function EcranAssistant({
  preSelectedPatientId,
  onOuvrirSettings,
}: {
  preSelectedPatientId?: string | null;
  onOuvrirSettings: () => void;
}) {
  const { participants } = useParticipants();
  // contenuIA : version envoyable (sans le nom), voir historiquePourIA.
  type Msg = { role: 'user' | 'assistant'; content: string; contenuIA?: string };
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
      // Pseudonymisation (lot A, 2026-10-27) : ni le nom ni la date de
      // naissance ne partent ; l'identité est réinsérée dans la réponse.
      const identite = selectedPatient ? identiteDe(selectedPatient) : null;
      const prompt = buildAssistantPromptMobile(
        selectedPatient ? versParticipantIA(selectedPatient) : null,
        historiquePourIA(messages, identite),
        masquerIdentiteConnue(trimmed, identite),
      );
      const res = await fetch('/api/claude', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await getAuthHeader()) },
        body: JSON.stringify({ prompt }),
      });
      const data = await res.json();
      const brut: string | undefined = data.text;
      const responseText: string = brut != null ? reinsererIdentite(brut, identite) : (data.error ? `Erreur : ${data.error}` : 'Pas de réponse.');
      setMessages(prev => [...prev, { role: 'assistant', content: responseText, ...(brut != null ? { contenuIA: brut } : {}) }]);
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
        <RappelNomsIA style={{ marginTop: 6 }} />
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

function ModifierBeneficiaireMobile({ participantId, onBack }: { participantId: string; onBack: () => void }) {
  const { participants, loading } = useParticipants();
  const participant: Participant | undefined = participants.find(p => p.id === participantId);
  if (!participant) return <EcranChargement loading={loading} texteIntrouvable="Bénéficiaire introuvable" onBack={onBack} />;
  return <EditPatientMobile participant={participant} onBack={onBack} />;
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
