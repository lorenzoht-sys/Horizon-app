// Analyses sur les séances existantes — complémentaires au planificateur.
// Utilisé par ContratNouveauPage pour suggérer des créneaux lors de la création d'un contrat.

import type { Seance, Participant, JourSemaine } from '../types';
import { heureEnMinutes, minutesEnHeure, MARGE_ENTRE_SEANCES_MIN } from '../utils/horaires';

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

// Mapping JS getDay() → JourSemaine (dim exclu = undefined)
const DOW_TO_JOUR_SEMAINE: Record<number, JourSemaine | undefined> = {
  1: 'lun', 2: 'mar', 3: 'mer', 4: 'jeu', 5: 'ven', 6: 'sam',
};

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

// Marge dynamique : trajet estimé depuis le patient précédent vers le nouveau.
// ~24 km/h en zone rurale/périurbaine → 2.5 min/km. Minimum = MARGE_ENTRE_SEANCES_MIN.
function margeTrajet(
  coordsPrecedent: { lat: number; lng: number } | undefined,
  newPatientCoords: { lat: number; lng: number } | undefined,
): number {
  if (!coordsPrecedent || !newPatientCoords) return MARGE_ENTRE_SEANCES_MIN;
  return Math.max(MARGE_ENTRE_SEANCES_MIN, Math.round(distanceKm(coordsPrecedent, newPatientCoords) * 2.5));
}

// Arrondit un nombre de minutes à la tranche de 5 min supérieure (jamais inférieure).
function arrondirA5Min(minutes: number): number {
  return Math.ceil(minutes / 5) * 5;
}

function filtrerParIndispos(slots: CreneauLibre[], indisponibilites?: JourSemaine[]): CreneauLibre[] {
  if (!indisponibilites?.length) return slots;
  return slots.filter(c => {
    const jour = DOW_TO_JOUR_SEMAINE[c.jourSemaine];
    return jour === undefined || !indisponibilites.includes(jour);
  });
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
  0: 'Dim', 1: 'Lun', 2: 'Mar', 3: 'Mer', 4: 'Jeu', 5: 'Ven', 6: 'Sam',
};

export type DisposPatient = {
  joursDisponibles?: string[];
  creneauxParJour?: Record<string, { debut: string; fin: string }[]>;
};

// Slot interne incluant le participantId pour la marge dynamique.
type SlotInternal = { debut: number; fin: number; participantId: string };

/**
 * Créneaux libres récurrents sur l'ensemble du planning de Pierre (sans filtre zone).
 * Utilisé en fallback quand aucune séance n'existe dans la zone du nouveau patient.
 * Même logique que getTrousRecurrents mais toutes séances confondues.
 */
export function getCreneauxLibresGlobal(
  seances: Seance[],
  participants: Participant[],
  newPatientCoords?: { lat: number; lng: number },
  newPatientDispos?: DisposPatient,
  indisponibilites?: JourSemaine[],
): CreneauLibre[] {
  const seancesActives = seances.filter(s => s.statut !== 'annulee');
  if (seancesActives.length === 0) return [];

  const participantParId = new Map<string, Participant>();
  for (const p of participants) participantParId.set(p.id, p);

  const parJour = new Map<number, SlotInternal[]>();
  const datesParJour = new Map<number, Set<string>>();
  for (const s of seancesActives) {
    const dow = new Date(s.date + 'T12:00').getDay();
    const slots = parJour.get(dow) ?? [];
    slots.push({ debut: heureEnMinutes(s.heureDebut), fin: heureEnMinutes(s.heureFin), participantId: s.participantId });
    parJour.set(dow, slots);
    const dates = datesParJour.get(dow) ?? new Set();
    dates.add(s.date);
    datesParJour.set(dow, dates);
  }

  const debutTravailMin = heureEnMinutes(HEURE_DEBUT_TRAVAIL);
  const finTravailMin   = heureEnMinutes(HEURE_FIN_TRAVAIL);
  const result: CreneauLibre[] = [];

  for (const [dow, slots] of parJour) {
    const nbDates = datesParJour.get(dow)?.size ?? 0;
    if (nbDates < 2) {
      continue;
    }

    slots.sort((a, b) => a.debut - b.debut);
    const fusionnes: SlotInternal[] = [];
    for (const s of slots) {
      if (fusionnes.length === 0 || s.debut > fusionnes[fusionnes.length - 1].fin) {
        fusionnes.push({ ...s });
      } else {
        const last = fusionnes[fusionnes.length - 1];
        if (s.fin > last.fin) {
          last.fin = s.fin;
          last.participantId = s.participantId;
        }
      }
    }

    if (fusionnes[0].debut - debutTravailMin >= TROU_MIN_SUGGESTION_MINUTES) {
      result.push({ jourSemaine: dow, nomJour: NOMS_JOURS[dow], heureDebut: HEURE_DEBUT_TRAVAIL, heureFin: minutesEnHeure(fusionnes[0].debut), dureeMinutes: fusionnes[0].debut - debutTravailMin });
    }
    for (let i = 0; i < fusionnes.length - 1; i++) {
      const coordsPrev = participantParId.get(fusionnes[i].participantId)?.coordonnees;
      const marge = margeTrajet(coordsPrev, newPatientCoords);
      const debutCreneau = arrondirA5Min(fusionnes[i].fin + marge);
      const gap = fusionnes[i + 1].debut - debutCreneau;
      if (gap >= TROU_MIN_SUGGESTION_MINUTES) {
        result.push({ jourSemaine: dow, nomJour: NOMS_JOURS[dow], heureDebut: minutesEnHeure(debutCreneau), heureFin: minutesEnHeure(fusionnes[i + 1].debut), dureeMinutes: gap });
      }
    }
    const last = fusionnes[fusionnes.length - 1];
    const coordsPrev = participantParId.get(last.participantId)?.coordonnees;
    const margeApres = margeTrajet(coordsPrev, newPatientCoords);
    const debutApres = arrondirA5Min(last.fin + margeApres);
    const gapApres = finTravailMin - debutApres;
    if (gapApres >= TROU_MIN_SUGGESTION_MINUTES) {
      result.push({ jourSemaine: dow, nomJour: NOMS_JOURS[dow], heureDebut: minutesEnHeure(debutApres), heureFin: HEURE_FIN_TRAVAIL, dureeMinutes: gapApres });
    }
  }

  const sorted = result.sort((a, b) =>
    a.jourSemaine !== b.jourSemaine ? a.jourSemaine - b.jourSemaine : a.heureDebut.localeCompare(b.heureDebut)
  );

  const filtres = filtrerParIndispos(sorted, indisponibilites);

  if (!newPatientDispos) return filtres;

  const { joursDisponibles = [], creneauxParJour = {} } = newPatientDispos;
  const final = filtres.filter(c => {
    const cleJour = DOW_TO_DISPO[c.jourSemaine];
    if (!cleJour) return false;
    if (joursDisponibles.length > 0 && !joursDisponibles.includes(cleJour)) return false;
    const slots = creneauxParJour[cleJour];
    if (!slots || slots.length === 0) return true;
    const debutC = heureEnMinutes(c.heureDebut);
    const finC   = heureEnMinutes(c.heureFin);
    const ok = slots.some(s => heureEnMinutes(s.debut) < finC && heureEnMinutes(s.fin) > debutC);
    return ok;
  });
  return final;
}

