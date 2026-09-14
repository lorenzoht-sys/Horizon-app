import { describe, it, expect } from 'vitest';
import {
  EMPTY_SED,
  SED_TOTAL_MAX,
  SED_DUREE,
  SED_MARCHE,
  computeSedScore,
  itemsSedManquants,
  computeFSSScore,
  itemsFSSManquants,
  etatSedentarite,
  etatFatigue,
  getSedProfil,
  getFSSProfil,
  FSS_NB_ITEMS,
} from './scoresAutonomie';
import type { SedentariteReponses } from '../types';

// Jeu complet de référence : pratiquant, toutes les réponses renseignées.
const SED_COMPLET: SedentariteReponses = {
  a_sedentarite: 5, b_pratique: 'oui', b_freq: 4, b_duree: 3, b_effort: 3,
  c_intensite: 2, c_travaux: 2, c_marche: 2, c_etages: 2,
};

const FSS_COMPLET: (number | null)[] = [5, 5, 5, 5, 5, 5, 5, 5, 5];

describe('Ricci & Gagnon — un item manquant ne produit pas de score', () => {
  // Le cas signalé par Pierre le 2026-09-13. Avant correction, l'absence de
  // réponse comptait comme un zéro : une personne assise moins de 2 h/jour
  // n'ayant répondu qu'à cette question obtenait 5, contre 6 pour une personne
  // assise plus de 5 h ayant tout rempli au minimum. Le score existait, il
  // était faux, et rien ne le signalait.
  it('refuse un score quand seule la question « temps assis » est renseignée', () => {
    const partiel: SedentariteReponses = { ...EMPTY_SED, a_sedentarite: 5 };

    expect(computeSedScore(partiel)).toBeNull();
    expect(itemsSedManquants(partiel)).toContain('c_marche');
    expect(itemsSedManquants(partiel)).not.toContain('a_sedentarite');
  });

  it('refuse un score dès qu’un SEUL item requis manque', () => {
    const presqueComplet: SedentariteReponses = { ...SED_COMPLET, c_etages: null };

    expect(computeSedScore(presqueComplet)).toBeNull();
    expect(itemsSedManquants(presqueComplet)).toEqual(['c_etages']);
  });

  it('calcule le score quand tout est renseigné', () => {
    const sc = computeSedScore(SED_COMPLET);

    expect(sc).not.toBeNull();
    // A=5, B=5+4+3+3=15, C=2+2+2+2=8
    expect(sc).toEqual({ scoreA: 5, scoreB: 15, scoreC: 8, total: 28 });
  });

  it("n'exige pas fréquence/durée/effort d'un non-pratiquant", () => {
    // L'interface masque ces trois questions quand b_pratique vaut 'non' :
    // les exiger rendrait tout questionnaire de non-pratiquant incomplet à vie.
    const nonPratiquant: SedentariteReponses = {
      ...EMPTY_SED,
      a_sedentarite: 3, b_pratique: 'non',
      c_intensite: 2, c_travaux: 2, c_marche: 2, c_etages: 2,
    };

    expect(itemsSedManquants(nonPratiquant)).toEqual([]);
    expect(computeSedScore(nonPratiquant)?.total).toBe(3 + 1 + 8);
  });

  it('conserve la pondération : moins sédentaire ⇒ meilleur score', () => {
    // Garde-fou sur le point que le diagnostic a déclaré correct. Si cette
    // assertion tombe un jour, c'est la table de pondération qui a bougé.
    const assisPeu = computeSedScore({ ...SED_COMPLET, a_sedentarite: 5 })!.total;
    const assisBeaucoup = computeSedScore({ ...SED_COMPLET, a_sedentarite: 1 })!.total;

    expect(assisPeu).toBeGreaterThan(assisBeaucoup);
  });
});

