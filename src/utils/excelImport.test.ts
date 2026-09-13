import { describe, expect, it } from 'vitest';
import { COL_CONSENTEMENT, parseExcelRows } from './excelImport';
import type { Participant } from '../types';

const EN_TETES = Array.from({ length: COL_CONSENTEMENT + 1 }, (_, i) => `col${i}`);

function ligne(nom: string, prenom: string, consentement: unknown): unknown[] {
  const r: unknown[] = Array(COL_CONSENTEMENT + 1).fill('');
  r[0] = nom;
  r[1] = prenom;
  r[2] = '15/03/1952';
  r[COL_CONSENTEMENT] = consentement;
  return r;
}

describe('parseExcelRows — consentement RGPD (colonne R)', () => {
  it('importe une ligne avec « Oui », marquée consentement déclaré à l’import', () => {
    const { succes, erreurs } = parseExcelRows([EN_TETES, ligne('Durand', 'Marie', 'Oui')], []);
    expect(erreurs).toEqual([]);
    expect(succes).toHaveLength(1);
    expect(succes[0].rgpd).toMatchObject({ consentementObtenu: true, methodeConsentement: 'declare_import' });
    expect(succes[0].rgpd?.consentementDate).toBe(succes[0].dateCreation);
  });

  it('refuse et liste les lignes sans « Oui »', () => {
    const { succes, erreurs } = parseExcelRows([
      EN_TETES,
      ligne('A', 'Non', 'Non'),
      ligne('B', 'Vide', ''),
      ligne('C', 'Croix', 'x'),
    ], []);
    expect(succes).toEqual([]);
    expect(erreurs.map(e => e.ligne)).toEqual([2, 3, 4]);
    expect(erreurs[0].message).toContain('consentement RGPD non déclaré');
  });

  it('refuse les lignes d’un ancien modèle, qui n’a pas la colonne R', () => {
    const ancienneLigne = ['Durand', 'Marie', '15/03/1952'];
    const { succes, erreurs } = parseExcelRows([EN_TETES.slice(0, 17), ancienneLigne], []);
    expect(succes).toEqual([]);
    expect(erreurs).toHaveLength(1);
  });

  it('ignore un doublon sans le signaler en erreur, même sans consentement', () => {
    const existant = { nom: 'Durand', prenom: 'Marie' } as Participant;
    const { succes, erreurs, ignores } = parseExcelRows([EN_TETES, ligne('Durand', 'Marie', '')], [existant]);
    expect(succes).toEqual([]);
    expect(erreurs).toEqual([]);
    expect(ignores).toHaveLength(1);
  });
});
