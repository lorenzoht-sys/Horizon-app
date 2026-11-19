import { describe, expect, it } from 'vitest';
import { estContratIncomplet, finSeancesPassees, messageContratIncomplet, syntheseControle } from './controleFacturation';
import type { LigneSuivi } from './suiviSeances';

const ligne = (p: Partial<LigneSuivi>): LigneSuivi => ({
  seanceId: Math.random().toString(36), date: '2026-10-10', heure: '10:00', type: 'seance', participantId: 'p1',
  contratId: 'c1', etat: 'en_preparation', motif: null, factureId: 'f1', numero: null, avantDebutContrat: false,
  avoirId: null, numeroAvoir: null, ...p,
});

describe('estContratIncomplet', () => {
  it('aucun tarif, ou un premier tarif postérieur au début du contrat (cas d\'octobre 2026)', () => {
    expect(estContratIncomplet({ contratId: 'c', participantId: 'p', dateDebut: '2026-10-03', premierTarif: null })).toBe(true);
    expect(estContratIncomplet({ contratId: 'c', participantId: 'p', dateDebut: '2026-10-03', premierTarif: '2026-11-01' })).toBe(true);
    expect(estContratIncomplet({ contratId: 'c', participantId: 'p', dateDebut: '2026-10-03', premierTarif: '2026-10-03' })).toBe(false);
    expect(estContratIncomplet({ contratId: 'c', participantId: 'p', dateDebut: '2026-10-03', premierTarif: '2026-09-01' })).toBe(false);
  });
  it('message clair dans les deux cas', () => {
    expect(messageContratIncomplet({ contratId: 'c', participantId: 'p', dateDebut: '2026-10-03', premierTarif: null }))
      .toBe('Impossible de préparer la facture : aucun tarif renseigné dans le contrat.');
    expect(messageContratIncomplet({ contratId: 'c', participantId: 'p', dateDebut: '2026-10-03', premierTarif: '2026-11-01' }))
      .toMatch(/commence le 01\/11\/2026, après le début du contrat \(03\/10\/2026\)/);
  });
});

describe('syntheseControle', () => {
  it('bloqué > à vérifier > prêt, un dossier par bénéficiaire', () => {
    const s = syntheseControle(
      [
        ligne({ participantId: 'pret', factureId: 'fa' }),
        ligne({ participantId: 'pret', factureId: 'fa' }),
        ligne({ participantId: 'bloque', etat: 'a_facturer', motif: 'sans_tarif', factureId: null }),
        ligne({ participantId: 'bloque', factureId: 'fb' }),
        ligne({ participantId: 'verif', factureId: 'fc', etat: 'facturee' }),
        ligne({ participantId: 'sap', etat: 'non_facturable', motif: 'beneficiaire_sap', factureId: null }),
      ],
      [{ seanceId: 's', date: '2026-10-20', heure: '10:00', participantId: 'verif', contratId: 'c' },
       { seanceId: 't', date: '2026-10-21', heure: '10:00', participantId: 'seulement-planifie', contratId: 'c' }],
      [],
    );
    expect(s.dossiers.map(d => [d.participantId, d.statut])).toEqual([
      ['bloque', 'bloque'], ['verif', 'a_verifier'], ['seulement-planifie', 'a_verifier'], ['pret', 'pret'],
    ]);
    expect(s).toMatchObject({ prets: 1, aVerifier: 2, bloques: 1, factures: 3, seancesAConfirmer: 2, contratsIncomplets: 0 });
  });
  it('un contrat incomplet met le dossier « à vérifier » même si les séances du mois sont facturées', () => {
    const s = syntheseControle([ligne({ participantId: 'p' })], [],
      [{ contratId: 'c', participantId: 'p', dateDebut: '2026-10-03', premierTarif: '2026-10-20' }]);
    expect(s.dossiers[0].statut).toBe('a_verifier');
    expect(s.contratsIncomplets).toBe(1);
  });
});

describe('finSeancesPassees', () => {
  it('veille du jour, bornée à la fin du mois ; rien pour un mois sans jour passé', () => {
    expect(finSeancesPassees('2026-11-01', '2026-11-19')).toBe('2026-11-18');
    expect(finSeancesPassees('2026-10-01', '2026-11-19')).toBe('2026-10-31');
    expect(finSeancesPassees('2026-11-01', '2026-11-01')).toBeNull();
    expect(finSeancesPassees('2026-12-01', '2026-11-19')).toBeNull();
    expect(finSeancesPassees('2026-02-01', '2026-03-01')).toBe('2026-02-28');
  });
});
