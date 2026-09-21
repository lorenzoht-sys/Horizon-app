import { describe, it, expect } from 'vitest';
import { niveauEffort, niveauBienEtre, NIVEAUX_EFFORT, NIVEAUX_BIEN_ETRE } from './ressentiCours';

describe('libellés de l\'effort perçu et du bien-être', () => {
  it('rien de saisi : pas de niveau', () => {
    expect(niveauEffort(null)).toBeNull();
    expect(niveauEffort(undefined)).toBeNull();
    expect(niveauBienEtre(null)).toBeNull();
  });

  it('valeurs de l\'échelle : le libellé de la saisie', () => {
    expect(niveauEffort(2)?.label).toBe('Très facile');
    expect(niveauEffort(10)?.label).toBe('Très difficile');
    expect(niveauBienEtre(1)?.label).toBe('Très bien');
    expect(niveauBienEtre(5)?.label).toBe('Épuisé');
  });

  it('valeur hors de l\'échelle de saisie (la base accepte 1 à 10) : affichée, pas masquée', () => {
    // La saisie ne propose que 2/4/6/8/10 ; une valeur 7 (autre outil, import) doit rester lisible.
    expect(niveauEffort(7)?.label).toBe('7/10');
    expect(niveauBienEtre(4)?.label).toBe('Fatigué');
  });

  it('l\'échelle est complète et sans doublon', () => {
    expect(NIVEAUX_EFFORT.map(n => n.valeur)).toEqual([2, 4, 6, 8, 10]);
    expect(NIVEAUX_BIEN_ETRE.map(n => n.valeur)).toEqual([1, 2, 3, 4, 5]);
  });
});
