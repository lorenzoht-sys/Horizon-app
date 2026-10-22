// tests/db/forme-juridique.spec.ts
//
// Forme juridique et mention « EI » (migration 20261031100000) contre une VRAIE pile Supabase locale :
// sans forme déclarée, la validation est refusée (message traduit par l'écran, aucun numéro consommé) ;
// déclarée, elle est figée dans snapshot_emetteur, avoir compris, et ne bouge plus ensuite.
//
// ⚠️ BASE LOCALE UNIQUEMENT (voir fixtures-facturation.ts).
//   supabase start && supabase db reset && npm run test:db

import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { messageValidationLisible } from '../../src/lib/facturesAValider.js';
import { API_URL, clesLocales, creerContrat, creerPraticien, moisDuTest, pg, pileDisponible, type Praticien } from './fixtures-facturation.js';

const DISPONIBLE = await pileDisponible();
const decrire = describe.skipIf(!DISPONIBLE);

decrire('Forme juridique : obligatoire pour valider, figée dans la facture', () => {
  const { service, anon } = clesLocales() ?? { service: 'absente', anon: 'absente' };
  const serviceClient = createClient(API_URL, service, { auth: { persistSession: false }, realtime: { transport: class {} as unknown as typeof WebSocket } });
  const pro = () => creerPraticien(serviceClient, anon, true);

  async function brouillon(p: Praticien) {
    const ct = await creerContrat(p, moisDuTest(), { seances: [{ jour: 3 }, { jour: 4 }] });
    return (await pg(c => c.query(`SELECT id FROM public.factures WHERE contrat_id = $1 AND type = 'facture'`, [ct.contratId]))).rows[0].id as string;
  }
  const etat = async (id: string) => (await pg(c => c.query(
    `SELECT statut, numero, snapshot_emetteur->>'forme_juridique' AS forme FROM public.factures WHERE id = $1`, [id]))).rows[0];
  const regler = (p: Praticien, v: string | null) => pg(c => c.query(`UPDATE public.praticiens SET forme_juridique = $2 WHERE id = $1`, [p.id, v]));

  it('non déclarée (praticien existant) : refus clair, la facture reste un brouillon sans numéro', async () => {
    const p = await pro();
    await regler(p, null);
    const id = await brouillon(p);
    const r = await p.client.rpc('valider_facture', { p_facture_id: id });
    expect(r.error?.message).toBe('Profil de facturation incomplet : forme_juridique');
    expect(messageValidationLisible(r.error!.message)).toMatch(/forme juridique \(à déclarer dans le profil de facturation\)/);
    expect(await etat(id)).toMatchObject({ statut: 'brouillon', numero: null, forme: null });
  });

  it('EI : figée à la validation ; la changer ensuite ne touche pas la facture', async () => {
    const p = await pro();
    const id = await brouillon(p);
    expect((await p.client.rpc('valider_facture', { p_facture_id: id })).error).toBeNull();
    expect(await etat(id)).toMatchObject({ statut: 'validee', forme: 'ei' });
    await regler(p, 'societe');
    expect((await etat(id)).forme).toBe('ei');
  });

  it('un avoir porte la forme juridique au jour de SA validation', async () => {
    const p = await pro();
    const id = await brouillon(p);
    expect((await p.client.rpc('valider_facture', { p_facture_id: id })).error).toBeNull();
    await regler(p, 'societe');
    const lignes = (await pg(c => c.query(`SELECT id, quantite::float8 AS quantite FROM public.lignes_facture WHERE facture_id = $1`, [id]))).rows;
    const r = await p.client.rpc('creer_avoir', {
      p_facture_id: id, p_lignes: lignes.map(l => ({ ligne_id: l.id, quantite: l.quantite })), p_geste: null, p_motif: 'Séance annulée', p_total_attendu: 90,
    });
    expect(r.error).toBeNull();
    expect((await etat(r.data.avoir_id)).forme).toBe('societe');
  });

  it('valeurs admises : ei, societe ou NULL', async () => {
    const p = await pro();
    await expect(regler(p, 'sarl')).rejects.toThrow(/praticiens_forme_juridique_valide/);
    const r = await p.client.from('praticiens').update({ forme_juridique: 'societe' }).eq('id', p.id).select('forme_juridique');
    expect(r.error).toBeNull();
    expect(r.data![0].forme_juridique).toBe('societe');
  });
});
