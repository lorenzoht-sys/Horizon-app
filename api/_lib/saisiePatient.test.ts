import { describe, it, expect } from 'vitest';
import { dateCivileValide, texteDansLaBorne, TEXTE_PATIENT_MAX } from './saisiePatient.js';

describe('dateCivileValide', () => {
  it('accepte une date civile réelle', () => {
    expect(dateCivileValide('2026-11-12')).toBe(true);
    expect(dateCivileValide('2028-02-29')).toBe(true);
  });
  it('refuse ce qui ferait une erreur en base ou une date fausse', () => {
    for (const v of ['2026-02-31', '2027-02-29', '12/11/2026', '2026-11-12T10:00:00Z', '2026-1-2', '', 'demain', null, undefined, 20261112]) {
      expect(dateCivileValide(v), String(v)).toBe(false);
    }
  });
});

describe('texteDansLaBorne', () => {
  it('accepte l\'absence et un texte au plafond, refuse au-delà et tout ce qui n\'est pas un texte', () => {
    expect(texteDansLaBorne(undefined)).toBe(true);
    expect(texteDansLaBorne(null)).toBe(true);
    expect(texteDansLaBorne('x'.repeat(TEXTE_PATIENT_MAX))).toBe(true);
    expect(texteDansLaBorne('x'.repeat(TEXTE_PATIENT_MAX + 1))).toBe(false);
    expect(texteDansLaBorne(42)).toBe(false);
    expect(texteDansLaBorne({ length: 1 })).toBe(false);
  });
});
