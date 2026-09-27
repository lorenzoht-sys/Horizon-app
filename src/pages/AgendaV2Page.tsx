import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Calendar, dateFnsLocalizer, Views } from 'react-big-calendar';
import * as DragAndDropAddon from 'react-big-calendar/lib/addons/dragAndDrop';
import type { DragFromOutsideItemArgs, EventInteractionArgs } from 'react-big-calendar/lib/addons/dragAndDrop';
import { format, parse, startOfWeek, getDay } from 'date-fns';
import { fr } from 'date-fns/locale';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import 'react-big-calendar/lib/addons/dragAndDrop/styles.css';
import { toast } from 'sonner';
import { ChevronDown } from 'lucide-react';
import { useAgenda } from '../hooks/useAgenda';
import { useParticipants } from '../hooks/useParticipants';
import { useContrats } from '../hooks/useContrats';
import { useIndispos } from '../hooks/useIndispos';
import { useEvenementsAgenda } from '../hooks/useEvenementsAgenda';
import { useZones } from '../hooks/useZones';
import { useCoursCollectifs } from '../hooks/useCoursCollectifs';
import { resumeAnnonces, libelleCompactAnnonces } from '../lib/coursCollectifs';
import { useStructures } from '../hooks/useStructures';
import { useProgrammesModeles } from '../hooks/useProgrammesModeles';
import { getOrganisation } from '../lib/anamnese';
import BadgeSeancesRestantes from '../components/ui/BadgeSeancesRestantes';
import PageWrapper from '../components/layout/PageWrapper';
import NoteSeanceModal from '../components/journal/NoteSeanceModal';
import ModalNouveauCoursCollectif from '../components/agenda/ModalNouveauCoursCollectif';
import ModalPresenceCoursCollectif from '../components/agenda/ModalPresenceCoursCollectif';
import ModalConfirmerCreation from '../components/agenda/ModalConfirmerCreation';
import ModalChoixSerie from '../components/agenda/ModalChoixSerie';
import ModalEditSeance from '../components/agenda/ModalEditSeance';
import ModalNouvelEvenement from '../components/agenda/ModalNouvelEvenement';
import ModalEvenementAgenda from '../components/agenda/ModalEvenementAgenda';
import ModalCreerSeanceManuelle from '../components/agenda/ModalCreerSeanceManuelle';
import {
  genererDatesSeances, datesManquantes, trouveChevauchement,
  calculerStatutSeancesSemaine, addMinutes,
} from '../utils/horaires';
import {
  calculerFutures, estDeplacementNoop,
  planDeplacerUnique, planDeplacerSerie, planEditerUnique, planEditerSerie,
  planSupprimerUnique, planSupprimerSerie, planActionSurSelection, executerOperations,
  optionsPorteePourAction, type MiseAJourSeance,
} from '../lib/planificationManuelle';
import {
  LABEL_TYPE, LABEL_TYPE_EVENEMENT, getCouleurEvenement, heureToDate, formatDate,
  CLE_JOUR_PAR_DOW, CLE_JOUR_CAPITALISE_PAR_DOW, windowsDispoPourJour,
  type CalEvent, type DropPendant, type ChoixSerie,
} from '../lib/agendaCommun';
import type { Seance, Participant, Indisponibilite, EvenementAgenda, CoursCollectif, StatutCoursCollectif } from '../types';

