// Algorithme de planification de semaine — pur TypeScript, pas de dépendances React.
// Utilisé par ModalPlanificateur pour les deux modes (ponctuel et récurrent).

import type { Participant, Contrat, Seance, JourSemaine, IndisponibilitePierre } from '../types';
import { addMinutes } from '../utils/horaires';

// ── Types publics ─────────────────────────────────────────────────────────────

export interface MatriceORS {
  durees: number[][];      // secondes
  distances: number[][];   // mètres
  fallback: boolean;
}

export interface EtapePlanifiee {
  patient: Participant;
  contrat: Contrat;
  seanceExistanteId?: string; // Mode B : id de la séance à mettre à jour
  date: string;
  heureDebut: string;
  heureFin: string;
  dureeTrajetMinutes: number;
  distanceKm: number;
  accepted: boolean;
}

export interface JourPlanifie {
  jourKey: JourSemaine;
  date: string;
  label: string;
  etapes: EtapePlanifiee[];
}

export interface ResultatPlanification {
  jours: JourPlanifie[];
  impossibles: { patient: Participant; raison: string }[];
  fallbackORS: boolean;
  modeB: boolean;
}

export interface PlanificateurParams {
  participants: Participant[];
  contrats: Contrat[];
  seances: Seance[];
  indispos: IndisponibilitePierre[];
  depart: { lat: number; lng: number };
  matrix: MatriceORS;
  indexMap: Map<string, number>; // coordKey → index matrice
  heureDebutJournee: string;     // heure de départ de Pierre (ex: "08:00")
}

// ── Helpers internes ──────────────────────────────────────────────────────────