export function getTrousRecurrents(
  seances: Seance[],
  participants: Participant[],
  newPatientVille: string,
  newPatientCoords?: { lat: number; lng: number },
  newPatientDispos?: DisposPatient,
  indisponibilites?: JourSemaine[],
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
  const parJour = new Map<number, SlotInternal[]>();
  const datesParJour = new Map<number, Set<string>>();
  for (const s of seancesZone) {
    const dow = new Date(s.date + 'T12:00').getDay();
    const slots = parJour.get(dow) ?? [];
    slots.push({ debut: heureEnMinutes(s.heureDebut), fin: heureEnMinutes(s.heureFin), participantId: s.participantId });
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
    const fusionnes: SlotInternal[] = [];
    for (const s of slots) {
      if (fusionnes.length === 0 || s.debut > fusionnes[fusionnes.length - 1].fin) {
        fusionnes.push({ ...s });
      } else {
        const last = fusionnes[fusionnes.length - 1];
        if (s.fin > last.fin) {
          last.fin = s.fin;
          last.participantId = s.participantId;
        }
      }
    }

    // Trou avant la 1ère séance — pas de patient précédent, pas de marge trajet
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
      const coordsPrev = participantParId.get(fusionnes[i].participantId)?.coordonnees;
      const marge = margeTrajet(coordsPrev, newPatientCoords);
      const debutCreneau = arrondirA5Min(fusionnes[i].fin + marge);
      const gap = fusionnes[i + 1].debut - debutCreneau;
      if (gap >= TROU_MIN_SUGGESTION_MINUTES) {
        result.push({
          jourSemaine: dow,
          nomJour: NOMS_JOURS[dow],
          heureDebut:  minutesEnHeure(debutCreneau),
          heureFin:    minutesEnHeure(fusionnes[i + 1].debut),
          dureeMinutes: gap,
        });
      }
    }

    // Trou après la dernière séance
    const last = fusionnes[fusionnes.length - 1];
    const coordsPrev = participantParId.get(last.participantId)?.coordonnees;
    const margeApres = margeTrajet(coordsPrev, newPatientCoords);
    const debutApres = arrondirA5Min(last.fin + margeApres);
    if (finTravailMin - debutApres >= TROU_MIN_SUGGESTION_MINUTES) {
      result.push({
        jourSemaine: dow,
        nomJour: NOMS_JOURS[dow],
        heureDebut:  minutesEnHeure(debutApres),
        heureFin:    HEURE_FIN_TRAVAIL,
        dureeMinutes: finTravailMin - debutApres,
      });
    }
  }

  const sorted = result.sort((a, b) =>
    a.jourSemaine !== b.jourSemaine
      ? a.jourSemaine - b.jourSemaine
      : a.heureDebut.localeCompare(b.heureDebut)
  );

  const filtres = filtrerParIndispos(sorted, indisponibilites);

  if (!newPatientDispos) return filtres;

  const { joursDisponibles = [], creneauxParJour = {} } = newPatientDispos;
  return filtres.filter(c => {
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
