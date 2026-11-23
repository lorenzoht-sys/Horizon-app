import { describe, it, expect } from 'vitest';
import { apleyRenseigne, apleyEnNiveaux, calculerScoreApley, ecartCmApley, formaterCmApley, lignesApley, scoreNiveauApley, sensCmApley } from './apley';

const vide = { haut_d: null, haut_g: null, bas_d: null, bas_g: null, score: null, notes: '' };

describe('scoreNiveauApley', () => {
  it('lit le niveau selon le mouvement', () => {
    expect(scoreNiveauApley('haut_d', 'shoulder')).toBe(4);
    expect(scoreNiveauApley('bas_g', 'buttocks')).toBe(1);
  });
  it('refuse une clé du mauvais mouvement plutôt que de la noter', () => {
    expect(scoreNiveauApley('haut_d', 'scapula')).toBeNull();
    expect(scoreNiveauApley('haut_d', null)).toBeNull();
  });
});

describe('calculerScoreApley', () => {
  it('fait la moyenne des seuls côtés cochés', () => {
    expect(calculerScoreApley({ ...vide, haut_d: 'neck', haut_g: 'shoulder', bas_d: 'mid_back', bas_g: 'scapula' })).toBe(3.5);
    expect(calculerScoreApley({ ...vide, haut_d: 'top' })).toBe(2);
  });
  it("vaut null quand rien n'est coché (jamais 0)", () => {
    expect(calculerScoreApley(vide)).toBeNull();
  });
});

describe('apleyRenseigne', () => {
  it('reconnaît un test commencé', () => {
    expect(apleyRenseigne({ ...vide, bas_g: 'low_back' })).toBe(true);
    expect(apleyRenseigne({ ...vide, notes: 'douleur épaule' })).toBe(true);
  });
  it('ignore un test vide ou absent', () => {
    expect(apleyRenseigne(vide)).toBe(false);
    expect(apleyRenseigne({ ...vide, notes: '   ' })).toBe(false);
    expect(apleyRenseigne(undefined)).toBe(false);
  });
});

describe('lignesApley', () => {
  it('décrit chaque côté coché, dans un ordre fixe', () => {
    expect(lignesApley({ ...vide, bas_g: 'buttocks', haut_d: 'neck' })).toEqual([
      'Haut, côté droit : Atteint la nuque (légèrement limité)',
      'Bas, côté gauche : Atteint seulement les fesses (très limité)',
    ]);
  });
  it('ne produit rien pour un test absent', () => {
    expect(lignesApley(undefined)).toEqual([]);
  });
});

describe('Scratch Test en centimètres signés', () => {
  it('écrit la valeur et son sens, comme convenu avec Pierre', () => {
    expect(formaterCmApley(-12)).toBe('−12 cm');
    expect(formaterCmApley(0)).toBe('0 cm');
    expect(formaterCmApley(4.5)).toBe('+4,5 cm');
    expect(sensCmApley(-12)).toBe('les doigts ne se touchent pas');
    expect(sensCmApley(0)).toBe('les doigts se touchent');
    expect(sensCmApley(4)).toBe('les doigts se chevauchent');
  });
  it('garde les deux positions séparées et calcule l’écart', () => {
    const a = { haut_d: null, haut_g: null, bas_d: null, bas_g: null, score: null, notes: '', cmDroiteDessus: -12, cmGaucheDessus: 3 };
    expect(apleyRenseigne(a)).toBe(true);
    expect(ecartCmApley(a)).toBe(15);
    expect(lignesApley(a)).toEqual([
      'Main droite au-dessus, gauche en dessous : −12 cm (les doigts ne se touchent pas)',
      'Main gauche au-dessus, droite en dessous : +3 cm (les doigts se chevauchent)',
      'Écart entre les deux positions : 15 cm',
    ]);
  });
  it('ne touche pas aux anciens bilans saisis en niveaux', () => {
    const ancien = { haut_d: 'neck', haut_g: null, bas_d: null, bas_g: null, score: 3, notes: '' };
    expect(apleyEnNiveaux(ancien)).toBe(true);
    expect(ecartCmApley(ancien)).toBeNull();
    expect(lignesApley(ancien)).toEqual(['Haut, côté droit : Atteint la nuque (légèrement limité)']);
  });
});
