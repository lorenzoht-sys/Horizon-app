// Analyses sur les séances existantes — complémentaires au planificateur.
// Utilisé par ContratNouveauPage pour suggérer des créneaux lors de la création d'un contrat.

import type { Seance, Participant } from '../types';
import { heureEnMinutes, minutesEnHeure } from '../utils/horaires';

const TROU_MIN_SUGGESTION_MINUTES = 45;
const RAYON_ZONE_KM = 5;
const HEURE_DEBUT_TRAVAIL = '08:00'; // plage de travail de Pierre — début
const HEURE_FIN_TRAVAIL   = '19:00'; // plage de travail de Pierre — fin

export interface CreneauLibre {
  jourSemaine: number;        // 0=dim…6=sam (JS Date.getDay())
  nomJour: string;            // 'Lundi', 'Mardi'…
  heureDebut: string;
  heureFin: string;
  dureeMinutes: number;
}

const NOMS_JOURS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

// Formule Haversine — identique à kmeans.ts (non exportée là-bas)
function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLon = (b.lng - a.lng) * Math.PI / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

/**
 * Détecte les créneaux libres récurrents dans les jours où le praticien a déjà
 * des séances proches du nouveau patient.
 *
 * Pour chaque jour de semaine avec ≥ 2 occurrences dans la zone :
 *   1. Fusionne toutes les séances (tous patients, toutes dates confondus) en
 *      une timeline unifiée — évite les doublons "08:00-Xh" / "08:00-Yh".
 *   2. Fusionne les intervalles qui se chevauchent (union).
 *   3. Détecte les trous avant la 1ère séance, entre séances et après la dernière.
 *
 * Matching prioritaire : rayon géographique ≤ RAYON_ZONE_KM km (Haversine).
 * Repli : matching par adresseVille exacte (insensible à la casse).
 */
const DOW_TO_DISPO: Record<number, string> = {
  1: 'Lun', 2: 'Mar', 3: 'Mer', 4: 'Jeu', 5: 'Ven', 6: 'Sam',
};

export type DisposPatient = {
  joursDisponibles?: string[];
  creneauxParJour?: Record<string, { debut: string; fin: string }[]>;
};

/**
 * Créneaux libres récurrents sur l'ensemble du planning de Pierre (sans filtre zone).
 * Utilisé en fallback quand aucune séance n'existe dans la zone du nouveau patient.
 * Même logique que getTrousRecurrents mais toutes séances confondues.
 */
export function getCreneauxLibresGlobal(
  seances: Seance[],
  newPatientDispos?: DisposPatient,
): CreneauLibre[] {
  const seancesActives = seances.filter(s => s.statut !== 'annulee');
  if (seancesActives.length === 0) return [];

  const parJour = new Map<number, { debut: number; fin: number }[]>();
  const datesParJour = new Map<number, Set<string>>();
  for (const s of seancesActives) {
    const dow = new Date(s.date + 'T12:00').getDay();
    const slots = parJour.get(dow) ?? [];
    slots.push({ debut: heureEnMinutes(s.heureDebut), fin: heureEnMinutes(s.heureFin) });
    parJour.set(dow, slots);
    const dates = datesParJour.get(dow) ?? new Set();
    dates.add(s.date);
    datesParJour.set(dow, dates);
  }

  const debutTravailMin = heureEnMinutes(HEURE_DEBUT_TRAVAIL);
  const finTravailMin   = heureEnMinutes(HEURE_FIN_TRAVAIL);
  const result: CreneauLibre[] = [];

  for (const [dow, slots] of parJour) {
    if ((datesParJour.get(dow)?.size ?? 0) < 2) continue;

    slots.sort((a, b) => a.debut - b.debut);
    const fusionnes: { debut: number; fin: number }[] = [];
    for (const s of slots) {
      if (fusionnes.length === 0 || s.debut > fusionnes[fusionnes.length - 1].fin) {
        fusionnes.push({ ...s });
      } else {
        fusionnes[fusionnes.length - 1].fin = Math.max(fusionnes[fusionnes.length - 1].fin, s.fin);
      }
    }

    if (fusionnes[0].debut - debutTravailMin >= TROU_MIN_SUGGESTION_MINUTES) {
      result.push({ jourSemaine: dow, nomJour: NOMS_JOURS[dow], heureDebut: HEURE_DEBUT_TRAVAIL, heureFin: minutesEnHeure(fusionnes[0].debut), dureeMinutes: fusionnes[0].debut - debutTravailMin });
    }
    for (let i = 0; i < fusionnes.length - 1; i++) {
      const gap = fusionnes[i + 1].debut - fusionnes[i].fin;
      if (gap >= TROU_MIN_SUGGESTION_MINUTES) {
        result.push({ jourSemaine: dow, nomJour: NOMS_JOURS[dow], heureDebut: minutesEnHeure(fusionnes[i].fin), heureFin: minutesEnHeure(fusionnes[i + 1].debut), dureeMinutes: gap });
      }
    }
    if (finTravailMin - fusionnes[fusionnes.length - 1].fin >= TROU_MIN_SUGGESTION_MINUTES) {
      result.push({ jourSemaine: dow, nomJour: NOMS_JOURS[dow], heureDebut: minutesEnHeure(fusionnes[fusionnes.length - 1].fin), heureFin: HEURE_FIN_TRAVAIL, dureeMinutes: finTravailMin - fusionnes[fusionnes.length - 1].fin });
    }
  }

  const sorted = result.sort((a, b) =>
    a.jourSemaine !== b.jourSemaine ? a.jourSemaine - b.jourSemaine : a.heureDebut.localeCompare(b.heureDebut)
  );

  if (!newPatientDispos) return sorted;

  const { joursDisponibles = [], creneauxParJour = {} } = newPatientDispos;
  return sorted.filter(c => {
    const cleJour = DOW_TO_DISPO[c.jourSemaine];
    if (!cleJour) return false;
    if (joursDisponibles.length > 0 && !joursDisponibles.includes(cleJour)) return false;
    const slots = creneauxParJour[cleJour];
    if (!slots || slots.length === 0) return true;
    const debutC = heureEnMinutes(c.heureDebut);
    const finC   = heureEnMinutes(c.heureFin);
    return slots.some(s => heureEnMinutes(s.debut) < finC && heureEnMinutes(s.fin) > debutC);
  });
}

