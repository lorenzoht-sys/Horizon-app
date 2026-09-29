import { describe, it, expect } from 'vitest';
import { absenceSignaleeAffichable, titreEvenementSeance } from './agendaCommun';
import type { Seance } from '../types';

const seanceBase: Seance = {
  id: 's1', participantId: 'p1', date: '2026-10-01',
  heureDebut: '09:00', heureFin: '09:45', dureeMinutes: 45,
  type: 'seance', statut: 'planifiee', adresse: '',
};

// absenceSignaleeAffichable est la règle unique derrière les 4 surfaces qui
// affichent ce signalement : Tournée mobile, Agenda mobile (vue Jour et
// pastille vue Mois — AppMobile.tsx) et l'agenda desktop (titreEvenementSeance
// ci-dessous). La couvrir ici couvre donc ces 4 endroits à la fois.
describe('absenceSignaleeAffichable — règle d\'affichage partagée mobile + desktop', () => {
  it('affichable : signalée et encore planifiée', () => {
    const seance = { ...seanceBase, absenceSignaleeLe: '2026-09-30T10:00:00.000Z' };
    expect(absenceSignaleeAffichable(seance)).toBe(true);
  });

  it('non affichable : rien n\'est signalé', () => {
    expect(absenceSignaleeAffichable(seanceBase)).toBe(false);
  });

  // Option A (chantier lots C+G, suite) : la colonne absence_signalee_par_
  // patient_le n'est jamais effacée (seanceToDb ne la sérialise pas, voir
  // mappers.ts), mais une fois la séance traitée le signal n'est plus
  // actionnable — le garder affiché redeviendrait trompeur (ex. à côté du
  // badge « Reportée » en Tournée mobile). Couvre explicitement le cas
  // signalé : séance signalée dont le statut est passé à annulee/reportee,
  // et le cas réalisee (la séance a eu lieu, pas seulement annulée).
  it.each(['annulee', 'reportee', 'realisee'] as const)(
    'non affichable une fois la séance traitée (statut = %s), même signalée',
    (statut) => {
      const seance = { ...seanceBase, statut, absenceSignaleeLe: '2026-09-30T10:00:00.000Z' };
      expect(absenceSignaleeAffichable(seance)).toBe(false);
    },
  );
});

describe('titreEvenementSeance — badge « absence signalée » agenda desktop', () => {
  const participant = { prenom: 'Jean', nom: 'Dupont' };

  it('titre normal quand rien n\'est signalé', () => {
    expect(titreEvenementSeance(seanceBase, participant)).toBe('Jean Dupont');
  });

  it('préfixe 🚫 quand une absence est signalée et la séance encore planifiée', () => {
    const seance = { ...seanceBase, absenceSignaleeLe: '2026-09-30T10:00:00.000Z' };
    expect(titreEvenementSeance(seance, participant)).toBe('🚫 Jean Dupont');
  });

  it('sans participant (bilan sans fiche), retombe sur le libellé du type', () => {
    const seance: Seance = { ...seanceBase, type: 'bilan', absenceSignaleeLe: '2026-09-30T10:00:00.000Z' };
    expect(titreEvenementSeance(seance, undefined)).toBe('🚫 Bilan');
  });

  it('pas de préfixe sur une séance annulée, même signalée (cas signalé — voir absenceSignaleeAffichable)', () => {
    const seance = { ...seanceBase, statut: 'annulee' as const, absenceSignaleeLe: '2026-09-30T10:00:00.000Z' };
    expect(titreEvenementSeance(seance, participant)).toBe('Jean Dupont');
  });
});
