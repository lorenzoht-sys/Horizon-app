import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Calendar, dateFnsLocalizer, Views } from 'react-big-calendar';
import * as DragAndDropAddon from 'react-big-calendar/lib/addons/dragAndDrop';
import type { DragFromOutsideItemArgs, EventInteractionArgs } from 'react-big-calendar/lib/addons/dragAndDrop';
import { format, parse, startOfWeek, getDay } from 'date-fns';
import { fr } from 'date-fns/locale';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import 'react-big-calendar/lib/addons/dragAndDrop/styles.css';
import { toast } from 'sonner';
import { X, Loader, Trash2, ChevronDown, ListChecks, ArrowLeft, Undo2 } from 'lucide-react';
import { useAgenda } from '../hooks/useAgenda';
import { useParticipants } from '../hooks/useParticipants';
import { useContrats } from '../hooks/useContrats';
import { useIndispos } from '../hooks/useIndispos';
import { useEvenementsAgenda } from '../hooks/useEvenementsAgenda';
import { useZones } from '../hooks/useZones';
import { getOrganisation } from '../lib/anamnese';
import BadgeSeancesRestantes from '../components/ui/BadgeSeancesRestantes';
import PageWrapper from '../components/layout/PageWrapper';
import {
  genererDatesSeances, datesManquantes, trouveChevauchements, trouveChevauchement,
  calculerStatutSeancesSemaine, addMinutes,
} from '../utils/horaires';
import {
  calculerFutures, estDeplacementNoop,
  planDeplacerUnique, planDeplacerSerie, planEditerUnique, planEditerSerie,
  planSupprimerUnique, planSupprimerSerie, planActionSurSelection, executerOperations,
  optionsPorteePourAction, type MiseAJourSeance, type OptionPortee,
} from '../lib/planificationManuelle';
import type { Seance, StatutSeance, TypeSeance, Participant, Contrat, IndisponibilitePierre, OrganisationData, RaisonAnnulation, EvenementAgenda, TypeEvenementAgenda } from '../types';

// ============================================================================
// AGENDA UNIFIÉ — ÉTAPE 2 (création par glisser) + ÉTAPE 3 (déplacement /
// édition / suppression des séances existantes)
// ============================================================================
// Route /agenda-v2, accessible depuis le menu (Sidebar) sous "Agenda (bêta)"
// — en parallèle de l'agenda habituel, pas en remplacement (étape 6 :
// bascule finale et retrait des anciens écrans, après période d'usage réel).
// PlanningGrilleView / AgendaPage / TourneePage ne sont PAS modifiés.
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

const TODAY = new Date().toISOString().slice(0, 10);

const LABEL_TYPE: Record<TypeSeance, string> = {
  seance: 'Séance',
  bilan: 'Bilan',
  bilan_initial: 'Bilan initial',
};

const LABEL_STATUT: Record<StatutSeance, string> = {
  planifiee: 'Planifiée', realisee: 'Réalisée', reportee: 'Reportée', annulee: 'Annulée',
};

// Raisons prédéfinies pour une annulation — donnée interne au praticien,
// jamais exposée à l'espace bénéficiaire (voir api/patient/me.ts).
const OPTIONS_RAISON_ANNULATION: RaisonAnnulation[] = [
  'maladie', 'vacances', 'rdv_medical', 'indisponibilite_personnelle',
  'transport', 'meteo', 'hospitalisation', 'autre',
];

const LABEL_RAISON_ANNULATION: Record<RaisonAnnulation, string> = {
  maladie: 'Maladie',
  vacances: 'Vacances / congés',
  rdv_medical: 'Rendez-vous médical',
  indisponibilite_personnelle: 'Indisponibilité personnelle',
  transport: 'Problème de transport',
  meteo: 'Météo / conditions extérieures',
  hospitalisation: 'Hospitalisation',
  autre: 'Autre',
};

// Reproduit exactement getCouleurEvenement de AgendaPage.tsx.
function getCouleurEvenement(seance: Seance): string {
  if (seance.statut === 'annulee') return '#EF4444';
  if (seance.statut === 'reportee') return '#F59E0B';
  if (seance.statut === 'realisee') return '#3B6D11';
  if (seance.type === 'bilan' || seance.type === 'bilan_initial') return '#8B5CF6';
  return seance.date === TODAY ? '#1A5F9E' : '#5B9BD5';
}

// Événements d'agenda (indisponibilité ponctuelle, réunion, premier contact
// prospect) — couleurs volontairement grises/neutres, jamais dans la palette
// des séances (bleu/violet/vert/rouge ci-dessus), pour qu'un coup d'œil
// suffise à ne jamais les confondre avec une vraie séance patient.
const OPTIONS_TYPE_EVENEMENT: TypeEvenementAgenda[] = [
  'indisponibilite', 'reunion_professionnelle', 'premier_contact_prospect',
];

const LABEL_TYPE_EVENEMENT: Record<TypeEvenementAgenda, string> = {
  indisponibilite: 'Indisponibilité',
  reunion_professionnelle: 'Réunion professionnelle',
  premier_contact_prospect: 'Premier contact (prospect)',
};

