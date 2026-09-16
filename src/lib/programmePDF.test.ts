import { describe, it, expect } from 'vitest';
import { normaliserProgrammeV1, normaliserProgrammeV2 } from './programmePDF';
import type { Exercice, ExerciceProgramme, Programme, ProgrammeExerciceV2, ProgrammeV2 } from '../types';

function exerciceCatalogue(overrides: Partial<Exercice> = {}): Exercice {
  return {
    id: 'eq-unipodal',
    nom: 'Équilibre unipodal',
    categorie: 'equilibre',
    description: 'Tenir en appui sur une jambe.',
    consigneSecurite: 'Rester près d\'un appui.',
    videoYoutubeId: 'abc123',
    niveaux: { debutant: '10 secondes', intermediaire: '20 secondes', avance: '30 secondes' },
    dureeEstimeeMinutes: 5,
    adaptations: { fauteuil_roulant: 'Réaliser assis, pied levé.' },
    niveau_config: {
      '1': { series: 2, repetitions: 5, duree_secondes: null, description: '5 répétitions', conseil: '' },
      '2': { series: 3, repetitions: 8, duree_secondes: null, description: '8 répétitions', conseil: '' },
      '3': { series: 3, repetitions: 12, duree_secondes: null, description: '12 répétitions', conseil: '' },
    },
    ...overrides,
  };
}

function exerciceProgrammeV1(overrides: Partial<ExerciceProgramme> = {}): ExerciceProgramme {
  return {
    exerciceId: 'eq-unipodal',
    niveau: 'intermediaire',
    series: 3,
    repetitions: 10,
    pauseSecondes: 30,
    frequenceParSemaine: [3, 1],
    ordre: 0,
    ...overrides,
  };
}

function programmeV1(overrides: Partial<Programme> = {}): Programme {
  return {
    id: 'prog-1',
    participantId: 'p-1',
    dateCreation: '2026-09-01',
    dateDebut: '2026-09-01',
    titre: 'Programme équilibre',
    objectif: 'Prévenir les chutes',
    messageMotivation: 'On y va doucement',
    exercices: [exerciceProgrammeV1()],
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
    categorie: 'equilibre',
    description: 'Tenir sur une jambe',
    conseilSecurite: 'Près d\'un appui',
    series: 3,
    repetitions: 8,
    ordre: 0,
    exerciceId: 'eq-unipodal',
    niveau: '2',
    ...overrides,
  };
}

function programmeV2(overrides: Partial<ProgrammeV2> = {}): ProgrammeV2 {
  return {
    id: 'progv2-1',
    participantId: 'p-1',
    nom: 'Programme V2',
    objectif: 'Renforcement',
    messageMotivation: 'Continuez comme ça',
    type: 'domicile',
    actif: true,
    createdAt: '2026-09-10',
    seances: [
      { id: 'seance-1', programmeId: 'progv2-1', nom: 'Séance A', ordre: 0, exercices: [exerciceProgrammeV2()] },
      { id: 'seance-2', programmeId: 'progv2-1', nom: 'Séance B', ordre: 1, exercices: [exerciceProgrammeV2({ id: 'ep-2', seanceId: 'seance-2', nom: 'Marche', exerciceId: undefined, categorie: 'endurance', niveau: undefined })] },
    ],
    planning: [
      { id: 'pl-1', programmeId: 'progv2-1', seanceId: 'seance-1', jour: 'lundi' },
      { id: 'pl-2', programmeId: 'progv2-1', seanceId: 'seance-1', jour: 'jeudi' },
      { id: 'pl-3', programmeId: 'progv2-1', seanceId: 'seance-2', jour: 'mercredi' },
    ],
    ...overrides,
  };
}