describe('FSS — un item manquant ne produit pas de score', () => {
  // Biais inverse de Ricci & Gagnon, et plus dangereux : il rassure. La somme
  // des seuls items répondus était comparée au seuil fixe de 36, qui suppose
  // les 9 affirmations.
  it('refuse un score quand 4 affirmations sur 9 sont sans réponse', () => {
    const partiel = [7, 7, 7, 7, 7, null, null, null, null];

    // Avant correction : 35, soit « Pas de fatigue significative » pour une
    // personne ayant répondu au maximum à tout ce qu'on lui a posé.
    expect(computeFSSScore(partiel)).toBeNull();
    expect(itemsFSSManquants(partiel)).toEqual([5, 6, 7, 8]);
  });

  it('refuse un score dès qu’une seule affirmation manque', () => {
    const presqueComplet = [...FSS_COMPLET];
    presqueComplet[3] = null;

    expect(computeFSSScore(presqueComplet)).toBeNull();
    expect(itemsFSSManquants(presqueComplet)).toEqual([3]);
  });

  it('calcule la somme des 9 affirmations quand tout est répondu', () => {
    expect(computeFSSScore(FSS_COMPLET)).toBe(45);
    expect(itemsFSSManquants(FSS_COMPLET)).toEqual([]);
  });

  it('traite un tableau trop court comme incomplet', () => {
    expect(computeFSSScore([7, 7, 7])).toBeNull();
    expect(itemsFSSManquants([7, 7, 7])).toHaveLength(FSS_NB_ITEMS - 3);
  });
});

describe('Dénominateur affiché', () => {
  // Régression : l'interface affichait « / 55 » alors que le maximum
  // atteignable est 45 (A=5, B=20, C=20). Tout score paraissait plus faible
  // qu'il ne l'était.
  it('SED_TOTAL_MAX vaut le maximum réellement atteignable', () => {
    const maximum = computeSedScore({
      a_sedentarite: 5, b_pratique: 'oui', b_freq: 5, b_duree: 5, b_effort: 5,
      c_intensite: 5, c_travaux: 5, c_marche: 5, c_etages: 5,
    })!;

    expect(maximum.total).toBe(SED_TOTAL_MAX);
    expect(SED_TOTAL_MAX).toBe(45);
    expect(getSedProfil(maximum.total).profil).toBe('tres_actif');
  });
});

describe('Libellés de la question « marche »', () => {
  it('dit des minutes par jour, sans reprendre les libellés de durée par séance', () => {
    expect(SED_MARCHE.map(o => o.score)).toEqual(SED_DUREE.map(o => o.score));
    expect(SED_MARCHE.every(o => o.label.includes('/j'))).toBe(true);
    expect(SED_MARCHE.map(o => o.label)).not.toEqual(SED_DUREE.map(o => o.label));
  });
});

describe('État « à régulariser »', () => {
  it('distingue un questionnaire jamais commencé d’un questionnaire laissé incomplet', () => {
    expect(etatSedentarite(EMPTY_SED)).toEqual({ etat: 'vide' });
    expect(etatFatigue(Array(9).fill(null))).toEqual({ etat: 'vide' });

    const commence = etatSedentarite({ ...EMPTY_SED, a_sedentarite: 5 });
    expect(commence.etat).toBe('a_regulariser');
  });

  it('nomme les items à reprendre', () => {
    const etat = etatSedentarite({ ...SED_COMPLET, c_marche: null, c_etages: null });

    expect(etat).toEqual({
      etat: 'a_regulariser',
      manquants: ['Minutes de marche par jour', 'Étages montés par jour'],
    });
  });

  it('numérote les affirmations FSS manquantes à partir de 1', () => {
    const reponses = [...FSS_COMPLET];
    reponses[0] = null;
    const etat = etatFatigue(reponses);

    expect(etat.etat).toBe('a_regulariser');
    expect(etat.etat === 'a_regulariser' && etat.manquants[0]).toMatch(/^Affirmation 1 —/);
  });

  it('renvoie le score quand le questionnaire est complet', () => {
    expect(etatSedentarite(SED_COMPLET)).toEqual({ etat: 'complet', score: 28 });
    expect(etatFatigue(FSS_COMPLET)).toEqual({ etat: 'complet', score: 45 });
    expect(getFSSProfil(45).profil).toBe('fatigue_probable');
  });
});
