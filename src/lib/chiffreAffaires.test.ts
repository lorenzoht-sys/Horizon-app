import { describe, expect, it } from 'vitest';
import {
  ajouterMois,
  caParMoisCle,
  detailDuMois,
  historique,
  libelleMois,
  moisCourantParis,
  lireLigneCA,
  lireMontant,
  plageHistorique,
  premierDuMois,
  totauxParMois,
  validerSaisie,
  type LigneCA,
} from './chiffreAffaires';

const l = (mois: string, participantId: string, horizon: number, externe = 0): LigneCA => ({ mois, participantId, horizon, externe });
const NOMS = { a: 'Camille Demo', b: 'Sam Essai', c: 'Alex Test' };

describe('mois', () => {
  it('ajoute et retire des mois, à travers les années', () => {
    expect(ajouterMois('2026-10-01', 1)).toBe('2026-11-01');
    expect(ajouterMois('2026-12-01', 1)).toBe('2027-01-01');
    expect(ajouterMois('2026-01-01', -1)).toBe('2025-12-01');
    expect(ajouterMois('2026-03-01', -14)).toBe('2025-01-01');
    expect(ajouterMois('2026-10-01', 0)).toBe('2026-10-01');
  });
  it('premier du mois, libellé et plage de 12 mois', () => {
    expect(premierDuMois('2026-10-17')).toBe('2026-10-01');
    expect(premierDuMois('2026-10')).toBe('2026-10-01');
    expect(libelleMois('2026-02-01')).toBe('février 2026');
    expect(plageHistorique('2026-10-01')).toEqual({ debut: '2025-11-01', fin: '2026-10-01' });
  });
});

describe('mois courant', () => {
  it('se règle sur la date de Paris : à 23h30 UTC le 31 octobre, c\'est déjà novembre à Paris', () => {
    expect(moisCourantParis(new Date('2026-10-31T23:30:00Z'))).toBe('2026-11-01');
    expect(moisCourantParis(new Date('2026-10-31T22:30:00Z'))).toBe('2026-10-01');
    expect(moisCourantParis(new Date('2026-01-01T00:30:00Z'))).toBe('2026-01-01');
  });
});

describe('lecture des lignes de la fonction SQL', () => {
  it('accepte les numeric en chaîne ou en nombre', () => {
    expect(lireLigneCA({ mois: '2026-09-01', participant_id: 'a', ca_horizon: '90.00', ca_externe: 25.5 }))
      .toEqual({ mois: '2026-09-01', participantId: 'a', horizon: 90, externe: 25.5 });
    expect(lireLigneCA({ mois: '2026-09-01', participant_id: 'a', ca_horizon: null, ca_externe: undefined }))
      .toEqual({ mois: '2026-09-01', participantId: 'a', horizon: 0, externe: 0 });
  });
});

describe('agrégation', () => {
  const lignes = [
    l('2026-09-01', 'a', 90, 20), l('2026-09-01', 'b', 135), l('2026-09-01', 'c', 0, 50),
    l('2026-08-01', 'a', 45),
  ];

  it('détail d\'un mois : totaux et bénéficiaires du plus gros CA au plus petit', () => {
    const d = detailDuMois(lignes, '2026-09-01', NOMS);
    expect(d).toMatchObject({ horizon: 225, externe: 70, total: 295 });
    expect(d.beneficiaires.map(b => [b.nom, b.horizon, b.externe, b.total])).toEqual([
      ['Sam Essai', 135, 0, 135],
      ['Camille Demo', 90, 20, 110],
      ['Alex Test', 0, 50, 50],
    ]);
  });
  it('un mois sans activité est vide, un bénéficiaire inconnu garde un nom neutre', () => {
    expect(detailDuMois(lignes, '2026-07-01', NOMS)).toEqual({ mois: '2026-07-01', horizon: 0, externe: 0, total: 0, beneficiaires: [] });
    expect(detailDuMois([l('2026-09-01', 'zzz', 10)], '2026-09-01', NOMS).beneficiaires[0].nom).toBe('Bénéficiaire');
  });
  it('plusieurs lignes du même bénéficiaire et du même mois s\'additionnent, sans dérive de flottants', () => {
    const d = detailDuMois([l('2026-09-01', 'a', 0.1, 0.2), l('2026-09-01', 'a', 0.2, 0.1)], '2026-09-01', NOMS);
    expect(d.beneficiaires[0]).toMatchObject({ horizon: 0.3, externe: 0.3, total: 0.6 });
  });
  it('un bénéficiaire dont l\'avoir ramène le CA à 0 disparaît, un CA négatif reste visible', () => {
    expect(detailDuMois([l('2026-09-01', 'a', 0)], '2026-09-01', NOMS).beneficiaires).toEqual([]);
    expect(detailDuMois([l('2026-09-01', 'a', -30)], '2026-09-01', NOMS).total).toBe(-30);
  });
  it('totaux par mois et historique de 12 mois, mois vides compris, du plus récent au plus ancien', () => {
    expect(totauxParMois(lignes)).toEqual({ '2026-09-01': 295, '2026-08-01': 45 });
    const h = historique(lignes, '2026-09-01', 12);
    expect(h).toHaveLength(12);
    expect(h[0]).toMatchObject({ mois: '2026-09-01', total: 295 });
    expect(h[1]).toMatchObject({ mois: '2026-08-01', total: 45 });
    expect(h[2]).toMatchObject({ mois: '2026-07-01', total: 0 });
    expect(h[11].mois).toBe('2025-10-01');
  });
  it('format AAAA-MM pour « Mes stats »', () => {
    expect(caParMoisCle(lignes)).toEqual({ '2026-09': 295, '2026-08': 45 });
  });
});

describe('saisie d\'un montant', () => {
  it('lit les formats français et anglais', () => {
    expect(lireMontant('80')).toBe(80);
    expect(lireMontant('1 234,56')).toBe(1234.56);
    expect(lireMontant('1234.5')).toBe(1234.5);
    expect(lireMontant('80 €')).toBe(80);
    expect(lireMontant('1 200,00')).toBe(1200);
    expect(lireMontant('0,005')).toBe(0.01);        // arrondi au centime, puis > 0
    expect(lireMontant('0,004')).toBeNull();        // arrondi à 0 : refusé
  });
  it('refuse zéro, les négatifs et tout ce qui n\'est pas un nombre', () => {
    for (const s of ['', '0', '0,00', '-5', 'abc', '1,2,3', '12e3', '--', ' ', '1 000 000 000 000']) expect(lireMontant(s), s).toBeNull();
  });
});

describe('validation du formulaire', () => {
  it('accepte une saisie complète et normalise le libellé', () => {
    const r = validerSaisie({ participantId: 'a', libelle: '  SAP   externe ', montant: '120,5' });
    expect(r.erreurs).toEqual({});
    expect(r.valeurs).toEqual({ participantId: 'a', libelle: 'SAP externe', montant: 120.5 });
  });
  it('annonce chaque défaut, comme les contraintes de la base', () => {
    const r = validerSaisie({ participantId: '', libelle: '   ', montant: '0' });
    expect(Object.keys(r.erreurs).sort()).toEqual(['libelle', 'montant', 'participantId']);
    expect(r.valeurs).toBeNull();
    expect(validerSaisie({ participantId: 'a', libelle: 'x'.repeat(121), montant: '10' }).erreurs.libelle).toMatch(/120/);
    expect(validerSaisie({ participantId: 'a', libelle: 'x'.repeat(120), montant: '10' }).valeurs).not.toBeNull();
  });
});