function heureToDate(date: string, heure: string): Date {
  const [h, m] = heure.split(':').map(Number);
  const d = new Date(date);
  d.setHours(h, m, 0, 0);
  return d;
}

function formatDate(d: string): string {
  return new Date(d + 'T12:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}

// Jour de semaine JS (Date.getDay(), 0=dim) → clé attendue par
// genererDatesSeances. Équivalent local de CLE_JOUR_PAR_DOW (PlanningGrilleView.tsx,
// non exporté).
const CLE_JOUR_PAR_DOW: Record<number, string> = { 0: 'dim', 1: 'lun', 2: 'mar', 3: 'mer', 4: 'jeu', 5: 'ven', 6: 'sam' };

// Même Date.getDay() → clé, mais capitalisée : c'est la casse utilisée par
// OrganisationData.joursDisponibles/creneauxParJour (voir
// OPTIONS_JOURS_DISPONIBLES dans ParticipantForm.tsx et JOURS_ORDRES dans
// PlanningGrilleView.tsx), différente de CLE_JOUR_PAR_DOW ci-dessus qui sert
// un autre appelant (genererDatesSeances). Deux conventions de casse
// préexistantes dans le code, pas une invention de cette étape.
const CLE_JOUR_CAPITALISE_PAR_DOW: Record<number, string> = { 0: 'Dim', 1: 'Lun', 2: 'Mar', 3: 'Mer', 4: 'Jeu', 5: 'Ven', 6: 'Sam' };

// Fenêtres de disponibilité réellement renseignées pour un jour donné — copie
// exacte de la fonction non exportée du même nom dans PlanningGrilleView.tsx.
// Mode strict : un jour n'est disponible que s'il est à la fois coché dans
// joursDisponibles ET pourvu de créneaux dans creneauxParJour — aucune plage
// par défaut n'est inventée quand la donnée est absente (voir commit
// dbd0471, "affichage strict des dispos bénéficiaires").
function windowsDispoPourJour(
  org: OrganisationData | null,
  cleJour: string,
): { debut: string; fin: string }[] {
  if (!org) return [];
  if (!org.joursDisponibles?.includes(cleJour)) return [];
  return org.creneauxParJour?.[cleJour] ?? [];
}

// kind distingue une vraie séance patient d'un événement d'agenda (réunion,
// indisponibilité ponctuelle, premier contact prospect) — les deux partagent
// le même tableau `events` du calendrier, mais jamais le même style ni le
// même comportement (un événement n'est ni glissable ni éditable comme une
// séance, voir draggableAccessor et onSelectEvent plus bas).
type CalEvent =
  | { id: string; title: string; start: Date; end: Date; kind: 'seance'; resource: Seance }
  | { id: string; title: string; start: Date; end: Date; kind: 'evenement'; resource: EvenementAgenda };

// ── Confirmation de création (équivalent de ModalConfirmDrop, non exporté
//    depuis PlanningGrilleView.tsx — nouvelle implémentation, même logique
//    d'appel : genererDatesSeances, datesManquantes, trouveChevauchements) ──

interface DropPendant {
  participant: Participant;
  contrat: Contrat;
  date: Date; // vraie date déposée
}

function ModalConfirmerCreation({ info, seances, participantMap, onConfirm, onCancel }: {
  info: DropPendant;
  seances: Seance[];
  participantMap: Map<string, Participant>;
  onConfirm: (heureDebut: string, duree: number) => Promise<void>;
  onCancel: () => void;
}) {
  const { participant, contrat, date } = info;
  const [heureDebut, setHeureDebut] = useState(format(date, 'HH:mm'));
  const [duree, setDuree] = useState(contrat.dureeMinutes);
  const [loading, setLoading] = useState(false);

  const heureFin = addMinutes(heureDebut, duree);
  const jourKey = CLE_JOUR_PAR_DOW[date.getDay()];
  const dateDebutStr = format(date, 'yyyy-MM-dd');

  // Même génération que creerDatesRecurrentes (PlanningGrilleView.tsx), mais
  // ancrée sur la vraie date déposée plutôt que sur "aujourd'hui" — un
  // agenda daté connaît la date exacte visée, pas seulement "le jeudi".
  const datesGenerees = useMemo(
    () => genererDatesSeances(dateDebutStr, contrat.dateFin, jourKey, contrat.periodicite ?? 'semaine', contrat.dateDebut),
    [dateDebutStr, contrat, jourKey],
  );
  const dates = useMemo(
    () => datesManquantes(seances, participant.id, contrat.id, datesGenerees),
    [seances, participant.id, contrat.id, datesGenerees],
  );

  const conflits = useMemo(
    () => trouveChevauchements(seances, dates.map(d => ({ date: d, heureDebut, heureFin }))),
    [seances, dates, heureDebut, heureFin],
  );

  async function handleConfirmer() {
    if (conflits.length > 0 || dates.length === 0) return;
    setLoading(true);
    try {
      await onConfirm(heureDebut, duree);
    } catch {
      // Déjà signalé par un toast (message humain, voir messageErreurSeance
      // dans useAgenda) — on absorbe juste l'exception pour ne pas la
      // laisser remonter en rejet non géré ; la modale reste ouverte.
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4" style={{ zIndex: 1010 }}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100">
          <h3 className="text-base font-bold text-dark">Planifier la séance</h3>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600 p-1"><X size={16} /></button>
        </div>

        <div className="px-6 py-4 space-y-4">
          <div className="bg-gray-50 rounded-xl px-4 py-3">
            <p className="text-xs text-gray-500 mb-0.5">Bénéficiaire</p>
            <p className="text-sm font-semibold text-dark">{participant.prenom} {participant.nom}</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-gray-50 rounded-xl px-4 py-3">
              <p className="text-xs text-gray-500 mb-0.5">Jour (chaque semaine)</p>
              <p className="text-sm font-semibold text-dark">
                {date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'short' })}
              </p>
            </div>
            <div className="bg-gray-50 rounded-xl px-4 py-3">
              <label className="block text-xs text-gray-500 mb-0.5">Heure de début</label>
              <input type="time" step={60} value={heureDebut} onChange={e => setHeureDebut(e.target.value)}
                className="w-full bg-transparent text-sm font-semibold text-dark focus:outline-none" />
              <p className="text-xs text-gray-400 mt-0.5">→ fin {heureFin}</p>
            </div>
          </div>

          {contrat.dureesSeances.length > 1 ? (
            <div>
              <label className="block text-xs text-gray-500 mb-1">Durée de la séance</label>
              <select value={duree} onChange={e => setDuree(Number(e.target.value))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary">
                {contrat.dureesSeances.map(d => <option key={d} value={d}>{d} min</option>)}
              </select>
            </div>
          ) : (
            <p className="text-xs text-gray-500">Durée : <span className="font-medium text-dark">{duree} min</span></p>
          )}

          {dates.length > 0 ? (
            <div className="bg-primary/5 border border-primary/20 rounded-xl px-4 py-3">
              <p className="text-xs text-gray-600">
                <span className="font-semibold text-primary">{dates.length} séance{dates.length > 1 ? 's' : ''}</span>
                {' '}à créer sur la durée du contrat
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                {formatDate(dates[0])} → {formatDate(dates[dates.length - 1])}
              </p>
              {datesGenerees.length > dates.length && (
                <p className="text-xs text-gray-400 mt-0.5">
                  ({datesGenerees.length - dates.length} déjà existante{datesGenerees.length - dates.length > 1 ? 's' : ''} pour ce contrat, ignorée{datesGenerees.length - dates.length > 1 ? 's' : ''})
                </p>
              )}
            </div>
          ) : (
            <p className="text-xs text-orange-700 bg-orange-50 rounded-xl px-4 py-3">
              {datesGenerees.length === 0
                ? 'Aucune date disponible dans ce contrat.'
                : `${participant.prenom} a déjà une séance planifiée à chacune de ces dates pour ce contrat.`}
            </p>
          )}

          {conflits.length > 0 && (() => {
            const premier = conflits[0];
            const nomExistant = participantMap.get(premier.existante.participantId);
            const nomAffiche = nomExistant ? `${nomExistant.prenom} ${nomExistant.nom[0]}.` : 'un autre bénéficiaire';
            return (
              <div className="bg-red-light border border-red/20 rounded-xl px-4 py-3">
                <p className="text-xs font-semibold text-red">
                  Créneau indisponible — chevauche une séance existante avec {nomAffiche} le {formatDate(premier.creneau.date)} ({premier.existante.heureDebut}–{premier.existante.heureFin}).
                </p>
                <p className="text-xs text-red mt-1">Modifiez l'heure ou la durée pour lever le conflit.</p>
              </div>
            );
          })()}
        </div>

        <div className="flex gap-3 px-6 py-4 border-t border-gray-100">
          <button onClick={onCancel}
            className="flex-1 py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50 transition-colors">
            Annuler
          </button>
          <button onClick={handleConfirmer} disabled={loading || dates.length === 0 || conflits.length > 0}
            className={`flex-1 py-2 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50 flex items-center justify-center gap-2 ${
              dates.length === 0 || conflits.length > 0 ? 'bg-red text-white cursor-not-allowed' : 'bg-primary text-white hover:bg-dark'
            }`}>
            {loading
              ? <><Loader size={14} className="animate-spin" />En cours…</>
              : conflits.length > 0
                ? 'Créneau occupé'
                : dates.length === 0
                  ? 'Rien à créer'
                  : `Confirmer (${dates.length})`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Choix de portée (occurrence seule vs série) — port de ModalChoixSerie
//    (PlanningGrilleView.tsx, non exportée) : aucun bouton présélectionné,
//    un déplacement/édition/suppression de masse doit rester un choix
//    conscient. ─────────────────────────────────────────────────────────────

interface ChoixSerie {
  titre: string;
  futures: Seance[];
  // Id de la séance sur laquelle le praticien a cliqué à l'origine — précochée
  // par défaut dans l'option "Sélectionner les séances concernées".
  seanceRefId: string;
  // Options affichées dans la boîte de choix — TOUTES_OPTIONS_PORTEE par
  // défaut si non précisé (déplacer/éditer/supprimer inchangés).
  optionsDisponibles?: OptionPortee[];
  // Affiché en évidence au-dessus des boutons quand l'action de portée
  // "série" a un impact jugé plus lourd qu'un simple déplacement (ex :
  // annulation de plusieurs mois de séances d'un coup) — voir l'incident
  // Pierre Poindessault (14 séances annulées le 07/07 par un seul clic sur
  // "et les suivantes", scope sous-estimé faute d'avertissement explicite).
  // Sans objet depuis que 'serie' est retiré pour l'annulation — conservé
  // pour déplacer/éditer si un usage futur le justifie.
  avertissementSerie?: string;
  onUnique: () => Promise<void>;
  onSerie: () => Promise<void>;
  // Sous-ensemble choisi à la main (voir planActionSurSelection) — jamais
  // appelé avec un tableau vide, le bouton de confirmation est désactivé tant
  // qu'aucune case n'est cochée.
  onSelection: (idsSelectionnes: string[]) => Promise<void>;
}

// Option intermédiaire entre "cette séance uniquement" et "toutes les
// suivantes" : cocher précisément les occurrences concernées (ex : 2 dates de
// vacances sur une série de 12). Repliée par défaut derrière un 3e bouton
// pour ne pas alourdir le choix courant (déplacement simple, édition ponctuelle)
// — seul un praticien qui en a besoin l'ouvre.
function SelectionSeances({ futures, seanceRefId, loading, onConfirm, onRetour }: {
  futures: Seance[];
  seanceRefId: string;
  loading: boolean;
  onConfirm: (ids: string[]) => void;
  onRetour: () => void;
}) {
  const [selectionnees, setSelectionnees] = useState<Set<string>>(new Set([seanceRefId]));

  function toggle(id: string) {
    setSelectionnees(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const nb = selectionnees.size;
  const datesTriees = futures.filter(f => selectionnees.has(f.id)).map(f => formatDate(f.date));

  return (
    <>
      <div className="flex items-center gap-2 mb-1">
        <button onClick={onRetour} disabled={loading} className="text-gray-400 hover:text-gray-600 p-0.5 -ml-0.5">
          <ArrowLeft size={15} />
        </button>
        <h3 className="text-base font-bold text-dark">Sélectionner les séances concernées</h3>
      </div>
      <p className="text-xs text-gray-500 mb-3">Cochez précisément les occurrences à modifier.</p>

      <div className="space-y-1 max-h-56 overflow-y-auto border border-gray-100 rounded-xl p-2 mb-3">
        {futures.map(f => (
          <label key={f.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 cursor-pointer text-sm">
            <input type="checkbox" checked={selectionnees.has(f.id)} onChange={() => toggle(f.id)}
              className="w-3.5 h-3.5 accent-primary flex-shrink-0" />
            <span className="text-dark">{formatDate(f.date)} — {f.heureDebut}–{f.heureFin}</span>
          </label>
        ))}
      </div>

      <div className={`rounded-xl px-3 py-2.5 mb-4 ${nb === 0 ? 'bg-gray-50' : 'bg-primary/5 border border-primary/20'}`}>
        <p className={`text-xs font-semibold ${nb === 0 ? 'text-gray-400' : 'text-primary'}`}>
          {nb === 0 ? 'Aucune séance sélectionnée' : `${nb} séance${nb > 1 ? 's' : ''} sélectionnée${nb > 1 ? 's' : ''}`}
        </p>
        {nb > 0 && <p className="text-xs text-gray-500 mt-0.5">{datesTriees.join(', ')}</p>}
      </div>

      <button onClick={() => onConfirm(Array.from(selectionnees))} disabled={loading || nb === 0}
        className="w-full py-2.5 rounded-xl text-sm font-semibold bg-primary text-white hover:bg-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
        {loading
          ? <span className="inline-flex items-center gap-2 justify-center"><Loader size={13} className="animate-spin" />En cours…</span>
          : `Confirmer pour ${nb || 0} séance${nb > 1 ? 's' : ''}`}
      </button>
    </>
  );
}

function ModalChoixSerie({ titre, futures, seanceRefId, optionsDisponibles = ['unique', 'serie', 'selection'], avertissementSerie, loading, onUnique, onSerie, onSelection, onCancel }: {
  titre: string;
  futures: Seance[];
  seanceRefId: string;
  optionsDisponibles?: OptionPortee[];
  avertissementSerie?: string;
  loading: boolean;
  onUnique: () => void;
  onSerie: () => void;
  onSelection: (ids: string[]) => void;
  onCancel: () => void;
}) {
  const [mode, setMode] = useState<'choix' | 'selection'>('choix');
  const premiere = futures[0];
  const derniere = futures[futures.length - 1];
  const afficheSerie = optionsDisponibles.includes('serie');
  const afficheSelection = optionsDisponibles.includes('selection');
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4" style={{ zIndex: 1030 }}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
        {mode === 'selection' ? (
          <SelectionSeances
            futures={futures}
            seanceRefId={seanceRefId}
            loading={loading}
            onConfirm={onSelection}
            onRetour={() => setMode('choix')}
          />
        ) : (
          <>
            <h3 className="text-base font-bold text-dark mb-1">{titre}</h3>
            <p className="text-xs text-gray-500 mb-4">
              Ce créneau se répète {futures.length} fois (du {formatDate(premiere.date)} au {formatDate(derniere.date)}). Quelle portée ?
            </p>
            {avertissementSerie && (
              <div className="bg-red-light border border-red/20 rounded-xl px-3 py-2.5 mb-4">
                <p className="text-xs font-semibold text-red">{avertissementSerie}</p>
              </div>
            )}
            <div className="space-y-2">
              <button onClick={onUnique} disabled={loading}
                className="w-full py-2 rounded-xl text-sm font-semibold bg-primary text-white hover:bg-dark transition-colors disabled:opacity-50">
                <span className="block">Cette séance uniquement</span>
                <span className="block text-xs font-normal opacity-80 mt-0.5">{formatDate(premiere.date)}</span>
              </button>
              {afficheSerie && (
                <button onClick={onSerie} disabled={loading}
                  className={`w-full py-2 rounded-xl text-sm font-medium border transition-colors disabled:opacity-50 ${
                    avertissementSerie ? 'border-red/30 text-red hover:bg-red-light' : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                  }`}>
                  <span className="block">Cette séance et les {futures.length - 1} suivantes</span>
                  <span className="block text-xs font-normal opacity-80 mt-0.5">jusqu'au {formatDate(derniere.date)}</span>
                </button>
              )}
              {afficheSelection && (
                <button onClick={() => setMode('selection')} disabled={loading}
                  className="w-full py-2.5 rounded-xl text-sm font-medium border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5">
                  <ListChecks size={14} />
                  Sélectionner les séances concernées…
                </button>
              )}
              <button onClick={onCancel} disabled={loading}
                className="w-full py-2 rounded-xl text-sm text-gray-400 hover:text-gray-600 transition-colors">
                {loading ? <span className="inline-flex items-center gap-2"><Loader size={13} className="animate-spin" />En cours…</span> : 'Annuler'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Édition / suppression d'une séance existante (étape 3) — remplace la
//    popup lecture seule de l'étape 2. Port de ModalEditSeance
//    (PlanningGrilleView.tsx), sans le volet disponibilités/organisation :
//    non demandé ici, périmètre propre à cet écran-là. ──────────────────────

function ModalEditSeance({ seance, nomBeneficiaire, seances, contrat, onSave, onDelete, onRestaurer, onClose }: {
  seance: Seance;
  nomBeneficiaire: string;
  seances: Seance[];
  contrat: Contrat | null;
  onSave: (updates: MiseAJourSeance) => void;
  onDelete: () => void;
  onRestaurer: () => void;
  onClose: () => void;
}) {
  const [date, setDate] = useState(seance.date);
  const [heureDebut, setHeureDebut] = useState(seance.heureDebut);
  const [duree, setDuree] = useState(seance.dureeMinutes);
  const [statut, setStatut] = useState<StatutSeance>(seance.statut);
  const [raisonAnnulation, setRaisonAnnulation] = useState<RaisonAnnulation | ''>(seance.motifAnnulation ?? '');
  const [raisonAnnulationDetail, setRaisonAnnulationDetail] = useState(seance.motifAnnulationDetail ?? '');
  const [confirmSuppr, setConfirmSuppr] = useState(false);

  const heureFin = addMinutes(heureDebut, duree);

  // Occurrences futures (celle-ci incluse) du même créneau récurrent — le
  // périmètre exact que « cette séance et les suivantes » modifierait.
  const futures = useMemo(() => calculerFutures(seances, seance), [seances, seance]);

  const conflit = useMemo(
    () => trouveChevauchement(seances, { date, heureDebut, heureFin }, seance.id),
    [seances, date, heureDebut, heureFin, seance.id],
  );

  function handleEnregistrer() {
    if (conflit) return;
    // La raison n'a de sens que pour une annulation — jamais transmise pour
    // un autre statut, pour ne pas laisser traîner une ancienne raison si la
    // séance est réannulée plus tard sous un motif différent (ou aucun).
    const motifAnnulation = statut === 'annulee' && raisonAnnulation ? raisonAnnulation : undefined;
    const motifAnnulationDetail = motifAnnulation === 'autre' ? raisonAnnulationDetail.trim() || undefined : undefined;
    onSave({ date, heureDebut, heureFin, dureeMinutes: duree, statut, motifAnnulation, motifAnnulationDetail });
    onClose();
  }

  function handleSupprimer() {
    onDelete();
    onClose();
  }

  // Raccourci "↩ Restaurer" — toujours en portée "cette séance uniquement",
  // jamais de choix série : contourne structurellement le bug corrigé dans
  // trouverSerieRecurrente (une référence annulée s'excluait elle-même de sa
  // propre série), et évite au passage de faire deviner à l'utilisateur
  // qu'il doit re-sélectionner "Planifiée" dans le sélecteur de statut.
  function handleRestaurer() {
    onRestaurer();
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4" style={{ zIndex: 1010 }}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100">
          <h3 className="text-base font-bold text-dark">Modifier la séance</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1"><X size={16} /></button>
        </div>

        <div className="px-6 py-4 space-y-4">
          <div className="bg-gray-50 rounded-xl px-4 py-3">
            <p className="text-xs text-gray-500 mb-0.5">Bénéficiaire</p>
            <p className="text-sm font-semibold text-dark">{nomBeneficiaire}</p>
          </div>

          {seance.statut === 'annulee' && (
            <div className="flex items-center justify-between gap-3 bg-amber-light border border-amber/20 rounded-xl px-4 py-3">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-amber">
                  Séance annulée{seance.motifAnnulation ? ` — ${LABEL_RAISON_ANNULATION[seance.motifAnnulation]}` : ''}
                </p>
                {seance.motifAnnulationDetail && (
                  <p className="text-xs text-amber mt-0.5 truncate">{seance.motifAnnulationDetail}</p>
                )}
              </div>
              <button onClick={handleRestaurer}
                className="flex-shrink-0 flex items-center gap-1.5 text-xs font-semibold text-white bg-amber hover:opacity-90 rounded-lg px-3 py-2 transition-colors">
                <Undo2 size={13} />
                Restaurer
              </button>
            </div>
          )}

          {futures.length > 1 && (
            <p className="text-xs text-blue-700 bg-blue-50 rounded-xl px-4 py-3">
              Ce créneau se répète encore {futures.length} fois (jusqu'au {formatDate(futures[futures.length - 1].date)}). La portée (cette séance seule ou toute la série) sera demandée à l'enregistrement.
            </p>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-gray-50 rounded-xl px-4 py-3">
              <label className="block text-xs text-gray-500 mb-0.5">Date</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)}
                className="w-full bg-transparent text-sm font-semibold text-dark focus:outline-none" />
            </div>
            <div className="bg-gray-50 rounded-xl px-4 py-3">
              <label className="block text-xs text-gray-500 mb-0.5">Heure de début</label>
              <input type="time" step={60} value={heureDebut} onChange={e => setHeureDebut(e.target.value)}
                className="w-full bg-transparent text-sm font-semibold text-dark focus:outline-none" />
              <p className="text-xs text-gray-400 mt-0.5">→ fin {heureFin}</p>
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">Durée de la séance</label>
            {contrat && contrat.dureesSeances.length > 1 ? (
              <select value={duree} onChange={e => setDuree(Number(e.target.value))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary">
                {contrat.dureesSeances.map(d => <option key={d} value={d}>{d} min</option>)}
              </select>
            ) : (
              <input type="number" min={5} step={5} value={duree} onChange={e => setDuree(Number(e.target.value))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary" />
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Statut</label>
            <div className="grid grid-cols-3 gap-2">
              {(['planifiee', 'realisee', 'annulee'] as StatutSeance[]).map(s => (
                <button key={s} onClick={() => setStatut(s)}
                  className={`py-1.5 px-3 rounded-lg text-xs font-medium border transition-colors text-left ${
                    statut === s ? 'bg-primary text-white border-primary' : 'bg-white text-gray-600 border-gray-200 hover:border-primary/40'
                  }`}>
                  {LABEL_STATUT[s]}
                </button>
              ))}
            </div>
          </div>

          {statut === 'annulee' && (
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Raison de l'annulation <span className="normal-case font-normal text-gray-400">(facultatif, usage interne)</span>
              </label>
              <select value={raisonAnnulation} onChange={e => setRaisonAnnulation(e.target.value as RaisonAnnulation | '')}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary">
                <option value="">— Non précisée —</option>
                {OPTIONS_RAISON_ANNULATION.map(r => <option key={r} value={r}>{LABEL_RAISON_ANNULATION[r]}</option>)}
              </select>
              {raisonAnnulation === 'autre' && (
                <input type="text" value={raisonAnnulationDetail} onChange={e => setRaisonAnnulationDetail(e.target.value)}
                  placeholder="Précisez la raison…" maxLength={200}
                  className="w-full mt-2 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary" />
              )}
              {futures.length > 1 && (
                <p className="text-[11px] text-gray-400 mt-1.5">
                  Si vous sélectionnez plusieurs séances à l'enregistrement, cette même raison s'appliquera à toutes celles cochées.
                </p>
              )}
            </div>
          )}

          {conflit && (
            <div className="bg-red-light border border-red/20 rounded-xl px-4 py-3">
              <p className="text-xs font-semibold text-red">
                Créneau indisponible — chevauche une autre séance ({conflit.heureDebut}–{conflit.heureFin}) le {formatDate(conflit.date)}.
              </p>
              <p className="text-xs text-red mt-1">Modifiez l'heure, la date ou la durée pour lever le conflit.</p>
            </div>
          )}
        </div>

        <div className="flex gap-3 px-6 py-4 border-t border-gray-100">
          <button onClick={() => setConfirmSuppr(true)}
            className="flex items-center justify-center border border-red/20 text-red rounded-xl px-3 hover:bg-red-light transition-colors">
            <Trash2 size={15} />
          </button>
          <button onClick={onClose}
            className="flex-1 py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50 transition-colors">
            Annuler
          </button>
          <button onClick={handleEnregistrer} disabled={!!conflit}
            className={`flex-1 py-2 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50 ${
              conflit ? 'bg-red text-white cursor-not-allowed' : 'bg-primary text-white hover:bg-dark'
            }`}>
            {conflit ? 'Créneau occupé' : 'Enregistrer'}
          </button>
        </div>
      </div>

      {confirmSuppr && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4" style={{ zIndex: 1020 }}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <p className="text-sm text-dark font-medium mb-1">Supprimer cette séance ?</p>
            <p className="text-xs text-gray-500 mb-4">
              {nomBeneficiaire} — {formatDate(seance.date)} {seance.heureDebut}–{seance.heureFin}. Action irréversible.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmSuppr(false)} className="flex-1 py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">
                Annuler
              </button>
              <button onClick={handleSupprimer}
                className="flex-1 py-2 rounded-xl text-sm font-semibold bg-red text-white hover:opacity-90">
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Événements d'agenda (indisponibilité ponctuelle, réunion, premier contact
//    prospect) — formulaire de création et fiche de consultation/suppression.
//    Volontairement plus simple qu'une séance : pas de bénéficiaire, pas de
//    contrat, pas de chevauchement vérifié (un événement d'agenda n'occupe
//    pas un créneau de tournée patient, il informe seulement). ─────────────

function ModalNouvelEvenement({ onCreer, onCancel }: {
  onCreer: (data: Omit<EvenementAgenda, 'id'>) => Promise<void>;
  onCancel: () => void;
}) {
  const [type, setType] = useState<TypeEvenementAgenda>('reunion_professionnelle');
  const [titre, setTitre] = useState('');
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [heureDebut, setHeureDebut] = useState('09:00');
  const [heureFin, setHeureFin] = useState('10:00');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);

  const heureInvalide = heureFin <= heureDebut;

  async function handleCreer() {
    if (!titre.trim() || heureInvalide) return;
    setLoading(true);
    try {
      await onCreer({ type, titre: titre.trim(), date, heureDebut, heureFin, notes: notes.trim() || undefined });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4" style={{ zIndex: 1010 }}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100">
          <h3 className="text-base font-bold text-dark">Ajouter un événement d'agenda</h3>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600 p-1"><X size={16} /></button>
        </div>

        <div className="px-6 py-4 space-y-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Type</label>
            <select value={type} onChange={e => setType(e.target.value as TypeEvenementAgenda)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary">
              {OPTIONS_TYPE_EVENEMENT.map(t => <option key={t} value={t}>{LABEL_TYPE_EVENEMENT[t]}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">Titre</label>
            <input type="text" value={titre} onChange={e => setTitre(e.target.value)}
              placeholder="Ex : Réunion équipe, Mme Dupont (prospect)…"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary" />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Date</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Début</label>
              <input type="time" step={60} value={heureDebut} onChange={e => setHeureDebut(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Fin</label>
              <input type="time" step={60} value={heureFin} onChange={e => setHeureFin(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary" />
            </div>
          </div>
          {heureInvalide && <p className="text-xs text-red">L'heure de fin doit être après l'heure de début.</p>}

          <div>
            <label className="block text-xs text-gray-500 mb-1">Notes (optionnel)</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary resize-none" />
          </div>
        </div>

        <div className="flex gap-3 px-6 py-4 border-t border-gray-100">
          <button onClick={onCancel} className="flex-1 py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50 transition-colors">
            Annuler
          </button>
          <button onClick={handleCreer} disabled={loading || !titre.trim() || heureInvalide}
            className="flex-1 py-2 rounded-xl text-sm font-semibold bg-primary text-white hover:bg-dark transition-colors disabled:opacity-50 flex items-center justify-center">
            {loading ? <Loader size={14} className="animate-spin" /> : 'Créer'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ModalEvenementAgenda({ evenement, onDelete, onClose }: {
  evenement: EvenementAgenda;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [confirmSuppr, setConfirmSuppr] = useState(false);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4" style={{ zIndex: 1010 }}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100">
          <h3 className="text-base font-bold text-dark">{LABEL_TYPE_EVENEMENT[evenement.type]}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1"><X size={16} /></button>
        </div>

        <div className="px-6 py-4 space-y-3">
          <div className="bg-gray-50 rounded-xl px-4 py-3">
            <p className="text-xs text-gray-500 mb-0.5">Titre</p>
            <p className="text-sm font-semibold text-dark">{evenement.titre}</p>
          </div>
          <div className="bg-gray-50 rounded-xl px-4 py-3">
            <p className="text-xs text-gray-500 mb-0.5">Quand</p>
            <p className="text-sm font-semibold text-dark">
              {formatDate(evenement.date)} — {evenement.heureDebut} à {evenement.heureFin}
            </p>
          </div>
          {evenement.notes && (
            <div className="bg-gray-50 rounded-xl px-4 py-3">
              <p className="text-xs text-gray-500 mb-0.5">Notes</p>
              <p className="text-sm text-dark whitespace-pre-wrap">{evenement.notes}</p>
            </div>
          )}
        </div>

        <div className="flex gap-3 px-6 py-4 border-t border-gray-100">
          <button onClick={() => setConfirmSuppr(true)}
            className="flex items-center justify-center border border-red/20 text-red rounded-xl px-3 hover:bg-red-light transition-colors">
            <Trash2 size={15} />
          </button>
          <button onClick={onClose}
            className="flex-1 py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50 transition-colors">
            Fermer
          </button>
        </div>

        {confirmSuppr && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4" style={{ zIndex: 1020 }}>
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
              <p className="text-sm text-dark font-medium mb-1">Supprimer cet événement ?</p>
              <p className="text-xs text-gray-500 mb-4">
                {evenement.titre} — {formatDate(evenement.date)}. Action irréversible.
              </p>
              <div className="flex gap-3">
                <button onClick={() => setConfirmSuppr(false)} className="flex-1 py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">
                  Annuler
                </button>
                <button onClick={onDelete}
                  className="flex-1 py-2 rounded-xl text-sm font-semibold bg-red text-white hover:opacity-90">
                  Supprimer
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Page principale ────────────────────────────────────────────────────────────

export default function AgendaV2Page() {
  const { seances, bulkCreerSeances, modifierSeance, supprimerSeance } = useAgenda();
  const { participants } = useParticipants();
  const { contrats, contratActifDeParticipant } = useContrats();
  const { indisposDuJour } = useIndispos();
  const { evenements, creerEvenement, supprimerEvenement } = useEvenementsAgenda();
  // Zones géographiques définies par le praticien dans l'onglet Zones — la
  // zone d'un bénéficiaire est stockée sur la zone elle-même (participantIds),
  // pas sur le participant. zoneDePatient est la fonction déjà écrite dans ce
  // hook pour retrouver la zone d'un bénéficiaire donné, réutilisée telle
  // quelle (aucune logique de zone redupliquée ici).
  const { zones, zoneDePatient } = useZones();

  const [seanceEditee, setSeanceEditee] = useState<Seance | null>(null);
  const [evenementEdite, setEvenementEdite] = useState<EvenementAgenda | null>(null);
  const [nouvelEvenementOuvert, setNouvelEvenementOuvert] = useState(false);
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
    return [...participants]
      .filter(p => !q || `${p.prenom} ${p.nom}`.toLowerCase().includes(q))
      .filter(p => zonesFiltreIds.size === 0 || (() => {
        const zone = zoneDePatient(p.id);
        return !!zone && zonesFiltreIds.has(zone.id);
      })())
      .sort((a, b) => a.nom.localeCompare(b.nom));
  }, [participants, search, zonesFiltreIds, zoneDePatient]);

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
    return [...eventsSeances, ...eventsAgenda];
  }, [seances, evenements, participantMap]);

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
    const jourIndispo = CLE_JOUR_PAR_DOW[dow] as IndisponibilitePierre['jour'];
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

  return (
    <PageWrapper>
      <div className="mb-4">
        <h1 className="font-heading font-bold text-2xl text-dark">Agenda (bêta)</h1>
        <p className="text-xs text-gray-400 mt-0.5">
          Création par glisser-déposer, déplacement, édition et suppression des séances, disponibilités/indisponibilités en fond, filtre par zone. Vraies dates, vraies données.
        </p>
      </div>

      <div className="mb-4 bg-primary/5 border border-primary/20 rounded-xl px-4 py-2.5 text-xs text-dark">
        🧪 Version bêta du nouvel agenda, en test en parallèle de l'agenda habituel (onglet <strong>Agenda</strong>) — les deux affichent les mêmes séances réelles, aucune n'est prioritaire. Glisser-déposer testé à la souris (bureau) — le geste tactile équivalent (glisser depuis la liste) est en attente, sera traité séparément.
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
                Indispo Pierre
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: '#0d9488' }} />
                Séance du bénéficiaire sélectionné
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ background: 'repeating-linear-gradient(135deg,#9CA3AF,#9CA3AF 3px,#6B7280 3px,#6B7280 6px)', border: '1px dashed #374151' }} />
                Événement d'agenda (ni une séance ni un vrai bénéficiaire)
              </div>
            </div>

            <button
              type="button"
              onClick={() => setNouvelEvenementOuvert(true)}
              className="flex-shrink-0 bg-dark text-white text-xs font-semibold rounded-xl px-3 py-2 hover:opacity-90 transition-opacity"
            >
              + Ajouter un événement
            </button>
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
                // Événements d'agenda : style volontairement distinct (gris,
                // hachuré, bordure en tirets) et jamais dans la palette des
                // séances (bleu/violet/vert/rouge) — pour ne jamais les
                // confondre avec une vraie séance patient au premier coup
                // d'œil, y compris quand l'agenda est chargé.
                if (event.kind === 'evenement') {
                  return {
                    style: {
                      background: 'repeating-linear-gradient(135deg,#9CA3AF,#9CA3AF 4px,#6B7280 4px,#6B7280 8px)',
                      border: '1px dashed #374151',
                      borderRadius: 6,
                      color: 'white',
                      fontSize: 12,
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
                setSeanceEditee(event.resource);
              }}
              onDropFromOutside={onDropFromOutside}
              dragFromOutsideItem={dragFromOutsideItem}
              onEventDrop={handleEventDrop}
              draggableAccessor={(event: CalEvent) => event.kind === 'seance'}
              resizable={false}
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
            onClose={() => setSeanceEditee(null)}
          />
        );
      })()}

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
