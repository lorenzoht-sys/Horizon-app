import { describe, it, expect } from 'vitest';
import { enLots, TAILLE_LOT_IDS } from './lots';

describe('enLots', () => {
  it('ne perd ni ne duplique aucun élément, dans le même ordre', () => {
    const ids = Array.from({ length: 250 }, (_, i) => `id-${i}`);
    const lots = enLots(ids);
    expect(lots.map(l => l.length)).toEqual([TAILLE_LOT_IDS, TAILLE_LOT_IDS, 50]);
    expect(lots.flat()).toEqual(ids);
  });

  it('renvoie une liste vide pour une entrée vide', () => {
    expect(enLots([])).toEqual([]);
  });

  it('refuse une taille invalide plutôt que de boucler sans fin', () => {
    expect(() => enLots([1, 2], 0)).toThrow();
  });
});
