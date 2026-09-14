import { describe, it, expect } from 'vitest';
import {
  etatPartageBilan,
  resumePartageBilan,
  bilanADuContenuVisible,
  auMoinsUnResultatPartage,
  etatProgresBeneficiaire,
  resultatsNonComparables,
} from './partageBeneficiaire';
import type { Bilan } from '../types';

/** Bilan minimal : seuls les champs lus par le module comptent. */
function bilan(over: Partial<Bilan> = {}): Bilan {
  return {
    id: 'b1', date: '2026-01-01', type: 'initial',
    equilibre: { droite: 12, gauche: 10 },
    chairStand30: 14,
    handGrip: { droite: 28, gauche: 26 },
    tug3m: 9.4,
    tm6: { distanceMetres: 380 },
    visibleBeneficiaire: {},
    ...over,
  } as Bilan;
}

describe('État de partage d’un bilan', () => {
  it('distingue un résultat non saisi d’un résultat saisi mais non coché', () => {
    // Les deux ne montrent rien au bénéficiaire, mais appellent des actions
    // opposées : mesurer, ou cocher.
    const b = bilan({ chairStand30: undefined, visibleBeneficiaire: { equilibre: true } });
    const etats = etatPartageBilan(b);

    expect(etats.find(e => e.cle === 'force')).toMatchObject({ renseigne: false, partage: false });
    expect(etats.find(e => e.cle === 'equilibre')).toMatchObject({ renseigne: true, partage: true });
    expect(etats.find(e => e.cle === 'mobilite')).toMatchObject({ renseigne: true, partage: false });
  });

  it('compte partagés, masqués et absents', () => {
    const b = bilan({ tm6: undefined, visibleBeneficiaire: { equilibre: true, force: true } });

    expect(resumePartageBilan(b)).toEqual({ partages: 2, masques: 2, absents: 1 });
  });

  it('une case cochée sur un résultat non saisi ne compte pas comme partagée', () => {
    const b = bilan({ tm6: undefined, visibleBeneficiaire: { endurance: true } });

    expect(resumePartageBilan(b).partages).toBe(0);
    expect(bilanADuContenuVisible(b)).toBe(false);
  });

  it('un bilan sans aucune case cochée ne montre rien', () => {
    expect(bilanADuContenuVisible(bilan())).toBe(false);
    expect(auMoinsUnResultatPartage([bilan(), bilan()])).toBe(false);
  });
});

describe('Pourquoi la page « Progrès » est vide', () => {
  it('aucun bilan : rien à attendre', () => {
    expect(etatProgresBeneficiaire([], 0)).toEqual({ etat: 'aucun_bilan' });
  });

  it('des bilans existent mais rien n’est partagé', () => {
    expect(etatProgresBeneficiaire([bilan(), bilan({ id: 'b2' })], 0))
      .toEqual({ etat: 'en_attente_partage' });
  });

  it('un seul bilan partagé : pas encore de quoi comparer', () => {
    const b = bilan({ visibleBeneficiaire: { equilibre: true } });

    expect(etatProgresBeneficiaire([b], 0)).toEqual({ etat: 'un_seul_bilan' });
  });

  it('partagé sur le dernier bilan seulement : aucune progression traçable', () => {
    // Le cas rendu probable par le relevé du 2026-09-14 : Pierre coche les
    // résultats du bilan du jour sans revenir sur le bilan initial. Le
    // mécanisme a servi, et pourtant rien ne s'affiche.
    const initial = bilan({ id: 'b1', visibleBeneficiaire: {} });
    const dernier = bilan({ id: 'b2', date: '2026-06-01', visibleBeneficiaire: { equilibre: true } });

    expect(etatProgresBeneficiaire([initial, dernier], 0))
      .toEqual({ etat: 'partage_non_comparable' });
  });

  it('des progressions existent : on les affiche', () => {
    const b = bilan({ visibleBeneficiaire: { equilibre: true } });

    expect(etatProgresBeneficiaire([b, b], 3)).toEqual({ etat: 'progressions' });
  });
});

describe('Cases manquantes pour rendre une progression comparable', () => {
  it('nomme le bilan où la case manque', () => {
    const initial = bilan({ id: 'b1', visibleBeneficiaire: { force: true } });
    const dernier = bilan({ id: 'b2', visibleBeneficiaire: { force: true, equilibre: true } });

    const manquants = resultatsNonComparables(initial, dernier);

    // « force » est partagé des deux côtés : comparable, donc absent.
    // « equilibre » ne l'est que sur le dernier : c'est l'initial qui manque.
    expect(manquants.map(m => m.cle)).toEqual(['equilibre']);
    expect(manquants[0].partage).toBe(false);
  });

  it('ignore un test mesuré d’un seul côté', () => {
    // Rien à cocher : le test n'existe pas dans le bilan initial.
    const initial = bilan({ id: 'b1', tm6: undefined });
    const dernier = bilan({ id: 'b2', visibleBeneficiaire: { endurance: true } });

    expect(resultatsNonComparables(initial, dernier).map(m => m.cle)).not.toContain('endurance');
  });

  it('ne renvoie rien quand tout est partagé des deux côtés', () => {
    const partout = { equilibre: true, force: true, handGrip: true, mobilite: true, endurance: true };
    const initial = bilan({ id: 'b1', visibleBeneficiaire: partout });
    const dernier = bilan({ id: 'b2', visibleBeneficiaire: partout });

    expect(resultatsNonComparables(initial, dernier)).toEqual([]);
  });
});