// ============================================================================
// AGENDA UNIFIÉ — ÉTAPE 2 (création par glisser) + ÉTAPE 3 (déplacement /
// édition / suppression des séances existantes)
// ============================================================================
// Route /agenda-v2, accessible depuis le menu (Sidebar) sous "Agenda" —
// AgendaPage.tsx (l'ancien /agenda) a été retiré, cet écran est désormais le
// seul agenda. PlanningGrilleView.tsx et l'onglet "Agenda bénéficiaire" de
// TourneePage.tsx restent en place tels quels (hors périmètre de ce retrait).
//
// Étape 2 — réutilise telle quelle la logique métier existante :
// genererDatesSeances, datesManquantes, trouveChevauchements, bulkCreerSeances
// (useAgenda, qui branche déjà messageErreurSeance).
//
// Bug corrigé (glisser-déposer réel à la souris impossible, curseur "interdit"
// permanent) : le dragstart de la carte bénéficiaire n'appelait jamais
// e.dataTransfer.setData()/effectAllowed. react-big-calendar (Selection.js)
// appelle bien preventDefault() sur dragover/drop en interne — ce n'était donc
// pas la cause : sans dataTransfer initialisé au dragstart, la session de
// glisser-déposer HTML5 native n'est jamais valide côté navigateur (Chrome et
// surtout Firefox), quel que soit le comportement de la cible. Un test
// automatisé par dispatch direct de DragEvent (sans vraie souris) ne pouvait
// pas détecter ce bug : dispatchEvent contourne entièrement la validation
// native du navigateur. Corrigé en alignant sur le pattern déjà éprouvé de
// PlanningGrilleView.tsx (setData + effectAllowed au dragstart).
//
// Étape 3 — déplacement via onEventDrop (mécanisme interne de
// react-big-calendar basé sur de vrais événements souris, pas sur le
// glisser-déposer HTML5 natif : aucun risque de retomber sur le même bug).
// Réutilise sans modification lib/planificationManuelle.ts + utils/horaires.ts :
// calculerFutures, estDeplacementNoop, planDeplacerUnique, planDeplacerSerie,
// planEditerUnique, planEditerSerie, planSupprimerUnique, planSupprimerSerie,
// executerOperations, trouveChevauchement, messageErreurSeance (déjà branché
// dans modifierSeance/supprimerSeance de useAgenda). Aucun INSERT possible sur
// ce chemin : OperationSeance n'a pas de variante 'create'.
//
// Glisser un bénéficiaire depuis la liste externe reste connu pour ne pas
// fonctionner nativement au toucher sur mobile (cf. étape 0) — non traité ici.
//
// Étape 5 — disponibilités du bénéficiaire sélectionné (vert) + indisponibilités
// de Pierre (hachuré) en fond de grille horaire. L'ancienne grille
// (FrisePlanningJour.tsx) les affichait via des divs positionnées en pixels
// absolus — mécanisme propre à ce rendu custom, non transposable ici.
// Choix retenu : slotPropGetter (react-big-calendar) plutôt que backgroundEvents.
// Les deux existent dans la version installée (^1.19.4), mais backgroundEvents
// crée de vrais "événements" qui passent par le même algorithme de layout en
// colonnes que les séances réelles (DayEventLayout.getStyledEvents) et portent
// leurs propres gestionnaires onClick/onDoubleClick/onKeyPress — risque de
// gêner la largeur d'affichage des vraies séances et l'interaction de
// glisser-déposer. slotPropGetter se contente de renvoyer className/style pour
// les cellules de la grille déjà "vides" (TimeSlotGroup.js), sans ajouter
// aucun élément interactif : zéro risque pour le drag, par construction.
// Appelé une fois par créneau de 15 min (step/timeslots déjà configurés),
// uniquement sur les vues Semaine/Jour (TimeGrid) — la vue Mois n'a pas de
// notion de "slot" horaire et n'appelle pas ce getter, ce qui correspond
// exactement à la recommandation : le détail dispo/indispo n'a pas de sens à
// cette granularité, la vue Mois reste donc simplifiée sans code spécifique.
// Réutilise sans modification windowsDispoPourJour/getOrganisation
// (mode strict déjà validé, commit dbd0471) et useIndispos (déjà utilisé par
// PlanningGrilleView). La sélection d'un bénéficiaire (clic sur sa carte,
// distinct du glisser) est nouvelle sur cet écran — reprend le pattern déjà
// en place dans PlanningGrilleView (patientSelectionneId).
// ============================================================================

// L'import profond 'react-big-calendar/lib/addons/dragAndDrop' est un module
// CommonJS : selon les bundlers, l'interop ESM place la fonction réelle sur
// .default (dev) ou double-imbriquée sur .default.default (build de prod
// observé sur ce projet, esbuild/Rolldown) — on résout les deux cas plutôt
// que de dépendre d'un seul niveau d'interop.
const withDragAndDrop = (() => {
  const ns = DragAndDropAddon as unknown as { default: unknown };
  const candidate = ns.default as { default?: unknown } | undefined;
  if (typeof candidate === 'function') return candidate as typeof DragAndDropAddon.default;
  if (typeof candidate?.default === 'function') return candidate.default as typeof DragAndDropAddon.default;
  throw new Error("Impossible de résoudre l'export par défaut de react-big-calendar/addons/dragAndDrop");
})();

const DnDCalendar = withDragAndDrop<CalEvent>(Calendar);

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: (date: Date) => startOfWeek(date, { weekStartsOn: 1 }),
  getDay,
  locales: { fr },
});


// ── Page principale ────────────────────────────────────────────────────────────

