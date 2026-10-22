// tests/db/documents-beneficiaire.spec.ts
//
// Documents du bénéficiaire (migration 20261030100000, point D, D1) contre une VRAIE pile Supabase locale :
// documents_du_beneficiaire ne rend que les factures émises, applique le réglage « proche payeur » sur le
// payeur FIGÉ dans la facture, n'est exécutable que par service_role ; la règle de l'écran
// (src/lib/documentsBeneficiaire.ts), appliquée à ce que le praticien lit sous sa RLS, donne le même résultat.
//
// ⚠️ BASE LOCALE UNIQUEMENT (voir fixtures-facturation.ts).
//   supabase start && supabase db reset && npm run test:db

import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { SELECT_FACTURES_DOCUMENTS, lireFactureDocument, visibleParBeneficiaire } from '../../src/lib/documentsBeneficiaire.js';
import { API_URL, clesLocales, creerContrat, creerPraticien, moisDuTest, pg, pileDisponible, type Praticien } from './fixtures-facturation.js';

const DISPONIBLE = await pileDisponible();
const decrire = describe.skipIf(!DISPONIBLE);

decrire('Documents du bénéficiaire : factures visibles et réglage « proche payeur »', () => {
  const { service, anon } = clesLocales() ?? { service: 'absente', anon: 'absente' };
  const serviceClient = createClient(API_URL, service, { auth: { persistSession: false }, realtime: { transport: class {} as unknown as typeof WebSocket } });
  const anonyme = createClient(API_URL, anon, { auth: { persistSession: false }, realtime: { transport: class {} as unknown as typeof WebSocket } });
  const pro = () => creerPraticien(serviceClient, anon, true);

  /** Brouillon (2 séances) d'un nouveau bénéficiaire ; payé par un proche si demandé (avant validation). */
  async function brouillon(p: Praticien, o: { proche?: boolean } = {}) {
    const M = moisDuTest();
    const ct = await creerContrat(p, M, { seances: [{ jour: 3 }, { jour: 4 }] });
    if (o.proche) {
      await pg(c => c.query(
        `UPDATE public.contrats SET payeur_type = 'proche', payeur_nom = 'Proche Test', payeur_adresse = '3 rue Fictive 00000 Villetest', payeur_email = 'proche@example.com' WHERE id = $1`,
        [ct.contratId]));
    }
    const id = (await pg(c => c.query(`SELECT id FROM public.factures WHERE contrat_id = $1 AND type = 'facture'`, [ct.contratId]))).rows[0].id as string;
    return { id, participantId: ct.participantId };
  }
  const valider = async (p: Praticien, id: string) => expect((await p.client.rpc('valider_facture', { p_facture_id: id })).error).toBeNull();
  const visibles = async (participantId: string) => {
    const r = await serviceClient.rpc('documents_du_beneficiaire', { p_participant_id: participantId });
    expect(r.error).toBeNull();
    return (r.data as { id: string; payeur_proche: boolean }[]);
  };
  /** Ce que l'écran affiche comme « visible par le bénéficiaire », depuis la lecture du praticien. */
  const visiblesSelonEcran = async (p: Praticien, participantId: string, procheVisibles: boolean) => {
    const { data, error } = await p.client.from('factures').select(SELECT_FACTURES_DOCUMENTS).eq('participant_id', participantId).neq('statut', 'brouillon');
    expect(error).toBeNull();
    return (data as unknown as Record<string, unknown>[]).map(lireFactureDocument).filter(f => visibleParBeneficiaire(f, procheVisibles)).map(f => f.id);
  };
  const regler = (p: Praticien, v: boolean) => pg(c => c.query(`UPDATE public.praticiens SET factures_proche_visibles = $2 WHERE id = $1`, [p.id, v]));

  it('réglage par défaut : oui', async () => {
    const p = await pro();
    const r = await pg(c => c.query(`SELECT factures_proche_visibles AS v FROM public.praticiens WHERE id = $1`, [p.id]));
    expect(r.rows[0].v).toBe(true);
  });

  it('un brouillon n\'est jamais rendu ; une facture émise au bénéficiaire l\'est toujours', async () => {
    const p = await pro();
    const f = await brouillon(p);
    expect(await visibles(f.participantId)).toEqual([]);
    await valider(p, f.id);
    await regler(p, false);
    const v = await visibles(f.participantId);
    expect(v.map(x => [x.id, x.payeur_proche])).toEqual([[f.id, false]]);
    expect(await visiblesSelonEcran(p, f.participantId, false)).toEqual([f.id]);
  });

  it('payée par un proche : rendue si le réglage est à oui, masquée sinon ; l\'écran suit la même règle', async () => {
    const p = await pro();
    const f = await brouillon(p, { proche: true });
    await valider(p, f.id);
    const snap = await pg(c => c.query(`SELECT snapshot_destinataire->>'role' AS r FROM public.factures WHERE id = $1`, [f.id]));
    expect(snap.rows[0].r).toBe('proche');
    expect((await visibles(f.participantId)).map(x => [x.id, x.payeur_proche])).toEqual([[f.id, true]]);
    expect(await visiblesSelonEcran(p, f.participantId, true)).toEqual([f.id]);
    await regler(p, false);
    expect(await visibles(f.participantId)).toEqual([]);
    expect(await visiblesSelonEcran(p, f.participantId, false)).toEqual([]);
  });

  it('le payeur figé dans la facture fait foi, pas le contrat d\'aujourd\'hui', async () => {
    const p = await pro();
    const f = await brouillon(p, { proche: true });
    await valider(p, f.id);
    await regler(p, false);
    // Le contrat repasse au bénéficiaire après coup : la facture émise reste « payée par un proche ».
    await pg(c => c.query(`UPDATE public.contrats SET payeur_type = 'beneficiaire' FROM public.factures f WHERE f.id = $1 AND contrats.id = f.contrat_id`, [f.id]));
    expect(await visibles(f.participantId)).toEqual([]);
  });

  it('réservée à service_role : refusée au praticien et à anon', async () => {
    const p = await pro();
    const f = await brouillon(p);
    expect((await p.client.rpc('documents_du_beneficiaire', { p_participant_id: f.participantId })).error).not.toBeNull();
    expect((await anonyme.rpc('documents_du_beneficiaire', { p_participant_id: f.participantId })).error).not.toBeNull();
  });
});
