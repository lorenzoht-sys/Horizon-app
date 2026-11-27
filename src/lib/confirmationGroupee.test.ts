import { describe, it, expect } from 'vitest';
import type { Seance, TarifContrat } from '../types';
import { planConfirmationGroupee, libelleMois } from './confirmationGroupee';

function s(id: string, date: string, extra: Partial<Seance> = {}): Seance {
  return { id, participantId: 'p1', contratId: 'c1', date, heureDebut: '10:00', heureFin: '11:00', dureeMinutes: 60, type: 'seance', statut: 'planifiee', adresse: '', ...extra } as Seance;
}

const tarifs: Record<string, TarifContrat[]> = {
  c1: [{ id: 't1', contratId: 'c1', tarifSeance: 45, fraisDeplacement: 5, dateDebutValidite: '2026-01-01', createdAt: '' }],
};

describe('planConfirmationGroupee', () => {
  it('confirme les séances planifiées passées, groupées par mois, avec le montant ajouté', () => {
    const p = planConfirmationGroupee([s('a', '2026-11-03'), s('b', '2026-11-10'), s('c', '2026-10-20')], [], tarifs);
    expect(p.aConfirmer.map(x => x.id)).toEqual(['a', 'b', 'c']);
    expect(p.parMois).toEqual([{ mois: '2026-11', nombre: 2, montant: 100 }, { mois: '2026-10', nombre: 1, montant: 50 }]);
    expect(p.montant).toBe(150);
    expect(p.sansTarif).toBe(0);
  });

  it('laisse de côté les mois déjà facturés pour ce contrat et les absences signalées', () => {
    const p = planConfirmationGroupee(
      [s('a', '2026-10-05'), s('b', '2026-10-06', { contratId: 'c2' }), s('c', '2026-11-03', { absenceSignaleeLe: '2026-11-02T08:00:00Z' })],
      [
        { contratId: 'c1', periode: '2026-10-01', type: 'facture', statut: 'envoyee' },
        { contratId: 'c2', periode: '2026-10-01', type: 'facture', statut: 'annulee' },
      ],
      tarifs,
    );
    expect(p.moisFactures.map(x => x.id)).toEqual(['a']);
    expect(p.absences.map(x => x.id)).toEqual(['c']);
    expect(p.aConfirmer.map(x => x.id)).toEqual(['b']);
    expect(p.sansTarif).toBe(1);
  });

  it('ignore ce qui n’est plus planifié', () => {
    expect(planConfirmationGroupee([s('a', '2026-11-03', { statut: 'realisee' })], [], tarifs).aConfirmer).toEqual([]);
  });

  it('nomme le mois', () => {
    expect(libelleMois('2026-11')).toBe('novembre 2026');
  });
});