export default function AgendaV2Page() {
  const { seances, bulkCreerSeances, modifierSeance, supprimerSeance, creerSeance, detecterConflits } = useAgenda();
  // `participants` (tous) : recherches par identifiant et cours passés. `participantsActifs` :
  // listes de choix et de recherche — un archivé n'est plus suivi.
  const { participants, participantsActifs } = useParticipants();
  const { contrats, contratActifDeParticipant } = useContrats();
  const { indisposDuJour } = useIndispos();
  const { evenements, creerEvenement, supprimerEvenement } = useEvenementsAgenda();
  // Zones géographiques définies par le praticien dans l'onglet Zones — la
  // zone d'un bénéficiaire est stockée sur la zone elle-même (participantIds),
  // pas sur le participant. zoneDePatient est la fonction déjà écrite dans ce
  // hook pour retrouver la zone d'un bénéficiaire donné, réutilisée telle
  // quelle (aucune logique de zone redupliquée ici).
  const { zones, zoneDePatient } = useZones();
  const {
    coursCollectifs, participations: participationsCoursCollectifs, creerCoursCollectif, modifierStatutCours,
    mettreAJourParticipation, participationsDuCours, recharger: rechargerCoursCollectifs,
  } = useCoursCollectifs();
  const { structures } = useStructures();
  const { modeles: programmesModeles } = useProgrammesModeles();

  const [seanceEditee, setSeanceEditee] = useState<Seance | null>(null);
  const [evenementEdite, setEvenementEdite] = useState<EvenementAgenda | null>(null);
  const [nouvelEvenementOuvert, setNouvelEvenementOuvert] = useState(false);
  const [nouveauCoursCollectifOuvert, setNouveauCoursCollectifOuvert] = useState(false);
  const [coursCollectifSelectionne, setCoursCollectifSelectionne] = useState<CoursCollectif | null>(null);
  // Création manuelle (bouton "Nouvelle séance") — indépendante du glisser-
  // déposer contrat/récurrent : n'importe quel bénéficiaire, avec ou sans
  // contrat actif (bilan initial d'un prospect, séance ponctuelle...).
  const [nouvelleSeanceOuverte, setNouvelleSeanceOuverte] = useState(false);
  const [slotInitialSeance, setSlotInitialSeance] = useState<{ date?: string; heureDebut?: string } | undefined>();
  // Note de séance (journal) — ouverte depuis ModalEditSeance, remplace la
  // modale d'édition (voir onNoteSeance).
  const [noteSeanceOuverte, setNoteSeanceOuverte] = useState<Seance | null>(null);
  const [search, setSearch] = useState('');
  const [beneficiaireGlisse, setBeneficiaireGlisse] = useState<Participant | null>(null);
  const [dropPendant, setDropPendant] = useState<DropPendant | null>(null);
  const [choixSerie, setChoixSerie] = useState<ChoixSerie | null>(null);
  const [choixSerieLoading, setChoixSerieLoading] = useState(false);
  // Bénéficiaire sélectionné par clic (distinct du glisser) — pilote
  // uniquement l'affichage des zones de disponibilité en fond, comme dans
  // PlanningGrilleView.tsx (patientSelectionneId).
  const [participantSelectionneId, setParticipantSelectionneId] = useState<string | null>(null);
  // Filtre par zone (multi-sélection) — aucune case cochée = toutes les
  // zones affichées (comportement par défaut, pas de filtrage).
  const [zonesFiltreIds, setZonesFiltreIds] = useState<Set<string>>(new Set());
  const [zoneDropdownOuvert, setZoneDropdownOuvert] = useState(false);
  const zoneDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!zoneDropdownOuvert) return;
    function handleClickDehors(e: MouseEvent) {
      if (zoneDropdownRef.current && !zoneDropdownRef.current.contains(e.target as Node)) {
        setZoneDropdownOuvert(false);
      }
    }
    document.addEventListener('mousedown', handleClickDehors);
    return () => document.removeEventListener('mousedown', handleClickDehors);
  }, [zoneDropdownOuvert]);

  function toggleZoneFiltre(zoneId: string) {
    setZonesFiltreIds(prev => {
      const next = new Set(prev);
      if (next.has(zoneId)) next.delete(zoneId); else next.add(zoneId);
      return next;
    });
  }

  const participantMap = useMemo(
    () => new Map(participants.map(p => [p.id, p])),
    [participants],
  );

  const participantSelectionne = participantSelectionneId ? participantMap.get(participantSelectionneId) ?? null : null;

  const orgSelectionne = useMemo(
    () => participantSelectionne ? getOrganisation(participantSelectionne) : null,
    [participantSelectionne],
  );

  const patientsFiltres = useMemo(() => {
    const q = search.toLowerCase().trim();
    return [...participantsActifs]
      .filter(p => !q || `${p.prenom} ${p.nom}`.toLowerCase().includes(q))
      .filter(p => zonesFiltreIds.size === 0 || (() => {
        const zone = zoneDePatient(p.id);
        return !!zone && zonesFiltreIds.has(zone.id);
      })())
      .sort((a, b) => a.nom.localeCompare(b.nom));
  }, [participantsActifs, search, zonesFiltreIds, zoneDePatient]);

  const events: CalEvent[] = useMemo(() => {
    const eventsSeances: CalEvent[] = seances.map(s => {
      const p = participantMap.get(s.participantId);
      return {
        id: s.id,
        title: p ? `${p.prenom} ${p.nom}` : LABEL_TYPE[s.type],
        start: heureToDate(s.date, s.heureDebut),
        end: heureToDate(s.date, s.heureFin),
        kind: 'seance',
        resource: s,
      };
    });
    const eventsAgenda: CalEvent[] = evenements.map(e => ({
      id: e.id,
      title: `${LABEL_TYPE_EVENEMENT[e.type]} — ${e.titre}`,
      start: heureToDate(e.date, e.heureDebut),
      end: heureToDate(e.date, e.heureFin),
      kind: 'evenement',
      resource: e,
    }));
    const eventsCoursCollectifs: CalEvent[] = coursCollectifs
      .filter(c => c.statut !== 'annule')
      .map(c => {
        const fin = new Date(heureToDate(c.date, c.heureDebut).getTime() + c.dureeMinutes * 60000);
        const participantsDuCours = participationsCoursCollectifs.filter(p => p.coursId === c.id);
        const nbParticipants = participantsDuCours.length;
        // Cours à venir : où en sont les réponses des bénéficiaires (✓ viennent, ✗ ne viennent pas,
        // ? sans réponse), pour anticiper sans ouvrir chaque cours.
        const annonces = c.statut === 'planifie' ? libelleCompactAnnonces(resumeAnnonces(participantsDuCours)) : '';
        return {
          id: c.id,
          title: `${c.titre} — ${nbParticipants} participant${nbParticipants > 1 ? 's' : ''}${annonces ? ` · ${annonces}` : ''}`,
          start: heureToDate(c.date, c.heureDebut),
          end: fin,
          kind: 'cours_collectif',
          resource: c,
        };
      });
    return [...eventsSeances, ...eventsAgenda, ...eventsCoursCollectifs];
  }, [seances, evenements, coursCollectifs, participationsCoursCollectifs, participantMap]);

  function nomBeneficiaireDe(s: Seance): string {
    const p = participantMap.get(s.participantId);
    return p ? `${p.prenom} ${p.nom}` : LABEL_TYPE[s.type];
  }

  // Affiche le détail d'un conflit détecté par planDeplacerSerie/planEditerSerie
  // (déjà vérifié AVANT toute écriture — voir lib/planificationManuelle).
  function toastConflitSerie(conflits: { date: string; occupePar: string }[]) {
    const detail = conflits
      .map(c => `${formatDate(c.date)} (occupé par ${participantMap.get(c.occupePar)?.prenom ?? 'une autre séance'})`)
      .join(', ');
    toast.error(`Action annulée — conflit sur ${conflits.length} semaine${conflits.length > 1 ? 's' : ''} : ${detail}`);
  }

  // Événement fantôme affiché pendant le survol du calendrier par un
  // bénéficiaire glissé — doit être un vrai objet Seance pour que
  // eventPropGetter/getCouleurEvenement fonctionnent sans cas particulier.
  const dragFromOutsideItem = useCallback((): CalEvent => {
    const contrat = beneficiaireGlisse ? contratActifDeParticipant(beneficiaireGlisse.id) : undefined;
    const duree = contrat?.dureeMinutes ?? 45;
    const debut = new Date();
    const fin = new Date(debut.getTime() + duree * 60000);
    const seanceFantome: Seance = {
      id: 'apercu-externe',
      participantId: beneficiaireGlisse?.id ?? '',
      contratId: contrat?.id,
      date: format(debut, 'yyyy-MM-dd'),
      heureDebut: format(debut, 'HH:mm'),
      heureFin: format(fin, 'HH:mm'),
      dureeMinutes: duree,
      type: 'seance',
      statut: 'planifiee',
      adresse: '',
    };
    return {
      id: 'apercu-externe',
      title: beneficiaireGlisse ? `${beneficiaireGlisse.prenom} ${beneficiaireGlisse.nom}` : '…',
      start: debut,
      end: fin,
      kind: 'seance',
      resource: seanceFantome,
    };
  }, [beneficiaireGlisse, contratActifDeParticipant]);

  // Fond de grille horaire (étape 5) : disponibilités du bénéficiaire
  // sélectionné (teal clair de la charte, #0d9488 à faible opacité — pas le
  // vert générique de FrisePlanningJour.tsx, trop pâle pour être vraiment
  // visible ici) + indisponibilités de Pierre (hachuré, couleurs identiques
  // à l'ancienne grille). Les deux peuvent se superposer (ex : Pierre
  // indisponible sur une plage où le bénéficiaire a déclaré une dispo) :
  // backgroundColor et backgroundImage sont deux propriétés CSS distinctes
  // qui se superposent nativement, reproduisant le même empilement que les
  // deux calques absolus de l'ancienne grille — pas besoin de choisir une
  // priorité entre les deux.
  const slotPropGetter = useCallback((date: Date) => {
    const dow = date.getDay();
    const heure = format(date, 'HH:mm');
    const style: CSSProperties = {};

    // Indisponibilités de Pierre — toujours affichées, indépendamment du
    // bénéficiaire sélectionné.
    const jourIndispo = CLE_JOUR_PAR_DOW[dow] as Indisponibilite['jour'];
    const enIndispo = indisposDuJour(jourIndispo).some(i => heure >= i.heureDebut && heure < i.heureFin);
    if (enIndispo) {
      style.backgroundImage = 'repeating-linear-gradient(45deg,#fee2e2,#fee2e2 3px,#fef2f2 3px,#fef2f2 9px)';
      style.opacity = 0.85;
    }

    // Disponibilités du bénéficiaire sélectionné — mode strict : rien si ce
    // jour n'a pas de créneau réellement saisi (windowsDispoPourJour).
    if (orgSelectionne) {
      const jourDispo = CLE_JOUR_CAPITALISE_PAR_DOW[dow];
      const windows = windowsDispoPourJour(orgSelectionne, jourDispo);
      const enDispo = windows.some(w => heure >= w.debut && heure < w.fin);
      if (enDispo) style.backgroundColor = 'rgba(13, 148, 136, 0.16)'; // #0d9488 (teal charte) à 16% d'opacité
    }

    return Object.keys(style).length > 0 ? { style } : {};
  }, [indisposDuJour, orgSelectionne]);

  // Ne crée rien directement : ouvre la modale de confirmation, comme
  // ModalConfirmDrop dans PlanningGrilleView.tsx. L'aimantation au pas de 15
  // minutes est déjà assurée par les props step={15}/timeslots={4} du
  // calendrier (react-big-calendar snappe nativement la position de drop),
  // pas besoin de rappeler arrondirAuPas ici.
  const onDropFromOutside = useCallback(({ start }: DragFromOutsideItemArgs) => {
    if (!beneficiaireGlisse) return;
    const contrat = contratActifDeParticipant(beneficiaireGlisse.id);
    if (!contrat) {
      toast.error("Ce bénéficiaire n'a pas de contrat actif. Créez d'abord un contrat.");
      setBeneficiaireGlisse(null);
      return;
    }
    setDropPendant({ participant: beneficiaireGlisse, contrat, date: new Date(start) });
    setBeneficiaireGlisse(null);
  }, [beneficiaireGlisse, contratActifDeParticipant]);

  async function handleConfirmerCreation(heureDebut: string, duree: number) {
    if (!dropPendant) return;
    const { participant, contrat, date } = dropPendant;
    const jourKey = CLE_JOUR_PAR_DOW[date.getDay()];
    const dateDebutStr = format(date, 'yyyy-MM-dd');
    const datesGenerees = genererDatesSeances(dateDebutStr, contrat.dateFin, jourKey, contrat.periodicite ?? 'semaine', contrat.dateDebut);
    const dates = datesManquantes(seances, participant.id, contrat.id, datesGenerees);
    if (!dates.length) { toast.error('Aucune séance à créer (déjà planifiées ou aucune date disponible).'); setDropPendant(null); return; }

    const heureFin = addMinutes(heureDebut, duree);
    const adresse = [participant.adresseRue, participant.adresseCodePostal, participant.adresseVille].filter(Boolean).join(', ');

    const data: Omit<Seance, 'id'>[] = dates.map(d => ({
      participantId: participant.id,
      contratId: contrat.id,
      date: d,
      heureDebut,
      heureFin,
      dureeMinutes: duree,
      type: 'seance' as const,
      statut: 'planifiee' as const,
      adresse,
      coordonnees: participant.coordonnees ? { lat: participant.coordonnees.lat, lng: participant.coordonnees.lng } : undefined,
    }));

    // Chevauchement déjà vérifié dans la modale (bloque tant qu'un conflit
    // existe) — ignorerChevauchements évite un double contrôle redondant,
    // pas un contournement. bulkCreerSeances traduit déjà toute erreur
    // Postgres brute via messageErreurSeance (useAgenda.ts).
    await bulkCreerSeances(data, { ignorerChevauchements: true });
    toast.success(`${dates.length} séance${dates.length > 1 ? 's' : ''} planifiée${dates.length > 1 ? 's' : ''} pour ${participant.prenom}`);
    setDropPendant(null);
  }

  // Déplace une séance existante (glisser un événement du calendrier) — passe
  // par de vrais événements souris internes à react-big-calendar (Selection),
  // pas par le glisser-déposer HTML5 natif : le bug de dataTransfer (voir
  // commentaire d'en-tête) ne s'applique pas à ce chemin. Si le créneau a
  // d'autres occurrences futures (calculerFutures), demande la portée avant
  // d'appliquer quoi que ce soit — jamais de choix par défaut sur un
  // déplacement de masse. executerOperations n'accepte pas de fonction de
  // création : un INSERT est structurellement impossible ici.
  async function handleEventDrop({ event, start }: EventInteractionArgs<CalEvent>) {
    // Les événements d'agenda ne sont pas glissables (draggableAccessor plus
    // bas) — ce garde-fou est une ceinture de sécurité, jamais censé se
    // déclencher.
    if (event.kind !== 'seance') return;
    const s = event.resource;
    const nouvelleDateObj = new Date(start);
    const nouvelleDate = format(nouvelleDateObj, 'yyyy-MM-dd');
    const heureDebut = format(nouvelleDateObj, 'HH:mm');
    const heureFin = addMinutes(heureDebut, s.dureeMinutes);
    if (estDeplacementNoop(s, nouvelleDate, heureDebut, heureFin)) return;

    const jourLabel = nouvelleDateObj.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'short' });
    const futures = calculerFutures(seances, s);

    // Contrairement à FrisePlanningJour (grille jour-de-semaine), rien ne
    // bloque encore le dépôt avant ce point sur un calendrier daté — le
    // conflit est donc vérifié ici, avant toute écriture.
    const deplacerUnique = async () => {
      const conflit = trouveChevauchement(seances, { date: nouvelleDate, heureDebut, heureFin }, s.id);
      if (conflit) {
        const nom = participantMap.get(conflit.participantId);
        toast.error(`Créneau déjà occupé par ${nom ? `${nom.prenom} ${nom.nom[0]}.` : 'une autre séance'} (${conflit.heureDebut}–${conflit.heureFin}) — déplacement annulé.`);
        return;
      }
      await executerOperations([planDeplacerUnique(s, nouvelleDate, heureDebut, heureFin)], modifierSeance, supprimerSeance);
      toast.success(`Séance déplacée au ${jourLabel} ${heureDebut}`);
    };

    if (futures.length <= 1) {
      await deplacerUnique();
      return;
    }

    const dowCible = nouvelleDateObj.getDay();
    setChoixSerie({
      titre: `Déplacer au ${jourLabel} ${heureDebut}`,
      futures,
      seanceRefId: s.id,
      optionsDisponibles: optionsPorteePourAction({ type: 'deplacer', dowCible, heureDebut }),
      onUnique: deplacerUnique,
      onSerie: async () => {
        const plan = planDeplacerSerie(seances, futures, dowCible, heureDebut);
        if (!plan.ok) { toastConflitSerie(plan.conflits); return; }
        const nb = await executerOperations(plan.operations, modifierSeance, supprimerSeance);
        toast.success(`${nb} séances déplacées au ${jourLabel} ${heureDebut}`);
      },
      onSelection: async (ids) => {
        const plan = planActionSurSelection(seances, ids, { type: 'deplacer', dowCible, heureDebut });
        if (!plan.ok) { toastConflitSerie(plan.conflits); return; }
        const nb = await executerOperations(plan.operations, modifierSeance, supprimerSeance);
        toast.success(`${nb} séance${nb > 1 ? 's' : ''} déplacée${nb > 1 ? 's' : ''} au ${jourLabel} ${heureDebut}`);
      },
    });
  }

  // Enregistre les modifications saisies dans ModalEditSeance — même logique
  // de portée que le déplacement.
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
      // Annuler "et toutes les suivantes" a causé l'incident Pierre
      // Poindessault (14 séances annulées d'un coup pour 2 voulues) :
      // optionsPorteePourAction retire 'serie' pour ce cas précis (voir
      // planificationManuelle.ts) — inchangé pour les autres statuts.
      optionsDisponibles: optionsPorteePourAction({ type: 'editer', dowCible, updates }),
      onUnique: enregistrerUnique,
      onSerie: async () => {
        const plan = planEditerSerie(seances, futures, dowCible, updates);
        if (!plan.ok) { toastConflitSerie(plan.conflits); return; }
        const nb = await executerOperations(plan.operations, modifierSeance, supprimerSeance);
        toast.success(`${nb} séances modifiées`);
      },
      onSelection: async (ids) => {
        const plan = planActionSurSelection(seances, ids, { type: 'editer', dowCible, updates });
        if (!plan.ok) { toastConflitSerie(plan.conflits); return; }
        const nb = await executerOperations(plan.operations, modifierSeance, supprimerSeance);
        toast.success(`${nb} séance${nb > 1 ? 's' : ''} modifiée${nb > 1 ? 's' : ''}`);
      },
    });
  }

  // Raccourci "↩ Restaurer" (bouton dédié dans ModalEditSeance, séance déjà
  // annulée) — toujours "cette séance uniquement", jamais de choix série :
  // pas besoin de calculerFutures/choixSerie ici, donc structurellement
  // insensible au bug corrigé dans trouverSerieRecurrente.
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

  // Supprime une séance — même logique de portée. « Toutes les suivantes »
  // ne touche jamais l'historique (date < celle de l'occurrence supprimée).
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

  // Reporter une séance — toujours "cette occurrence seule", jamais de choix
  // série (voir le commentaire sur ModalEditSeance.onReporter). Reproduit
  // exactement confirmerReport (AgendaPage.tsx, ancien /agenda) : la séance
  // d'origine passe en statut "reportee" sans changer de date/heure (garde
  // une trace historique fidèle), et une nouvelle séance "planifiee" est
  // créée à la date choisie, avec une note explicite sur son origine.
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
      notes: `Reportée depuis le ${formatDate(seance.date)}`,
      adresse: seance.adresse,
      coordonnees: seance.coordonnees ?? (participant?.coordonnees ? { lat: participant.coordonnees.lat, lng: participant.coordonnees.lng } : undefined),
    });
    toast.success(`Séance reportée au ${formatDate(nouvelleDate)}`);
  }

  return (
    <PageWrapper>
      <div className="mb-4">
        <h1 className="font-heading font-bold text-2xl text-dark">Agenda</h1>
        <p className="text-xs text-gray-400 mt-0.5">
          Création par glisser-déposer, déplacement, édition et suppression des séances, disponibilités/indisponibilités en fond, filtre par zone. Vraies dates, vraies données.
        </p>
      </div>

      <div className="flex gap-4">
        {/* Colonne bénéficiaires — équivalent de la colonne de PlanningGrilleView.tsx
            (non exportée séparément là-bas, donc réécrite ici avec la même logique :
            recherche, contrat actif, BadgeSeancesRestantes). */}
        <div className="w-60 flex-shrink-0 flex flex-col gap-3">
          <input
            type="text" placeholder="Rechercher un bénéficiaire…" value={search}
            onChange={e => setSearch(e.target.value)}
            className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary" />

          {/* Filtre par zone — multi-sélection, zones telles que définies par
              le praticien dans l'onglet Zones (useZones), pas de liste figée.
              Aucune case cochée = toutes les zones (comportement par défaut). */}
          <div className="relative" ref={zoneDropdownRef}>
            <button
              type="button"
              onClick={() => setZoneDropdownOuvert(o => !o)}
              className="w-full flex items-center justify-between gap-2 border border-gray-200 rounded-xl px-3 py-2 text-sm text-left hover:border-primary/40 transition-colors focus:outline-none focus:border-primary"
            >
              <span className="truncate text-gray-700">
                {zonesFiltreIds.size === 0
                  ? 'Toutes les zones'
                  : `${zonesFiltreIds.size} zone${zonesFiltreIds.size > 1 ? 's' : ''} sélectionnée${zonesFiltreIds.size > 1 ? 's' : ''}`}
              </span>
              <ChevronDown size={14} className={`flex-shrink-0 text-gray-400 transition-transform ${zoneDropdownOuvert ? 'rotate-180' : ''}`} />
            </button>
            {zoneDropdownOuvert && (
              <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg p-2 space-y-0.5 max-h-56 overflow-y-auto">
                {zones.length === 0 ? (
                  <p className="text-xs text-gray-400 px-2 py-1.5">Aucune zone définie (onglet Zones).</p>
                ) : zones.map(z => (
                  <label key={z.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 cursor-pointer text-sm">
                    <input
                      type="checkbox"
                      checked={zonesFiltreIds.has(z.id)}
                      onChange={() => toggleZoneFiltre(z.id)}
                      className="w-3.5 h-3.5 accent-primary flex-shrink-0"
                    />
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: z.couleur }} />
                    <span className="flex-1 truncate text-dark">{z.nom}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <p className="text-[11px] text-gray-400 px-1">
            Glissez un bénéficiaire sur le calendrier pour planifier une séance. Cliquez sur sa fiche pour voir ses disponibilités en fond.
          </p>
          <div className="space-y-1.5 overflow-y-auto" style={{ maxHeight: 600 }}>
            {patientsFiltres.map(p => {
              const contratActifP = contratActifDeParticipant(p.id) ?? null;
              const aContrat = contratActifP !== null;
              const statutSeances = calculerStatutSeancesSemaine(contratActifP, seances);
              const selectionne = participantSelectionneId === p.id;
              return (
                <div key={p.id}
                  draggable={aContrat}
                  onDragStart={e => {
                    // Requis pour que le glisser-déposer HTML5 natif soit
                    // valide côté navigateur (voir commentaire d'en-tête) —
                    // sans setData/effectAllowed, le dépôt échoue toujours,
                    // même si la cible gère bien dragover/preventDefault.
                    e.dataTransfer.effectAllowed = 'copy';
                    e.dataTransfer.setData('text/plain', `${p.prenom} ${p.nom}`);
                    setBeneficiaireGlisse(p);
                  }}
                  onDragEnd={() => setBeneficiaireGlisse(null)}
                  onClick={() => setParticipantSelectionneId(selectionne ? null : p.id)}
                  className={`rounded-xl px-3 py-2.5 border transition-colors select-none ${
                    aContrat ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'
                  } ${
                    selectionne ? 'border-primary bg-primary/5' : 'border-gray-200 bg-white hover:border-primary/40 hover:bg-gray-50'
                  } ${aContrat ? '' : 'opacity-60'}`}>
                  <p className="text-sm font-medium text-dark truncate">{p.prenom} {p.nom}</p>
                  <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                    <p className={`text-xs ${aContrat ? 'text-green-600' : 'text-gray-400'}`}>
                      {aContrat ? 'Contrat actif' : 'Sans contrat'}
                    </p>
                    <BadgeSeancesRestantes statut={statutSeances} />
                  </div>
                </div>
              );
            })}
            {patientsFiltres.length === 0 && (
              <p className="text-xs text-gray-400 text-center py-4">Aucun bénéficiaire trouvé</p>
            )}
          </div>
        </div>

        {/* Calendrier */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-3">
            {/* Légende couleurs — identique à AgendaPage.tsx */}
            <div className="flex flex-wrap gap-3 text-xs text-gray-500">
              {[
                { couleur: '#1A5F9E', label: "Aujourd'hui" },
                { couleur: '#5B9BD5', label: 'Planifiée' },
                { couleur: '#3B6D11', label: 'Réalisée' },
                { couleur: '#EF4444', label: 'Annulée' },
                { couleur: '#8B5CF6', label: 'Bilan' },
              ].map(({ couleur, label }) => (
                <div key={label} className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: couleur }} />
                  {label}
                </div>
              ))}
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: 'rgba(13, 148, 136, 0.16)', border: '1px solid rgba(13, 148, 136, 0.4)' }} />
                Dispo bénéficiaire sélectionné
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ background: 'repeating-linear-gradient(45deg,#fee2e2,#fee2e2 3px,#fef2f2 3px,#fef2f2 9px)' }} />
                Mes indisponibilités
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: '#0d9488' }} />
                Séance du bénéficiaire sélectionné
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: '#6B7280', border: '1px dashed rgba(0,0,0,0.45)' }} />
                Événement d'agenda — couleur libre, bordure en tirets (ni une séance ni un vrai bénéficiaire)
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: '#DB2777' }} />
                Cours collectif
              </div>
            </div>

            <div className="flex-shrink-0 flex gap-2">
              <button
                type="button"
                onClick={() => { setSlotInitialSeance(undefined); setNouvelleSeanceOuverte(true); }}
                className="bg-primary text-white text-xs font-semibold rounded-xl px-3 py-2 hover:bg-dark transition-colors"
              >
                + Nouvelle séance
              </button>
              <button
                type="button"
                onClick={() => setNouveauCoursCollectifOuvert(true)}
                className="text-white text-xs font-semibold rounded-xl px-3 py-2 hover:opacity-90 transition-opacity"
                style={{ backgroundColor: '#DB2777' }}
              >
                + Nouveau cours collectif
              </button>
              <button
                type="button"
                onClick={() => setNouvelEvenementOuvert(true)}
                className="bg-dark text-white text-xs font-semibold rounded-xl px-3 py-2 hover:opacity-90 transition-opacity"
              >
                + Ajouter un événement
              </button>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm" style={{ height: 660 }}>
            <DnDCalendar
              localizer={localizer}
              events={events}
              defaultView={Views.WEEK}
              views={[Views.MONTH, Views.WEEK, Views.DAY]}
              culture="fr"
              messages={{
                next: 'Suivant', previous: 'Précédent', today: "Aujourd'hui",
                month: 'Mois', week: 'Semaine', day: 'Jour',
                showMore: (n: number) => `+${n} de plus`,
              }}
              eventPropGetter={(event: CalEvent) => {
                // Événements d'agenda : couleur choisie librement par Pierre
                // (evenement.couleur), mais bordure en tirets systématique —
                // quelle que soit la couleur retenue, ce trait distinctif
                // suffit à ne jamais confondre le bloc avec une vraie séance
                // patient (bordure pleine) au premier coup d'œil.
                if (event.kind === 'evenement') {
                  return {
                    style: {
                      backgroundColor: event.resource.couleur,
                      border: '1px dashed rgba(0,0,0,0.45)',
                      borderRadius: 6,
                      color: 'white',
                      fontSize: 12,
                    },
                  };
                }
                // Cours collectif : couleur dédiée (magenta), jamais utilisée
                // ailleurs dans ce calendrier — distinct au premier coup
                // d'œil d'une séance individuelle ou d'un événement d'agenda
                // (dont la couleur est libre mais toujours en tirets).
                if (event.kind === 'cours_collectif') {
                  return {
                    style: {
                      backgroundColor: '#DB2777',
                      opacity: event.resource.statut === 'realise' ? 1 : 0.85,
                      borderRadius: 6,
                      border: 'none',
                      color: 'white',
                      fontSize: 12,
                      fontWeight: 600,
                    },
                  };
                }
                // Séances déjà existantes du bénéficiaire sélectionné :
                // remplacent la couleur habituelle par statut par un vert
                // (teal #0d9488) — choix assumé, repérer où est ce
                // bénéficiaire prime sur le statut visuel ici. Distinct du
                // fond de disponibilité (même teal, mais à 16% d'opacité sur
                // les créneaux vides — voir slotPropGetter) grâce à
                // l'opacité pleine par défaut. Une séance annulée reste
                // néanmoins visuellement distincte (opacité réduite, voir
                // plus bas) même pour ce bénéficiaire — sinon une annulation
                // devient indiscernable d'une séance planifiée tant que sa
                // fiche reste sélectionnée (source de confusion constatée).
                // Uniquement du style, aucun élément ajouté : même prudence
                // que slotPropGetter, zéro risque pour le glisser-déposer.
                const estDuBeneficiaireSelectionne = participantSelectionne && event.resource.participantId === participantSelectionne.id;
                return {
                  style: {
                    backgroundColor: estDuBeneficiaireSelectionne ? '#0d9488' : getCouleurEvenement(event.resource),
                    // L'opacité réduite d'une séance annulée s'applique
                    // maintenant aussi au bénéficiaire sélectionné : avant ce
                    // correctif, une séance annulée de ce bénéficiaire restait
                    // teal plein, indiscernable d'une séance planifiée — ce
                    // qui a fait croire à une annulation "qui ne prend pas"
                    // alors que la donnée changeait bien en base.
                    opacity: event.resource.statut === 'annulee' ? 0.5 : 1,
                    borderRadius: 6,
                    border: 'none',
                    color: 'white',
                    fontSize: 12,
                  },
                };
              }}
              onSelectEvent={(event: CalEvent) => {
                if (event.kind === 'evenement') { setEvenementEdite(event.resource); return; }
                if (event.kind === 'cours_collectif') {
                  // Les bénéficiaires répondent depuis leur espace, pendant que l'agenda est ouvert :
                  // on relit avant d'ouvrir le cours pour ne pas montrer des réponses périmées.
                  void rechargerCoursCollectifs();
                  setCoursCollectifSelectionne(event.resource);
                  return;
                }
                setSeanceEditee(event.resource);
              }}
              onDropFromOutside={onDropFromOutside}
              dragFromOutsideItem={dragFromOutsideItem}
              onEventDrop={handleEventDrop}
              draggableAccessor={(event: CalEvent) => event.kind === 'seance'}
              resizable={false}
              // Clic (ou clic-glisser) sur un créneau vide → création manuelle
              // (bouton "Nouvelle séance"), avec date/heure pré-remplies —
              // équivalent de handleSelectSlot dans l'ancien /agenda. Chemin
              // indépendant du glisser-déposer externe (onDropFromOutside),
              // qui reste réservé aux bénéficiaires sous contrat actif.
              selectable
              onSelectSlot={(slotInfo: { start: Date }) => {
                setSlotInitialSeance({ date: format(slotInfo.start, 'yyyy-MM-dd'), heureDebut: format(slotInfo.start, 'HH:mm') });
                setNouvelleSeanceOuverte(true);
              }}
              slotPropGetter={slotPropGetter}
              step={15}
              timeslots={4}
              min={new Date(0, 0, 0, 7, 0)}
              max={new Date(0, 0, 0, 21, 0)}
              formats={{
                dayHeaderFormat: (date: Date) => date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }),
              }}
              popup
            />
          </div>
        </div>
      </div>

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

      {nouvelleSeanceOuverte && (
        <ModalCreerSeanceManuelle
          participants={participantsActifs}
          detecterConflits={detecterConflits}
          initial={slotInitialSeance}
          onCreer={async data => { await creerSeance(data); }}
          onClose={() => setNouvelleSeanceOuverte(false)}
        />
      )}

      {nouvelEvenementOuvert && (
        <ModalNouvelEvenement
          onCreer={async data => {
            await creerEvenement(data);
            toast.success('Événement ajouté à l\'agenda');
            setNouvelEvenementOuvert(false);
          }}
          onCancel={() => setNouvelEvenementOuvert(false)}
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

      {nouveauCoursCollectifOuvert && (
        <ModalNouveauCoursCollectif
          participants={participantsActifs}
          structures={structures}
          programmesModeles={programmesModeles}
          onCreer={async data => {
            const cours = await creerCoursCollectif(data);
            if (cours) toast.success('Cours collectif créé');
            return !!cours;
          }}
          onClose={() => setNouveauCoursCollectifOuvert(false)}
        />
      )}

      {coursCollectifSelectionne && (
        <ModalPresenceCoursCollectif
          cours={coursCollectifSelectionne}
          participations={participationsDuCours(coursCollectifSelectionne.id)}
          participants={participants}
          programmeNom={programmesModeles.find(m => m.id === coursCollectifSelectionne.programmeCommunId)?.nom}
          onMettreAJourParticipation={(participationId, patch) => mettreAJourParticipation(participationId, patch)}
          onModifierStatutCours={async (statut: StatutCoursCollectif) => {
            const ok = await modifierStatutCours(coursCollectifSelectionne.id, statut);
            if (ok) {
              setCoursCollectifSelectionne(prev => prev ? { ...prev, statut } : prev);
              toast.success('Statut du cours mis à jour');
            }
            return ok;
          }}
          onClose={() => setCoursCollectifSelectionne(null)}
        />
      )}

      {dropPendant && (
        <ModalConfirmerCreation
          info={dropPendant}
          seances={seances}
          participantMap={participantMap}
          onConfirm={handleConfirmerCreation}
          onCancel={() => setDropPendant(null)}
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
    </PageWrapper>
  );
}
