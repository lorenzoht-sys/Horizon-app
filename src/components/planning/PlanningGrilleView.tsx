import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Loader, X, Trash2 } from 'lucide-react';
import type { Contrat, Indisponibilite, JourSemaine, OrganisationData, Participant, Seance, StatutSeance } from '../../types';
import { getOrganisation } from '../../lib/anamnese';
import { heureEnMinutes, genererDatesSeances, trouveChevauchements, trouveChevauchement, dateDansMemeSemaine, datesManquantes, calculerStatutSeancesSemaine } from '../../utils/horaires';
import { addMinutes } from '../../hooks/useAgenda';
import {
  calculerFutures, estDeplacementNoop, estDeplacementExistant,
  planDeplacerUnique, planDeplacerSerie, planEditerUnique, planEditerSerie,
  planSupprimerUnique, planSupprimerSerie, executerOperations,
  type MiseAJourSeance,
} from '../../lib/planificationManuelle';
import BadgeSeancesRestantes from '../ui/BadgeSeancesRestantes';
import FrisePlanningJour, {
  FRISE_H_DEBUT, FRISE_H_FIN, FRISE_TOTAL_H, friseToY, DRAG_MIME_TYPE, type DragPayload,
} from './FrisePlanningJour';

// ── Jours de la semaine (Lun → Dim) ───────────────────────────────────────────
// Les 7 jours sont toujours affichés (voir joursIndisposComplete plus bas) —
// samedi/dimanche restent visibles et déposables, seulement grisés quand
// Pierre y est indisponible toute la journée.

// Hauteur visible de la grille avant défilement interne. À la nouvelle
// échelle (HAUTEUR_HEURE_PX = 96px/h), la journée complète 8h–19h occupe
// ~1056px de haut — plus que ce qu'un écran affiche confortablement sous les
// en-têtes de jours. Ce plafond garde ces en-têtes visibles en permanence :
// seul le corps de la grille (colonne heures + frises) défile, dans son
// propre conteneur.
const HAUTEUR_GRILLE_VISIBLE = 600;

const JOURS_ORDRES = [
  { key: 'lun' as JourSemaine | 'dim', label: 'Lundi',    cleJour: 'Lun', dow: 1 },
  { key: 'mar' as JourSemaine | 'dim', label: 'Mardi',    cleJour: 'Mar', dow: 2 },
  { key: 'mer' as JourSemaine | 'dim', label: 'Mercredi', cleJour: 'Mer', dow: 3 },
  { key: 'jeu' as JourSemaine | 'dim', label: 'Jeudi',    cleJour: 'Jeu', dow: 4 },
  { key: 'ven' as JourSemaine | 'dim', label: 'Vendredi', cleJour: 'Ven', dow: 5 },
  { key: 'sam' as JourSemaine | 'dim', label: 'Samedi',   cleJour: 'Sam', dow: 6 },
  { key: 'dim' as JourSemaine | 'dim', label: 'Dimanche', cleJour: 'Dim', dow: 0 },
];

// ── Calcul des dates récurrentes d'un jour de la semaine ──────────────────────
// Délègue à genererDatesSeances (utils/horaires) — logique partagée avec
// ModalInsererPatient, qui respecte déjà contrat.periodicite (hebdo / 1
// semaine sur 2 / 1 semaine sur 3) via estSemaineDue(). dateAncrage reste le
// vrai dateDebut du contrat même si la génération démarre plus tard
// (aujourd'hui), pour ne pas décaler le cycle bimensuel/trimestriel.

function creerDatesRecurrentes(jourKey: JourSemaine | 'dim', contrat: Contrat): string[] {
  const today = new Date().toISOString().split('T')[0];
  const start = contrat.dateDebut > today ? contrat.dateDebut : today;
  return genererDatesSeances(start, contrat.dateFin, jourKey, contrat.periodicite ?? 'semaine', contrat.dateDebut);
}

