import { describe, it, expect } from 'vitest';
import { ressentisPreoccupants } from './suiviBeneficiaire';

const r = (borgRpe: number, bienEtre: number) => ({ borgRpe, bienEtre });

describe('ressentisPreoccupants', () => {
  it("n'alerte pas avec moins de 3 retours, même mauvais", () => {
    expect(ressentisPreoccupants([r(10, 5), r(10, 5)])).toBe(false);
  });

  it('alerte si les 3 derniers efforts sont à 8 ou plus', () => {
    expect(ressentisPreoccupants([r(8, 1), r(10, 2), r(8, 1)])).toBe(true);
  });

  it('alerte si les 3 derniers bien-être sont à 4 ou plus', () => {
    expect(ressentisPreoccupants([r(2, 4), r(4, 5), r(2, 4)])).toBe(true);
  });

  it("n'alerte pas si un seul des 3 derniers est correct", () => {
    expect(ressentisPreoccupants([r(8, 4), r(6, 3), r(8, 4)])).toBe(false);
  });

  it('ne regarde que les 3 plus récents (les premiers de la liste)', () => {
    expect(ressentisPreoccupants([r(2, 1), r(2, 1), r(2, 1), r(10, 5), r(10, 5), r(10, 5)])).toBe(false);
  });
});
