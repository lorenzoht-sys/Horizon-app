import type { Programme, ProgrammeV2 } from '../types';

/**
 * Le programme V2 (mêmes id) correspondant à un programme actif V1, s'il
 * existe. Toute création récente d'un programme passe exclusivement par
 * useProgrammeV2 (ProgrammePage.tsx), qui laisse vide la colonne JSON
 * `exercices` que porte encore la ligne lue par useProgramme (V1) — lire
 * `.exercices` sur un `Programme` actif sans ce lookup fait apparaître à
 * tort tout programme récent comme vide (0 exercice, ligne absente).
 *
 * Même pattern que ParticipantProfile.tsx (handleTelechargerProgrammePDF,
 * la carte « Programme en cours ») et EspacePatient.tsx.
 */
export function programmeV2Actif(
  programmeActif: Programme | null,
  programmesV2: ProgrammeV2[],
): ProgrammeV2 | null {
  if (!programmeActif) return null;
  return programmesV2.find(p => p.id === programmeActif.id) ?? null;
}
