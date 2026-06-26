// Analyses sur les séances existantes — complémentaires au planificateur.
// Utilisé par ContratNouveauPage pour suggérer des créneaux lors de la création d'un contrat.

import type { Seance, Participant } from '../types';
import { heureEnMinutes } from '../utils/horaires';

const TROU_MIN_SUGGESTION_MINUTES = 60; // créneau libre minimum pour être suggéré

export interface CreneauLibre {
  jourSemaine: number;        // 0=dim…6=sam (JS Date.getDay())
  nomJour: string;            // 'Lundi', 'Mardi'…
  heureDebut: string;         // début du trou (ex: '10:30')
  heureFin: string;           // fin du trou (ex: '12:00')
  dureeMinutes: number;
}

const NOMS_JOURS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

/**
 * Détecte les créneaux libres récurrents dans les jours où le praticien a déjà
 * des séances proches du nouveau patient (même ville).
 *
 * Approche : pour chaque jour de semaine où ≥2 occurrences de séances
 * chez des patients de la même ville existent, cherche les écarts > seuil
 * entre séances consécutives sur ce jour.
 */
export function getTrousRecurrents(
  seances: Seance[],
  participants: Participant[],
  newPatientVille: string,
): CreneauLibre[] {
  if (!newPatientVille.trim()) return [];

  const villeRef = newPatientVille.trim().toLowerCase();

  // Index participantId → ville
  const villeParParticipant = new Map<string, string>();
  for (const p of participants) {
    if (p.adresseVille) villeParParticipant.set(p.id, p.adresseVille.trim().toLowerCase());
  }

  // Séances de patients dans la même ville, non annulées
  const seancesZone = seances.filter(s =>
    s.statut !== 'annulee' &&
    (villeParParticipant.get(s.participantId) ?? '') === villeRef
  );

  if (seancesZone.length === 0) return [];

  // Grouper par jour de semaine → liste de { heureDebut, heureFin } par occurrence de date
  const parJour = new Map<number, { date: string; heureDebut: string; heureFin: string }[]>();
  for (const s of seancesZone) {
    const dow = new Date(s.date + 'T12:00').getDay();
    const existing = parJour.get(dow) ?? [];
    existing.push({ date: s.date, heureDebut: s.heureDebut, heureFin: s.heureFin });
    parJour.set(dow, existing);
  }

  const result: CreneauLibre[] = [];

  for (const [dow, occurrences] of parJour) {
    // Garder uniquement les jours avec au moins 2 occurrences (pattern récurrent)
    const dates = [...new Set(occurrences.map(o => o.date))];
    if (dates.length < 2) continue;

    // Moyenne des positions de séances sur ce jour pour représenter un "jour type"
    // On groupe par date, puis on cherche les trous sur chaque journée, et on ne
    // retient que les trous qui apparaissent sur au moins 2 dates distinctes.
    const trousCandidats = new Map<string, number>(); // clé "HH:MM-HH:MM" → nb occurrences

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
      if (nb < 2) continue; // non récurrent
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

  // Trier par jour de semaine (lun → sam), puis par heure de début
  return result.sort((a, b) =>
    a.jourSemaine !== b.jourSemaine
      ? a.jourSemaine - b.jourSemaine
      : a.heureDebut.localeCompare(b.heureDebut)
  );
}
