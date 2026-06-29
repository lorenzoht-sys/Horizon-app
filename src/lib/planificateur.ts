// Algorithme de planification de semaine — pur TypeScript, pas de dépendances React.
// Utilisé par ModalPlanificateur pour les deux modes (ponctuel et récurrent).

import type { Participant, Contrat, Seance, JourSemaine, IndisponibilitePierre, ZoneGeographique } from '../types';
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
  zones?: ZoneGeographique[];    // zones géographiques pour guider l'assignation des jours
}

// ── Helpers internes ──────────────────────────────────────────────────────────

export function coordKey(p: { lat: number; lng: number }): string {
  return `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;
}

// Formule Haversine locale — intentionnellement dupliquée (analyse-tournee.ts
// l'importe déjà depuis ce fichier, importer en sens inverse créerait un cycle).
function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLon = (b.lng - a.lng) * Math.PI / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
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

// ═══════════════════════════════════════════════════════════════════════════════
// PARAMÈTRES DE L'ALGORITHME — ajustables selon les préférences de Pierre
// ═══════════════════════════════════════════════════════════════════════════════

// Pondération du scoring multi-critères (total = 1.00)
const POIDS_TRAJET    = 0.35; // Minimiser les temps de trajet
const POIDS_ZONE      = 0.20; // Cohérence géographique (secondaire — n'écrase plus la charge)
const POIDS_CHARGE    = 0.30; // Densifier les journées en priorité
const POIDS_STABILITE = 0.15; // Stabiliser les jours habituels des patients (malus doux)

// Capacité journalière de Pierre (minutes de travail disponibles)
const CAPACITE_JOURNEE_MINUTES = 660; // 11h — plage complète 08:00–19:00

// Marge tampon entre la fin d'une séance et le début de la suivante (en plus du trajet)
const MARGE_ENTRE_SEANCES_MIN = 10;

// Au-delà de ce seuil entre la fin d'une séance et le début de la suivante,
// un trou est signalé dans le rapport qualité.
const TROU_MAX_MINUTES = 45;

// Seuil du malus trou structurel dans assignerJoursSemaine — ne pénaliser
// que les écarts vraiment handicapants (> 2h), pas les trous d'1h acceptables.
const TROU_STRUCTUREL_MALUS_MINUTES = 120;

// Fraction minimale de la plage de travail couverte par des indispos pour
// considérer un jour comme totalement bloqué et l'exclure de l'assignation.
const SEUIL_BLOCAGE_JOUR = 0.90;

// Heure de fin de journée utilisée pour calculer la couverture d'indisponibilité.
const HEURE_FIN_JOURNEE_TRAVAIL = '19:00';

// ═══════════════════════════════════════════════════════════════════════════════

// ── Détection d'un jour totalement bloqué ────────────────────────────────────

/**
 * Retourne true si les indisponibilités du praticien couvrent >= SEUIL_BLOCAGE_JOUR
 * de la plage [heureDebutTravail, HEURE_FIN_JOURNEE_TRAVAIL] pour ce jour.
 * Fusionne les intervalles qui se chevauchent avant de calculer la couverture.
 */
function jourTotalementBloque(
  jourKey: JourSemaine,
  indispos: IndisponibilitePierre[],
  heureDebutTravail: string,
): boolean {
  const indisposJour = indispos.filter(i => i.jour === jourKey);
  if (indisposJour.length === 0) return false;

  const debutMin = heureEnMinutes(heureDebutTravail);
  const finMin   = heureEnMinutes(HEURE_FIN_JOURNEE_TRAVAIL);
  const plageTotale = finMin - debutMin;
  if (plageTotale <= 0) return false;

  // Restreindre chaque indispo à la plage de travail, puis fusionner.
  const intervals = indisposJour
    .map(i => [
      Math.max(debutMin, heureEnMinutes(i.heureDebut)),
      Math.min(finMin,   heureEnMinutes(i.heureFin)),
    ] as [number, number])
    .filter(([s, e]) => s < e)
    .sort((a, b) => a[0] - b[0]);

  let couvert = 0;
  let curFin  = -1;
  for (const [start, end] of intervals) {
    if (start > curFin) {
      couvert += end - start;
      curFin   = end;
    } else if (end > curFin) {
      couvert += end - curFin;
      curFin   = end;
    }
  }
  return couvert / plageTotale >= SEUIL_BLOCAGE_JOUR;
}

// ── Reste des helpers internes ────────────────────────────────────────────────

// Conversion JourSemaine → clé utilisée dans creneauxParJour (ex: 'lun' → 'Lun')
const JOUR_SEMAINE_TO_DISPO: Record<JourSemaine, string> = {
  lun: 'Lun', mar: 'Mar', mer: 'Mer', jeu: 'Jeu', ven: 'Ven', sam: 'Sam',
};

// Retourne la fenêtre temporelle effective d'un patient pour un jour donné (en minutes).
// null = disponible toute la journée (pas de contrainte horaire détectée).
function getFenetreTemporelle(
  patient: Participant,
  jourKey: JourSemaine,
): { debut: number; fin: number } | null {
  const cleJour = JOUR_SEMAINE_TO_DISPO[jourKey];
  const creneauxJour = patient.anamnese?.organisation?.creneauxParJour?.[cleJour];
  if (creneauxJour?.length) {
    const debuts = creneauxJour.map(c => heureEnMinutes(c.debut));
    const fins   = creneauxJour.map(c => heureEnMinutes(c.fin));
    return { debut: Math.min(...debuts), fin: Math.max(...fins) };
  }
  const prefs = patient.disponibilites?.creneauxPreference;
  if (!prefs?.length) return null;
  const debuts = prefs.map(p => heureEnMinutes(CRENEAU_DEBUT[p]));
  const fins   = prefs.map(p => heureEnMinutes(CRENEAU_FIN[p]));
  return { debut: Math.min(...debuts), fin: Math.max(...fins) };
}

function ajusterAuCreneauPatient(
  heure: string,
  patient: Participant,
  jourKey: JourSemaine,
): { heure: string; impossible: boolean; raison?: string } {
  // Créneaux précis du jour (ex: 09:00–12:00) — priorité sur creneauxPreference.
  // Les clés de creneauxParJour sont en format abrégé majuscule ('Lun', 'Mar'...).
  const cleJour = JOUR_SEMAINE_TO_DISPO[jourKey];
  const creneauxJour = patient.anamnese?.organisation?.creneauxParJour?.[cleJour];
  if (creneauxJour?.length) {
    const tries = [...creneauxJour].sort((a, b) => a.debut.localeCompare(b.debut));
    for (const c of tries) {
      if (heure < c.debut) return { heure: c.debut, impossible: false };
      if (heure < c.fin)   return { heure, impossible: false };
    }
    const dernier = tries[tries.length - 1];
    return { heure, impossible: true, raison: `Créneau dépassé — dernier créneau terminé à ${dernier.fin}` };
  }

  // Fallback : creneauxPreference (matin / apres-midi / soiree)
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

function permutations<T>(arr: T[]): T[][] {
  if (arr.length <= 1) return [[...arr]];
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i++) {
    const rest = [...arr.slice(0, i), ...arr.slice(i + 1)];
    for (const p of permutations(rest)) result.push([arr[i], ...p]);
  }
  return result;
}

// Ordonnancement optimal par groupe de créneau.
// Groupes ≤ 7 : exhaustif (7! = 5040 perms max) — garantit le trajet minimum.
// Groupes > 7  : nearest-neighbor glouton.
function ordonner(departIdx: number, candidates: Candidat[], matrix: MatriceORS): Candidat[] {
  const groups = [0, 1, 2].map(p => candidates.filter(c => prioriteCreneau(c.patient) === p));
  const result: Candidat[] = [];
  let pos = departIdx;
  for (const group of groups) {
    if (group.length === 0) continue;
    let bestOrder: Candidat[] = group;
    if (group.length <= 7) {
      let minCost = Infinity;
      for (const perm of permutations(group)) {
        let cost = matrix.durees[pos]?.[perm[0].idx] ?? Infinity;
        for (let i = 0; i < perm.length - 1; i++) {
          cost += matrix.durees[perm[i].idx]?.[perm[i + 1].idx] ?? Infinity;
        }
        if (cost < minCost) { minCost = cost; bestOrder = perm; }
      }
    } else {
      const remaining = [...group];
      bestOrder = [];
      let cur = pos;
      while (remaining.length > 0) {
        let best = 0;
        let minSec = Infinity;
        for (let i = 0; i < remaining.length; i++) {
          const s = matrix.durees[cur]?.[remaining[i].idx] ?? Infinity;
          if (s < minSec) { minSec = s; best = i; }
        }
        const [next] = remaining.splice(best, 1);
        bestOrder.push(next);
        cur = next.idx;
      }
    }
    result.push(...bestOrder);
    pos = bestOrder[bestOrder.length - 1].idx;
  }
  return result;
}

// ── Assignation des jours de la semaine ────────────────────────────────────────
// Pour chaque contrat actif, choisit nbSeancesSemaine jours parmi les
// disponibilités du patient (anamnese.organisation), en :
//   1. Excluant les jours où Pierre est totalement indisponible (>= 90% bloqués).
//   2. Optimisant les trajets (heuristique "most constrained first" + coût ORS).
//   3. Appliquant un bonus/malus de zone géographique sur le scoring des jours.
function assignerJoursSemaine(
  joursDeLaSemaine: { date: string; jourKey: JourSemaine }[],
  contrats: Contrat[],
  participants: Participant[],
  seancesExistantes: Seance[],
  matrix: MatriceORS,
  indexMap: Map<string, number>,
  departIdx: number,
  indispos: IndisponibilitePierre[],
  heureDebutJournee: string,
  zones: ZoneGeographique[],
  joursPrecedents?: Map<string, JourSemaine[]>,
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

    // Exclure les jours où Pierre est totalement indisponible sur sa plage de
    // travail — un patient ne doit jamais être assigné à un jour où il ne peut
    // pas être visité, même si ajusterAuCreneauPatient le rejetterait de toute
    // façon (évite un "Créneau dépassé" trompeur côté UI).
    const joursDispoFiltrés = joursDispo.filter(j =>
      !jourTotalementBloque(j.jourKey, indispos, heureDebutJournee)
    );
    if (joursDispoFiltrés.length === 0) {
      impossibles.push({ patient, raison: 'Aucun jour disponible cette semaine (indisponibilités praticien)' });
      continue;
    }

    candidats.push({ contrat, patient, idx, joursDispo: joursDispoFiltrés });
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
  // Coordonnées GPS des patients assignés par jour — pour le scoring centroïde (P2).
  const gpsCoordsParJour = new Map<JourSemaine, { lat: number; lng: number }[]>();
  // Patients assignés par jour — pour détecter les trous horaires structurels (P3).
  const participantsParJour = new Map<JourSemaine, Participant[]>();
  // Charge cumulée par jour (minutes de séances + trajets estimés) — scoring équilibre.
  const chargeParJour = new Map<JourSemaine, number>();

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
      const zonePatient = zones.length > 0
        ? zones.find(z => z.participantIds.includes(patient.id))
        : undefined;

      // Scoring multi-critères normalisé : on calcule les composantes brutes,
      // puis on normalise le trajet entre 0 et 1 avant d'appliquer les poids.
      const rawScores = joursDispo.map(jour => {
        const gpsExistants = gpsCoordsParJour.get(jour.jourKey) ?? [];
        let rawTrajet: number;
        if (gpsExistants.length > 0 && patient.coordonnees) {
          // Centroïde GPS des patients déjà assignés ce jour → distance au nouveau.
          const centLat = gpsExistants.reduce((s, c) => s + c.lat, 0) / gpsExistants.length;
          const centLng = gpsExistants.reduce((s, c) => s + c.lng, 0) / gpsExistants.length;
          rawTrajet = haversineKm(patient.coordonnees, { lat: centLat, lng: centLng }) * 2.5 * 60;
        } else {
          // Fallback : distance au départ ou via matrice ORS si coords absentes.
          const occupants = occupeParJour.get(jour.jourKey) ?? [];
          const cibles = occupants.length > 0 ? occupants : [departIdx];
          rawTrajet = Math.min(...cibles.map(o => matrix.durees[idx]?.[o] ?? Infinity));
        }

        // Zone : malus binaire si le jour n'est pas dans joursAssignes de la zone.
        const malusZone = zonePatient && !zonePatient.joursAssignes.includes(jour.jourKey) ? 1 : 0;

        // Charge : part des minutes déjà planifiées ce jour, plafonnée à 1.
        const chargeNorm = Math.min((chargeParJour.get(jour.jourKey) ?? 0) / CAPACITE_JOURNEE_MINUTES, 1);

        // Stabilité : malus doux si le patient était sur un autre jour la semaine précédente.
        const joursPrecContrat = joursPrecedents?.get(contrat.id) ?? [];
        const malusStabilite = joursPrecContrat.length > 0 && !joursPrecContrat.includes(jour.jourKey) ? 1 : 0;

        // Trou horaire structurel : malus si la fenêtre temporelle du nouveau patient
        // est séparée de celle d'un patient existant par un gap inévitable > TROU_STRUCTUREL_MALUS_MINUTES.
        const fenNouv = getFenetreTemporelle(patient, jour.jourKey);
        const existants = participantsParJour.get(jour.jourKey) ?? [];
        const malusTrouStructurel = (fenNouv && existants.some(ep => {
          const fenEx = getFenetreTemporelle(ep, jour.jourKey);
          if (!fenEx) return false;
          const gap = Math.max(0, Math.max(fenNouv.debut - fenEx.fin, fenEx.debut - fenNouv.fin));
          return gap > TROU_STRUCTUREL_MALUS_MINUTES;
        })) ? 0.30 : 0;

        return { jour, rawTrajet, malusZone, chargeNorm, malusStabilite, malusTrouStructurel };
      });

      // Normaliser les trajets entre 0 et 1 pour que les poids soient comparables.
      const maxTrajet = Math.max(...rawScores.map(s => s.rawTrajet).filter(Number.isFinite), 1);
      const scored = rawScores.map(s => ({
        jour: s.jour,
        score: POIDS_TRAJET    * (Number.isFinite(s.rawTrajet) ? s.rawTrajet / maxTrajet : 0)
             + POIDS_ZONE      * s.malusZone
             + POIDS_CHARGE    * s.chargeNorm
             + POIDS_STABILITE * s.malusStabilite
             + s.malusTrouStructurel,
      }));
      scored.sort((a, b) => a.score - b.score);
      choisis = scored.slice(0, n).map(s => s.jour);
    }

    for (const jour of choisis) {
      const occupants = occupeParJour.get(jour.jourKey) ?? [];
      // Trajet estimé depuis le plus proche occupant avant ajout de ce patient.
      const ciblesCharge = occupants.length > 0 ? occupants : [departIdx];
      const trajetEstimeMin = Math.round(
        Math.min(...ciblesCharge.map(o => matrix.durees[idx]?.[o] ?? 0)) / 60
      );
      occupants.push(idx);
      occupeParJour.set(jour.jourKey, occupants);
      joursDejaPris.add(jour.jourKey);

      if (patient.coordonnees) {
        const coords = gpsCoordsParJour.get(jour.jourKey) ?? [];
        coords.push(patient.coordonnees);
        gpsCoordsParJour.set(jour.jourKey, coords);
      }

      const patientsJour = participantsParJour.get(jour.jourKey) ?? [];
      patientsJour.push(patient);
      participantsParJour.set(jour.jourKey, patientsJour);

      chargeParJour.set(jour.jourKey, (chargeParJour.get(jour.jourKey) ?? 0) + contrat.dureeMinutes + trajetEstimeMin);
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

  let heure = arrondirHeure(heureDebutJournee); // heure de départ initiale
  let posIdx = departIdx;
  const debutJourneeMin = heureEnMinutes(heureDebutJournee);

  for (let iOrd = 0; iOrd < ordered.length; iOrd++) {
    const { patient, contrat, seanceExistanteId, alreadyPlanned, idx } = ordered[iOrd];
    const trajet = travelMin(matrix, posIdx, idx);
    const dist   = distKm(matrix, posIdx, idx);

    const heureArriveeNaturelle = arrondirHeure(appliquerIndispos(
      arrondirHeure(addMinutes(heure, trajet)),
      indisposJour,
    ));

    const slot = ajusterAuCreneauPatient(heureArriveeNaturelle, patient, jourKey);
    if (slot.impossible) {
      impossibles.push({ patient, raison: slot.raison ?? 'Créneau patient dépassé' });
      continue;
    }

    // Décalage intelligent : si le patient est poussé vers son creneauDebut et que
    // cela crée un trou > 120 min avec le patient suivant, essayer de planifier dès
    // l'arrivée naturelle — à condition que celle-ci soit dans les heures de travail
    // et que la fenêtre du patient soit suffisamment large (> 4h).
    let heureDebut = slot.heure;
    if (slot.heure > heureArriveeNaturelle) {
      const fenetre = getFenetreTemporelle(patient, jourKey);
      const largeFenetre = fenetre !== null && (fenetre.fin - fenetre.debut) > 240;
      const dansHeuresTravail = heureEnMinutes(heureArriveeNaturelle) >= debutJourneeMin;
      const nextCand = ordered[iOrd + 1];
      if (largeFenetre && dansHeuresTravail && nextCand) {
        const heureFinSiCreneau = addMinutes(slot.heure, contrat.dureeMinutes);
        const nextArriveeMin =
          heureEnMinutes(heureFinSiCreneau) + MARGE_ENTRE_SEANCES_MIN + travelMin(matrix, idx, nextCand.idx);
        const nextArriveeStr = appliquerIndispos(minutesEnHeure(nextArriveeMin), indisposJour);
        const nextSlot = ajusterAuCreneauPatient(nextArriveeStr, nextCand.patient, jourKey);
        if (!nextSlot.impossible) {
          const gap = heureEnMinutes(nextSlot.heure) - heureEnMinutes(heureFinSiCreneau);
          if (gap > 120) heureDebut = heureArriveeNaturelle;
        }
      }
    }

    // Premier patient : si le second a un créneau tardif (> 13h00), décaler le premier
    // pour qu'il finisse juste avant le départ vers le second (pas de temps mort entre eux).
    // heureDebut = max(creneauDebut premier, heureDebutSecond - trajet(1→2) - durée1 - MARGE)
    if (iOrd === 0 && ordered.length > 1) {
      const secondCand = ordered[1];
      const secondSlot = ajusterAuCreneauPatient(heureDebutJournee, secondCand.patient, jourKey);
      const fenetre = getFenetreTemporelle(patient, jourKey);
      console.log(
        `[DECALAGE-P1] patient=${patient.nom}, iOrd=${iOrd},`,
        `heureArriveeNaturelle=${heureArriveeNaturelle}, creneauDebut=${slot.heure},`,
        `fenetre=${fenetre ? fenetre.fin - fenetre.debut : 'null'}min,`,
        `secondPatient=${secondCand.patient.nom}, secondSlot=${secondSlot.heure}, secondImpossible=${secondSlot.impossible}`,
      );
      if (!secondSlot.impossible && secondSlot.heure > '13:00') {
        if (fenetre !== null && (fenetre.fin - fenetre.debut) > 240) {
          const trajetVersSecond = travelMin(matrix, idx, secondCand.idx);
          const cibleMin = heureEnMinutes(secondSlot.heure)
            - trajetVersSecond
            - contrat.dureeMinutes
            - MARGE_ENTRE_SEANCES_MIN;
          const candidatMin = Math.max(heureEnMinutes(slot.heure), cibleMin);
          if (candidatMin >= fenetre.debut && candidatMin + contrat.dureeMinutes <= fenetre.fin) {
            heureDebut = arrondirHeure(minutesEnHeure(candidatMin));
            console.log(`[DECALAGE-P1 ACTIVE] cibleMin=${cibleMin}min (${minutesEnHeure(cibleMin)}), candidatMin=${candidatMin}min, heureDebut=${heureDebut}`);
          } else {
            console.log(`[DECALAGE-P1 SKIP] raison=securite_fenetre candidatMin=${candidatMin}min fenetre=[${fenetre.debut}-${fenetre.fin}] duree=${contrat.dureeMinutes}`);
          }
        } else {
          console.log(`[DECALAGE-P1 SKIP] raison=fenetre_trop_petite fenetre=${fenetre ? fenetre.fin - fenetre.debut : 'null'}min (seuil=240)`);
        }
      } else {
        console.log(`[DECALAGE-P1 SKIP] raison=${secondSlot.impossible ? 'second_impossible' : 'second_pas_tardif'} secondSlot.heure=${secondSlot.heure}`);
      }
    }

    const heureFin = addMinutes(heureDebut, contrat.dureeMinutes);

    etapes.push({
      patient,
      contrat,
      seanceExistanteId,
      alreadyPlanned,
      date,
      heureDebut,
      heureFin,
      dureeTrajetMinutes: trajet,
      distanceKm: dist,
      accepted: true,
    });

    heure  = addMinutes(heureFin, MARGE_ENTRE_SEANCES_MIN);
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
    indispos, heureDebutJournee, params.zones ?? [],
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

  // Compte les semaines impossibles par patient — permet de rapporter
  // "raison (3/8 semaines)" au lieu de dédupliquer silencieusement.
  const impossiblesParPatient = new Map<string, { imp: { patient: Participant; raison: string }; count: number }>();
  // Jours choisis la semaine précédente par contrat — passés à assignerJoursSemaine
  // pour favoriser la stabilité (le patient retrouve son praticien le même jour).
  let joursPrecedents: Map<string, JourSemaine[]> | undefined = undefined;

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
      indispos, heureDebutJournee, params.zones ?? [],
      joursPrecedents,
    );

    // Mémoriser les jours choisis pour la stabilité de la semaine suivante.
    joursPrecedents = new Map<string, JourSemaine[]>();
    for (const [contratId, joursAssignes] of assignations) {
      if (joursAssignes.length > 0) {
        joursPrecedents.set(contratId, joursAssignes.map(j => j.jourKey));
      }
    }

    for (const imp of impossibles) {
      const existing = impossiblesParPatient.get(imp.patient.id);
      if (existing) {
        existing.count++;
      } else {
        impossiblesParPatient.set(imp.patient.id, { imp, count: 1 });
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
        const existing = impossiblesParPatient.get(imp.patient.id);
        if (existing) {
          existing.count++;
        } else {
          impossiblesParPatient.set(imp.patient.id, { imp, count: 1 });
        }
      }
      if (etapes.length > 0) {
        jours.push({ jourKey, date: dateStr, label: labelDate(dateStr), etapes });
      }
    }
  }

  // Consolider les impossibles : raison enrichie du nombre de semaines concernées.
  for (const { imp, count } of impossiblesParPatient.values()) {
    allImpossibles.push(
      count > 1
        ? { ...imp, raison: `${imp.raison} (${count}/${nbSemaines} sem.)` }
        : imp,
    );
  }

  // Trier par date
  jours.sort((a, b) => a.date.localeCompare(b.date));

  return { jours, impossibles: allImpossibles, fallbackORS: matrix.fallback, modeB: true };
}

// ── Calcul du prochain lundi ──────────────────────────────────────────────────

// ── Rapport de qualité du planning ───────────────────────────────────────────

export interface TrouCalendrier {
  date: string;           // 'YYYY-MM-DD'
  labelJour: string;      // 'Lundi 23 juin'
  jourKey: JourSemaine;
  dureeMinutes: number;
  nomPatientA: string;    // patient dont la séance précède le trou
  nomPatientB: string;    // patient dont la séance suit le trou
}

export interface RapportQualite {
  nbPlanifies: number;    // patients distincts avec au moins une séance
  nbTotal: number;        // nbPlanifies + patients en impossibles
  distanceSemaineKm: number; // distance totale par semaine (moyenne en mode B)
  jourLePlusCharge:  { label: string; date: string; minutes: number } | null;
  jourLeMoinsCharge: { label: string; date: string; minutes: number } | null;
  nbHorsZone: number;     // séances placées hors des joursAssignes de la zone
  trous: TrouCalendrier[]; // trous > TROU_MAX_MINUTES entre deux séances consécutives
}

export function calculerRapport(
  resultat: ResultatPlanification,
  zones: ZoneGeographique[],
  nbSemaines = 1,
): RapportQualite {
  const patientsPlanifies = new Set<string>();
  let distanceTotaleKm = 0;
  let nbHorsZone = 0;

  // Charge par date (minutes séance + trajet) — pour identifier le jour le +/- chargé.
  const chargeParDate = new Map<string, { label: string; minutes: number }>();

  for (const jour of resultat.jours) {
    let minutesJour = 0;
    for (const etape of jour.etapes) {
      patientsPlanifies.add(etape.patient.id);
      distanceTotaleKm += etape.distanceKm;
      minutesJour += etape.contrat.dureeMinutes + etape.dureeTrajetMinutes;

      if (zones.length > 0) {
        const zonePatient = zones.find(z => z.participantIds.includes(etape.patient.id));
        if (zonePatient && !zonePatient.joursAssignes.includes(jour.jourKey)) nbHorsZone++;
      }
    }
    chargeParDate.set(jour.date, {
      label: jour.label,
      minutes: (chargeParDate.get(jour.date)?.minutes ?? 0) + minutesJour,
    });
  }

  const entries = [...chargeParDate.entries()].map(([date, v]) => ({ date, ...v }));
  entries.sort((a, b) => b.minutes - a.minutes);

  // Détection des trous : gap > TROU_MAX_MINUTES entre deux séances consécutives du même jour.
  const trous: TrouCalendrier[] = [];
  for (const jour of resultat.jours) {
    for (let i = 0; i < jour.etapes.length - 1; i++) {
      const a = jour.etapes[i];
      const b = jour.etapes[i + 1];
      const gap = heureEnMinutes(b.heureDebut) - heureEnMinutes(a.heureFin);
      if (gap > TROU_MAX_MINUTES) {
        const nomA = [a.patient.prenom, a.patient.nom].filter(Boolean).join(' ') || 'Patient';
        const nomB = [b.patient.prenom, b.patient.nom].filter(Boolean).join(' ') || 'Patient';
        trous.push({ date: jour.date, labelJour: jour.label, jourKey: jour.jourKey, dureeMinutes: gap, nomPatientA: nomA, nomPatientB: nomB });
      }
    }
  }

  const patientsImpossibles = new Set(resultat.impossibles.map(i => i.patient.id));
  const nbTotal = patientsPlanifies.size
    + [...patientsImpossibles].filter(id => !patientsPlanifies.has(id)).length;

  return {
    nbPlanifies: patientsPlanifies.size,
    nbTotal,
    distanceSemaineKm: Math.round((distanceTotaleKm / Math.max(nbSemaines, 1)) * 10) / 10,
    jourLePlusCharge:  entries.length > 0 ? { label: entries[0].label, date: entries[0].date, minutes: entries[0].minutes } : null,
    jourLeMoinsCharge: entries.length > 0 ? { label: entries[entries.length - 1].label, date: entries[entries.length - 1].date, minutes: entries[entries.length - 1].minutes } : null,
    nbHorsZone,
    trous,
  };
}

// ── Calcul du prochain lundi ──────────────────────────────────────────────────

export function prochainLundi(today: string): string {
  const d = new Date(today + 'T12:00');
  const dow = d.getDay();
  const jump = dow === 0 ? 1 : dow === 1 ? 7 : 8 - dow;
  d.setDate(d.getDate() + jump);
  return d.toISOString().split('T')[0];
}

export { JOURS_ORDRE, LABELS_JOURS, POIDS_TRAJET, POIDS_ZONE, POIDS_CHARGE, POIDS_STABILITE, CAPACITE_JOURNEE_MINUTES, MARGE_ENTRE_SEANCES_MIN };