describe('normaliserProgrammeV1', () => {
  it('produit une seule séance implicite portant le titre du programme', () => {
    const r = normaliserProgrammeV1(programmeV1(), [exerciceCatalogue()]);
    expect(r.seances).toHaveLength(1);
    expect(r.seances[0].nom).toBe('Programme équilibre');
    expect(r.titre).toBe('Programme équilibre');
    expect(r.dateDebut).toBe('2026-09-01');
    expect(r.dateReference).toBe('2026-09-01');
  });

  it('résout nom/catégorie/description depuis le catalogue', () => {
    const r = normaliserProgrammeV1(programmeV1(), [exerciceCatalogue()]);
    const ex = r.seances[0].exercices[0];
    expect(ex.nom).toBe('Équilibre unipodal');
    expect(ex.categorie).toBe('equilibre');
    expect(ex.description).toBe('Tenir en appui sur une jambe.');
    expect(ex.series).toBe(3);
    expect(ex.repetitions).toBe(10);
  });

  it('résout le libellé de niveau avec le texte du catalogue', () => {
    const r = normaliserProgrammeV1(programmeV1(), [exerciceCatalogue()]);
    expect(r.seances[0].exercices[0].niveauLabel).toBe('Intermédiaire : 20 secondes');
  });

  it('trie les jours actifs', () => {
    const r = normaliserProgrammeV1(programmeV1(), [exerciceCatalogue()]);
    expect(r.seances[0].exercices[0].joursActifs).toEqual([1, 3]);
  });

  it('ignore un exercice dont l\'id ne correspond plus à aucun exercice du catalogue', () => {
    const prog = programmeV1({
      exercices: [exerciceProgrammeV1({ exerciceId: 'eq-unipodal' }), exerciceProgrammeV1({ exerciceId: 'supprime', ordre: 1 })],
    });
    const r = normaliserProgrammeV1(prog, [exerciceCatalogue()]);
    expect(r.seances[0].exercices).toHaveLength(1);
    expect(r.seances[0].exercices[0].id).toBe('eq-unipodal');
  });

  it('ne résout une adaptation que si le profil handicap est fourni et couvert', () => {
    const sansProfil = normaliserProgrammeV1(programmeV1(), [exerciceCatalogue()]);
    expect(sansProfil.seances[0].exercices[0].adaptationTexte).toBeUndefined();

    const avecProfil = normaliserProgrammeV1(programmeV1(), [exerciceCatalogue()], 'fauteuil_roulant');
    expect(avecProfil.seances[0].exercices[0].adaptationTexte).toBe('Réaliser assis, pied levé.');

    const profilNonCouvert = normaliserProgrammeV1(programmeV1(), [exerciceCatalogue()], 'parkinson');
    expect(profilNonCouvert.seances[0].exercices[0].adaptationTexte).toBeUndefined();
  });

  it('trie les exercices par ordre', () => {
    const prog = programmeV1({
      exercices: [
        exerciceProgrammeV1({ exerciceId: 'eq-unipodal', ordre: 1 }),
        exerciceProgrammeV1({ exerciceId: 'eq-unipodal-2', ordre: 0 }),
      ],
    });
    const r = normaliserProgrammeV1(prog, [exerciceCatalogue(), exerciceCatalogue({ id: 'eq-unipodal-2', nom: 'Deuxième' })]);
    expect(r.seances[0].exercices.map(e => e.nom)).toEqual(['Deuxième', 'Équilibre unipodal']);
  });
});

describe('normaliserProgrammeV2', () => {
  it('conserve chaque séance nommée', () => {
    const r = normaliserProgrammeV2(programmeV2(), [exerciceCatalogue()]);
    expect(r.seances.map(s => s.nom)).toEqual(['Séance A', 'Séance B']);
    expect(r.titre).toBe('Programme V2');
    expect(r.dateReference).toBe('2026-09-10');
    expect(r.dateDebut).toBeUndefined();
  });

  it('hérite les jours actifs de la séance pour tous ses exercices (planning par séance, pas par exercice)', () => {
    const r = normaliserProgrammeV2(programmeV2(), [exerciceCatalogue()]);
    expect(r.seances[0].exercices[0].joursActifs).toEqual([1, 4]); // séance-1 : lundi, jeudi
    expect(r.seances[1].exercices[0].joursActifs).toEqual([3]);    // séance-2 : mercredi
  });

  it('lit nom/description/consigne directement sur l\'exercice de séance, pas depuis le catalogue', () => {
    const r = normaliserProgrammeV2(programmeV2(), [exerciceCatalogue({ nom: 'Autre nom catalogue' })]);
    expect(r.seances[0].exercices[0].nom).toBe('Équilibre unipodal');
    expect(r.seances[0].exercices[0].consigneSecurite).toBe('Près d\'un appui');
  });

  it('un exercice sans exerciceId (saisie libre) fonctionne sans catalogue, sans vidéo ni niveau détaillé', () => {
    const r = normaliserProgrammeV2(programmeV2(), [exerciceCatalogue()]);
    const marche = r.seances[1].exercices[0];
    expect(marche.nom).toBe('Marche');
    expect(marche.videoYoutubeId).toBeUndefined();
    expect(marche.niveauLabel).toBeUndefined();
  });

  it('résout le libellé de niveau via niveau_config quand exerciceId est lié', () => {
    const r = normaliserProgrammeV2(programmeV2(), [exerciceCatalogue()]);
    expect(r.seances[0].exercices[0].niveauLabel).toBe('Niveau 2 : 8 répétitions');
  });

  it('affiche "Niveau N" sans texte détaillé si le catalogue n\'a pas cette entrée', () => {
    const r = normaliserProgrammeV2(programmeV2(), [exerciceCatalogue({ niveau_config: undefined })]);
    expect(r.seances[0].exercices[0].niveauLabel).toBe('Niveau 2');
  });

  it('résout la vidéo depuis le catalogue quand exerciceId est lié', () => {
    const r = normaliserProgrammeV2(programmeV2(), [exerciceCatalogue()]);
    expect(r.seances[0].exercices[0].videoYoutubeId).toBe('abc123');
  });

  it('seanceIds filtre les séances incluses, sans toucher au reste', () => {
    const r = normaliserProgrammeV2(programmeV2(), [exerciceCatalogue()], undefined, ['seance-2']);
    expect(r.seances).toHaveLength(1);
    expect(r.seances[0].nom).toBe('Séance B');
  });

  it('seanceIds absent = toutes les séances', () => {
    const r = normaliserProgrammeV2(programmeV2(), [exerciceCatalogue()]);
    expect(r.seances).toHaveLength(2);
  });
});
