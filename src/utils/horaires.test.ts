import { describe, it, expect } from 'vitest';
import { estSemaineDue, genererDatesSeances, heuresChevauchent, trouveChevauchement, trouveChevauchements } from './horaires';
import type { Seance } from '../types';

function fakeSeance(overrides: Partial<Seance> = {}): Seance {
  return {
    id: 'seance-1',
    participantId: 'participant-1',
    date: '2026-07-13',
    heureDebut: '10:00',
    heureFin: '10:45',
    dureeMinutes: 45,
    type: 'seance',
    statut: 'planifiee',
    adresse: '',
    ...overrides,
  };
}

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

  it('dateAncrage distincte de dateDebut : le cycle reste calé sur le vrai début de contrat', () => {
    // Contrat "deux_semaines" ancré le 29/06 (semaine 0, due). On ne génère
    // qu'à partir du 06/07 (semaine 1 par rapport au vrai début → PAS due).
    // Sans dateAncrage (bug), le calcul prendrait 06/07 comme semaine 0 et le
    // considérerait à tort comme due : le résultat serait alors
    // ['2026-07-06', '2026-07-20'] au lieu du résultat correct ci-dessous.
    const dates = genererDatesSeances('2026-07-06', '2026-08-03', 'lun', 'deux_semaines', '2026-06-29');
    expect(dates).toEqual(['2026-07-13', '2026-07-27']);
  });
});

describe('heuresChevauchent', () => {
  it('détecte un chevauchement partiel', () => {
    expect(heuresChevauchent('10:00', '10:45', '10:30', '11:15')).toBe(true);
  });

  it('ne détecte pas de chevauchement quand les créneaux se touchent juste (fin = début)', () => {
    expect(heuresChevauchent('10:00', '10:45', '10:45', '11:30')).toBe(false);
  });

  it('ne détecte pas de chevauchement quand les créneaux sont disjoints', () => {
    expect(heuresChevauchent('10:00', '10:45', '11:00', '11:45')).toBe(false);
  });

  it('détecte un créneau entièrement englobé dans un autre', () => {
    expect(heuresChevauchent('10:00', '12:00', '10:30', '10:45')).toBe(true);
  });
});

describe('trouveChevauchement', () => {
  it('trouve la séance existante en collision le même jour', () => {
    const existante = fakeSeance({ id: 'e1', date: '2026-07-13', heureDebut: '10:00', heureFin: '10:45' });
    const trouve = trouveChevauchement([existante], { date: '2026-07-13', heureDebut: '10:30', heureFin: '11:15' });
    expect(trouve?.id).toBe('e1');
  });

  it('ignore les séances annulées', () => {
    const annulee = fakeSeance({ id: 'e1', statut: 'annulee' });
    const trouve = trouveChevauchement([annulee], { date: '2026-07-13', heureDebut: '10:00', heureFin: '10:45' });
    expect(trouve).toBeUndefined();
  });

  it('ignore les séances un autre jour', () => {
    const existante = fakeSeance({ id: 'e1', date: '2026-07-14' });
    const trouve = trouveChevauchement([existante], { date: '2026-07-13', heureDebut: '10:00', heureFin: '10:45' });
    expect(trouve).toBeUndefined();
  });

  it('excludeId permet d\'ignorer la séance elle-même (cas modification)', () => {
    const existante = fakeSeance({ id: 'e1' });
    const trouve = trouveChevauchement(
      [existante], { date: '2026-07-13', heureDebut: '10:00', heureFin: '10:45' }, 'e1',
    );
    expect(trouve).toBeUndefined();
  });
});

describe('trouveChevauchements (bulk)', () => {
  it('renvoie une paire par créneau candidat en collision', () => {
    const existantes = [
      fakeSeance({ id: 'e1', date: '2026-07-13', heureDebut: '10:00', heureFin: '10:45' }),
      fakeSeance({ id: 'e2', date: '2026-07-27', heureDebut: '10:00', heureFin: '10:45' }),
    ];
    // 3 occurrences hebdomadaires générées, dont 2 tombent en collision avec
    // des séances déjà planifiées pour un autre bénéficiaire.
    const candidats = [
      { date: '2026-07-13', heureDebut: '10:15', heureFin: '11:00' },
      { date: '2026-07-20', heureDebut: '10:15', heureFin: '11:00' },
      { date: '2026-07-27', heureDebut: '10:15', heureFin: '11:00' },
    ];
    const conflits = trouveChevauchements(existantes, candidats);
    expect(conflits).toHaveLength(2);
    expect(conflits.map(c => c.creneau.date)).toEqual(['2026-07-13', '2026-07-27']);
  });

  it('ne renvoie rien quand aucun créneau candidat ne chevauche', () => {
    const existantes = [fakeSeance({ id: 'e1', date: '2026-07-13', heureDebut: '08:00', heureFin: '08:45' })];
    const candidats = [{ date: '2026-07-13', heureDebut: '10:00', heureFin: '10:45' }];
    expect(trouveChevauchements(existantes, candidats)).toHaveLength(0);
  });
});
