import { describe, expect, it } from 'vitest';
import { aidesMobiliteDepuis, calculerIMC, categorieIMC, deplacer, resumeAidesMobilite, sansEmoji } from './formulaireBeneficiaire';

describe('IMC', () => {
  it('calcule au dixième et refuse les valeurs manquantes', () => {
    expect(calculerIMC(170, 70)).toBe(24.2);
    expect(calculerIMC(undefined, 70)).toBeNull();
    expect(calculerIMC(170, 0)).toBeNull();
  });

  it('suit les seuils OMS, sans le mot « morbide »', () => {
    expect(categorieIMC(18.4).label).toBe('Insuffisance pondérale');
    expect(categorieIMC(18.5).label).toBe('Corpulence normale');
    expect(categorieIMC(30).label).toBe('Obésité de classe I');
    expect(categorieIMC(35).label).toBe('Obésité de classe II');
    expect(categorieIMC(41).label).toBe('Obésité de classe III');
  });
});

describe('aides à la mobilité', () => {
  it('lit la nouvelle liste en priorité', () => {
    expect(aidesMobiliteDepuis({ aidesMobilite: ['Rollator', 'Canne simple'], aideMarche: 'Canne' })).toEqual(['Rollator', 'Canne simple']);
  });

  it("reprend l'ancien choix unique", () => {
    expect(aidesMobiliteDepuis({ aideMarche: 'Canne' })).toEqual(['Canne simple']);
    expect(aidesMobiliteDepuis({ aideMarche: 'Déambulateur' })).toEqual(['Déambulateur']);
    expect(aidesMobiliteDepuis({ aideMarche: 'Aucune' })).toEqual([]);
    expect(aidesMobiliteDepuis({ aideMarche: 'Autre' })).toEqual([]);
    expect(aidesMobiliteDepuis(undefined)).toEqual([]);
  });

  it('résume en texte pour les anciennes lectures', () => {
    expect(resumeAidesMobilite(['Rollator', 'Béquilles'], false)).toBe('Rollator, Béquilles');
    expect(resumeAidesMobilite([], true)).toBe('Aucune');
    expect(resumeAidesMobilite([], false)).toBeNull();
  });
});

describe('deplacer', () => {
  it('échange avec le voisin et ignore les bords', () => {
    expect(deplacer(['a', 'b', 'c'], 1, -1)).toEqual(['b', 'a', 'c']);
    expect(deplacer(['a', 'b', 'c'], 1, 1)).toEqual(['a', 'c', 'b']);
    expect(deplacer(['a', 'b'], 0, -1)).toEqual(['a', 'b']);
    expect(deplacer(['a', 'b'], 1, 1)).toEqual(['a', 'b']);
  });
});

describe('sansEmoji', () => {
  it("retire l'émoji de tête", () => {
    expect(sansEmoji("⚖️ Améliorer l'équilibre")).toBe("Améliorer l'équilibre");
    expect(sansEmoji('Objectif libre')).toBe('Objectif libre');
  });
});
