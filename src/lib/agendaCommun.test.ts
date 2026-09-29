import { describe, it, expect } from 'vitest';
import { titreEvenementSeance } from './agendaCommun';
import type { Seance } from '../types';

describe('titreEvenementSeance — badge « absence signalée » agenda desktop', () => {
  const seanceBase: Seance = {
    id: 's1', participantId: 'p1', date: '2026-10-01',
    heureDebut: '09:00', heureFin: '09:45', dureeMinutes: 45,
    type: 'seance', statut: 'planifiee', adresse: '',
  };
  const participant = { prenom: 'Jean', nom: 'Dupont' };

  it('titre normal quand rien n\'est signalé', () => {
    expect(titreEvenementSeance(seanceBase, participant)).toBe('Jean Dupont');
  });

  it('préfixe 🚫 quand une absence est signalée', () => {
    const seance = { ...seanceBase, absenceSignaleeLe: '2026-09-30T10:00:00.000Z' };
    expect(titreEvenementSeance(seance, participant)).toBe('🚫 Jean Dupont');
  });

  it('sans participant (bilan sans fiche), retombe sur le libellé du type', () => {
    const seance: Seance = { ...seanceBase, type: 'bilan', absenceSignaleeLe: '2026-09-30T10:00:00.000Z' };
    expect(titreEvenementSeance(seance, undefined)).toBe('🚫 Bilan');
  });

  it('le préfixe ne dépend pas du statut (lecture seule, aucun calcul)', () => {
    const seance = { ...seanceBase, statut: 'annulee' as const, absenceSignaleeLe: '2026-09-30T10:00:00.000Z' };
    expect(titreEvenementSeance(seance, participant)).toBe('🚫 Jean Dupont');
  });
});
