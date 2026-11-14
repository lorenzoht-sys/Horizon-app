import { describe, it, expect } from 'vitest';
import type { Contrat } from '../types';
import { contratCouvreDate, contratsDuBeneficiaire, contratSuggere, libelleContrat } from './contratSeance';
import { avecInfosDeLaReference } from './planificationManuelle';

function contrat(partiel: Partial<Contrat> & Pick<Contrat, 'id'>): Contrat {
  return {
    participantId: 'p1', dateDebut: '2026-09-01', dateFin: '2026-12-31', joursFixe: [], nbSeancesSemaine: 1,
    heureDebut: '09:00', dureeMinutes: 45, dureesSeances: [45], statut: 'actif', dateCreation: '2026-09-01',
    nombreSeancesTotal: 0, nombreSeancesRealisees: 0,
    ...partiel,
  } as Contrat;
}

describe('contratCouvreDate', () => {
  it('bornes incluses', () => {
    const c = contrat({ id: 'c' });
    expect(contratCouvreDate(c, '2026-09-01')).toBe(true);
    expect(contratCouvreDate(c, '2026-12-31')).toBe(true);
    expect(contratCouvreDate(c, '2026-08-31')).toBe(false);
    expect(contratCouvreDate(c, '2027-01-01')).toBe(false);
  });
  it('durée indéterminée : aucune fin', () => {
    expect(contratCouvreDate(contrat({ id: 'c', dureeIndeterminee: true, dateFin: '2026-09-30' }), '2030-01-01')).toBe(true);
  });
});

describe('contratSuggere', () => {
  it('aucun contrat : rien (prospect, bilan initial)', () => {
    expect(contratSuggere([], 'p1', '2026-11-10')).toBeUndefined();
  });
  it('ignore les contrats des autres bénéficiaires', () => {
    expect(contratSuggere([contrat({ id: 'c', participantId: 'p2' })], 'p1', '2026-11-10')).toBeUndefined();
  });
  it('le contrat qui couvre la date', () => {
    const ancien = contrat({ id: 'ancien', dateDebut: '2026-01-01', dateFin: '2026-06-30', statut: 'termine' });
    const courant = contrat({ id: 'courant' });
    expect(contratSuggere([ancien, courant], 'p1', '2026-03-15')?.id).toBe('ancien');
    expect(contratSuggere([ancien, courant], 'p1', '2026-11-10')?.id).toBe('courant');
  });
  it('plusieurs contrats couvrent la date : l’actif d’abord', () => {
    const termine = contrat({ id: 'termine', statut: 'termine' });
    const actif = contrat({ id: 'actif', dateDebut: '2026-10-01' });
    expect(contratSuggere([termine, actif], 'p1', '2026-11-10')?.id).toBe('actif');
  });
  it('hors période : le contrat actif à défaut', () => {
    const actif = contrat({ id: 'actif', dateDebut: '2026-11-15' });
    expect(contratSuggere([actif], 'p1', '2026-11-10')?.id).toBe('actif');
  });
  it('hors période sans contrat actif : rien', () => {
    expect(contratSuggere([contrat({ id: 't', statut: 'termine', dateFin: '2026-10-31' })], 'p1', '2026-11-10')).toBeUndefined();
  });
});

describe('contratsDuBeneficiaire', () => {
  it('le plus récent d’abord', () => {
    const a = contrat({ id: 'a', dateDebut: '2026-01-01' });
    const b = contrat({ id: 'b', dateDebut: '2026-09-01' });
    expect(contratsDuBeneficiaire([a, b, contrat({ id: 'x', participantId: 'p2' })], 'p1').map(c => c.id)).toEqual(['b', 'a']);
  });
});

describe('libelleContrat', () => {
  it('période et statut', () => {
    expect(libelleContrat(contrat({ id: 'c' }))).toBe('Contrat du 01/09/2026 au 31/12/2026 (actif)');
    expect(libelleContrat(contrat({ id: 'c', dureeIndeterminee: true, statut: 'suspendu' }))).toBe('Contrat depuis le 01/09/2026 (suspendu)');
  });
});

describe('rattachement par une édition de série (avecInfosDeLaReference)', () => {
  const base = { date: '2026-11-10', heureDebut: '09:00', heureFin: '09:45', dureeMinutes: 45, statut: 'realisee' as const };
  const ops = [
    { type: 'update' as const, id: 'ref', updates: { date: '2026-11-10' } },
    { type: 'update' as const, id: 'autre', updates: { date: '2026-11-17' } },
  ];
  it('seule la séance de référence reçoit le contrat', () => {
    const res = avecInfosDeLaReference(ops, 'ref', { ...base, contratId: 'c1' });
    expect(res[0]).toMatchObject({ updates: { contratId: 'c1' } });
    expect(res[1].type === 'update' && 'contratId' in res[1].updates).toBe(false);
  });
  it('sans clé contratId, le contrat n’est pas touché', () => {
    const res = avecInfosDeLaReference(ops, 'ref', base);
    expect(res[0].type === 'update' && 'contratId' in res[0].updates).toBe(false);
  });
});
