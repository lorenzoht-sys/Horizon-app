import { describe, expect, it } from 'vitest';
import { estLigneFrais, lignesAffichees, lirePresentation, type LigneRegroupable } from './regroupement';

// Lignes telles que generer_brouillon_facture les écrit (20261022100000) ; données fictives.
const seance = (jour: string, prix = 50): LigneRegroupable =>
  ({ libelle: `Séance du ${jour}/09/2026 à 10:00 (1 h)`, quantite: 1, prixUnitaire: prix, montant: prix, seanceDate: `2026-09-${jour}`, seanceType: 'seance' });
const bilan = (jour: string, prix = 60): LigneRegroupable =>
  ({ libelle: `Bilan du ${jour}/09/2026 à 10:00 (1 h)`, quantite: 1, prixUnitaire: prix, montant: prix, seanceDate: `2026-09-${jour}`, seanceType: 'bilan' });
const frais = (n: number, prix = 5): LigneRegroupable =>
  ({ libelle: `Frais de déplacement : ${n} × ${prix} €`, quantite: n, prixUnitaire: prix, montant: n * prix });

describe('lirePresentation', () => {
  it('seule « globale » est globale ; NULL (factures antérieures) et toute autre valeur sont détaillées', () => {
    expect(lirePresentation('globale')).toBe('globale');
    for (const v of ['detaillee', null, undefined, '', 'GLOBALE', 1]) expect(lirePresentation(v)).toBe('detaillee');
  });
});

describe('lignesAffichees', () => {
  const lignes = [seance('03'), seance('10'), seance('17'), seance('24'), frais(4)];

  it('détaillée : les lignes de la base, inchangées (même tableau)', () => {
    expect(lignesAffichees(lignes, 'detaillee', '2026-09-01')).toBe(lignes);
  });

  it('globale : une seule ligne, libellé de la décision du 2026-10-22, total identique', () => {
    expect(lignesAffichees(lignes, 'globale', '2026-09-01')).toEqual([{
      libelle: 'Accompagnement en activité physique adaptée — septembre 2026 : 4 séances, déplacements inclus',
      quantite: 1, prixUnitaire: 220, montant: 220, seanceDate: null, seanceType: null,
    }]);
  });

  it('sans frais de déplacement : pas de « déplacements inclus » ; singulier pour une séance', () => {
    expect(lignesAffichees([seance('03')], 'globale', '2026-02-01')[0].libelle)
      .toBe('Accompagnement en activité physique adaptée — février 2026 : 1 séance');
  });

  it('les bilans sont comptés à part, plusieurs tarifs et plusieurs lignes de frais sont additionnés', () => {
    const r = lignesAffichees([seance('03', 45), seance('10', 50), bilan('17'), frais(1, 5), frais(2, 7.5)], 'globale', '2026-09-01');
    expect(r).toHaveLength(1);
    expect(r[0].libelle).toBe('Accompagnement en activité physique adaptée — septembre 2026 : 2 séances et 1 bilan, déplacements inclus');
    expect(r[0].montant).toBe(175);
    expect(lignesAffichees([bilan('03'), bilan('10')], 'globale', '2026-09-01')[0].libelle).toMatch(/: 2 bilans$/);
  });

  it('somme au centime, sans dérive flottante', () => {
    const r = lignesAffichees([seance('03', 0.1), seance('10', 0.2), frais(2, 0.35)], 'globale', '2026-09-01');
    expect(r[0].montant).toBe(1);
  });

  it('forfait : rien à regrouper, lignes inchangées', () => {
    const forfait = [{ libelle: 'Forfait mensuel — septembre 2026', quantite: 1, prixUnitaire: 300, montant: 300 }];
    expect(lignesAffichees(forfait, 'globale', '2026-09-01')).toBe(forfait);
  });

  it('avoir : séances et frais crédités regroupés, le geste commercial reste à part', () => {
    const r = lignesAffichees([seance('03'), frais(0.5), { libelle: 'Geste commercial', quantite: 1, prixUnitaire: 10, montant: 10 }], 'globale', '2026-09-01');
    expect(r.map(l => [l.libelle, l.montant])).toEqual([
      ['Accompagnement en activité physique adaptée — septembre 2026 : 1 séance, déplacements inclus', 52.5],
      ['Geste commercial', 10],
    ]);
  });

  it('avoir sur les seuls frais : aucune séance, rien n\'est regroupé', () => {
    const l = [frais(1)];
    expect(lignesAffichees(l, 'globale', '2026-09-01')).toBe(l);
  });

  it('estLigneFrais : seulement les lignes sans séance dont le libellé commence par « Frais de déplacement »', () => {
    expect(estLigneFrais(frais(2))).toBe(true);
    expect(estLigneFrais({ ...frais(2), seanceDate: '2026-09-03' })).toBe(false);
    expect(estLigneFrais({ libelle: 'Geste commercial' })).toBe(false);
  });
});
