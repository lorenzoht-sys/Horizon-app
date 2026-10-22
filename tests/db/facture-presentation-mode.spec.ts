// tests/db/facture-presentation-mode.spec.ts
//
// Mode de présentation de la facture (migration 20261028100000, point A, étape A1) contre une VRAIE pile
// Supabase locale : réglage du praticien (« detaillee » par défaut), réglage du contrat (NULL = celui du
// praticien), mode figé dans factures.presentation à la validation, inaltérable ensuite, repris par un avoir.
//
// ⚠️ BASE LOCALE UNIQUEMENT (voir fixtures-facturation.ts).
//   supabase start && supabase db reset && npm run test:db

import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { API_URL, clesLocales, creerContrat, creerPraticien, moisDuTest, pg, pileDisponible, type Praticien } from './fixtures-facturation.js';

const DISPONIBLE = await pileDisponible();
const decrire = describe.skipIf(!DISPONIBLE);

decrire('Mode de présentation figé sur la facture à sa validation', () => {
  const { service, anon } = clesLocales() ?? { service: 'absente', anon: 'absente' };
  const serviceClient = createClient(API_URL, service, { auth: { persistSession: false }, realtime: { transport: class {} as unknown as typeof WebSocket } });
  const pro = () => creerPraticien(serviceClient, anon, true);

  /** Réglages posés comme le feront les écrans : avec le jeton du praticien. */
  const reglerPraticien = async (p: Praticien, mode: string) =>
    expect((await p.client.from('praticiens').update({ presentation_facture: mode }).eq('id', p.id)).error).toBeNull();
  const reglerContrat = async (p: Praticien, contratId: string, mode: string | null) =>
    expect((await p.client.from('contrats').update({ presentation_facture: mode }).eq('id', contratId)).error).toBeNull();

  /** Brouillon d'un nouveau contrat (2 séances à 45 €) ; le tarif posé après les séances recalcule le brouillon. */
  async function brouillon(p: Praticien) {
    const M = moisDuTest();
    const ct = await creerContrat(p, M, { seances: [{ jour: 3 }, { jour: 4 }], tarif: false });
    await pg(c => c.query(`INSERT INTO public.tarifs_contrats (contrat_id, tarif_seance, frais_deplacement, date_debut_validite) VALUES ($1, 45, 0, $2)`,
      [ct.contratId, M.debut]));
    const id = (await pg(c => c.query(`SELECT id FROM public.factures WHERE contrat_id = $1 AND type = 'facture'`, [ct.contratId]))).rows[0].id as string;
    return { id, contratId: ct.contratId as string };
  }
  const valider = async (p: Praticien, id: string) =>
    expect((await p.client.rpc('valider_facture', { p_facture_id: id })).error).toBeNull();
  const presentation = async (id: string) =>
    (await pg(c => c.query(`SELECT presentation FROM public.factures WHERE id = $1`, [id]))).rows[0].presentation as string | null;

  it('par défaut : brouillon sans mode, facture validée en « detaillee »', async () => {
    const p = await pro();
    const f = await brouillon(p);
    expect(await presentation(f.id)).toBeNull();
    await valider(p, f.id);
    expect(await presentation(f.id)).toBe('detaillee');
  });

  it('le contrat l\'emporte sur le praticien ; NULL sur le contrat = réglage du praticien', async () => {
    const p = await pro();
    await reglerPraticien(p, 'globale');
    const a = await brouillon(p);
    await valider(p, a.id);
    expect(await presentation(a.id)).toBe('globale');

    const b = await brouillon(p);
    await reglerContrat(p, b.contratId, 'detaillee');
    await valider(p, b.id);
    expect(await presentation(b.id)).toBe('detaillee');

    const q = await pro();
    const c = await brouillon(q);
    await reglerContrat(q, c.contratId, 'globale');
    await valider(q, c.id);
    expect(await presentation(c.id)).toBe('globale');
  });

  it('changer les réglages après coup ne touche pas une facture validée, dont le mode est inaltérable', async () => {
    const p = await pro();
    const f = await brouillon(p);
    await valider(p, f.id);
    await reglerPraticien(p, 'globale');
    await reglerContrat(p, f.contratId, 'globale');
    expect(await presentation(f.id)).toBe('detaillee');
    await expect(pg(c => c.query(`UPDATE public.factures SET presentation = 'globale' WHERE id = $1`, [f.id])))
      .rejects.toThrow(/seuls statut et pdf_path peuvent changer/);
  });

  it('un avoir reprend le mode de sa facture d\'origine, pas le réglage courant', async () => {
    const p = await pro();
    await reglerPraticien(p, 'globale');
    const f = await brouillon(p);
    await valider(p, f.id);
    await reglerPraticien(p, 'detaillee');
    const lignes = (await pg(c => c.query(`SELECT id, quantite::float8 AS quantite FROM public.lignes_facture WHERE facture_id = $1`, [f.id]))).rows;
    const r = await p.client.rpc('creer_avoir', {
      p_facture_id: f.id, p_lignes: lignes.map(l => ({ ligne_id: l.id, quantite: l.quantite })),
      p_geste: null, p_motif: 'Séance annulée', p_total_attendu: 90,
    });
    expect(r.error).toBeNull();
    expect(await presentation(r.data.avoir_id)).toBe('globale');
  });

  it('valeurs hors liste refusées sur le praticien et le contrat', async () => {
    const p = await pro();
    const f = await brouillon(p);
    expect((await p.client.from('praticiens').update({ presentation_facture: 'resumee' }).eq('id', p.id)).error?.message)
      .toMatch(/praticiens_presentation_facture_valide/);
    expect((await p.client.from('contrats').update({ presentation_facture: 'resumee' }).eq('id', f.contratId)).error?.message)
      .toMatch(/contrats_presentation_facture_valide/);
  });
});
