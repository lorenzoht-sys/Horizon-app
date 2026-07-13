// Phase 4 — validation du schéma JSON généré (résolution catalogue, repli
// exercice libre si exerciceId invalide) et mapping vers createProgramme().
// Pas de test sur l'appel réseau lui-même (genererProgrammeStructure) : ce
// projet n'a pas d'environnement DOM/RTL, et la logique testable sans réseau
// (validation, résolution catalogue, mapping) est extraite en fonctions pures.
import { describe, it, expect } from 'vitest';
import { resoudreExercice, validerEtResoudre, versPayloadCreateProgramme, type ProgrammeIA, type ExerciceIA } from './genererProgrammeIA';
import type { Exercice } from '../types';

function exerciceCatalogue(overrides: Partial<Exercice> = {}): Exercice {
  return {
    id: 'eq-unipodal',
    nom: 'Équilibre unipodal',
    categorie: 'equilibre',
    description: 'Tenez-vous sur un pied.',
    consigneSecurite: 'Restez près d\'un appui.',
    niveaux: { debutant: '10s', intermediaire: '20s', avance: '30s' },
    dureeEstimeeMinutes: 5,
    niveau_config: {
      '1': { series: 2, repetitions: null, duree_secondes: 10, description: 'Avec appui', conseil: 'Prudence' },
      '2': { series: 3, repetitions: null, duree_secondes: 20, description: 'Sans appui', conseil: 'Regard fixe' },
      '3': { series: 3, repetitions: null, duree_secondes: 30, description: 'Yeux fermés', conseil: 'Appui à portée' },
    },
    ...overrides,
  };
}

describe('resoudreExercice — résolution du catalogue', () => {
  const catalogue = [exerciceCatalogue()];

  it('résout un exerciceId valide : reprend les champs du catalogue', () => {
    const r = resoudreExercice({ exerciceId: 'eq-unipodal', niveau: 2, nom: '', categorie: '', description: '' }, catalogue);
    expect(r.nom).toBe('Équilibre unipodal');
    expect(r.categorie).toBe('equilibre');
    expect(r.exerciceId).toBe('eq-unipodal');
  });

  it('calcule series/repetitions/duree_secondes via niveau_config, pas les valeurs proposées par l\'IA', () => {
    const r = resoudreExercice({ exerciceId: 'eq-unipodal', niveau: 3, nom: '', categorie: '', description: '', series: 99, repetitions: 99 }, catalogue);
    expect(r.series).toBe(3);
    expect(r.repetitions).toBeNull(); // ce niveau utilise une durée, pas des répétitions
    expect(r.duree_secondes).toBe(30);
  });

  it('repli sur exercice libre si exerciceId absent du catalogue (IA halluciné) — garde le nom suggéré', () => {
    const r = resoudreExercice({ exerciceId: 'id-invente-par-ia', nom: 'Exercice inventé', categorie: 'force', description: 'desc', niveau: 2 }, catalogue);
    expect(r.exerciceId).toBeUndefined();
    expect(r.nom).toBe('Exercice inventé');
    expect(r.categorie).toBe('force');
  });

  it('exercice libre sans nom fourni : ne plante pas, retombe sur l\'exerciceId comme nom', () => {
    const r = resoudreExercice({ exerciceId: 'id-invente', nom: '', categorie: 'force', description: '', niveau: 2 }, catalogue);
    expect(r.nom).toBe('id-invente');
  });

  it('exercice sans exerciceId (libre dès le départ) : inchangé', () => {
    const ex: ExerciceIA = { nom: 'Marche', categorie: 'endurance', description: 'd', niveau: 2, series: 3, repetitions: 10 };
    expect(resoudreExercice(ex, catalogue)).toEqual(ex);
  });
});

