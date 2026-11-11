import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { format, addDays, addMonths, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth, isSameDay } from 'date-fns';
import { toast } from 'sonner';
import { useParticipants } from '../../../hooks/useParticipants';
import { useAgenda } from '../../../hooks/useAgenda';
import { useContrats } from '../../../hooks/useContrats';
import { useCoursCollectifs } from '../../../hooks/useCoursCollectifs';
import { useIndispos } from '../../../hooks/useIndispos';
import { useEvenementsAgenda } from '../../../hooks/useEvenementsAgenda';
import { useCategoriesSeance } from '../../../hooks/useCategoriesSeance';
import ModalCategoriesSeance from '../../../components/agenda/ModalCategoriesSeance';
import ModalPresenceCoursCollectif from '../../../components/agenda/ModalPresenceCoursCollectif';
import ModalCreerSeanceManuelle from '../../../components/agenda/ModalCreerSeanceManuelle';
import ModalEditSeance from '../../../components/agenda/ModalEditSeance';
import ModalChoixSerie from '../../../components/agenda/ModalChoixSerie';
import ModalEvenementAgenda from '../../../components/agenda/ModalEvenementAgenda';
import NoteSeanceModal from '../../../components/journal/NoteSeanceModal';
import type { CoursCollectif, Participant, Seance, EvenementAgenda, CategorieSeance } from '../../../types';
import { calculerFutures, planEditerUnique, planEditerSerie, planSupprimerUnique, planSupprimerSerie, planActionSurSelection, avecInfosDeLaReference, executerOperations, optionsPorteePourAction, type MiseAJourSeance } from '../../../lib/planificationManuelle';
import { CLE_JOUR_PAR_DOW, LABEL_TYPE_EVENEMENT, formatDate as formatDateAgenda, absenceSignaleeAffichable, couleurCategorieDe, LABEL_TYPE, type ChoixSerie } from '../../../lib/agendaCommun';
import { URLS_MOBILE } from '../../../lib/routesMobile';
import { C, card, formatDateLong } from './communs';

export function formatMoisAnnee(d: Date) {
  return d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
}

// Carte d'une séance dans l'agenda mobile (vue Jour et listes À venir / Passées). Le bandeau de gauche
// porte la couleur de la catégorie choisie par le praticien (gris sans catégorie) : on lit le planning
// d'un coup d'œil sans ouvrir chaque séance. Les actions rapides évitent la modale pour le quotidien :
// valider une séance réalisée, ouvrir la fiche, ouvrir le bilan lié.
export function CarteSeanceAgenda({ seance, participant, categorie, avecDate, onOuvrir, onValider, onFiche, onBilan }: {
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

export type ItemJour =
  | { kind: 'seance'; heureDebut: string; seance: Seance }
  | { kind: 'cours'; heureDebut: string; cours: CoursCollectif; nbInscrits: number }
  | { kind: 'evenement'; heureDebut: string; evenement: EvenementAgenda };

// `dateInitiale` (AAAA-MM-JJ, déjà validée par ecranMobileDepuisUrl) : jour
// affiché à l'ouverture — lien /agenda?date=… de la notification push
// « absence signalée ». Absente : aujourd'hui, comme avant.
export function EcranAgenda({ dateInitiale }: { dateInitiale: string | null }) {
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
