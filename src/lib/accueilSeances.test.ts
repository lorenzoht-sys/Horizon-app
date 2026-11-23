import { describe, it, expect } from 'vitest';
import type { Seance } from '../types';
import { seancePrincipale, seancesAConfirmer } from './accueilSeances';

function seance(id: string, date: string, heureDebut: string, heureFin: string, statut: Seance['statut'] = 'planifiee'): Seance {
  return {
    id, participantId: `p-${id}`, date, heureDebut, heureFin, dureeMinutes: 60,
    type: 'seance', statut, adresse: '',
  } as Seance;
}

const JOUR = '2026-11-23';

describe('seancePrincipale', () => {
  const a = seance('a', JOUR, '14:00', '15:00');
  const b = seance('b', JOUR, '15:00', '16:00');

  it("garde la séance non clôturée après l'heure du rendez-vous suivant (cas de Pierre)", () => {
    expect(seancePrincipale([b, a], '15:05')?.id).toBe('a');
  });

  it('passe à la suivante une fois la séance validée', () => {
    expect(seancePrincipale([{ ...a, statut: 'realisee' }, b], '15:05')?.id).toBe('b');
  });

  it('passe à la suivante quand la séance est écartée à la main', () => {
    expect(seancePrincipale([a, b], '15:05', new Set(['a']))?.id).toBe('b');
  });

  it("lâche une séance oubliée une heure après sa fin, pour ne pas bloquer l'accueil", () => {
    expect(seancePrincipale([a, b], '16:00')?.id).toBe('b');
    expect(seancePrincipale([a, b], '17:00')).toBeNull();
  });

  it('accepte les heures avec secondes venues de la base', () => {
    expect(seancePrincipale([seance('c', JOUR, '09:00:00', '10:00:00')], '10:30')?.id).toBe('c');
  });

  it('ignore les séances annulées', () => {
    expect(seancePrincipale([{ ...a, statut: 'annulee' }], '14:10')).toBeNull();
  });
});

describe('seancesAConfirmer', () => {
  it('liste les séances passées restées planifiées, les plus récentes en premier', () => {
    const liste = seancesAConfirmer([
      seance('vieille', '2026-11-10', '10:00', '11:00'),
      seance('hier', '2026-11-22', '09:00', '10:00'),
      seance('faite', '2026-11-21', '09:00', '10:00', 'realisee'),
      seance('demain', '2026-11-24', '09:00', '10:00'),
    ], JOUR, '08:00');
    expect(liste.map(s => s.id)).toEqual(['hier', 'vieille']);
  });

  it("prend les séances du jour une heure après leur fin, pas avant (elles sont encore sur la carte)", () => {
    const matin = seance('matin', JOUR, '09:00', '10:00');
    expect(seancesAConfirmer([matin], JOUR, '10:30')).toEqual([]);
    expect(seancesAConfirmer([matin], JOUR, '11:00').map(s => s.id)).toEqual(['matin']);
  });

  it('garde une séance oubliée, même ancienne, tant qu’elle n’est pas traitée (retour de Pierre)', () => {
    expect(seancesAConfirmer([seance('ancienne', '2026-08-01', '10:00', '11:00')], JOUR, '08:00').map(s => s.id)).toEqual(['ancienne']);
  });
});
