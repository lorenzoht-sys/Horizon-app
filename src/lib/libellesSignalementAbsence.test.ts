import { describe, it, expect } from 'vitest';
import { libellesSignalementAbsence } from './libellesSignalementAbsence';

describe('libellesSignalementAbsence', () => {
  it('nomme le praticien par son prénom', () => {
    const l = libellesSignalementAbsence('Pierre');
    expect(l.bouton).toBe('Prévenir Pierre de mon absence');
    expect(l.confirmation).toBe('✓ Absence signalée à Pierre');
  });

  it('retombe sur « mon praticien » sans prénom exploitable', () => {
    for (const vide of [null, undefined, '', '   ']) {
      const l = libellesSignalementAbsence(vide);
      expect(l.bouton).toBe('Prévenir mon praticien de mon absence');
      expect(l.confirmation).toBe('✓ Absence signalée à votre praticien');
    }
  });

  it('ignore les espaces autour du prénom', () => {
    expect(libellesSignalementAbsence('  Camille ').bouton).toBe('Prévenir Camille de mon absence');
  });

  it("n'emploie jamais l'ancien libellé ambigu", () => {
    for (const p of ['Pierre', null]) {
      expect(Object.values(libellesSignalementAbsence(p)).join(' ')).not.toMatch(/disponible/i);
    }
  });
});
