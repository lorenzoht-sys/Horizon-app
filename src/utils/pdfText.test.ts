import { describe, it, expect } from 'vitest';
import { cleanTextPdf, cleanTextPdfMultiligne } from './pdfText';

describe('cleanTextPdfMultiligne — texte libre sur plusieurs lignes', () => {
  it('retire les émojis et symboles que Helvetica ne sait pas dessiner (sinon : un carré vide)', () => {
    expect(cleanTextPdfMultiligne('Douleur épaule 😓 exercice adapté ✓')).toBe('Douleur épaule exercice adapté');
    expect(cleanTextPdfMultiligne('Bravo 🎉👍🏽 !')).toBe('Bravo !');
  });

  it('GARDE les retours à la ligne, et les paragraphes', () => {
    const note = 'Douleur épaule droite.\nExercice adapté.\n\nÀ revoir la semaine prochaine.';
    expect(cleanTextPdfMultiligne(note)).toBe(note);
  });

  // cleanTextPdf réduit toute suite de 2 blancs ou plus à UN espace : un saut de ligne simple
  // survit, mais une ligne vide (paragraphe) et une fin de ligne Windows sont détruites.
  it('ce que cleanTextPdf, lui, détruit : les lignes vides et les fins de ligne Windows', () => {
    expect(cleanTextPdf('a\nb')).toBe('a\nb');
    expect(cleanTextPdf('a\n\nb')).toBe('a b');
    expect(cleanTextPdf('a\r\nb')).toBe('a b');
    expect(cleanTextPdfMultiligne('a\n\nb')).toBe('a\n\nb');
    expect(cleanTextPdfMultiligne('a\r\nb')).toBe('a\nb');
  });

  it('ramène les retours Windows et Mac à \\n', () => {
    expect(cleanTextPdfMultiligne('a\r\nb\rc')).toBe('a\nb\nc');
  });

  it("réduit les espaces multiples dans une ligne, et n'en laisse pas en bord de ligne", () => {
    expect(cleanTextPdfMultiligne('  a    b  \n\t c \t d  ')).toBe('a b\nc d');
  });

  it("pas plus d'une ligne vide d'affilée", () => {
    expect(cleanTextPdfMultiligne('a\n\n\n\n\nb')).toBe('a\n\nb');
  });

  it("une ligne qui n'était faite que d'émojis disparaît sans laisser d'espaces", () => {
    expect(cleanTextPdfMultiligne('a\n😀😀\nb')).toBe('a\n\nb');
  });

  it('garde les accents, la ponctuation typographique et les signes que Helvetica dessine', () => {
    const texte = "Séance très bien — l’élève a « progressé » (10 min) : 5 € – œuvre à…";
    expect(cleanTextPdfMultiligne(texte)).toBe(texte);
  });

  it("retire un symbole hors de Helvetica (≈, U+2248) sans toucher au reste de la phrase", () => {
    expect(cleanTextPdfMultiligne('environ ≈ 10 min')).toBe('environ 10 min');
  });

  it('vide ou blanc : chaîne vide', () => {
    expect(cleanTextPdfMultiligne('')).toBe('');
    expect(cleanTextPdfMultiligne('  \n \n ')).toBe('');
    expect(cleanTextPdfMultiligne('😀')).toBe('');
  });
});
