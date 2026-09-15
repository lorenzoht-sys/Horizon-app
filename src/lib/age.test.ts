import { describe, expect, it } from 'vitest';
import { calculerAge, libelleAge } from './age';

// Références construites en heure LOCALE, comme `new Date()` dans l'application.
const le = (annee: number, mois: number, jour: number, heure = 12) => new Date(annee, mois - 1, jour, heure);

describe('calculerAge — autour de l’anniversaire', () => {
  const naissance = '1950-03-15';

  it('la veille de l’anniversaire', () => {
    expect(calculerAge(naissance, le(2026, 3, 14))).toBe(75);
  });

  it('le jour même', () => {
    expect(calculerAge(naissance, le(2026, 3, 15))).toBe(76);
  });

  it('le lendemain', () => {
    expect(calculerAge(naissance, le(2026, 3, 16))).toBe(76);
  });

  it('le jour même, à minuit passé comme à 23 h 59', () => {
    expect(calculerAge(naissance, le(2026, 3, 15, 0))).toBe(76);
    expect(calculerAge(naissance, new Date(2026, 2, 14, 23, 59, 59))).toBe(75);
  });

  it('pendant le mois d’anniversaire, avant le jour (défaut de l’ancienne version mobile)', () => {
    // L'ancienne comparaison du mois seul renvoyait 76 ici.
    expect(calculerAge(naissance, le(2026, 3, 1))).toBe(75);
  });

  it('au passage d’année', () => {
    expect(calculerAge('1950-01-01', le(2025, 12, 31))).toBe(75);
    expect(calculerAge('1950-01-01', le(2026, 1, 1))).toBe(76);
  });

  it('le jour anniversaire après une année de 365 jours (défaut de la division par 365,25)', () => {
    // (365 jours / 365,25) arrondi à l'inférieur donnait 0.
    expect(calculerAge('2001-03-01', le(2002, 3, 1))).toBe(1);
  });
});

describe('calculerAge — années bissextiles', () => {
  it('né un 29 février : l’anniversaire des années communes est le 1er mars', () => {
    expect(calculerAge('2000-02-29', le(2025, 2, 28))).toBe(24);
    expect(calculerAge('2000-02-29', le(2025, 3, 1))).toBe(25);
  });

  it('né un 29 février : l’anniversaire des années bissextiles est le 29 février', () => {
    expect(calculerAge('2000-02-29', le(2024, 2, 28))).toBe(23);
    expect(calculerAge('2000-02-29', le(2024, 2, 29))).toBe(24);
  });

  it('né un 28 février ou un 1er mars, référence un 29 février', () => {
    expect(calculerAge('2000-02-28', le(2024, 2, 29))).toBe(24);
    expect(calculerAge('2000-03-01', le(2024, 2, 29))).toBe(23);
  });
});

describe('calculerAge — entrées invalides', () => {
  it('renvoie null pour une date absente ou illisible', () => {
    for (const v of [null, undefined, '', 'abc', '15/03/1950']) {
      expect(calculerAge(v, le(2026, 1, 1))).toBeNull();
    }
  });

  it('renvoie null pour une date impossible', () => {
    expect(calculerAge('1950-04-31', le(2026, 1, 1))).toBeNull();
    expect(calculerAge('2001-02-29', le(2026, 1, 1))).toBeNull();
  });

  it('renvoie null pour une naissance postérieure à la référence', () => {
    expect(calculerAge('2030-01-01', le(2026, 1, 1))).toBeNull();
  });

  it('accepte un horodatage ISO en ne lisant que la date', () => {
    expect(calculerAge('1950-03-15T00:00:00+00:00', le(2026, 3, 15))).toBe(76);
  });

  it('né aujourd’hui : 0 an', () => {
    expect(calculerAge('2026-03-15', le(2026, 3, 15))).toBe(0);
  });
});

describe('libelleAge', () => {
  it('formate l’âge ou signale son absence', () => {
    expect(libelleAge('1950-03-15', le(2026, 3, 15))).toBe('76 ans');
    expect(libelleAge('', le(2026, 3, 15))).toBe('âge non renseigné');
  });
});
