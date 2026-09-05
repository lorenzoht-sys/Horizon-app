import { describe, it, expect } from 'vitest';
import { initialesPraticien } from './initiales';

describe('initialesPraticien', () => {
  it('rend les deux vraies initiales', () => {
    expect(initialesPraticien('Marie', 'Durand')).toBe('MD');
  });

  it('met en majuscule une saisie en minuscules', () => {
    expect(initialesPraticien('marie', 'durand')).toBe('MD');
  });

  it('ignore les espaces autour de la saisie', () => {
    expect(initialesPraticien('  Marie ', ' Durand ')).toBe('MD');
  });

  it('rend une seule lettre quand le nom manque', () => {
    expect(initialesPraticien('Marie', '')).toBe('M');
  });

  it('rend une seule lettre quand le prenom manque', () => {
    expect(initialesPraticien('', 'Durand')).toBe('D');
  });

  // Le defaut corrige : la Sidebar affichait « PC » sur un compte sans
  // identite, et l'ecran mobile « P ». Aucune lettre ne doit sortir d'un
  // repli.
  it('ne rend RIEN quand les deux champs sont vides', () => {
    expect(initialesPraticien('', '')).toBe('');
  });

  it('ne rend rien pour des champs absents ou blancs', () => {
    expect(initialesPraticien(null, undefined)).toBe('');
    expect(initialesPraticien('   ', '\t')).toBe('');
  });

  it("n'invente aucune lettre plausible", () => {
    expect(initialesPraticien('', '')).not.toBe('PC');
    expect(initialesPraticien('', '')).not.toContain('P');
    expect(initialesPraticien('', '')).not.toContain('C');
  });

  it('gere une initiale accentuee sans la couper', () => {
    expect(initialesPraticien('Élodie', 'Østergaard')).toBe('ÉØ');
  });
});
