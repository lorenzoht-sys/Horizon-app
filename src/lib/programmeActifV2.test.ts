import { describe, it, expect } from 'vitest';
import { programmeV2Actif } from './programmeActifV2';
import type { Programme, ProgrammeExerciceV2, ProgrammeV2 } from '../types';

// Correctif : trois surfaces (dossier praticien, compte-rendu structure,
// et la carte "Programme en cours" de ParticipantProfile.tsx) lisaient la
// colonne V1 `exercices`, vide pour tout programme créé via useProgrammeV2
// (seul chemin de création actuel, ProgrammePage.tsx). Ce test couvre le
// lookup partagé qui corrige les deux premières.

function programmeV1(overrides: Partial<Programme> = {}): Programme {
  return {
    id: 'prog-1',
    participantId: 'p-1',
    dateCreation: '2026-09-01',
    dateDebut: '2026-09-01',
    titre: 'Programme équilibre',
    objectif: 'Prévenir les chutes',
    messageMotivation: '',
    exercices: [],
    actif: true,
    suiviSemaines: [],
    ...overrides,
  };
}

function exerciceProgrammeV2(overrides: Partial<ProgrammeExerciceV2> = {}): ProgrammeExerciceV2 {
  return {
    id: 'ep-1',
    seanceId: 'seance-1',
    nom: 'Équilibre unipodal',
    series: 3,
    repetitions: 8,
    ordre: 0,
    ...overrides,
  };
}

function programmeV2(overrides: Partial<ProgrammeV2> = {}): ProgrammeV2 {
  return {
    id: 'prog-1',
    participantId: 'p-1',
    nom: 'Programme équilibre',
    objectif: 'Prévenir les chutes',
    type: 'domicile',
    actif: true,
    createdAt: '2026-09-01T00:00:00Z',
    seances: [{ id: 'seance-1', programmeId: 'prog-1', nom: 'Séance 1', ordre: 1, exercices: [exerciceProgrammeV2()] }],
    planning: [],
    ...overrides,
  };
}

describe('programmeV2Actif', () => {
  it('retourne null si aucun programme actif', () => {
    expect(programmeV2Actif(null, [programmeV2()])).toBeNull();
  });

  it('retourne null si le programme actif est purement V1 (jamais migré vers V2)', () => {
    expect(programmeV2Actif(programmeV1(), [])).toBeNull();
    expect(programmeV2Actif(programmeV1(), [programmeV2({ id: 'un-autre-id' })])).toBeNull();
  });

  it('retrouve le programme V2 correspondant (même id) — le cas du bug corrigé', () => {
    const v1 = programmeV1({ id: 'prog-1', exercices: [] }); // colonne V1 vide, comme en réalité pour tout programme créé via V2
    const v2 = programmeV2({ id: 'prog-1' });
    const resultat = programmeV2Actif(v1, [v2, programmeV2({ id: 'autre-prog' })]);
    expect(resultat).toBe(v2);
    expect(resultat!.seances[0].exercices).toHaveLength(1);
  });
});
