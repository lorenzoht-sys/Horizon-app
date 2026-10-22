import { describe, expect, it } from 'vitest';
import { etatPourBeneficiaire, trierFacturesPatient, type FacturePatient } from './facturesPatient';

const f = (o: Partial<FacturePatient> = {}): FacturePatient => ({
  id: 'a', type: 'facture', numero: '2026-0001', periode: '2026-09-01', dateEmission: '2026-10-01', total: 10, statut: 'validee', pdfDisponible: true, ...o,
});

describe('etatPourBeneficiaire', () => {
  it('émise, envoyée ou en retard : « À régler » (jamais « En retard » côté bénéficiaire)', () => {
    for (const statut of ['validee', 'envoyee', 'en_retard']) expect(etatPourBeneficiaire(f({ statut })).libelle).toBe('À régler');
  });
  it('réglée, annulée, avoir', () => {
    expect(etatPourBeneficiaire(f({ statut: 'payee' }))).toEqual({ libelle: 'Réglée', ton: 'ok' });
    expect(etatPourBeneficiaire(f({ statut: 'annulee' })).libelle).toBe('Annulée');
    expect(etatPourBeneficiaire(f({ type: 'avoir', statut: 'validee' })).libelle).toBe('Avoir');
  });
});

describe('trierFacturesPatient', () => {
  it('plus récentes d\'abord, puis numéro décroissant', () => {
    const l = [f({ id: 'a', dateEmission: '2026-09-01' }), f({ id: 'b', numero: '2026-0003', dateEmission: '2026-10-01' }), f({ id: 'c', numero: '2026-0004', dateEmission: '2026-10-01' })];
    expect(trierFacturesPatient(l).map(x => x.id)).toEqual(['c', 'b', 'a']);
  });
});
