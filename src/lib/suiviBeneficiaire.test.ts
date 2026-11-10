import { describe, it, expect } from 'vitest';
import { ressentisPreoccupants, agregerAssiduite } from './suiviBeneficiaire';

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

describe('agregerAssiduite', () => {
  it('compte les séances, le taux de réalisation et la dernière date par bénéficiaire', () => {
    const res = agregerAssiduite(
      [
        { id: 's1', participantId: 'a', date: '2026-11-03' },
        { id: 's2', participantId: 'a', date: '2026-11-05' },
        { id: 's3', participantId: 'b', date: '2026-11-04' },
      ],
      [
        { seance_patient_id: 's1', realise: true },
        { seance_patient_id: 's1', realise: false },
        { seance_patient_id: 's2', realise: true },
        { seance_patient_id: 's2', realise: true },
      ],
    );
    expect(res.a).toEqual({ nb: 2, taux: 75, derniere: '2026-11-05' });
    // Séance sans exercice coché ni décoché : taux inconnu, pas 0 %.
    expect(res.b).toEqual({ nb: 1, taux: null, derniere: '2026-11-04' });
  });

  it('renvoie un objet vide sans séance', () => {
    expect(agregerAssiduite([], [])).toEqual({});
  });
});
