// Analyses sur les séances existantes — complémentaires au planificateur.
// Utilisé par ContratNouveauPage pour suggérer des créneaux lors de la création d'un contrat.

import type { Seance, Participant } from '../types';
import { heureEnMinutes } from '../utils/horaires';

const TROU_MIN_SUGGESTION_MINUTES = 60;
const RAYON_ZONE_KM = 5;

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
 * Matching prioritaire : rayon géographique ≤ RAYON_ZONE_KM km (Haversine) si les
 * coordonnées GPS du nouveau patient sont disponibles.
 * Repli : matching par adresseVille exacte (insensible à la casse).
 *
 * Un créneau est retenu s'il apparaît sur ≥ 2 dates distinctes du même jour de semaine.
 */
export function getTrousRecurrents(
  seances: Seance[],
  participants: Participant[],
  newPatientVille: string,
  newPatientCoords?: { lat: number; lng: number },
): CreneauLibre[] {
  // Index participantId → participant (pour coordonnées et ville)
  const participantParId = new Map<string, Participant>();
  for (const p of participants) participantParId.set(p.id, p);

  // Détermine si un participant existant est "dans la même zone" que le nouveau patient
  function dansLaZone(participantId: string): boolean {
    const p = participantParId.get(participantId);
    if (!p) return false;

    if (newPatientCoords && p.coordonnees) {
      return distanceKm(newPatientCoords, p.coordonnees) <= RAYON_ZONE_KM;
    }

    // Repli par ville
    const villeRef = newPatientVille.trim().toLowerCase();
    if (!villeRef) return false;
    return (p.adresseVille ?? '').trim().toLowerCase() === villeRef;
  }

  // Séances de patients dans la zone, non annulées
  const seancesZone = seances.filter(s => s.statut !== 'annulee' && dansLaZone(s.participantId));
  if (seancesZone.length === 0) return [];

  // Grouper par jour de semaine
  const parJour = new Map<number, { date: string; heureDebut: string; heureFin: string }[]>();
  for (const s of seancesZone) {
    const dow = new Date(s.date + 'T12:00').getDay();
    const existing = parJour.get(dow) ?? [];
    existing.push({ date: s.date, heureDebut: s.heureDebut, heureFin: s.heureFin });
    parJour.set(dow, existing);
  }

  const result: CreneauLibre[] = [];

  for (const [dow, occurrences] of parJour) {
    const dates = [...new Set(occurrences.map(o => o.date))];
    if (dates.length < 2) continue;

    const trousCandidats = new Map<string, number>(); // "HH:MM-HH:MM" → nb occurrences

    for (const date of dates) {
      const seancesJour = occurrences
        .filter(o => o.date === date)
        .sort((a, b) => a.heureDebut.localeCompare(b.heureDebut));

      for (let i = 0; i < seancesJour.length - 1; i++) {
        const gap = heureEnMinutes(seancesJour[i + 1].heureDebut) - heureEnMinutes(seancesJour[i].heureFin);
        if (gap >= TROU_MIN_SUGGESTION_MINUTES) {
          const cleHeure = `${seancesJour[i].heureFin}-${seancesJour[i + 1].heureDebut}`;
          trousCandidats.set(cleHeure, (trousCandidats.get(cleHeure) ?? 0) + 1);
        }
      }
    }

    for (const [cleHeure, nb] of trousCandidats) {
      if (nb < 2) continue;
      const [debut, fin] = cleHeure.split('-');
      result.push({
        jourSemaine: dow,
        nomJour: NOMS_JOURS[dow],
        heureDebut: debut,
        heureFin: fin,
        dureeMinutes: heureEnMinutes(fin) - heureEnMinutes(debut),
      });
    }
  }

  return result.sort((a, b) =>
    a.jourSemaine !== b.jourSemaine
      ? a.jourSemaine - b.jourSemaine
      : a.heureDebut.localeCompare(b.heureDebut)
  );
}
