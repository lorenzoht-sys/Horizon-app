import { describe, expect, it } from 'vitest';
import { aRembourser, calculerAvoir, motifValide, quantiteRestante, type LigneOrigine } from './avoirs';

const ligne = (id: string, quantite: number, prixUnitaire: number): LigneOrigine =>
  ({ id, libelle: id, quantite, prixUnitaire, montant: Math.round(quantite * prixUnitaire * 100) / 100, seanceId: null });

describe('quantiteRestante', () => {
  it('retire ce que les avoirs émis ont déjà crédité, sans descendre sous zéro', () => {
    const frais = ligne('frais', 4, 5);
    expect(quantiteRestante(frais, [])).toBe(4);
    expect(quantiteRestante(frais, [{ ligneOrigineId: 'frais', quantite: 1 }, { ligneOrigineId: 'autre', quantite: 3 }])).toBe(3);
    expect(quantiteRestante(frais, [{ ligneOrigineId: 'frais', quantite: 5 }])).toBe(0);
  });
});

describe('calculerAvoir', () => {
  const franchise = { totalHt: 90, montantTva: 0, total: 90, tauxTva: 0 };
  const lignes = [ligne('s1', 1, 45), ligne('s2', 1, 45)];

  it('avoir total en franchise : 90 €, annule la facture', () => {
    const r = calculerAvoir(franchise, lignes, [{ ligneId: 's1', quantite: 1 }, { ligneId: 's2', quantite: 1 }], 0, []);
    expect(r).toEqual({ totalHt: 90, montantTva: 0, total: 90, resteCreditable: 90, depasse: false, annuleOrigine: true });
  });

  it('partiel + geste commercial, puis dépassement du reste créditable', () => {
    expect(calculerAvoir(franchise, lignes, [{ ligneId: 's1', quantite: 1 }], 10, [])).toMatchObject({ total: 55, annuleOrigine: false, depasse: false });
    expect(calculerAvoir(franchise, lignes, [], 50, [{ totalHt: 45, montantTva: 0, total: 45 }])).toMatchObject({ resteCreditable: 45, depasse: true });
  });

  it('TVA à 10 % arrondie par avoir, et « solde » exact sur le dernier (comme la base)', () => {
    const origine = { totalHt: 0.15, montantTva: 0.02, total: 0.17, tauxTva: 10 };
    const l = [ligne('a', 1, 0.05), ligne('b', 1, 0.05), ligne('c', 1, 0.05)];
    const un = { totalHt: 0.05, montantTva: 0.01, total: 0.06 };
    expect(calculerAvoir(origine, l, [{ ligneId: 'a', quantite: 1 }], 0, [])).toMatchObject(un);
    expect(calculerAvoir(origine, l, [{ ligneId: 'c', quantite: 1 }], 0, [un, un])).toMatchObject({ totalHt: 0.05, montantTva: 0, total: 0.05, annuleOrigine: true, depasse: false });
  });

  it('TVA à 5,5 % : arrondi au centime le plus proche, moitié vers le haut', () => {
    // 45 € HT × 5,5 % = 2,475 -> 2,48
    const origine = { totalHt: 90, montantTva: 4.95, total: 94.95, tauxTva: 5.5 };
    expect(calculerAvoir(origine, lignes, [{ ligneId: 's1', quantite: 1 }], 0, [])).toMatchObject({ totalHt: 45, montantTva: 2.48, total: 47.48 });
  });

  it('frais : une partie de la quantité ; ligne inconnue ou quantité nulle ignorées', () => {
    const l = [ligne('frais', 2, 5)];
    expect(calculerAvoir(franchise, l, [{ ligneId: 'frais', quantite: 1 }, { ligneId: 'x', quantite: 1 }, { ligneId: 'frais', quantite: 0 }], 0, []).total).toBe(5);
  });
});

describe('aRembourser et motif', () => {
  it('rembourse ce qui a été encaissé au-delà du reste dû', () => {
    expect(aRembourser(90, 90, 45)).toBe(45);
    expect(aRembourser(30, 90, 45)).toBe(0);
    expect(aRembourser(90, 90, 90)).toBe(90);
  });
  it('motif obligatoire, 500 caractères au plus', () => {
    expect(motifValide('  ')).toBe(false);
    expect(motifValide('Séance annulée')).toBe(true);
    expect(motifValide('x'.repeat(501))).toBe(false);
  });
});
