import { describe, it, expect } from 'vitest';
import { estSemaineDue, genererDatesSeances } from './horaires';

describe('estSemaineDue', () => {
  const DEBUT = '2026-06-29'; // un lundi

  it('périodicité "semaine" : toujours due, quelle que soit la date cible', () => {
    expect(estSemaineDue(DEBUT, DEBUT, 'semaine')).toBe(true);
    expect(estSemaineDue(DEBUT, '2026-07-06', 'semaine')).toBe(true);
    expect(estSemaineDue(DEBUT, '2026-08-10', 'semaine')).toBe(true);
  });

  it('périodicité absente (undefined) : se comporte comme "semaine"', () => {
    expect(estSemaineDue(DEBUT, '2026-07-13')).toBe(true);
  });

  it('"deux_semaines" : due à la semaine 0, pas à la semaine 1, due à la semaine 2', () => {
    expect(estSemaineDue(DEBUT, '2026-06-29', 'deux_semaines')).toBe(true);  // semaine 0
    expect(estSemaineDue(DEBUT, '2026-07-06', 'deux_semaines')).toBe(false); // semaine 1
    expect(estSemaineDue(DEBUT, '2026-07-13', 'deux_semaines')).toBe(true);  // semaine 2
    expect(estSemaineDue(DEBUT, '2026-07-20', 'deux_semaines')).toBe(false); // semaine 3
  });

  it('"trois_semaines" : due seulement aux semaines 0, 3, 6...', () => {
    expect(estSemaineDue(DEBUT, '2026-06-29', 'trois_semaines')).toBe(true);  // semaine 0
    expect(estSemaineDue(DEBUT, '2026-07-06', 'trois_semaines')).toBe(false); // semaine 1
    expect(estSemaineDue(DEBUT, '2026-07-13', 'trois_semaines')).toBe(false); // semaine 2
    expect(estSemaineDue(DEBUT, '2026-07-20', 'trois_semaines')).toBe(true);  // semaine 3
  });

  it('fonctionne aussi pour une date cible avant dateDebut (indice négatif)', () => {
    // semaine -1 par rapport à dateDebut : ne doit pas planter sur le modulo négatif.
    expect(estSemaineDue(DEBUT, '2026-06-22', 'deux_semaines')).toBe(false);
    expect(estSemaineDue(DEBUT, '2026-06-15', 'deux_semaines')).toBe(true);
  });
});

describe('genererDatesSeances avec périodicité', () => {
  it('"deux_semaines" : ne génère qu\'une date toutes les 2 semaines, jamais 2 semaines consécutives', () => {
    const dates = genererDatesSeances('2026-06-29', '2026-08-09', 'lun', 'deux_semaines');
    // Lundis entre le 29/06 et le 09/08 : 29/06, 06/07, 13/07, 20/07, 27/07, 03/08
    // → un sur deux à partir du 29/06 : 29/06, 13/07, 27/07
    expect(dates).toEqual(['2026-06-29', '2026-07-13', '2026-07-27']);
  });

  it('"trois_semaines" : une date toutes les 3 semaines', () => {
    const dates = genererDatesSeances('2026-06-29', '2026-08-09', 'lun', 'trois_semaines');
    expect(dates).toEqual(['2026-06-29', '2026-07-20']);
  });

  it('sans périodicité (défaut "semaine") : comportement inchangé, toutes les semaines', () => {
    const dates = genererDatesSeances('2026-06-29', '2026-07-20', 'lun');
    expect(dates).toEqual(['2026-06-29', '2026-07-06', '2026-07-13', '2026-07-20']);
  });
});
