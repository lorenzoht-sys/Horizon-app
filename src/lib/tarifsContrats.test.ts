import { describe, it, expect } from 'vitest';
import { trouverTarifApplicable, totalFactureSeance } from './tarifsContrats';
import type { TarifContrat } from '../types';

function version(overrides: Partial<TarifContrat> = {}): TarifContrat {
  return {
    id: 'v1',
    contratId: 'c1',
    tarifSeance: 40,
    fraisDeplacement: 0,
    dateDebutValidite: '2026-01-01',
    dateFinValidite: undefined,
    createdAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('trouverTarifApplicable', () => {
  it('renvoie la bonne version parmi plusieurs versions successives', () => {
    const versions: TarifContrat[] = [
      version({ id: 'v3', tarifSeance: 50, dateDebutValidite: '2026-06-01', dateFinValidite: undefined }),
      version({ id: 'v2', tarifSeance: 45, dateDebutValidite: '2026-03-01', dateFinValidite: '2026-05-31' }),
      version({ id: 'v1', tarifSeance: 40, dateDebutValidite: '2026-01-01', dateFinValidite: '2026-02-28' }),
    ];

    expect(trouverTarifApplicable(versions, '2026-01-15')?.id).toBe('v1');
    expect(trouverTarifApplicable(versions, '2026-04-10')?.id).toBe('v2');
    expect(trouverTarifApplicable(versions, '2026-08-01')?.id).toBe('v3');
  });

  it('renvoie null pour une séance antérieure à toute version connue', () => {
    const versions: TarifContrat[] = [
      version({ id: 'v1', dateDebutValidite: '2026-03-01', dateFinValidite: undefined }),
    ];

    expect(trouverTarifApplicable(versions, '2026-01-01')).toBeNull();
  });

  it('renvoie null pour une séance postérieure à la dernière version quand celle-ci est close (trou dans l\'historique)', () => {
    const versions: TarifContrat[] = [
      version({ id: 'v1', dateDebutValidite: '2026-01-01', dateFinValidite: '2026-03-31' }),
    ];

    expect(trouverTarifApplicable(versions, '2026-04-15')).toBeNull();
  });

  it('couvre indéfiniment le futur quand la dernière version est ouverte (dateFinValidite undefined)', () => {
    const versions: TarifContrat[] = [
      version({ id: 'v1', dateDebutValidite: '2026-01-01', dateFinValidite: undefined }),
    ];

    expect(trouverTarifApplicable(versions, '2099-01-01')?.id).toBe('v1');
  });

  it('résout correctement un changement de tarif au milieu d\'un mois, avec des séances des deux côtés', () => {
    const versions: TarifContrat[] = [
      version({ id: 'ancien', tarifSeance: 40, dateDebutValidite: '2026-01-01', dateFinValidite: '2026-06-14' }),
      version({ id: 'nouveau', tarifSeance: 48, dateDebutValidite: '2026-06-15', dateFinValidite: undefined }),
    ];

    // Séance avant le changement, dans le mois.
    expect(trouverTarifApplicable(versions, '2026-06-10')?.id).toBe('ancien');
    // Séance le jour même du changement.
    expect(trouverTarifApplicable(versions, '2026-06-15')?.id).toBe('nouveau');
    // Séance après le changement, même mois.
    expect(trouverTarifApplicable(versions, '2026-06-20')?.id).toBe('nouveau');
  });

  it('ne suppose pas que la liste est triée', () => {
    const versions: TarifContrat[] = [
      version({ id: 'recent', dateDebutValidite: '2026-06-01', dateFinValidite: undefined }),
      version({ id: 'ancien', dateDebutValidite: '2026-01-01', dateFinValidite: '2026-05-31' }),
    ];

    expect(trouverTarifApplicable(versions, '2026-02-01')?.id).toBe('ancien');
  });

  it('renvoie null quand aucune version n\'existe', () => {
    expect(trouverTarifApplicable([], '2026-01-01')).toBeNull();
  });
});

describe('totalFactureSeance', () => {
  it('additionne le tarif de séance et les frais de déplacement', () => {
    expect(totalFactureSeance(version({ tarifSeance: 40, fraisDeplacement: 5 }))).toBe(45);
  });

  it('renvoie le tarif de séance seul quand il n\'y a pas de frais de déplacement', () => {
    expect(totalFactureSeance(version({ tarifSeance: 40, fraisDeplacement: 0 }))).toBe(40);
  });
});
