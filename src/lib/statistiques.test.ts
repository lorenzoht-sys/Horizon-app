import { describe, it, expect } from 'vitest';
import type { Bilan, Seance } from '../types';
import {
  ajouterJours, lundiDe, presenceRecente, seancesMoisADate, seancesParSemaine,
  assiduiteParBeneficiaire, resultatsParTest, categorieBeneficiaire,
} from './statistiques';

const JOUR = '2026-11-24'; // mardi

function s(date: string, statut: Seance['statut'], participantId = 'p1') {
  return { date, statut, participantId };
}

function bilan(date: string, champs: Partial<Bilan>): Bilan {
  return { date, ...champs } as Bilan;
}

describe('dates', () => {
  it('ajoute des jours en traversant les mois et les années', () => {
    expect(ajouterJours('2026-11-30', 1)).toBe('2026-12-01');
    expect(ajouterJours('2026-01-01', -1)).toBe('2025-12-31');
  });
  it('trouve le lundi de la semaine', () => {
    expect(lundiDe(JOUR)).toBe('2026-11-23');
    expect(lundiDe('2026-11-29')).toBe('2026-11-23'); // dimanche
    expect(lundiDe('2026-11-23')).toBe('2026-11-23');
  });
});

describe('presenceRecente', () => {
  it('ne compte pas les séances à venir ni celles du jour comme des absences', () => {
    const p = presenceRecente([
      s('2026-11-20', 'realisee'), s('2026-11-24', 'planifiee'), s('2026-11-28', 'planifiee'),
    ], JOUR);
    expect(p).toEqual({ realisees: 1, annulees: 0, nonPointees: 0, taux: 100 });
  });
  it('compte les annulées, ignore les reportées et signale les séances non pointées', () => {
    const p = presenceRecente([
      s('2026-11-10', 'realisee'), s('2026-11-12', 'realisee'), s('2026-11-13', 'realisee'),
      s('2026-11-17', 'annulee'), s('2026-11-18', 'reportee'), s('2026-11-19', 'planifiee'),
    ], JOUR);
    expect(p).toEqual({ realisees: 3, annulees: 1, nonPointees: 1, taux: 75 });
  });
  it('rend un taux nul (null) quand il n’y a rien à compter', () => {
    expect(presenceRecente([], JOUR).taux).toBeNull();
  });
  it('s’arrête à 30 jours', () => {
    expect(presenceRecente([s('2026-10-20', 'annulee')], JOUR).annulees).toBe(0);
  });
});

describe('seancesMoisADate', () => {
  it('compare au mois précédent à date égale', () => {
    const r = seancesMoisADate([
      s('2026-11-03', 'realisee'), s('2026-11-24', 'realisee'), s('2026-11-26', 'realisee'),
      s('2026-10-05', 'realisee'), s('2026-10-24', 'realisee'), s('2026-10-25', 'realisee'),
      s('2026-11-10', 'annulee'),
    ], JOUR);
    expect(r).toEqual({ mois: 2, moisPrecedent: 2 });
  });
  it('borne à la fin d’un mois plus court et passe l’année', () => {
    expect(seancesMoisADate([s('2026-02-28', 'realisee')], '2026-03-31').moisPrecedent).toBe(1);
    expect(seancesMoisADate([s('2025-12-15', 'realisee')], '2026-01-20').moisPrecedent).toBe(1);
  });
});

describe('seancesParSemaine', () => {
  it('rend 12 semaines du lundi au dimanche, la semaine en cours en dernier', () => {
    const sem = seancesParSemaine([
      s('2026-11-23', 'realisee'), s('2026-11-29', 'annulee'), s('2026-11-22', 'realisee'),
    ], JOUR);
    expect(sem).toHaveLength(12);
    expect(sem[11]).toEqual({ debut: '2026-11-23', libelle: '23/11', realisees: 1, annulees: 1 });
    expect(sem[10]).toMatchObject({ debut: '2026-11-16', realisees: 1 });
    expect(sem[0].debut).toBe('2026-09-07');
  });
});

describe('assiduiteParBeneficiaire', () => {
  it('classe du moins assidu au plus assidu et ignore les petits effectifs', () => {
    const r = assiduiteParBeneficiaire([
      s('2026-11-01', 'realisee', 'a'), s('2026-11-02', 'annulee', 'a'), s('2026-11-03', 'annulee', 'a'),
      s('2026-11-01', 'realisee', 'b'), s('2026-11-02', 'realisee', 'b'), s('2026-11-03', 'realisee', 'b'),
      s('2026-11-01', 'annulee', 'c'), s('2026-11-30', 'planifiee', 'c'),
    ], JOUR);
    expect(r.map(x => [x.participantId, x.taux])).toEqual([['a', 33], ['b', 100]]);
  });
});

describe('resultatsParTest', () => {
  it('classe progrès, stabilité et recul en unités du test, TUG à l’envers', () => {
    const r = resultatsParTest([
      { bilans: [bilan('2026-01-01', { tug3m: 12 }), bilan('2026-04-01', { tug3m: 9 })] },
      { bilans: [bilan('2026-04-01', { tug3m: 10.5 }), bilan('2026-01-01', { tug3m: 10 })] },
      { bilans: [bilan('2026-01-01', { tug3m: 8 }), bilan('2026-04-01', { tug3m: 10 })] },
    ]);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ cle: 'tug', progressent: 1, stables: 1, reculent: 1, total: 3 });
  });
  it('accepte une souplesse négative (pas de pourcentage)', () => {
    const r = resultatsParTest([
      { bilans: [bilan('2026-01-01', { souplesse: { methode: 'debout', valeur: -10 } }), bilan('2026-04-01', { souplesse: { methode: 'debout', valeur: 0 } })] },
    ]);
    expect(r[0]).toMatchObject({ cle: 'souplesse', progressent: 1 });
  });
  it('prend le premier et le dernier bilan où le test a été passé', () => {
    const r = resultatsParTest([
      { bilans: [bilan('2026-01-01', { chairStand30: 8 }), bilan('2026-02-01', { chairStand30: null }), bilan('2026-03-01', { chairStand30: 11 })] },
    ]);
    expect(r[0]).toMatchObject({ cle: 'force', progressent: 1 });
  });
  it('omet les tests sans bénéficiaire comparable', () => {
    expect(resultatsParTest([{ bilans: [bilan('2026-01-01', { tug3m: 10 })] }])).toEqual([]);
  });
});

describe('categorieBeneficiaire', () => {
  it('suit les étiquettes, puis le contexte clinique', () => {
    expect(categorieBeneficiaire({ tags: ['chronique'], dateNaissance: '', contexteClinic: '' } as never)).toBe('Chronique');
    expect(categorieBeneficiaire({ tags: [], dateNaissance: '', contexteClinic: 'PTH droite' } as never)).toBe('Post-op');
  });
});
