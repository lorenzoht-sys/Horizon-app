import { describe, it, expect } from 'vitest';
import { buildChampsAcroFormPrompt } from './buildCompteRenduStructureContext';
import type { Participant, Programme, ProgrammeExerciceV2, ProgrammeV2, Structure } from '../types';

// Correctif : buildProgrammeText (fonction interne) lisait la colonne V1
// `programme.exercices`, vide pour tout programme créé via useProgrammeV2
// (seul chemin de création actuel) — la ligne "Exercices principaux"
// disparaissait silencieusement du prompt envoyé à l'IA pour un programme
// récent, sans que titre/objectif ne le laissent deviner.

function participant(overrides: Partial<Participant> = {}): Participant {
  return {
    id: 'p-1', prenom: 'Camille', nom: 'Martin', dateNaissance: '1950-01-01',
    bilans: [], objectifsPatient: '', pathologie: '',
    ...overrides,
  } as Participant;
}

function structure(overrides: Partial<Structure> = {}): Structure {
  return { id: 's-1', nom: 'EHPAD Test', token: 't-1', ...overrides } as Structure;
}

function programmeV1(overrides: Partial<Programme> = {}): Programme {
  return {
    id: 'prog-1', participantId: 'p-1', dateCreation: '2026-09-01', dateDebut: '2026-09-01',
    titre: 'Programme équilibre', objectif: 'Prévenir les chutes', messageMotivation: '',
    exercices: [], actif: true, suiviSemaines: [],
    ...overrides,
  };
}

function exerciceProgrammeV2(overrides: Partial<ProgrammeExerciceV2> = {}): ProgrammeExerciceV2 {
  return { id: 'ep-1', seanceId: 'seance-1', nom: 'Équilibre unipodal', series: 3, repetitions: 8, ordre: 0, ...overrides };
}

function programmeV2(overrides: Partial<ProgrammeV2> = {}): ProgrammeV2 {
  return {
    id: 'prog-1', participantId: 'p-1', nom: 'Programme équilibre', objectif: 'Prévenir les chutes',
    type: 'domicile', actif: true, createdAt: '2026-09-01T00:00:00Z',
    seances: [{ id: 'seance-1', programmeId: 'prog-1', nom: 'Séance 1', ordre: 1, exercices: [exerciceProgrammeV2()] }],
    planning: [],
    ...overrides,
  };
}

describe('buildChampsAcroFormPrompt — programme en cours', () => {
  it('affiche les exercices d\'un programme V2 (colonne V1 vide, comme en réalité)', () => {
    const prompt = buildChampsAcroFormPrompt({
      champs: [],
      patient: participant(),
      structure: structure(),
      contratActif: null,
      programmeActif: programmeV1({ exercices: [] }),
      programmesV2: [programmeV2()],
    });
    expect(prompt).toContain('Exercices principaux : Équilibre unipodal');
  });

  it('conserve le repli V1 (catalogue) pour un programme jamais migré vers V2', () => {
    const prompt = buildChampsAcroFormPrompt({
      champs: [],
      patient: participant(),
      structure: structure(),
      contratActif: null,
      programmeActif: programmeV1({ exercices: [{ exerciceId: 'eq-unipodal', niveau: 'intermediaire', series: 3, repetitions: 10, pauseSecondes: 30, frequenceParSemaine: [1], ordre: 0 }] }),
      programmesV2: [],
    });
    // Le catalogue statique (EXERCICES_BASE) doit contenir 'eq-unipodal'
    // pour que ce test soit significatif — sinon la ligne est simplement
    // absente, comportement V1 déjà existant, inchangé par ce correctif.
    expect(prompt).toMatch(/Titre : Programme équilibre/);
  });

  it('ne montre pas la ligne "Exercices principaux" sans aucun exercice, dans les deux cas', () => {
    const promptV1 = buildChampsAcroFormPrompt({
      champs: [], patient: participant(), structure: structure(), contratActif: null,
      programmeActif: programmeV1({ exercices: [] }), programmesV2: [],
    });
    expect(promptV1).not.toContain('Exercices principaux');

    const promptV2SansExercice = buildChampsAcroFormPrompt({
      champs: [], patient: participant(), structure: structure(), contratActif: null,
      programmeActif: programmeV1({ exercices: [] }),
      programmesV2: [programmeV2({ seances: [] })],
    });
    expect(promptV2SansExercice).not.toContain('Exercices principaux');
  });
});
