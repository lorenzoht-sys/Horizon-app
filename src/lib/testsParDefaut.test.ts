import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { computeDefauts } from './testsParDefaut';
import { construirePromptResumeEvolution } from '../utils/promptComparaison';

// Bénéficiaire fictif né le 15/03/1956 : 70 ans le 15/03/2026.
const NE = { dateNaissance: '1956-03-15' };

describe('computeDefauts — seuil des 70 ans (lot G, calcul de l\'âge)', () => {
  it('la veille de l\'anniversaire : 69 ans, pas de tests gériatriques', () => {
    expect(computeDefauts(NE, new Date(2026, 2, 14, 12))).not.toContain('tinetti');
  });

  it('le jour de l\'anniversaire : 70 ans, tests gériatriques proposés', () => {
    // L'ancienne division par 365,25 jours donnait encore 69 ans ce jour-là
    // (vérifié le 2026-10-27 : à midi, moins de 70 × 365,25 jours écoulés).
    expect(computeDefauts(NE, new Date(2026, 2, 15, 12))).toContain('tinetti');
  });

  it('date de naissance invalide : tests de base seulement', () => {
    expect(computeDefauts({ dateNaissance: '' })).toEqual(['equilibre', 'chairStand', 'tug', 'tm6']);
  });
});

describe('construirePromptResumeEvolution — âge inconnu', () => {
  it('écrit « âge non renseigné » au lieu de « NaN ans »', () => {
    expect(construirePromptResumeEvolution({ age: null, nbMois: 3, nbBilans: 2, deltasTexte: '' })).toContain('âge non renseigné');
  });
});

// Garde-fou : plus aucun calcul d'âge maison. Il y en avait 14 en 2026-09
// (voir age.ts), encore 5 le 2026-10-27.
describe('aucun calcul d\'âge hors de src/lib/age.ts', () => {
  function fichiers(dossier: string): string[] {
    return readdirSync(dossier).flatMap(n => {
      const p = join(dossier, n);
      if (statSync(p).isDirectory()) return n === 'node_modules' ? [] : fichiers(p);
      return /\.(ts|tsx)$/.test(n) && !/\.test\.ts$/.test(n) ? [p] : [];
    });
  }
  it('ni division par 365,25 jours, ni différence d\'années sur une date de naissance', () => {
    const racine = join(__dirname, '..', '..');
    const fautifs = [...fichiers(join(racine, 'src')), ...fichiers(join(racine, 'api'))]
      .filter(f => !f.endsWith(join('lib', 'age.ts')))
      .filter(f => /365\.25|naissance[\s\S]{0,80}getFullYear\(\)\s*-|getFullYear\(\)\s*-\s*\w*(birth|naiss)/i.test(readFileSync(f, 'utf8')));
    expect(fautifs).toEqual([]);
  });
});