export function getTrousRecurrents(
  seances: Seance[],
  participants: Participant[],
  newPatientVille: string,
  newPatientCoords?: { lat: number; lng: number },
  newPatientDispos?: DisposPatient,
): CreneauLibre[] {
  // Index participantId → participant
  const participantParId = new Map<string, Participant>();
  for (const p of participants) participantParId.set(p.id, p);

  function dansLaZone(participantId: string): boolean {
    const p = participantParId.get(participantId);
    if (!p) return false;
    if (newPatientCoords && p.coordonnees) {
      return distanceKm(newPatientCoords, p.coordonnees) <= RAYON_ZONE_KM;
    }
    const villeRef = newPatientVille.trim().toLowerCase();
    if (!villeRef) return false;
    return (p.adresseVille ?? '').trim().toLowerCase() === villeRef;
  }

  const seancesZone = seances.filter(s => s.statut !== 'annulee' && dansLaZone(s.participantId));
  if (seancesZone.length === 0) return [];

  // Grouper par jour de semaine (toutes dates confondues)
  const parJour = new Map<number, { debut: number; fin: number }[]>();
  const datesParJour = new Map<number, Set<string>>();
  for (const s of seancesZone) {
    const dow = new Date(s.date + 'T12:00').getDay();
    const slots = parJour.get(dow) ?? [];
    slots.push({ debut: heureEnMinutes(s.heureDebut), fin: heureEnMinutes(s.heureFin) });
    parJour.set(dow, slots);
    const dates = datesParJour.get(dow) ?? new Set();
    dates.add(s.date);
    datesParJour.set(dow, dates);
  }

  const debutTravailMin = heureEnMinutes(HEURE_DEBUT_TRAVAIL);
  const finTravailMin   = heureEnMinutes(HEURE_FIN_TRAVAIL);

  const result: CreneauLibre[] = [];

  for (const [dow, slots] of parJour) {
    // Ignorer les jours non récurrents (présents sur une seule date)
    if ((datesParJour.get(dow)?.size ?? 0) < 2) continue;

    // Trier puis fusionner les intervalles qui se chevauchent (union)
    slots.sort((a, b) => a.debut - b.debut);
    const fusionnes: { debut: number; fin: number }[] = [];
    for (const s of slots) {
      if (fusionnes.length === 0 || s.debut > fusionnes[fusionnes.length - 1].fin) {
        fusionnes.push({ ...s });
      } else {
        fusionnes[fusionnes.length - 1].fin = Math.max(fusionnes[fusionnes.length - 1].fin, s.fin);
      }
    }

    // Trou avant la 1ère séance
    if (fusionnes[0].debut - debutTravailMin >= TROU_MIN_SUGGESTION_MINUTES) {
      result.push({
        jourSemaine: dow,
        nomJour: NOMS_JOURS[dow],
        heureDebut: HEURE_DEBUT_TRAVAIL,
        heureFin:   minutesEnHeure(fusionnes[0].debut),
        dureeMinutes: fusionnes[0].debut - debutTravailMin,
      });
    }

    // Trous entre séances fusionnées consécutives
    for (let i = 0; i < fusionnes.length - 1; i++) {
      const gap = fusionnes[i + 1].debut - fusionnes[i].fin;
      if (gap >= TROU_MIN_SUGGESTION_MINUTES) {
        result.push({
          jourSemaine: dow,
          nomJour: NOMS_JOURS[dow],
          heureDebut:  minutesEnHeure(fusionnes[i].fin),
          heureFin:    minutesEnHeure(fusionnes[i + 1].debut),
          dureeMinutes: gap,
        });
      }
    }

    // Trou après la dernière séance
    if (finTravailMin - fusionnes[fusionnes.length - 1].fin >= TROU_MIN_SUGGESTION_MINUTES) {
      result.push({
        jourSemaine: dow,
        nomJour: NOMS_JOURS[dow],
        heureDebut:  minutesEnHeure(fusionnes[fusionnes.length - 1].fin),
        heureFin:    HEURE_FIN_TRAVAIL,
        dureeMinutes: finTravailMin - fusionnes[fusionnes.length - 1].fin,
      });
    }
  }

  const sorted = result.sort((a, b) =>
    a.jourSemaine !== b.jourSemaine
      ? a.jourSemaine - b.jourSemaine
      : a.heureDebut.localeCompare(b.heureDebut)
  );

  if (!newPatientDispos) return sorted;

  const { joursDisponibles = [], creneauxParJour = {} } = newPatientDispos;
  return sorted.filter(c => {
    const cleJour = DOW_TO_DISPO[c.jourSemaine];
    if (!cleJour) return false;
    if (joursDisponibles.length > 0 && !joursDisponibles.includes(cleJour)) return false;
    const slots = creneauxParJour[cleJour];
    if (!slots || slots.length === 0) return true;
    const debutC = heureEnMinutes(c.heureDebut);
    const finC   = heureEnMinutes(c.heureFin);
    return slots.some(s => heureEnMinutes(s.debut) < finC && heureEnMinutes(s.fin) > debutC);
  });
}