export function coordKey(p: { lat: number; lng: number }): string {
  return `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;
}

const JOURS_ORDRE: JourSemaine[] = ['lun', 'mar', 'mer', 'jeu', 'ven', 'sam'];

const LABELS_JOURS: Record<JourSemaine, string> = {
  lun: 'Lundi', mar: 'Mardi', mer: 'Mercredi',
  jeu: 'Jeudi', ven: 'Vendredi', sam: 'Samedi',
};

const JS_TO_JOUR: Record<number, JourSemaine | 'dim'> = {
  0: 'dim', 1: 'lun', 2: 'mar', 3: 'mer', 4: 'jeu', 5: 'ven', 6: 'sam',
};

function jourDeLaDate(dateStr: string): JourSemaine | 'dim' {
  const [y, m, d] = dateStr.split('-').map(Number);
  return JS_TO_JOUR[new Date(y, m - 1, d).getDay()];
}

function labelDate(dateStr: string): string {
  const date = new Date(dateStr + 'T12:00');
  return date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
}

const CRENEAU_DEBUT: Record<string, string> = {
  matin: '08:00', 'apres-midi': '13:30', soiree: '18:00',
};
const CRENEAU_FIN: Record<string, string> = {
  matin: '12:00', 'apres-midi': '18:00', soiree: '21:00',
};

function ajusterAuCreneauPatient(
  heure: string,
  patient: Participant,
): { heure: string; impossible: boolean; raison?: string } {
  const prefs = patient.disponibilites?.creneauxPreference;
  if (!prefs?.length) return { heure, impossible: false };

  const tries = [...prefs].sort((a, b) =>
    CRENEAU_DEBUT[a].localeCompare(CRENEAU_DEBUT[b])
  );

  for (const pref of tries) {
    if (heure < CRENEAU_DEBUT[pref]) return { heure: CRENEAU_DEBUT[pref], impossible: false };
    if (heure < CRENEAU_FIN[pref])   return { heure, impossible: false };
  }

  const dernier = tries[tries.length - 1];
  return {
    heure,
    impossible: true,
    raison: `Créneaux dépassés — dernier créneau terminé à ${CRENEAU_FIN[dernier]}`,
  };
}

function appliquerIndispos(heure: string, indisposJour: IndisponibilitePierre[]): string {
  let h = heure;
  let changed = true;
  let guard = 0;
  while (changed && guard < 10) {
    changed = false;
    guard++;
    for (const ind of indisposJour) {
      if (h >= ind.heureDebut && h < ind.heureFin) {
        h = ind.heureFin;
        changed = true;
        break;
      }
    }
  }
  return h;
}

function travelMin(matrix: MatriceORS, fromIdx: number, toIdx: number): number {
  const raw = matrix.durees[fromIdx]?.[toIdx];
  return raw !== undefined ? Math.max(1, Math.round(raw / 60)) : 5;
}

function distKm(matrix: MatriceORS, fromIdx: number, toIdx: number): number {
  const raw = matrix.distances[fromIdx]?.[toIdx];
  return raw !== undefined ? Math.round(raw) / 1000 : 0;
}

// Priorité créneaux : matin=0, apres-midi=1, soiree=2, sans prefs=0
function prioriteCreneau(patient: Participant): number {
  const prefs = patient.disponibilites?.creneauxPreference ?? [];
  if (prefs.includes('matin'))      return 0;
  if (prefs.includes('apres-midi')) return 1;
  if (prefs.includes('soiree'))     return 2;
  return 0;
}

type Candidat = {
  patient: Participant;
  contrat: Contrat;
  seanceExistanteId?: string;
  idx: number;
};

// Nearest-neighbor groupé par priorité de créneau
function ordonner(departIdx: number, candidates: Candidat[], matrix: MatriceORS): Candidat[] {
  const groups = [0, 1, 2].map(p => candidates.filter(c => prioriteCreneau(c.patient) === p));
  const result: Candidat[] = [];
  let pos = departIdx;
  for (const group of groups) {
    const remaining = [...group];
    while (remaining.length > 0) {
      let best = 0;
      let minSec = Infinity;
      for (let i = 0; i < remaining.length; i++) {
        const s = matrix.durees[pos]?.[remaining[i].idx] ?? Infinity;
        if (s < minSec) { minSec = s; best = i; }
      }
      const [next] = remaining.splice(best, 1);
      result.push(next);
      pos = next.idx;
    }
  }
  return result;
}

// Cœur de l'algorithme : ordonne et chronomètre une journée
function planifierJour(
  date: string,
  jourKey: JourSemaine,
  candidates: Candidat[],
  departIdx: number,
  indisposJour: IndisponibilitePierre[],
  matrix: MatriceORS,
  heureDebutJournee: string,
): { etapes: EtapePlanifiee[]; impossibles: { patient: Participant; raison: string }[] } {
  const ordered = ordonner(departIdx, candidates, matrix);
  const etapes: EtapePlanifiee[] = [];
  const impossibles: { patient: Participant; raison: string }[] = [];

  let heure = heureDebutJournee;
  let posIdx = departIdx;

  for (const { patient, contrat, seanceExistanteId, idx } of ordered) {
    const trajet = travelMin(matrix, posIdx, idx);
    const dist   = distKm(matrix, posIdx, idx);

    let heureArrivee = addMinutes(heure, trajet);
    heureArrivee = appliquerIndispos(heureArrivee, indisposJour);

    const slot = ajusterAuCreneauPatient(heureArrivee, patient);
    if (slot.impossible) {
      impossibles.push({
        patient,
        raison: slot.raison ?? 'Créneau patient dépassé',
      });
      continue;
    }
    heureArrivee = slot.heure;

    const heureFin = addMinutes(heureArrivee, contrat.dureeMinutes);

    etapes.push({
      patient,
      contrat,
      seanceExistanteId,
      date,
      heureDebut: heureArrivee,
      heureFin,
      dureeTrajetMinutes: trajet,
      distanceKm: dist,
      accepted: true,
    });

    heure  = heureFin;
    posIdx = idx;
  }

  return { etapes, impossibles };
}

// ── MODE A : semaine ponctuelle ───────────────────────────────────────────────
// Crée des séances pour les patients sans séance cette semaine-là.

export function planifierSemaine(
  params: PlanificateurParams,
  lundiDate: string,
): ResultatPlanification {
  const { participants, contrats, seances, indispos, depart, matrix, indexMap, heureDebutJournee } = params;
  const departIdx = indexMap.get(coordKey(depart)) ?? 0;
  const allImpossibles: { patient: Participant; raison: string }[] = [];
  const jours: JourPlanifie[] = [];

  for (let i = 0; i < 6; i++) {
    const base = new Date(lundiDate + 'T12:00');
    base.setDate(base.getDate() + i);
    const dateStr = base.toISOString().split('T')[0];
    const jourKey = jourDeLaDate(dateStr);
    if (jourKey === 'dim') continue;

    const indisposJour = indispos.filter(ind => ind.jour === jourKey && ind.recurrente);

    // Participants déjà planifiés ce jour
    const deja = new Set(
      seances
        .filter(s => s.date === dateStr && s.statut !== 'annulee')
        .map(s => s.participantId)
    );

    const candidates: Candidat[] = [];

    for (const contrat of contrats) {
      if (contrat.statut !== 'actif') continue;
      if (!contrat.joursFixe.includes(jourKey as JourSemaine)) continue;
      if (contrat.dateDebut > dateStr || contrat.dateFin < dateStr) continue;
      if (deja.has(contrat.participantId)) continue;

      const patient = participants.find(p => p.id === contrat.participantId);
      if (!patient) continue;
      if (!patient.coordonnees) {
        allImpossibles.push({ patient, raison: 'Adresse non géocodée' });
        continue;
      }
      const idx = indexMap.get(coordKey(patient.coordonnees));
      if (idx === undefined) {
        allImpossibles.push({ patient, raison: 'Patient absent de la matrice de trajets' });
        continue;
      }
      candidates.push({ patient, contrat, idx });
    }

    if (candidates.length === 0) continue;

    const { etapes, impossibles } = planifierJour(
      dateStr, jourKey as JourSemaine, candidates,
      departIdx, indisposJour, matrix, heureDebutJournee,
    );

    allImpossibles.push(...impossibles);
    if (etapes.length > 0) {
      jours.push({ jourKey: jourKey as JourSemaine, date: dateStr, label: labelDate(dateStr), etapes });
    }
  }

  return { jours, impossibles: allImpossibles, fallbackORS: matrix.fallback, modeB: false };
}

// ── MODE B : planning récurrent — 4 semaines ─────────────────────────────────
// Met à jour les heureDebut/heureFin des séances existantes (planifiee).

export function planifierRecurrent(
  params: PlanificateurParams,
  dateRef: string,
): ResultatPlanification {
  const { participants, contrats, seances, indispos, depart, matrix, indexMap, heureDebutJournee } = params;
  const departIdx = indexMap.get(coordKey(depart)) ?? 0;
  const allImpossibles: { patient: Participant; raison: string }[] = [];
  const jours: JourPlanifie[] = [];

  // Prochain lundi
  const today = new Date(dateRef + 'T12:00');
  const dow   = today.getDay();
  const jump  = dow === 0 ? 1 : dow === 1 ? 7 : 8 - dow;
  const startDate = new Date(today);
  startDate.setDate(today.getDate() + jump);

  const vusImpossible = new Set<string>();

  for (let i = 0; i < 28; i++) {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + i);
    const dateStr = date.toISOString().split('T')[0];
    const jourKey = jourDeLaDate(dateStr);
    if (jourKey === 'dim') continue;

    const indisposJour = indispos.filter(ind => ind.jour === jourKey && ind.recurrente);

    // Séances planifiées ce jour
    const seancesDuJour = seances.filter(s => s.date === dateStr && s.statut === 'planifiee');
    if (seancesDuJour.length === 0) continue;

    const candidates: Candidat[] = [];

    for (const seance of seancesDuJour) {
      const contrat = contrats.find(c => c.id === seance.contratId && c.statut === 'actif');
      if (!contrat) continue;

      const patient = participants.find(p => p.id === seance.participantId);
      if (!patient) continue;

      if (!patient.coordonnees) {
        if (!vusImpossible.has(patient.id)) {
          allImpossibles.push({ patient, raison: 'Adresse non géocodée' });
          vusImpossible.add(patient.id);
        }
        continue;
      }
      const idx = indexMap.get(coordKey(patient.coordonnees));
      if (idx === undefined) {
        if (!vusImpossible.has(patient.id)) {
          allImpossibles.push({ patient, raison: 'Patient absent de la matrice de trajets' });
          vusImpossible.add(patient.id);
        }
        continue;
      }
      candidates.push({ patient, contrat, seanceExistanteId: seance.id, idx });
    }

    if (candidates.length === 0) continue;

    const { etapes, impossibles } = planifierJour(
      dateStr, jourKey as JourSemaine, candidates,
      departIdx, indisposJour, matrix, heureDebutJournee,
    );

    for (const imp of impossibles) {
      if (!vusImpossible.has(imp.patient.id)) {
        allImpossibles.push(imp);
        vusImpossible.add(imp.patient.id);
      }
    }
    if (etapes.length > 0) {
      jours.push({ jourKey: jourKey as JourSemaine, date: dateStr, label: labelDate(dateStr), etapes });
    }
  }

  // Trier par date
  jours.sort((a, b) => a.date.localeCompare(b.date));

  return { jours, impossibles: allImpossibles, fallbackORS: matrix.fallback, modeB: true };
}

// ── Calcul du prochain lundi ──────────────────────────────────────────────────

export function prochainLundi(today: string): string {
  const d = new Date(today + 'T12:00');
  const dow = d.getDay();
  const jump = dow === 0 ? 1 : dow === 1 ? 7 : 8 - dow;
  d.setDate(d.getDate() + jump);
  return d.toISOString().split('T')[0];
}

export { JOURS_ORDRE, LABELS_JOURS };
