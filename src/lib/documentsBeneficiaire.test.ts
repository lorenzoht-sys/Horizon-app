import { describe, expect, it } from 'vitest';
import {
  libelleStatut, lireCompteRendu, lireFactureDocument, trierComptesRendus, trierFactures, visibleParBeneficiaire,
  type FactureDocument,
} from './documentsBeneficiaire';

// Données fictives.
const brut = (o: Record<string, unknown> = {}) => ({
  id: 'f1', type: 'facture', numero: '2026-0007', periode: '2026-09-01', date_emission: '2026-10-02', total: '110.00',
  statut: 'validee', pdf_path: 'p/2026-0007.pdf', snapshot_destinataire: { role: 'beneficiaire', nom: 'Test' }, ...o,
});

describe('lireFactureDocument', () => {
  it('lit une facture adressée au bénéficiaire', () => {
    expect(lireFactureDocument(brut())).toEqual({
      id: 'f1', type: 'facture', numero: '2026-0007', periode: '2026-09-01', dateEmission: '2026-10-02',
      total: 110, statut: 'validee', pdfPath: 'p/2026-0007.pdf', payeurProche: false,
    });
  });
  it('payeur proche lu dans le snapshot ; snapshot absent = bénéficiaire ; PDF absent = null', () => {
    expect(lireFactureDocument(brut({ snapshot_destinataire: { role: 'proche' } })).payeurProche).toBe(true);
    expect(lireFactureDocument(brut({ snapshot_destinataire: null })).payeurProche).toBe(false);
    expect(lireFactureDocument(brut({ pdf_path: null })).pdfPath).toBeNull();
    expect(lireFactureDocument(brut({ type: 'avoir' })).type).toBe('avoir');
  });
});

describe('visibleParBeneficiaire (même règle que documents_du_beneficiaire)', () => {
  const f = (o: Partial<FactureDocument> = {}) => ({ statut: 'validee', numero: '2026-0007', payeurProche: false, ...o });
  it('adressée au bénéficiaire : toujours visible, quel que soit le réglage', () => {
    expect(visibleParBeneficiaire(f(), true)).toBe(true);
    expect(visibleParBeneficiaire(f(), false)).toBe(true);
  });
  it('payée par un proche : visible seulement si le réglage est à oui', () => {
    expect(visibleParBeneficiaire(f({ payeurProche: true }), true)).toBe(true);
    expect(visibleParBeneficiaire(f({ payeurProche: true }), false)).toBe(false);
  });
  it('jamais un brouillon ni une facture sans numéro', () => {
    expect(visibleParBeneficiaire(f({ statut: 'brouillon' }), true)).toBe(false);
    expect(visibleParBeneficiaire(f({ numero: '' }), true)).toBe(false);
  });
});

describe('tris et libellés', () => {
  it('factures : plus récentes d\'abord, puis numéro décroissant', () => {
    const l = [brut({ id: 'a', numero: '2026-0001', date_emission: '2026-09-01' }), brut({ id: 'b', numero: '2026-0003', date_emission: '2026-10-01' }), brut({ id: 'c', numero: '2026-0004', date_emission: '2026-10-01' })]
      .map(lireFactureDocument);
    expect(trierFactures(l).map(x => x.id)).toEqual(['c', 'b', 'a']);
  });
  it('comptes rendus : plus récents d\'abord ; titre par défaut', () => {
    const l = [{ id: 'a', titre: 'A', contenu: 'x', date_creation: '2026-09-01T10:00:00Z' }, { id: 'b', titre: '', contenu: 'y', date_creation: '2026-10-01T10:00:00Z' }].map(lireCompteRendu);
    expect(trierComptesRendus(l).map(x => [x.id, x.titre])).toEqual([['b', 'Document'], ['a', 'A']]);
  });
  it('libellé de statut', () => {
    expect(libelleStatut({ type: 'facture', statut: 'payee' })).toBe('Payée');
    expect(libelleStatut({ type: 'facture', statut: 'en_retard' })).toBe('En retard');
    expect(libelleStatut({ type: 'avoir', statut: 'validee' })).toBe('Avoir');
  });
});