describe('validerEtResoudre — validation du schéma', () => {
  const catalogue = [exerciceCatalogue()];
  const seanceValide = { nom: 'Séance A', exercices: [{ exerciceId: 'eq-unipodal', niveau: 2, nom: '', categorie: '', description: '' }] };

  it('accepte un programme valide et résout ses exercices', () => {
    const r = validerEtResoudre({ nom: 'Programme Test', seances: [seanceValide], planning: { lundi: 'Séance A' } }, catalogue);
    expect(r.nom).toBe('Programme Test');
    expect(r.seances[0].exercices[0].nom).toBe('Équilibre unipodal');
  });

  it('rejette un programme sans nom', () => {
    expect(() => validerEtResoudre({ seances: [seanceValide] }, catalogue)).toThrow(/nom manquant/);
  });

  it('rejette un programme sans séance', () => {
    expect(() => validerEtResoudre({ nom: 'X', seances: [] }, catalogue)).toThrow(/aucune séance/);
  });

  it('rejette une séance sans exercice', () => {
    expect(() => validerEtResoudre({ nom: 'X', seances: [{ nom: 'Vide', exercices: [] }] }, catalogue)).toThrow(/sans nom ou sans exercice/);
  });

  it('rejette une séance sans nom', () => {
    expect(() => validerEtResoudre({ nom: 'X', seances: [{ nom: '', exercices: seanceValide.exercices }] }, catalogue)).toThrow();
  });
});

describe('versPayloadCreateProgramme — mapping vers createProgramme()', () => {
  function programme(overrides: Partial<ProgrammeIA> = {}): ProgrammeIA {
    return {
      nom: 'Programme Équilibre',
      objectif: 'Prévenir les chutes',
      message_motivation: 'Vous progressez bien !',
      niveau_global: 2,
      seances: [
        { nom: 'Séance A', exercices: [{ nom: 'Équilibre unipodal', categorie: 'equilibre', description: 'd', conseil_securite: 'c', niveau: 2, series: 3, repetitions: null, duree_secondes: 20 }] },
        { nom: 'Séance B', exercices: [{ nom: 'Marche', categorie: 'endurance', description: 'd', niveau: 2, series: 2, repetitions: 10, duree_secondes: null }] },
      ],
      planning: { lundi: 'Séance A', mardi: 'repos', jeudi: 'Séance B', vendredi: 'Séance inconnue' },
      ...overrides,
    };
  }

  it('génère un tempId par séance via le générateur injecté (déterministe pour le test)', () => {
    let n = 0;
    const payload = versPayloadCreateProgramme(programme(), 'domicile', () => `id-${n++}`);
    expect(payload.seances.map(s => s.tempId)).toEqual(['id-0', 'id-1']);
  });

  it('mappe le planning sur les 7 jours : "repos", nom de séance inconnu, et jour non renseigné par l\'IA deviennent tous null ; un nom connu pointe vers le bon tempId', () => {
    let n = 0;
    const payload = versPayloadCreateProgramme(programme(), 'domicile', () => `id-${n++}`);
    expect(payload.planning.lundi).toBe('id-0');       // Séance A
    expect(payload.planning.mardi).toBeNull();         // repos
    expect(payload.planning.jeudi).toBe('id-1');        // Séance B
    expect(payload.planning.vendredi).toBeNull();       // "Séance inconnue" ne correspond à aucune séance
    expect(payload.planning.mercredi).toBeNull();       // jour non renseigné par l'IA — toujours explicite, jamais absent
    expect(Object.keys(payload.planning)).toHaveLength(7); // les 7 jours sont toujours présents
  });

  it('mappe message_motivation → messageMotivation et conseil_securite → conseilSecurite (snake_case IA → camelCase app)', () => {
    const payload = versPayloadCreateProgramme(programme(), 'domicile', () => 'id');
    expect(payload.messageMotivation).toBe('Vous progressez bien !');
    expect(payload.seances[0].exercices[0].conseilSecurite).toBe('c');
  });

  it('convertit null en undefined pour series/repetitions/dureeSecondes (createProgramme attend undefined, pas null)', () => {
    const payload = versPayloadCreateProgramme(programme(), 'domicile', () => 'id');
    expect(payload.seances[0].exercices[0].repetitions).toBeUndefined();
    expect(payload.seances[1].exercices[0].dureeSecondes).toBeUndefined();
  });
});
