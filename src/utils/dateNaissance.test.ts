import { describe, expect, it } from 'vitest';
import {
  formaterDateNaissanceAffichage,
  masquerSaisieDateNaissance,
  messageErreurDateNaissance,
  parserDateNaissanceSaisie,
} from './dateNaissance';

describe('masquerSaisieDateNaissance', () => {
  it('regroupe les chiffres au fur et à mesure de la saisie', () => {
    expect(masquerSaisieDateNaissance('1')).toBe('1');
    expect(masquerSaisieDateNaissance('12')).toBe('12');
    expect(masquerSaisieDateNaissance('120')).toBe('12/0');
    expect(masquerSaisieDateNaissance('1205')).toBe('12/05');
    expect(masquerSaisieDateNaissance('120519')).toBe('12/05/19');
    expect(masquerSaisieDateNaissance('12051957')).toBe('12/05/1957');
  });

  it('ignore tout caractère non numérique déjà tapé (les « / » ne sont jamais saisis)', () => {
    expect(masquerSaisieDateNaissance('12/05/1957')).toBe('12/05/1957');
    expect(masquerSaisieDateNaissance('12-05-1957')).toBe('12/05/1957');
  });

  it('tronque au-delà de 8 chiffres (JJMMAAAA)', () => {
    expect(masquerSaisieDateNaissance('120519579999')).toBe('12/05/1957');
  });

  it('chaîne vide pour une saisie vide', () => {
    expect(masquerSaisieDateNaissance('')).toBe('');
  });
});

describe('formaterDateNaissanceAffichage', () => {
  it('convertit un ISO en JJ/MM/AAAA', () => {
    expect(formaterDateNaissanceAffichage('1957-05-12')).toBe('12/05/1957');
  });

  it('chaîne vide pour un ISO vide ou mal formé', () => {
    expect(formaterDateNaissanceAffichage('')).toBe('');
    expect(formaterDateNaissanceAffichage('12/05/1957')).toBe('');
  });
});

describe('parserDateNaissanceSaisie', () => {
  const AUJOURDHUI = new Date(2026, 8, 15); // 2026-09-15, le jour du bug 03

  it('valide une date correcte et produit le même ISO que le stockage existant', () => {
    const resultat = parserDateNaissanceSaisie('12/05/1957', AUJOURDHUI);
    expect(resultat).toEqual({ statut: 'valide', iso: '1957-05-12' });
  });

  it('produit exactement le même ISO qu’une date obtenue autrement (aller-retour avec formaterDateNaissanceAffichage)', () => {
    const iso = '1957-05-12';
    const affichage = formaterDateNaissanceAffichage(iso);
    const resultat = parserDateNaissanceSaisie(affichage, AUJOURDHUI);
    expect(resultat).toEqual({ statut: 'valide', iso });
  });

  it.each(['', '1', '12', '12/0', '12/05', '12/05/19', '12/05/195'])(
    'saisie incomplète %s → « incomplete », jamais une erreur de format',
    (saisie) => {
      expect(parserDateNaissanceSaisie(saisie, AUJOURDHUI)).toEqual({ statut: 'incomplete' });
    },
  );

  it('une année à deux chiffres est une saisie incomplète, jamais complétée automatiquement (19 ≠ 1919 ni 2019)', () => {
    expect(parserDateNaissanceSaisie('12/05/19', AUJOURDHUI)).toEqual({ statut: 'incomplete' });
  });

  it.each([
    ['31/02/1957', '31 février n’existe jamais'],
    ['31/04/1957', 'avril n’a que 30 jours'],
    ['29/02/1957', '1957 n’est pas bissextile'],
    ['00/05/1957', 'jour 00 n’existe pas'],
    ['12/00/1957', 'mois 00 n’existe pas'],
    ['12/13/1957', 'mois 13 n’existe pas'],
  ])('date calendaire inexistante %s (%s) → « invalide »', (saisie) => {
    expect(parserDateNaissanceSaisie(saisie, AUJOURDHUI)).toEqual({ statut: 'invalide' });
  });

  it('accepte le 29 février d’une vraie année bissextile', () => {
    expect(parserDateNaissanceSaisie('29/02/2000', AUJOURDHUI)).toEqual({ statut: 'valide', iso: '2000-02-29' });
  });

  it('rejette une date de naissance dans le futur', () => {
    expect(parserDateNaissanceSaisie('16/09/2026', AUJOURDHUI)).toEqual({ statut: 'future' });
  });

  it('accepte aujourd’hui même (un bénéficiaire peut naître le jour de la saisie)', () => {
    expect(parserDateNaissanceSaisie('15/09/2026', AUJOURDHUI)).toEqual({ statut: 'valide', iso: '2026-09-15' });
  });
});

describe('messageErreurDateNaissance', () => {
  it('un message distinct par statut, rien pour « valide »', () => {
    expect(messageErreurDateNaissance({ statut: 'incomplete' })).toMatch(/JJ\/MM\/AAAA/);
    expect(messageErreurDateNaissance({ statut: 'invalide' })).toBeTruthy();
    expect(messageErreurDateNaissance({ statut: 'future' })).toMatch(/futur/);
    expect(messageErreurDateNaissance({ statut: 'valide', iso: '2000-01-01' })).toBeNull();
  });
});