function formatDate(d: string) {
  return new Date(d + 'T12:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}

// Fenêtres de disponibilité réellement renseignées pour un jour donné.
// Mode strict : un jour n'est disponible que s'il est à la fois coché dans
// joursDisponibles ET pourvu de créneaux dans creneauxParJour — aucune plage
// par défaut n'est inventée quand la donnée est absente.
function windowsDispoPourJour(
  org: OrganisationData | null,
  cleJour: string
): { debut: string; fin: string }[] {
  if (!org) return [];
  if (!org.joursDisponibles?.includes(cleJour)) return [];
  return org.creneauxParJour?.[cleJour] ?? [];
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface DropPendant {
  participantId: string;
  jour: typeof JOURS_ORDRES[number];
  heure: string;
  contrat: Contrat;
}

// Séance actuellement saisie pour édition (clic) ou glissée pour déplacement —
// accompagnée de totalOccurrences (voir FrisePlanningJour) pour prévenir
// l'utilisateur quand l'action ne portera que sur une occurrence parmi
// plusieurs d'un même créneau récurrent.
interface SeanceActive {
  seance: Seance;
  totalOccurrences: number;
}

// Choix en attente entre « cette occurrence seule » et « cette occurrence et
// toutes les suivantes » — n'est ouvert que lorsque futures.length > 1 (voir
// trouverSerieRecurrente). onUnique/onSerie effectuent l'action elles-mêmes ;
// aucune n'est présélectionnée dans ModalChoixSerie (voir plus bas) pour
// qu'un déplacement de masse reste un choix conscient.
interface ChoixSerie {
  titre: string;
  futures: Seance[];
  onUnique: () => Promise<void>;
  onSerie: () => Promise<void>;
}

interface Props {
  participants: Participant[];
  seances: Seance[];
  contrats: Contrat[];
  indispos: Indisponibilite[];
  bulkCreerSeances: (data: Omit<Seance, 'id'>[], options?: { ignorerChevauchements?: boolean }) => Promise<unknown>;
  modifierSeance: (id: string, updates: Partial<Seance>) => Promise<boolean>;
  supprimerSeance: (id: string) => Promise<void>;
}

const CLE_JOUR_PAR_DOW: Record<number, string> = { 0: 'Dim', 1: 'Lun', 2: 'Mar', 3: 'Mer', 4: 'Jeu', 5: 'Ven', 6: 'Sam' };

const LABEL_STATUT_SEANCE: Record<StatutSeance, string> = {
  planifiee: 'Planifiée', realisee: 'Réalisée', reportee: 'Reportée', annulee: 'Annulée',
};

// ── Modal confirmation drop ───────────────────────────────────────────────────

function ModalConfirmDrop({ info, patient, seances, participantMap, windows, onConfirm, onCancel }: {
  info: DropPendant;
  patient: Participant | undefined;
  seances: Seance[];
  participantMap: Map<string, Participant>;
  windows: { debut: string; fin: string }[];
  onConfirm: (duree: number, heureDebut: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [duree, setDuree] = useState(info.contrat.dureeMinutes);
  // Pré-rempli avec l'heure déjà aimantée/calée par FrisePlanningJour ;
  // reste éditable pour les cas particuliers (ex : 9h35 imposé par un trajet).
  const [heureDebut, setHeureDebut] = useState(info.heure);
  const [loading, setLoading] = useState(false);

  // datesGenerees : toutes les dates du rythme demandé sur la durée du
  // contrat. dates : seulement celles qui n'ont pas déjà une séance non
  // annulée pour ce bénéficiaire/contrat — reflète la contrainte d'unicité
  // seances_no_double_contrat_idx (participant_id, date, contrat_id). Ne
  // jamais réinsérer une date déjà couverte : filtré ici, AVANT tout appel
  // à bulkCreerSeances, plutôt que de laisser la contrainte base rejeter
  // l'insert après coup.
  const datesGenerees = useMemo(
    () => creerDatesRecurrentes(info.jour.key, info.contrat),
    [info.jour.key, info.contrat],
  );
  const dates = useMemo(
    () => datesManquantes(seances, info.participantId, info.contrat.id, datesGenerees),
    [seances, info.participantId, info.contrat.id, datesGenerees],
  );

  const heureFin = addMinutes(heureDebut, duree);

  // Le champ heure étant librement éditable au clavier, on revalide contre
  // les disponibilités déclarées — même logique que FrisePlanningJour/
  // ModalInsererPatient (créneau entièrement contenu dans une fenêtre).
  const heureHorsDispo = windows.length > 0 && !windows.some(w =>
    heureDebut >= w.debut && heureFin <= w.fin,
  );

  // Chevauchements : vérifiés sur toutes les occurrences récurrentes, pas
  // seulement la première — un rendez-vous fixe côté autre bénéficiaire
  // entre en collision chaque semaine, mais un cas isolé (séance reportée)
  // peut ne toucher qu'une occurrence.
  const conflits = useMemo(
    () => trouveChevauchements(
      seances,
      dates.map(date => ({ date, heureDebut, heureFin })),
    ),
    [seances, dates, heureDebut, heureFin],
  );

  async function handleConfirmer() {
    // Filet de sécurité : le bouton est désactivé dans ce cas, mais on ne
    // laisse aucune voie (ex : soumission clavier) créer un chevauchement.
    if (conflits.length > 0) return;
    setLoading(true);
    try {
      await onConfirm(duree, heureDebut);
    } catch {
      // Déjà signalé à l'utilisateur par un toast (message humain, voir
      // messageErreurSeance dans useAgenda) — on évite seulement que la
      // promesse rejetée reste non gérée ; la modale reste ouverte pour
      // laisser l'utilisateur ajuster et réessayer.
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
          {/* Patient */}
          <div className="bg-gray-50 rounded-xl px-4 py-3">
            <p className="text-xs text-gray-500 mb-0.5">Bénéficiaire</p>
            <p className="text-sm font-semibold text-dark">
              {patient ? `${patient.prenom} ${patient.nom}` : '—'}
            </p>
            {patient?.adresseVille && <p className="text-xs text-gray-400">{patient.adresseVille}</p>}
          </div>

          {/* Créneau */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-gray-50 rounded-xl px-4 py-3">
              <p className="text-xs text-gray-500 mb-0.5">Jour (chaque semaine)</p>
              <p className="text-sm font-semibold text-dark">{info.jour.label}</p>
            </div>
            <div className="bg-gray-50 rounded-xl px-4 py-3">
              <label className="block text-xs text-gray-500 mb-0.5">Heure de début</label>
              <input
                type="time"
                step={60}
                value={heureDebut}
                onChange={e => setHeureDebut(e.target.value)}
                className="w-full bg-transparent text-sm font-semibold text-dark focus:outline-none"
              />
              <p className="text-xs text-gray-400 mt-0.5">→ fin {heureFin}</p>
            </div>
          </div>

          {heureHorsDispo && (
            <p className="text-xs text-orange-700 bg-orange-50 rounded-xl px-4 py-3">
              Ce créneau ({heureDebut}–{heureFin}) sort des disponibilités déclarées de{' '}
              {patient ? patient.prenom : 'ce bénéficiaire'}.
            </p>
          )}

          {/* Durée (selector si plusieurs options) */}
          {info.contrat.dureesSeances.length > 1 ? (
            <div>
              <label className="block text-xs text-gray-500 mb-1">Durée de la séance</label>
              <select value={duree} onChange={e => setDuree(Number(e.target.value))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary">
                {info.contrat.dureesSeances.map(d => (
                  <option key={d} value={d}>{d} min</option>
                ))}
              </select>
            </div>
          ) : (
            <p className="text-xs text-gray-500">Durée : <span className="font-medium text-dark">{duree} min</span></p>
          )}

          {/* Récurrence */}
          {dates.length > 0 ? (
            <div className="bg-primary/5 border border-primary/20 rounded-xl px-4 py-3">
              <p className="text-xs text-gray-600">
                <span className="font-semibold text-primary">{dates.length} séance{dates.length > 1 ? 's' : ''}</span>
                {' '}sur la durée du contrat
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                {formatDate(dates[0])} → {formatDate(dates[dates.length - 1])}
              </p>
            </div>
          ) : (
            <p className="text-xs text-orange-700 bg-orange-50 rounded-xl px-4 py-3">
              {datesGenerees.length === 0
                ? 'Aucune date disponible dans ce contrat.'
                : `${patient ? patient.prenom : 'Ce bénéficiaire'} a déjà une séance planifiée à chacune de ces dates pour ce contrat.`}
            </p>
          )}

          {/* Chevauchement avec une séance existante : toujours bloquant — pas
              de "continuer quand même" ici, ni d'action pour déplacer/supprimer
              la séance en place à sa place. L'utilisateur doit soit changer
              l'heure/la durée, soit aller gérer lui-même la séance existante. */}
          {conflits.length > 0 && (() => {
            const premier = conflits[0];
            const nomExistant = participantMap.get(premier.existante.participantId);
            const nomAffiche = nomExistant ? `${nomExistant.prenom} ${nomExistant.nom[0]}.` : 'un autre bénéficiaire';
            return (
              <div className="bg-red-light border border-red/20 rounded-xl px-4 py-3">
                <p className="text-xs font-semibold text-red">
                  Créneau indisponible — chevauche une séance existante avec{' '}
                  {nomAffiche}{' '}le {formatDate(premier.creneau.date)} ({premier.existante.heureDebut}–{premier.existante.heureFin}).
                </p>
                <p className="text-xs text-red mt-1">
                  Modifiez l'heure ou la durée pour lever le conflit.
                  {nomExistant && (
                    <>
                      {' '}
                      <Link to={`/participant/${premier.existante.participantId}`} className="underline font-medium hover:opacity-80">
                        Voir la séance de {nomAffiche}
                      </Link>
                    </>
                  )}
                </p>
                {conflits.length > 1 && (
                  <p className="text-xs text-red mt-1">
                    {conflits.length} des {dates.length} séances générées sont concernées.
                  </p>
                )}
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
              conflits.length > 0
                ? 'bg-red text-white cursor-not-allowed'
                : heureHorsDispo
                  ? 'bg-orange-500 text-white hover:bg-orange-600'
                  : 'bg-primary text-white hover:bg-dark'
            }`}>
            {loading
              ? <><Loader size={14} className="animate-spin" />En cours…</>
              : conflits.length > 0
                ? 'Créneau occupé — impossible'
                : heureHorsDispo
                  ? 'Continuer quand même'
                  : `Confirmer ${dates.length > 0 ? `(${dates.length})` : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Modal choix de portée (occurrence seule vs série) ────────────────────────
// N'apparaît que lorsque l'action (déplacer/modifier/supprimer) touche un
// créneau qui a au moins une autre occurrence future (voir trouverSerieRecurrente
// dans les appelants). Aucun bouton n'est présélectionné/focus par défaut —
// l'utilisateur doit cliquer explicitement l'un des deux pour qu'un
// déplacement de masse reste un choix conscient, jamais un défaut.
function ModalChoixSerie({ titre, futures, loading, onUnique, onSerie, onCancel }: {
  titre: string;
  futures: Seance[];
  loading: boolean;
  onUnique: () => void;
  onSerie: () => void;
  onCancel: () => void;
}) {
  const premiere = futures[0];
  const derniere = futures[futures.length - 1];
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4" style={{ zIndex: 1030 }}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
        <h3 className="text-base font-bold text-dark mb-1">{titre}</h3>
        <p className="text-xs text-gray-500 mb-4">
          Ce créneau se répète {futures.length} fois (du {formatDate(premiere.date)} au {formatDate(derniere.date)}). Quelle portée ?
        </p>
        <div className="space-y-2">
          <button onClick={onUnique} disabled={loading}
            className="w-full py-2.5 rounded-xl text-sm font-semibold bg-primary text-white hover:bg-dark transition-colors disabled:opacity-50">
            Cette séance uniquement ({formatDate(premiere.date)})
          </button>
          <button onClick={onSerie} disabled={loading}
            className="w-full py-2.5 rounded-xl text-sm font-medium border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50">
            Cette séance et les {futures.length - 1} suivantes
          </button>
          <button onClick={onCancel} disabled={loading}
            className="w-full py-2 rounded-xl text-sm text-gray-400 hover:text-gray-600 transition-colors">
            {loading ? <span className="inline-flex items-center gap-2"><Loader size={13} className="animate-spin" />En cours…</span> : 'Annuler'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Modal édition/suppression d'une séance existante ─────────────────────────

function ModalEditSeance({ actif, patient, seances, orgPatient, contrat, onSave, onDelete, onClose }: {
  actif: SeanceActive;
  patient: Participant | undefined;
  seances: Seance[];
  orgPatient: OrganisationData | null;
  contrat: Contrat | null;
  // Déclenchent l'action côté parent, qui décide seul s'il faut ouvrir la
  // boîte de choix « cette occurrence / toute la série » avant d'appliquer
  // quoi que ce soit — cette modale n'a donc plus besoin d'attendre/fermer
  // elle-même après onSave/onDelete, le parent ferme dans tous les cas.
  onSave: (updates: MiseAJourSeance) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const { seance } = actif;
  const [date, setDate] = useState(seance.date);
  const [heureDebut, setHeureDebut] = useState(seance.heureDebut);
  const [duree, setDuree] = useState(seance.dureeMinutes);
  const [statut, setStatut] = useState<StatutSeance>(seance.statut);
  const [confirmSuppr, setConfirmSuppr] = useState(false);

  const heureFin = addMinutes(heureDebut, duree);

  // Occurrences futures (celle-ci incluse) du même créneau récurrent — c'est
  // exactement ce périmètre que « cette séance et les suivantes » modifierait,
  // donc ce compte doit refléter la même logique que la boîte de choix
  // (calculerFutures), pas un total générique passé en prop.
  const futures = useMemo(() => calculerFutures(seances, seance), [seances, seance]);

  // Fenêtres de dispo recalculées sur le jour de la semaine actuellement
  // saisi dans le formulaire (peut changer si l'utilisateur modifie la date).
  const windows = useMemo(
    () => windowsDispoPourJour(orgPatient, CLE_JOUR_PAR_DOW[new Date(date + 'T12:00').getDay()]),
    [orgPatient, date],
  );

  const heureHorsDispo = windows.length > 0 && !windows.some(w => heureDebut >= w.debut && heureFin <= w.fin);

  const conflit = useMemo(
    () => trouveChevauchement(seances, { date, heureDebut, heureFin }, seance.id),
    [seances, date, heureDebut, heureFin, seance.id],
  );

  function handleEnregistrer() {
    if (conflit) return;
    onSave({ date, heureDebut, heureFin, dureeMinutes: duree, statut });
    onClose();
  }

  function handleSupprimer() {
    onDelete();
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
            <p className="text-sm font-semibold text-dark">{patient ? `${patient.prenom} ${patient.nom}` : '—'}</p>
          </div>

          {/* Cette vue regroupe par jour/heure de la semaine : un même bloc
              représente en général plusieurs séances réelles (une par
              semaine du contrat). On demandera la portée (cette occurrence
              seule ou toute la série) au moment d'Enregistrer/Supprimer —
              ce simple rappel évite la surprise avant même d'en arriver là. */}
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

          {heureHorsDispo && (
            <p className="text-xs text-orange-700 bg-orange-50 rounded-xl px-4 py-3">
              Ce créneau ({heureDebut}–{heureFin}) sort des disponibilités déclarées de{' '}
              {patient ? patient.prenom : 'ce bénéficiaire'}.
            </p>
          )}

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
            <div className="grid grid-cols-2 gap-2">
              {(['planifiee', 'realisee', 'reportee', 'annulee'] as StatutSeance[]).map(s => (
                <button key={s} onClick={() => setStatut(s)}
                  className={`py-1.5 px-3 rounded-lg text-xs font-medium border transition-colors text-left ${
                    statut === s ? 'bg-primary text-white border-primary' : 'bg-white text-gray-600 border-gray-200 hover:border-primary/40'
                  }`}>
                  {LABEL_STATUT_SEANCE[s]}
                </button>
              ))}
            </div>
          </div>

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
              {patient ? `${patient.prenom} ${patient.nom}` : ''} — {formatDate(seance.date)} {seance.heureDebut}–{seance.heureFin}. Action irréversible.
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

// ── Composant principal ───────────────────────────────────────────────────────

export default function PlanningGrilleView({ participants, seances, contrats, indispos, bulkCreerSeances, modifierSeance, supprimerSeance }: Props) {
  const [search, setSearch] = useState('');
  const [patientSelectionneId, setPatientSelectionneId] = useState<string | null>(null);
  const [dragPatientId, setDragPatientId] = useState<string | null>(null);
  const [dropPendant, setDropPendant] = useState<DropPendant | null>(null);
  const [dragSeance, setDragSeance] = useState<SeanceActive | null>(null);
  const [seanceEditee, setSeanceEditee] = useState<SeanceActive | null>(null);
  const [choixSerie, setChoixSerie] = useState<ChoixSerie | null>(null);
  const [choixSerieLoading, setChoixSerieLoading] = useState(false);

  // Jours off : Pierre indisponible toute la journée — restent affichés
  // (grisés) plutôt que masqués, pour visualiser le planning sur 7 jours et
  // pouvoir exceptionnellement y déposer une séance (ex : un samedi travaillé).
  const joursOff = useMemo(() => {
    const off = new Set<string>();
    for (const j of JOURS_ORDRES) {
      const horsJournee = indispos.filter(i => i.jour === j.key).some(i =>
        heureEnMinutes(i.heureDebut) <= FRISE_H_DEBUT && heureEnMinutes(i.heureFin) >= FRISE_H_FIN,
      );
      if (horsJournee) off.add(j.key);
    }
    return off;
  }, [indispos]);

  // Séances groupées par jour de la semaine
  const seancesParDow = useMemo(() => {
    const map = new Map<number, Seance[]>();
    for (const s of seances) {
      if (s.statut === 'annulee') continue;
      const dow = new Date(s.date + 'T12:00').getDay();
      const arr = map.get(dow) ?? [];
      arr.push(s);
      map.set(dow, arr);
    }
    return map;
  }, [seances]);

  const participantMap = useMemo(
    () => new Map(participants.map(p => [p.id, p])),
    [participants],
  );

  const patientSelectionne = patientSelectionneId ? participantMap.get(patientSelectionneId) ?? null : null;

  // Organisation du patient sélectionné
  const orgPatient = useMemo(
    () => patientSelectionne ? getOrganisation(patientSelectionne) : null,
    [patientSelectionne],
  );

  // Fenêtres dispo du patient pour un jour donné
  function windowsForJour(cleJour: string): { debut: string; fin: string }[] {
    return windowsDispoPourJour(orgPatient, cleJour);
  }

  // Indispos de Pierre pour un jour donné
  function indisposForJour(jourKey: JourSemaine | 'dim'): { debut: string; fin: string }[] {
    return indispos.filter(i => i.jour === jourKey).map(i => ({ debut: i.heureDebut, fin: i.heureFin }));
  }

  // Patients filtrés + triés
  const patientsFiltres = useMemo(() => {
    const q = search.toLowerCase().trim();
    return [...participants]
      .filter(p => !q || `${p.prenom} ${p.nom}`.toLowerCase().includes(q))
      .sort((a, b) => a.nom.localeCompare(b.nom));
  }, [participants, search]);

  // Durée pour la frise (contrat actif du patient sélectionné, ou 45min par défaut)
  const dureeNouveau = useMemo(() => {
    if (!patientSelectionneId) return 45;
    const c = contrats.find(c => c.participantId === patientSelectionneId && c.statut === 'actif');
    return c?.dureeMinutes ?? 45;
  }, [patientSelectionneId, contrats]);

  // Gestion du drop sur la grille — distingue « créer » (bénéficiaire glissé
  // depuis la colonne de gauche) de « déplacer » (séance existante) via le
  // flag posé dans le dataTransfer au dragstart (voir FrisePlanningJour).
  function handleDrop(jour: typeof JOURS_ORDRES[number], heure: string, payload: DragPayload) {
    if (estDeplacementExistant(payload)) {
      handleDeplacerSeance(payload.seanceId, jour, heure);
      return;
    }
    const pid = dragPatientId ?? patientSelectionneId;
    if (!pid) return;
    const contrat = contrats.find(c => c.participantId === pid && c.statut === 'actif');
    if (!contrat) {
      toast.error("Ce bénéficiaire n'a pas de contrat actif. Créez d'abord un contrat.");
      return;
    }
    setDropPendant({ participantId: pid, jour, heure, contrat });
  }

  // Affiche le détail d'un conflit détecté par planDeplacerSerie/planEditerSerie
  // (déjà vérifié AVANT toute écriture — voir lib/planificationManuelle).
  function toastConflitSerie(conflits: { date: string; occupePar: string }[]) {
    const detail = conflits
      .map(c => `${formatDate(c.date)} (occupé par ${participantMap.get(c.occupePar)?.prenom ?? 'une autre séance'})`)
      .join(', ');
    toast.error(`Action annulée — conflit sur ${conflits.length} semaine${conflits.length > 1 ? 's' : ''} : ${detail}`);
  }

  // Déplace une séance existante vers un nouveau jour/heure. Si le créneau a
  // d'autres occurrences futures (même série récurrente, voir
  // calculerFutures), demande la portée avant d'appliquer quoi que ce soit —
  // jamais de choix par défaut pour un déplacement de masse. Toute la
  // décision (quelles lignes, quels champs, conflits) est calculée par les
  // fonctions pures de lib/planificationManuelle ; ce handler ne fait que les
  // appeler puis exécuter le plan retourné (executerOperations n'accepte pas
  // de fonction de création — un INSERT y est structurellement impossible).
  async function handleDeplacerSeance(seanceId: string, jour: typeof JOURS_ORDRES[number], heureDebut: string) {
    const s = seances.find(x => x.id === seanceId);
    if (!s) return;
    const nouvelleDate = dateDansMemeSemaine(s.date, jour.dow);
    const heureFin = addMinutes(heureDebut, s.dureeMinutes);
    if (estDeplacementNoop(s, nouvelleDate, heureDebut, heureFin)) return;

    const futures = calculerFutures(seances, s);

    const deplacerUnique = async () => {
      await executerOperations([planDeplacerUnique(s, nouvelleDate, heureDebut, heureFin)], modifierSeance, supprimerSeance);
      toast.success(`Séance déplacée au ${jour.label.toLowerCase()} ${heureDebut}`);
    };

    if (futures.length <= 1) {
      await deplacerUnique();
      return;
    }

    setChoixSerie({
      titre: `Déplacer au ${jour.label.toLowerCase()} ${heureDebut}`,
      futures,
      onUnique: deplacerUnique,
      onSerie: async () => {
        const plan = planDeplacerSerie(seances, futures, jour.dow, heureDebut);
        if (!plan.ok) { toastConflitSerie(plan.conflits); return; }
        const nb = await executerOperations(plan.operations, modifierSeance, supprimerSeance);
        toast.success(`${nb} séances déplacées au ${jour.label.toLowerCase()} ${heureDebut}`);
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
      onUnique: enregistrerUnique,
      onSerie: async () => {
        const plan = planEditerSerie(seances, futures, dowCible, updates);
        if (!plan.ok) { toastConflitSerie(plan.conflits); return; }
        const nb = await executerOperations(plan.operations, modifierSeance, supprimerSeance);
        toast.success(`${nb} séances modifiées`);
      },
    });
  }

  // Supprime une séance — même logique de portée. « Toutes les suivantes »
  // ne touche jamais l'historique (date < celle de l'occurrence supprimée).
  async function handleSupprimerSeanceModal(seance: Seance) {
    const futures = calculerFutures(seances, seance);

    if (futures.length <= 1) {
      await executerOperations([planSupprimerUnique(seance)], modifierSeance, supprimerSeance);
      toast.success('Séance supprimée');
      return;
    }

    setChoixSerie({
      titre: 'Supprimer la séance',
      futures,
      onUnique: async () => {
        await executerOperations([planSupprimerUnique(seance)], modifierSeance, supprimerSeance);
        toast.success('Séance supprimée');
      },
      onSerie: async () => {
        const nb = await executerOperations(planSupprimerSerie(futures), modifierSeance, supprimerSeance);
        toast.success(`${nb} séances supprimées`);
      },
    });
  }

  async function handleConfirmerDrop(duree: number, heureDebut: string) {
    if (!dropPendant) return;
    const { participantId, jour, contrat } = dropPendant;
    const patient = participantMap.get(participantId);
    const datesGenerees = creerDatesRecurrentes(jour.key, contrat);
    if (!datesGenerees.length) { toast.error('Aucune date disponible dans ce contrat.'); setDropPendant(null); return; }

    // Recalculé ici (pas seulement dans ModalConfirmDrop) : entre l'ouverture
    // de la modale et le clic sur Confirmer, une séance a pu être créée par
    // ailleurs (planificateur, autre onglet) — on ne tente jamais d'insérer
    // une date déjà couverte pour ce bénéficiaire/contrat (contrainte
    // seances_no_double_contrat_idx).
    const dates = datesManquantes(seances, participantId, contrat.id, datesGenerees);
    if (!dates.length) {
      toast.error(`${patient ? patient.prenom : 'Ce bénéficiaire'} a déjà une séance planifiée à chacune de ces dates pour ce contrat.`);
      setDropPendant(null);
      return;
    }

    const heureFin = addMinutes(heureDebut, duree);
    const adresse = patient
      ? [patient.adresseRue, patient.adresseCodePostal, patient.adresseVille].filter(Boolean).join(', ')
      : '';

    const data: Omit<Seance, 'id'>[] = dates.map(date => ({
      participantId,
      contratId: contrat.id,
      date,
      heureDebut,
      heureFin,
      dureeMinutes: duree,
      type: 'seance' as const,
      statut: 'planifiee' as const,
      adresse,
      coordonnees: patient?.coordonnees ? { lat: patient.coordonnees.lat, lng: patient.coordonnees.lng } : undefined,
    }));

    // Le chevauchement a déjà été vérifié dans ModalConfirmDrop, qui bloque
    // la confirmation tant qu'un conflit existe (aucun cas légitime) — on
    // n'atteint ce point que sans conflit. ignorerChevauchements évite un
    // double contrôle redondant, pas un contournement.
    await bulkCreerSeances(data, { ignorerChevauchements: true });
    const nbIgnorees = datesGenerees.length - dates.length;
    toast.success(
      `${dates.length} séance${dates.length > 1 ? 's' : ''} planifiée${dates.length > 1 ? 's' : ''} chaque ${jour.label.toLowerCase()}`
      + (nbIgnorees > 0 ? ` (${nbIgnorees} déjà existante${nbIgnorees > 1 ? 's' : ''} ignorée${nbIgnorees > 1 ? 's' : ''})` : '')
    );
    setDropPendant(null);
  }

  // Repères horaires (partagés entre colonnes)
  const heureMarks: number[] = [];
  for (let m = FRISE_H_DEBUT; m <= FRISE_H_FIN; m += 60) heureMarks.push(m);

  return (
    <div className="flex gap-4 min-h-0">

      {/* ── Colonne gauche : patients ─────────────────────────────── */}
      <div className="w-60 flex-shrink-0 flex flex-col gap-3">
        <input
          type="text" placeholder="Rechercher un bénéficiaire…" value={search}
          onChange={e => setSearch(e.target.value)}
          className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary" />

        <p className="text-[11px] text-gray-400 px-1">
          Glissez un bénéficiaire sur la grille pour placer une séance.
        </p>

        <div className="space-y-1.5 overflow-y-auto" style={{ maxHeight: HAUTEUR_GRILLE_VISIBLE }}>
          {patientsFiltres.map(p => {
            const contratActifP = contrats.find(c => c.participantId === p.id && c.statut === 'actif') ?? null;
            const aContrat = contratActifP !== null;
            const selected = patientSelectionneId === p.id;
            const statutSeances = calculerStatutSeancesSemaine(contratActifP, seances);
            return (
              <div key={p.id}
                draggable={aContrat}
                onDragStart={e => {
                  e.dataTransfer.effectAllowed = 'copy';
                  e.dataTransfer.setData(DRAG_MIME_TYPE, JSON.stringify({ type: 'nouvelle' } satisfies DragPayload));
                  setDragPatientId(p.id); setPatientSelectionneId(p.id);
                }}
                onDragEnd={() => setDragPatientId(null)}
                onClick={() => setPatientSelectionneId(selected ? null : p.id)}
                className={`rounded-xl px-3 py-2.5 border transition-colors select-none ${
                  aContrat ? 'cursor-grab active:cursor-grabbing' : 'cursor-default opacity-60'
                } ${
                  selected
                    ? 'border-primary bg-primary/5'
                    : 'border-gray-200 bg-white hover:border-primary/40 hover:bg-gray-50'
                }`}>
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

      {/* ── Grille principale ─────────────────────────────────────── */}
      <div className="flex-1 min-w-0 overflow-x-auto">
        {/* En-têtes jours */}
        <div className="flex gap-1 mb-1" style={{ paddingLeft: 36 + 8 }}>
          {JOURS_ORDRES.map(j => (
            <div key={j.key} className={`flex-1 min-w-[92px] text-center text-xs font-semibold pb-1 ${
              joursOff.has(j.key) ? 'text-gray-400' : 'text-gray-600'
            }`}>
              {j.label}
              {joursOff.has(j.key) && (
                <span className="block text-[9px] font-normal text-gray-400">Indispo</span>
              )}
            </div>
          ))}
        </div>

        {/* Corps grille — défile verticalement dans son propre conteneur,
            sous les en-têtes de jours qui restent fixes au-dessus. Colonne
            heures et frises des 7 jours partagent ce même scroll (siblings
            d'un seul conteneur) pour rester alignées entre elles. */}
        <div className="overflow-y-auto" style={{ maxHeight: HAUTEUR_GRILLE_VISIBLE }}>
          <div className="flex gap-1">
            {/* Colonne heures partagée */}
            <div className="relative flex-shrink-0" style={{ width: 36, height: FRISE_TOTAL_H }}>
              {heureMarks.map(m => (
                <div key={m} className="absolute right-1.5 text-[10px] text-gray-400 leading-none"
                  style={{ top: friseToY(m) - 4 }}>
                  {m / 60}h
                </div>
              ))}
            </div>

            {/* Une frise par jour (7/7) */}
            {JOURS_ORDRES.map(j => (
              <div key={j.key} className={`flex-1 min-w-[92px] ${joursOff.has(j.key) ? 'opacity-60' : ''}`}>
                <FrisePlanningJour
                  seancesDuJour={seancesParDow.get(j.dow) ?? []}
                  participantMap={participantMap}
                  dureeNouveau={dureeNouveau}
                  windowsPatient={patientSelectionne ? windowsForJour(j.cleJour) : []}
                  selectedHeure={null}
                  onSelect={() => {}}
                  canSelect={false}
                  showHours={false}
                  onDrop={(heure, payload) => handleDrop(j, heure, payload)}
                  indispos={indisposForJour(j.key)}
                  seanceEnDeplacement={dragSeance ? { id: dragSeance.seance.id, dureeMinutes: dragSeance.seance.dureeMinutes } : null}
                  onSeanceClick={(seance, totalOccurrences) => setSeanceEditee({ seance, totalOccurrences })}
                  onSeanceDragStart={(seance, totalOccurrences) => {
                    setDragSeance({ seance, totalOccurrences });
                    setPatientSelectionneId(seance.participantId);
                  }}
                  onSeanceDragEnd={() => setDragSeance(null)}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Légende */}
        <div className="flex items-center gap-4 mt-3 px-1">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm bg-green-100 border border-green-200" />
            <span className="text-[11px] text-gray-500">Disponibilités bénéficiaire</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm bg-slate-200 border border-slate-300" />
            <span className="text-[11px] text-gray-500">Séances planifiées</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm"
              style={{ background: 'repeating-linear-gradient(45deg,#fee2e2,#fee2e2 2px,#fef2f2 2px,#fef2f2 6px)' }} />
            <span className="text-[11px] text-gray-500">Mes indisponibilités</span>
          </div>
          {!patientSelectionne && (
            <span className="text-[11px] text-gray-400 ml-auto">← Sélectionnez un bénéficiaire pour voir ses disponibilités</span>
          )}
        </div>
      </div>

      {/* ── Modal confirmation drop ────────────────────────────────── */}
      {dropPendant && (() => {
        // Calculé pour le bénéficiaire déposé (pas patientSelectionne) : plus
        // sûr que de dépendre implicitement de la synchronisation faite dans
        // onDragStart.
        const patientDuDrop = participantMap.get(dropPendant.participantId);
        const orgDuDrop = patientDuDrop ? getOrganisation(patientDuDrop) : null;
        const windowsDuDrop = windowsDispoPourJour(orgDuDrop, dropPendant.jour.cleJour);
        return (
          <ModalConfirmDrop
            info={dropPendant}
            patient={patientDuDrop}
            seances={seances}
            participantMap={participantMap}
            windows={windowsDuDrop}
            onConfirm={handleConfirmerDrop}
            onCancel={() => setDropPendant(null)}
          />
        );
      })()}

      {/* ── Modal édition/suppression d'une séance existante ─────────── */}
      {seanceEditee && (() => {
        const patientEdite = participantMap.get(seanceEditee.seance.participantId);
        const orgEdite = patientEdite ? getOrganisation(patientEdite) : null;
        const contratEdite = contrats.find(c => c.id === seanceEditee.seance.contratId)
          ?? contrats.find(c => c.participantId === seanceEditee.seance.participantId && c.statut === 'actif')
          ?? null;
        return (
          <ModalEditSeance
            actif={seanceEditee}
            patient={patientEdite}
            seances={seances}
            orgPatient={orgEdite}
            contrat={contratEdite}
            onSave={updates => handleEnregistrerSeance(seanceEditee.seance, updates)}
            onDelete={() => handleSupprimerSeanceModal(seanceEditee.seance)}
            onClose={() => setSeanceEditee(null)}
          />
        );
      })()}

      {/* ── Modal choix de portée (occurrence seule vs série) ────────── */}
      {choixSerie && (
        <ModalChoixSerie
          titre={choixSerie.titre}
          futures={choixSerie.futures}
          loading={choixSerieLoading}
          onUnique={async () => {
            setChoixSerieLoading(true);
            try { await choixSerie.onUnique(); } finally { setChoixSerieLoading(false); setChoixSerie(null); }
          }}
          onSerie={async () => {
            setChoixSerieLoading(true);
            try { await choixSerie.onSerie(); } finally { setChoixSerieLoading(false); setChoixSerie(null); }
          }}
          onCancel={() => setChoixSerie(null)}
        />
      )}
    </div>
  );
}
