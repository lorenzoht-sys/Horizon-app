import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { DUREE_URL_PDF_SECONDES, exposerFacture, lireFacturesPatient, urlPdfFacturePatient, type LigneDocumentBeneficiaire } from './facturesPatient.js';

// Données fictives.
const ID = '11111111-2222-4333-8444-555555555555';
const AUTRE = '99999999-2222-4333-8444-555555555555';
const ligne = (o: Partial<LigneDocumentBeneficiaire> = {}): LigneDocumentBeneficiaire => ({
  id: ID, type: 'facture', numero: '2026-0007', periode: '2026-09-01', date_emission: '2026-10-02', total: '110.00',
  statut: 'validee', pdf_path: 'praticien-x/2026-0007.pdf', payeur_proche: false, ...o,
});

function faux(o: { lignes?: LigneDocumentBeneficiaire[]; erreurRpc?: string; erreurUrl?: string } = {}) {
  const createSignedUrl = vi.fn(async (chemin: string, duree: number) =>
    o.erreurUrl ? { data: null, error: { message: o.erreurUrl } } : { data: { signedUrl: `https://stockage.test/${chemin}?d=${duree}` }, error: null });
  const rpc = vi.fn(async () => (o.erreurRpc ? { data: null, error: { message: o.erreurRpc } } : { data: o.lignes ?? [], error: null }));
  const client = { rpc, storage: { from: vi.fn(() => ({ createSignedUrl })) } } as unknown as SupabaseClient;
  return { client, rpc, createSignedUrl };
}

describe('exposerFacture', () => {
  it('ne transmet jamais le chemin du PDF, seulement sa disponibilité', () => {
    const e = exposerFacture(ligne());
    expect(e).toEqual({ id: ID, type: 'facture', numero: '2026-0007', periode: '2026-09-01', dateEmission: '2026-10-02', total: 110, statut: 'validee', pdfDisponible: true });
    expect(JSON.stringify(e)).not.toMatch(/praticien-x|pdf_path|payeur/);
    expect(exposerFacture(ligne({ pdf_path: null })).pdfDisponible).toBe(false);
  });
});

describe('lireFacturesPatient', () => {
  it('interroge documents_du_beneficiaire avec le participant du jeton', async () => {
    const f = faux({ lignes: [ligne()] });
    expect(await lireFacturesPatient(f.client, 'participant-du-jeton')).toHaveLength(1);
    expect(f.rpc).toHaveBeenCalledWith('documents_du_beneficiaire', { p_participant_id: 'participant-du-jeton' });
  });
  it('une panne donne une liste vide, sans casser l\'espace', async () => {
    expect(await lireFacturesPatient(faux({ erreurRpc: 'panne' }).client, 'p')).toEqual([]);
  });
});

describe('urlPdfFacturePatient', () => {
  it('facture de la liste : URL signée de 60 s, nom de fichier lisible', async () => {
    const f = faux({ lignes: [ligne()] });
    const r = await urlPdfFacturePatient(f.client, 'p', ID);
    expect(r).toMatchObject({ ok: true, numero: '2026-0007' });
    expect(DUREE_URL_PDF_SECONDES).toBe(60);
    expect(f.createSignedUrl).toHaveBeenCalledWith('praticien-x/2026-0007.pdf', 60, { download: 'Facture-2026-0007.pdf' });
  });
  it('facture absente de la liste (autre bénéficiaire, brouillon, masquée) : 404 sans URL', async () => {
    const f = faux({ lignes: [ligne()] });
    expect(await urlPdfFacturePatient(f.client, 'p', AUTRE)).toMatchObject({ ok: false, statut: 404 });
    expect(f.createSignedUrl).not.toHaveBeenCalled();
  });
  it('identifiant mal formé : 400, sans lecture', async () => {
    const f = faux();
    for (const v of [undefined, '', 'abc', 12, { id: ID }]) expect(await urlPdfFacturePatient(f.client, 'p', v)).toMatchObject({ ok: false, statut: 400 });
    expect(f.rpc).not.toHaveBeenCalled();
  });
  it('PDF pas encore produit : 409 ; panne de lecture ou de signature : 500', async () => {
    expect(await urlPdfFacturePatient(faux({ lignes: [ligne({ pdf_path: null })] }).client, 'p', ID)).toMatchObject({ ok: false, statut: 409 });
    expect(await urlPdfFacturePatient(faux({ erreurRpc: 'x' }).client, 'p', ID)).toMatchObject({ ok: false, statut: 500 });
    expect(await urlPdfFacturePatient(faux({ lignes: [ligne()], erreurUrl: 'x' }).client, 'p', ID)).toMatchObject({ ok: false, statut: 500 });
  });
  it('un avoir porte son nom', async () => {
    const f = faux({ lignes: [ligne({ type: 'avoir', numero: '2026-0008' })] });
    await urlPdfFacturePatient(f.client, 'p', ID);
    expect(f.createSignedUrl).toHaveBeenCalledWith(expect.any(String), 60, { download: 'Avoir-2026-0008.pdf' });
  });
});
