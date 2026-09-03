// Contrôle d'appartenance des exercices [F-14] — voir api/patient/seance.ts.
//
// Fichier préfixé `_` : tout ce qui est sous api/ sans underscore est déployé
// comme route serverless par Vercel (même convention que _me.test.ts).
//
// Ce test ne couvre pas la requête Supabase, il couvre la COMPARAISON — la
// seule partie qu'on peut écrire de travers sans que rien ne le signale. Le
// piège visé est nommé dans docs/PLAN-BETA.md : comparer des cardinalités au
// lieu d'ensembles. Avec `.in('id', idsRecus)`, Postgres dédoublonne : deux
// ids identiques reçus renvoient une seule ligne. Un contrôle écrit
// `lignes.length === idsRecus.length` refuserait alors un envoi légitime, et
// — plus grave — `lignes.length > 0` accepterait un lot entier dès qu'un
// seul id est valide.
import { describe, it, expect } from 'vitest';
import { tousExercicesAutorises } from './seance.js';

describe('tousExercicesAutorises — contrôle d\'appartenance [F-14]', () => {
  it('accepte un lot dont tous les ids sont autorisés', () => {
    expect(tousExercicesAutorises(['a', 'b'], ['a', 'b', 'c'])).toBe(true);
  });

  it('REFUSE dès qu\'un seul id est étranger — le cas de la faille', () => {
    expect(tousExercicesAutorises(['a', 'intrus'], ['a', 'b'])).toBe(false);
  });

  it('refuse un lot entièrement étranger', () => {
    expect(tousExercicesAutorises(['x'], ['a', 'b'])).toBe(false);
  });

  it('refuse quand aucun exercice n\'est autorisé pour la séance', () => {
    expect(tousExercicesAutorises(['a'], [])).toBe(false);
  });

  it('un doublon légitime reste accepté (Postgres dédoublonne le IN)', () => {
    expect(tousExercicesAutorises(['a', 'a'], ['a'])).toBe(true);
  });

  it('un lot vide est accepté — l\'appelant ne l\'interroge même pas', () => {
    expect(tousExercicesAutorises([], [])).toBe(true);
  });
});
