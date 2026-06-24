// Algorithme de planification de semaine — pur TypeScript, pas de dépendances React.
// Utilisé par ModalPlanificateur pour les deux modes (ponctuel et récurrent).

import type { Participant, Contrat, Seance, JourSemaine, IndisponibilitePierre } from '../types';
import { addMinutes, heureEnMinutes, minutesEnHeure, arrondirAuQuartHeureSup, estSemaineDue } from '../utils/horaires';
import { getJoursDisponiblesCourts } from './anamnese';

// ── Types publics ─────────────────────────────────────────────────────────────

export interface MatriceORS {
  durees: number[][];      // secondes
  distances: number[][];   // mètres
  fallback: boolean;
}

export interface EtapePlanifiee {
  patient: Participant;
  contrat: Contrat;
  seanceExistanteId?: string; // séance existante à mettre à jour (Mode B, ou Mode A si déjà planifiée)
  alreadyPlanned?: boolean;   // Mode A : le patient a déjà une séance ce jour — on propose une mise à jour d'horaire
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

// Garde-fou explicite : sans un vrai point de départ, toute la tournée
// calculée serait fausse sans que personne ne le sache (cf. audit §3 — point
// de départ non configuré). L'UI (TourneePage/ModalPlanificateur) bloque déjà
// l'appel en amont ; cette validation est un filet de sécurité supplémentaire
// directement dans l'algorithme.
function validerDepart(depart: { lat: number; lng: number } | null | undefined): void {
  if (!depart || !Number.isFinite(depart.lat) || !Number.isFinite(depart.lng)) {
    throw new Error('Point de départ invalide ou non configuré — configurez votre adresse dans Paramètres.');
  }
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

// Arrondit une heure "HH:MM" au quart d'heure supérieur — jamais inférieur,
// pour ne jamais faire arriver Pierre avant l'heure réellement calculée.
function arrondirHeure(heure: string): string {
  return minutesEnHeure(arrondirAuQuartHeureSup(heureEnMinutes(heure)));
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
  alreadyPlanned?: boolean;
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

// ── Assignation des jours de la semaine ────────────────────────────────────────
// Remplace l'ancienne lecture de contrat.joursFixe : pour chaque contrat actif,
// choisit nbSeancesSemaine jours parmi les disponibilités du patient
// (anamnese.organisation), en optimisant les trajets (heuristique "most
// constrained first" + coût = trajet vers le patient déjà placé le plus
// proche ce jour-là, ou le départ si le jour est encore vide). Réutilise une
// séance déjà planifiée cette semaine pour ce contrat (la "déplace" vers le
// jour choisi) plutôt que d'en créer une en double.
function assignerJoursSemaine(
  joursDeLaSemaine: { date: string; jourKey: JourSemaine }[],
  contrats: Contrat[],
  participants: Participant[],
  seancesExistantes: Seance[],
  matrix: MatriceORS,
  indexMap: Map<string, number>,
  departIdx: number,
): {
  assignations: Map<string, { date: string; jourKey: JourSemaine; seanceExistanteId?: string }[]>;
  impossibles: { patient: Participant; raison: string }[];
} {
  const impossibles: { patient: Participant; raison: string }[] = [];
  const assignations = new Map<string, { date: string; jourKey: JourSemaine; seanceExistanteId?: string }[]>();

  type CandidatJour = {
    contrat: Contrat;
    patient: Participant;
    idx: number;
    joursDispo: { date: string; jourKey: JourSemaine }[];
  };
  const candidats: CandidatJour[] = [];
  // joursDeLaSemaine[0] est toujours le lundi (seul 'dim' est filtré par
  // l'appelant) — utilisé comme date cible pour le calcul de périodicité.
  const lundiSemaine = joursDeLaSemaine[0]?.date;

  for (const contrat of contrats) {
    if (contrat.statut !== 'actif') continue;
    if (contrat.exclureTournee) continue; // patient volontairement exclu de l'optimisation
    // Contrat bi/tri-mensuel : cette semaine n'est pas due dans son cycle —
    // ignoré silencieusement, comme exclureTournee (pas un échec à signaler).
    if (lundiSemaine && !estSemaineDue(contrat.dateDebut, lundiSemaine, contrat.periodicite)) continue;
    const patient = participants.find(p => p.id === contrat.participantId);
    if (!patient) continue;
    if (!patient.coordonnees) {
      impossibles.push({ patient, raison: 'Adresse non géocodée' });
      continue;
    }
    const idx = indexMap.get(coordKey(patient.coordonnees));
    if (idx === undefined) {
      impossibles.push({ patient, raison: 'Patient absent de la matrice de trajets' });
      continue;
    }
    const joursPatient = getJoursDisponiblesCourts(patient);
    const joursDispo = joursDeLaSemaine.filter(({ date, jourKey }) =>
      joursPatient.includes(jourKey) && contrat.dateDebut <= date && contrat.dateFin >= date
    );
    if (joursDispo.length === 0) {
      impossibles.push({ patient, raison: 'Disponibilités du patient non renseignées (ou incompatibles cette semaine)' });
      continue;
    }
    candidats.push({ contrat, patient, idx, joursDispo });
  }

  // Most constrained first : les patients avec le moins de jours disponibles
  // sont placés en premier, pour ne pas leur laisser que des jours saturés.
  candidats.sort((a, b) => a.joursDispo.length - b.joursDispo.length);

  // Séances déjà planifiées cette semaine, par contrat — réutilisées (déplacées
  // vers le nouveau jour choisi) plutôt que dupliquées.
  const datesSemaine = new Set(joursDeLaSemaine.map(j => j.date));
  const seancesParContrat = new Map<string, string[]>();
  for (const s of seancesExistantes) {
    if (s.statut !== 'planifiee' || !s.contratId || !datesSemaine.has(s.date)) continue;
    const arr = seancesParContrat.get(s.contratId) ?? [];
    arr.push(s.id);
    seancesParContrat.set(s.contratId, arr);
  }

  const occupeParJour = new Map<JourSemaine, number[]>();

  // Jours déjà pris par patient, tous contrats confondus — garantit qu'un
  // patient avec plusieurs contrats actifs simultanés n'est jamais programmé
  // deux fois le même jour.
  const joursPrisParPatient = new Map<string, Set<JourSemaine>>();

  for (const { contrat, patient, idx, joursDispo: joursDispoContrat } of candidats) {
    const n = contrat.nbSeancesSemaine;

    // Fréquence invalide (donnée corrompue) — jamais ignorée silencieusement :
    // signalée explicitement plutôt que de faire disparaître le patient du
    // planning (et plutôt que de heurter la sémantique de slice(0, n) avec un
    // n négatif, qui retournerait "tout sauf le dernier élément").
    if (n <= 0) {
      impossibles.push({ patient, raison: `Fréquence invalide (${n} séance(s)/semaine) — contrat à corriger` });
      assignations.set(contrat.id, []);
      continue;
    }

    const joursDejaPris = joursPrisParPatient.get(patient.id) ?? new Set<JourSemaine>();
    const joursDispo = joursDispoContrat.filter(j => !joursDejaPris.has(j.jourKey));

    if (joursDispo.length === 0) {
      impossibles.push({
        patient,
        raison: 'Aucun jour disponible cette semaine — déjà programmé(e) via un autre contrat actif',
      });
      assignations.set(contrat.id, []);
      continue;
    }

    let choisis: { date: string; jourKey: JourSemaine }[];

    if (joursDispo.length <= n) {
      choisis = joursDispo;
      if (joursDispo.length < n) {
        impossibles.push({
          patient,
          raison: `${joursDispo.length}/${n} séance(s) possible(s) cette semaine (disponibilités insuffisantes)`,
        });
      }
    } else {
      const scored = joursDispo.map(jour => {
        const occupants = occupeParJour.get(jour.jourKey) ?? [];
        const cibles = occupants.length > 0 ? occupants : [departIdx];
        const cout = Math.min(...cibles.map(o => matrix.durees[idx]?.[o] ?? Infinity));
        return { jour, cout };
      });
      scored.sort((a, b) => a.cout - b.cout);
      choisis = scored.slice(0, n).map(s => s.jour);
    }

    for (const jour of choisis) {
      const occupants = occupeParJour.get(jour.jourKey) ?? [];
      occupants.push(idx);
      occupeParJour.set(jour.jourKey, occupants);
      joursDejaPris.add(jour.jourKey);
    }
    joursPrisParPatient.set(patient.id, joursDejaPris);

    const existantes = [...(seancesParContrat.get(contrat.id) ?? [])];
    assignations.set(contrat.id, choisis.map(jour => ({
      date: jour.date,
      jourKey: jour.jourKey,
      seanceExistanteId: existantes.shift(),
    })));
  }

  return { assignations, impossibles };
}

// Cœur de l'algorithme : ordonne et chronomètre une journée
function planifierJour(
  date: string,
  _jourKey: JourSemaine,
  candidates: Candidat[],
  departIdx: number,
  indisposJour: IndisponibilitePierre[],
  matrix: MatriceORS,
  heureDebutJournee: string,
): { etapes: EtapePlanifiee[]; impossibles: { patient: Participant; raison: string }[] } {
  const ordered = ordonner(departIdx, candidates, matrix);
  const etapes: EtapePlanifiee[] = [];
  const impossibles: { patient: Participant; raison: string }[] = [];

  let heure = arrondirHeure(heureDebutJournee); // heure de départ initiale
  let posIdx = departIdx;

  for (const { patient, contrat, seanceExistanteId, alreadyPlanned, idx } of ordered) {
    const trajet = travelMin(matrix, posIdx, idx);
    const dist   = distKm(matrix, posIdx, idx);

    let heureArrivee = arrondirHeure(addMinutes(heure, trajet)); // après trajet
    heureArrivee = arrondirHeure(appliquerIndispos(heureArrivee, indisposJour)); // après pause

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
      alreadyPlanned,
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

// Construit, pour un jour donné, les candidats à partir de l'assignation de
// la semaine (jourKey → contrats placés ce jour-là).
function candidatsDuJour(
  jourKey: JourSemaine,
  assignations: Map<string, { date: string; jourKey: JourSemaine; seanceExistanteId?: string }[]>,
  contrats: Contrat[],
  participants: Participant[],
): Candidat[] {
  const candidates: Candidat[] = [];
  for (const [contratId, joursAssignes] of assignations) {
    const assign = joursAssignes.find(j => j.jourKey === jourKey);
    if (!assign) continue;
    const contrat = contrats.find(c => c.id === contratId);
    if (!contrat) continue;
    const patient = participants.find(p => p.id === contrat.participantId);
    if (!patient?.coordonnees) continue;
    candidates.push({
      patient,
      contrat,
      idx: -1, // recalculé via indexMap par l'appelant si besoin — non utilisé ici
      seanceExistanteId: assign.seanceExistanteId,
      alreadyPlanned: Boolean(assign.seanceExistanteId),
    });
  }
  return candidates;
}

// ── MODE A : semaine ponctuelle ───────────────────────────────────────────────
// Propose un planning optimal pour la semaine choisie. Les jours de passage
// sont choisis dynamiquement (assignerJoursSemaine) à partir des disponibilités
// patient et de la fréquence du contrat (nbSeancesSemaine). Si une séance
// existe déjà cette semaine pour un contrat, elle est déplacée vers le jour
// choisi (alreadyPlanned) plutôt que dupliquée.

export function planifierSemaine(
  params: PlanificateurParams,
  lundiDate: string,
): ResultatPlanification {
  const { participants, contrats, seances, indispos, depart, matrix, indexMap, heureDebutJournee } = params;
  validerDepart(depart);
  const departIdx = indexMap.get(coordKey(depart)) ?? 0;
  const allImpossibles: { patient: Participant; raison: string }[] = [];
  const jours: JourPlanifie[] = [];

  const joursDeLaSemaine: { date: string; jourKey: JourSemaine }[] = [];
  for (let i = 0; i < 6; i++) {
    const base = new Date(lundiDate + 'T12:00');
    base.setDate(base.getDate() + i);
    const dateStr = base.toISOString().split('T')[0];
    const jourKey = jourDeLaDate(dateStr);
    if (jourKey === 'dim') continue;
    joursDeLaSemaine.push({ date: dateStr, jourKey: jourKey as JourSemaine });
  }

  const { assignations, impossibles } = assignerJoursSemaine(
    joursDeLaSemaine, contrats, participants, seances, matrix, indexMap, departIdx,
  );
  allImpossibles.push(...impossibles);

  for (const { date: dateStr, jourKey } of joursDeLaSemaine) {
    // IndisponibilitePierre n'a pas de date propre (seulement un jour de
    // semaine) : qu'elle soit marquée "récurrente" ou non, elle s'applique à
    // toute occurrence de ce jour — cohérent avec indisposDuJour (TourneePage),
    // qui ne filtre pas non plus sur ce champ.
    const indisposJour = indispos.filter(ind => ind.jour === jourKey);

    const candidates = candidatsDuJour(jourKey, assignations, contrats, participants)
      .map(c => ({ ...c, idx: indexMap.get(coordKey(c.patient.coordonnees!))! }));

    if (candidates.length === 0) continue;

    const { etapes, impossibles: impJour } = planifierJour(
      dateStr, jourKey, candidates,
      departIdx, indisposJour, matrix, heureDebutJournee,
    );

    allImpossibles.push(...impJour);
    if (etapes.length > 0) {
      jours.push({ jourKey, date: dateStr, label: labelDate(dateStr), etapes });
    }
  }

  return { jours, impossibles: allImpossibles, fallbackORS: matrix.fallback, modeB: false };
}

// ── MODE B : planning récurrent — N semaines ─────────────────────────────────
// Comme le Mode A, mais répété sur plusieurs semaines : à chaque semaine, les
// jours sont ré-optimisés indépendamment (pas de jours figés d'une semaine à
// l'autre). Une séance déjà planifiée cette semaine-là est déplacée vers le
// nouveau jour choisi plutôt que dupliquée.

export function planifierRecurrent(
  params: PlanificateurParams,
  dateRef: string,
  nbSemaines = 8,
): ResultatPlanification {
  const { participants, contrats, seances, indispos, depart, matrix, indexMap, heureDebutJournee } = params;
  validerDepart(depart);
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

  for (let semaine = 0; semaine < nbSemaines; semaine++) {
    const lundi = new Date(startDate);
    lundi.setDate(startDate.getDate() + semaine * 7);

    const joursDeLaSemaine: { date: string; jourKey: JourSemaine }[] = [];
    for (let i = 0; i < 6; i++) {
      const d = new Date(lundi);
      d.setDate(lundi.getDate() + i);
      const dateStr = d.toISOString().split('T')[0];
      const jourKey = jourDeLaDate(dateStr);
      if (jourKey === 'dim') continue;
      joursDeLaSemaine.push({ date: dateStr, jourKey: jourKey as JourSemaine });
    }

    const { assignations, impossibles } = assignerJoursSemaine(
      joursDeLaSemaine, contrats, participants, seances, matrix, indexMap, departIdx,
    );
    for (const imp of impossibles) {
      if (!vusImpossible.has(imp.patient.id)) {
        allImpossibles.push(imp);
        vusImpossible.add(imp.patient.id);
      }
    }

    for (const { date: dateStr, jourKey } of joursDeLaSemaine) {
      // IndisponibilitePierre n'a pas de date propre (seulement un jour de
    // semaine) : qu'elle soit marquée "récurrente" ou non, elle s'applique à
    // toute occurrence de ce jour — cohérent avec indisposDuJour (TourneePage),
    // qui ne filtre pas non plus sur ce champ.
    const indisposJour = indispos.filter(ind => ind.jour === jourKey);

      const candidates = candidatsDuJour(jourKey, assignations, contrats, participants)
        .map(c => ({ ...c, idx: indexMap.get(coordKey(c.patient.coordonnees!))! }));

      if (candidates.length === 0) continue;

      const { etapes, impossibles: impJour } = planifierJour(
        dateStr, jourKey, candidates,
        departIdx, indisposJour, matrix, heureDebutJournee,
      );

      for (const imp of impJour) {
        if (!vusImpossible.has(imp.patient.id)) {
          allImpossibles.push(imp);
          vusImpossible.add(imp.patient.id);
        }
      }
      if (etapes.length > 0) {
        jours.push({ jourKey, date: dateStr, label: labelDate(dateStr), etapes });
      }
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
