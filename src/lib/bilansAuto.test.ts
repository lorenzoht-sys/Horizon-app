import { describe, it, expect } from 'vitest';
import type { Seance } from '../types';
import { referenceBilan, datesBilansAPrevoir, placerBilans, bilansAutoARetirer } from './bilansAuto';

function seance(p: Partial<Seance>): Seance {
  return {
    id: 's', participantId: 'p1', date: '2026-09-10', heureDebut: '10:00', heureFin: '11:00', dureeMinutes: 60,
    type: 'bilan', statut: 'realisee', adresse: '', ...p,
  };
}

describe('referenceBilan', () => {
  it('prend le dernier bilan vivant du bénéficiaire, pas une séance ni un bilan annulé', () => {
    const r = referenceBilan([
      seance({ id: 'a', date: '2026-06-10' }),
      seance({ id: 'b', date: '2026-09-10', heureDebut: '14:00', dureeMinutes: 45 }),
      seance({ id: 'c', date: '2026-10-01', statut: 'annulee' }),
      seance({ id: 'd', date: '2026-10-05', type: 'seance' }),
      seance({ id: 'e', date: '2026-11-05', participantId: 'p2' }),
    ], 'p1');
    expect(r).toEqual({ date: '2026-09-10', heureDebut: '14:00', dureeMinutes: 45 });
  });

  it('retombe sur la date d’un bilan saisi dans la fiche, ou null', () => {
    expect(referenceBilan([], 'p1', ['2026-03-01', '2026-06-01'])).toEqual({ date: '2026-06-01', heureDebut: null, dureeMinutes: null });
    expect(referenceBilan([], 'p1')).toBeNull();
  });
});

describe('datesBilansAPrevoir', () => {
  it('exemple du cahier des charges : bilan le 10/09, tous les 3 mois', () => {
    expect(datesBilansAPrevoir({ reference: '2026-09-10', frequenceMois: 3, aujourdhui: '2026-09-15' }))
      .toEqual(['2026-12-10', '2027-03-10', '2027-06-10', '2027-09-10']);
  });

  it('calcule depuis la référence : pas de dérive après un 31', () => {
    expect(datesBilansAPrevoir({ reference: '2026-01-31', frequenceMois: 1, aujourdhui: '2026-01-31', horizonMois: 4 }))
      .toEqual(['2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31']);
  });

  it('écarte le passé et les dates déjà occupées par un bilan (idempotent)', () => {
    expect(datesBilansAPrevoir({
      reference: '2026-01-10', frequenceMois: 3, aujourdhui: '2026-10-25', datesExistantes: ['2026-10-10', '2027-01-10'], horizonMois: 12,
    })).toEqual(['2027-04-10', '2027-07-10', '2027-10-10']);
  });

  it('fréquence invalide : rien', () => {
    expect(datesBilansAPrevoir({ reference: '2026-09-10', frequenceMois: 0, aujourdhui: '2026-09-10' })).toEqual([]);
  });
});

describe('placerBilans', () => {
  it('utilise l’heure de la référence, ou 09:00 / 60 min par défaut', () => {
    expect(placerBilans(['2026-12-10'], [], '14:00', 45).aPoser).toEqual([
      { date: '2026-12-10', heureDebut: '14:00', heureFin: '14:45', dureeMinutes: 45 },
    ]);
    expect(placerBilans(['2026-12-10'], [], null, null).aPoser[0]).toMatchObject({ heureDebut: '09:00', heureFin: '10:00' });
  });

  it('décale par pas de 30 min si le créneau est pris', () => {
    const occupee = seance({ id: 'x', date: '2026-12-10', heureDebut: '09:00', heureFin: '10:00', type: 'seance', statut: 'planifiee' });
    expect(placerBilans(['2026-12-10'], [occupee], null, null).aPoser[0]).toMatchObject({ heureDebut: '10:00' });
  });

  it('signale une date sans créneau libre au lieu de l’ignorer', () => {
    const journee = seance({ id: 'x', date: '2026-12-10', heureDebut: '08:00', heureFin: '23:00', type: 'seance', statut: 'planifiee' });
    expect(placerBilans(['2026-12-10'], [journee], null, null)).toEqual({ aPoser: [], nonPlacees: ['2026-12-10'] });
  });
});

describe('bilansAutoARetirer', () => {
  it('ne retient que les bilans auto planifiés à venir du bénéficiaire', () => {
    const l = bilansAutoARetirer([
      seance({ id: '1', bilanAuto: true, statut: 'planifiee', date: '2026-12-10' }),
      seance({ id: '2', bilanAuto: true, statut: 'planifiee', date: '2026-01-10' }),
      seance({ id: '3', bilanAuto: false, statut: 'planifiee', date: '2026-12-10' }),
      seance({ id: '4', bilanAuto: true, statut: 'realisee', date: '2026-12-10' }),
      seance({ id: '5', bilanAuto: true, statut: 'planifiee', date: '2026-12-10', participantId: 'p2' }),
    ], 'p1', '2026-10-25');
    expect(l.map(s => s.id)).toEqual(['1']);
  });
});
