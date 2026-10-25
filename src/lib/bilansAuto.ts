import { addMonths, format } from 'date-fns';
import type { Seance } from '../types';
import { addMinutes, trouveChevauchement } from '../utils/horaires';

// Programmation automatique des bilans (chantier 15) : logique pure, sans Supabase ni React, pour
// que la règle de calcul des dates soit testée à part (bilansAuto.test.ts).
//
// Règle : à partir du DERNIER bilan connu du bénéficiaire (séance de type bilan non annulée, ou date
// d'un bilan déjà saisi dans sa fiche), on prévoit un bilan tous les N mois, jusqu'à HORIZON_MOIS
// après aujourd'hui. Chaque date est calculée depuis la référence (référence + k × N mois), jamais en
// ajoutant N mois à la date précédente : sinon un 31 janvier devient 28 février puis 28 mai et la
// série dérive.

export const HORIZON_MOIS = 12;
export const FREQUENCES_BILAN_MOIS = [1, 2, 3, 4, 6, 12] as const;
export const DUREE_BILAN_PAR_DEFAUT = 60;
export const HEURE_BILAN_PAR_DEFAUT = '09:00';
// Si le créneau visé est pris, on essaie les suivants du même jour par pas de 30 min.
const PAS_DECALAGE_MIN = 30;
const NB_DECALAGES_MAX = 6;

const estBilan = (s: Seance) => s.type === 'bilan' || s.type === 'bilan_initial';
const estVivante = (s: Seance) => s.statut !== 'annulee' && s.statut !== 'reportee';

function parseJour(date: string): Date {
  return new Date(`${date}T12:00:00`);
}

/** Dernier bilan connu : max entre les séances « bilan » vivantes et les dates de bilans saisis. */
export function referenceBilan(
  seances: Seance[],
  participantId: string,
  datesBilansSaisis: string[] = [],
): { date: string; heureDebut: string | null; dureeMinutes: number | null } | null {
  const bilans = seances
    .filter(s => s.participantId === participantId && estBilan(s) && estVivante(s))
    .sort((a, b) => a.date.localeCompare(b.date));
  const derniere = bilans[bilans.length - 1];
  const derniereSaisie = [...datesBilansSaisis].sort().pop();

  if (derniere && (!derniereSaisie || derniere.date >= derniereSaisie)) {
    return { date: derniere.date, heureDebut: derniere.heureDebut, dureeMinutes: derniere.dureeMinutes };
  }
  if (derniereSaisie) return { date: derniereSaisie, heureDebut: null, dureeMinutes: null };
  return null;
}

/**
 * Dates des bilans à prévoir, strictement après la référence et à partir d'aujourd'hui, dans
 * l'horizon. Triées. Les dates où un bilan vivant existe déjà sont écartées (idempotent).
 */
export function datesBilansAPrevoir(params: {
  reference: string;
  frequenceMois: number;
  aujourdhui: string;
  datesExistantes?: string[];
  horizonMois?: number;
}): string[] {
  const { reference, frequenceMois, aujourdhui, datesExistantes = [], horizonMois = HORIZON_MOIS } = params;
  if (!Number.isInteger(frequenceMois) || frequenceMois < 1) return [];
  const base = parseJour(reference);
  const limite = format(addMonths(parseJour(aujourdhui), horizonMois), 'yyyy-MM-dd');
  const deja = new Set(datesExistantes);
  const dates: string[] = [];
  for (let k = 1; k <= 240; k++) {
    const d = format(addMonths(base, k * frequenceMois), 'yyyy-MM-dd');
    if (d > limite) break;
    if (d < aujourdhui || deja.has(d)) continue;
    dates.push(d);
  }
  return dates;
}

export interface BilanAPoser {
  date: string;
  heureDebut: string;
  heureFin: string;
  dureeMinutes: number;
}

/**
 * Place chaque date : heure de la référence (ou 09:00), décalée par pas de 30 min si une autre
 * séance l'occupe. `nonPlacees` = dates où aucun créneau du jour n'est libre (à signaler au praticien,
 * jamais ignoré en silence). Les créneaux posés par ce même appel comptent comme occupés.
 */
export function placerBilans(
  dates: string[],
  existantes: Seance[],
  heureDebut: string | null,
  dureeMinutes: number | null,
): { aPoser: BilanAPoser[]; nonPlacees: string[] } {
  const debut = heureDebut ?? HEURE_BILAN_PAR_DEFAUT;
  const duree = dureeMinutes && dureeMinutes > 0 ? dureeMinutes : DUREE_BILAN_PAR_DEFAUT;
  const aPoser: BilanAPoser[] = [];
  const nonPlacees: string[] = [];
  let occupees = existantes;

  for (const date of dates) {
    let pose: BilanAPoser | null = null;
    for (let i = 0; i <= NB_DECALAGES_MAX && !pose; i++) {
      const h = addMinutes(debut, i * PAS_DECALAGE_MIN);
      const fin = addMinutes(h, duree);
      // Au-delà de minuit, addMinutes boucle : on s'arrête plutôt que de poser un bilan à 00:30.
      if (fin <= h) break;
      if (!trouveChevauchement(occupees, { date, heureDebut: h, heureFin: fin })) {
        pose = { date, heureDebut: h, heureFin: fin, dureeMinutes: duree };
      }
    }
    if (pose) {
      aPoser.push(pose);
      occupees = [...occupees, { date: pose.date, heureDebut: pose.heureDebut, heureFin: pose.heureFin, statut: 'planifiee' } as Seance];
    } else {
      nonPlacees.push(date);
    }
  }
  return { aPoser, nonPlacees };
}

/**
 * Séances « bilan automatique » encore à venir et planifiées d'un bénéficiaire : celles qu'on retire
 * quand l'option est désactivée ou la fréquence changée. Une séance posée automatiquement puis
 * déplacée à la main perd son marqueur (useAgenda.modifierSeance) et n'est donc jamais retirée.
 */
export function bilansAutoARetirer(seances: Seance[], participantId: string, aujourdhui: string): Seance[] {
  return seances.filter(s =>
    s.participantId === participantId && s.bilanAuto === true && s.statut === 'planifiee' && s.date >= aujourdhui,
  );
}
