import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { COL_CONSENTEMENT, construireClasseurExport, construireClasseurModele, lireClasseurImport, parseExcelRows } from './excelImport';
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

// Lecture et écriture réelles avec SheetJS 0.20.3 (lot E sécurité HDS,
// 2026-10-27) : classeur fictif écrit en mémoire, relu comme le fait
// ImportExcelModal, puis passé à parseExcelRows.
describe('SheetJS — lecture et écriture des classeurs', () => {
  function versBuffer(wb: XLSX.WorkBook): ArrayBuffer {
    return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  }

  it('lit un fichier Excel fictif (date en cellule date, onglet « Patients »)', () => {
    const ws = XLSX.utils.aoa_to_sheet([EN_TETES, ligne('Fictif', 'E2E', 'Oui')]);
    // Date réelle Excel, pas une chaîne : c'est le cas des fichiers saisis à la main.
    ws['C2'] = { t: 'd', v: new Date(1952, 2, 15, 12) };
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['autre']]), 'Notes');
    XLSX.utils.book_append_sheet(wb, ws, 'Patients');

    const rows = lireClasseurImport(versBuffer(wb));
    const { succes, erreurs } = parseExcelRows(rows, []);
    expect(erreurs).toEqual([]);
    expect(succes).toHaveLength(1);
    expect(succes[0]).toMatchObject({ nom: 'Fictif', prenom: 'E2E', dateNaissance: '1952-03-15' });
  });

  it('lit un CSV', () => {
    const csv = `${EN_TETES.join(',')}\n${ligne('Fictif', 'E2E', 'Oui').join(',')}`;
    const rows = lireClasseurImport(new TextEncoder().encode(csv).buffer as ArrayBuffer);
    expect(parseExcelRows(rows, []).succes).toHaveLength(1);
  });

  it('génère le modèle : onglets Patients et Instructions, 18 colonnes dont le consentement', () => {
    const wb = XLSX.read(versBuffer(construireClasseurModele()));
    expect(wb.SheetNames).toEqual(['Patients', 'Instructions']);
    const [entetes] = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets.Patients, { header: 1 });
    expect(entetes).toHaveLength(COL_CONSENTEMENT + 1);
    expect(String(entetes[COL_CONSENTEMENT])).toMatch(/Consentement RGPD/);
  });

  it('l\'export se réimporte sans modification (doublon détecté, aucune erreur)', () => {
    const p = {
      id: 'p1', nom: 'Fictif', prenom: 'E2E', dateNaissance: '1952-03-15', dateCreation: '2026-01-01',
      token: 't', bilans: [], tags: ['senior'], rgpd: { consentementObtenu: true },
    } as unknown as Participant;
    const rows = lireClasseurImport(versBuffer(construireClasseurExport([p])));
    expect(rows[1].slice(0, 3)).toEqual(['Fictif', 'E2E', '15/03/1952']);
    const r = parseExcelRows(rows, [p]);
    expect(r.erreurs).toEqual([]);
    expect(r.ignores).toHaveLength(1);
  });
});
