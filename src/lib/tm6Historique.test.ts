import { describe, it, expect } from 'vitest';
import { dbToBilan, bilanToDb } from './mappers';

// Formes de TM6 telles qu'elles sont en base (anciennes ET récentes). Règle : ré-enregistrer un bilan
// SANS toucher au TM6 ne doit modifier AUCUNE colonne de résultat. (Bug : les anciens Stepper — mode NULL,
// nb_pas renseigné — perdaient leurs pas au premier ré-enregistrement.)
const VARIANTE = 'f1000000-0000-4000-8000-000000000001';
const FORMES: Array<[string, Record<string, unknown>]> = [
  ['S1 marche', { tm6_distance_metres: 420 }],
  ['S2 ancien stepper via variante', { tm6_nb_pas: 650, tm6_variante_id: VARIANTE }],
  ['S3 ancien stepper sans mode (nb_pas)', { tm6_nb_pas: 650 }],
  ['S3b ancien stepper sans mode (repetitions)', { tm6_repetitions: 650 }],
  ['S4 marche sur place', { tm6_mode: 'marche_sur_place', tm6_repetitions: 720 }],
  ['S5 stepper récent', { tm6_mode: 'stepper', tm6_repetitions: 650 }],
  ['S6 anciens tours', { tm6_nb_tours: 12 }],
  ['S7 distance 0 et pas', { tm6_distance_metres: 0, tm6_nb_pas: 500 }],
  ['S8 distance ET pas, sans mode', { tm6_distance_metres: 300, tm6_nb_pas: 500 }],
  ['S9 mode standard avec repetitions', { tm6_mode: 'standard', tm6_repetitions: 480 }],
];
const COLONNES = ['tm6_mode', 'tm6_distance_metres', 'tm6_repetitions', 'tm6_nb_pas', 'tm6_nb_tours', 'tm6_variante_id'] as const;
const dbVersBilanVersDb = (row: Record<string, unknown>) =>
  bilanToDb('p-1', dbToBilan({ id: 'b-1', date: '2026-01-01', type: 'trimestriel', ...row }) as never) as Record<string, unknown>;

describe('TM6 : le ré-enregistrement ne modifie aucun résultat', () => {
  for (const [nom, row] of FORMES) {
    it(nom, () => {
      const apres = dbVersBilanVersDb(row);
      for (const c of COLONNES) expect(apres[c] ?? null, c).toEqual(row[c] ?? null);
    });
  }

  it('un résultat en pas survit à DEUX ré-enregistrements successifs', () => {
    const une = dbVersBilanVersDb({ tm6_nb_pas: 650 });
    expect(dbVersBilanVersDb(une).tm6_nb_pas).toBe(650);
  });
});
