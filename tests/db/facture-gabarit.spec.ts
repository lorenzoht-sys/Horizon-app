// tests/db/facture-gabarit.spec.ts
//
// Gabarit du PDF figé sur la facture (migration 20261029100000, point C) contre une VRAIE pile Supabase
// locale : NULL sur un brouillon, 2 (charte Horizon) à la validation, 2 aussi pour un avoir, inaltérable
// ensuite ; seules les valeurs 1 et 2 sont admises.
//
// ⚠️ BASE LOCALE UNIQUEMENT (voir fixtures-facturation.ts).
//   supabase start && supabase db reset && npm run test:db

import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { API_URL, clesLocales, creerContrat, creerPraticien, moisDuTest, pg, pileDisponible, type Praticien } from './fixtures-facturation.js';

const DISPONIBLE = await pileDisponible();
const decrire = describe.skipIf(!DISPONIBLE);

decrire('Gabarit du PDF figé sur la facture à sa validation', () => {
  const { service, anon } = clesLocales() ?? { service: 'absente', anon: 'absente' };
  const serviceClient = createClient(API_URL, service, { auth: { persistSession: false }, realtime: { transport: class {} as unknown as typeof WebSocket } });
  const pro = () => creerPraticien(serviceClient, anon, true);

  /** Brouillon d'un nouveau contrat (2 séances à 45 €) ; le tarif posé après les séances recalcule le brouillon. */
  async function brouillon(p: Praticien) {
    const M = moisDuTest();
    const ct = await creerContrat(p, M, { seances: [{ jour: 3 }, { jour: 4 }], tarif: false });
    await pg(c => c.query(`INSERT INTO public.tarifs_contrats (contrat_id, tarif_seance, frais_deplacement, date_debut_validite) VALUES ($1, 45, 0, $2)`,
      [ct.contratId, M.debut]));
    return (await pg(c => c.query(`SELECT id FROM public.factures WHERE contrat_id = $1 AND type = 'facture'`, [ct.contratId]))).rows[0].id as string;
  }
  const gabarit = async (id: string) =>
    (await pg(c => c.query(`SELECT gabarit FROM public.factures WHERE id = $1`, [id]))).rows[0].gabarit as number | null;

  it('brouillon sans gabarit, facture validée en gabarit 2, inaltérable ensuite', async () => {
    const p = await pro();
    const id = await brouillon(p);
    expect(await gabarit(id)).toBeNull();
    expect((await p.client.rpc('valider_facture', { p_facture_id: id })).error).toBeNull();
    expect(await gabarit(id)).toBe(2);
    await expect(pg(c => c.query(`UPDATE public.factures SET gabarit = 1 WHERE id = $1`, [id])))
      .rejects.toThrow(/seuls statut et pdf_path peuvent changer/);
  });

  it('un avoir prend le gabarit courant à sa validation', async () => {
    const p = await pro();
    const id = await brouillon(p);
    expect((await p.client.rpc('valider_facture', { p_facture_id: id })).error).toBeNull();
    const lignes = (await pg(c => c.query(`SELECT id, quantite::float8 AS quantite FROM public.lignes_facture WHERE facture_id = $1`, [id]))).rows;
    const r = await p.client.rpc('creer_avoir', {
      p_facture_id: id, p_lignes: lignes.map(l => ({ ligne_id: l.id, quantite: l.quantite })),
      p_geste: null, p_motif: 'Séance annulée', p_total_attendu: 90,
    });
    expect(r.error).toBeNull();
    expect(await gabarit(r.data.avoir_id)).toBe(2);
  });

  it('seules les valeurs 1 et 2 sont admises (contrainte), même sur un brouillon', async () => {
    const p = await pro();
    const id = await brouillon(p);
    await expect(pg(c => c.query(`UPDATE public.factures SET gabarit = 3 WHERE id = $1`, [id])))
      .rejects.toThrow(/factures_gabarit_valide/);
  });
});
