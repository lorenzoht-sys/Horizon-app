// tests/db/facture-envoi.spec.ts
//
// Journal des envois de factures (migration 20261026100000, PR 8) contre une VRAIE pile Supabase locale :
// le praticien lit SES envois et n'écrit rien ; service_role (l'Edge Function) écrit ; le journal est
// inaltérable ; la facture passe « envoyee » depuis « validee », et le passage quotidien des statuts la
// laisse « envoyee ». L'appel réel à Resend est recetté sur staging.
//
// ⚠️ BASE LOCALE UNIQUEMENT (voir fixtures-facturation.ts).
//   supabase start && supabase db reset && npm run test:db

import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { API_URL, clesLocales, creerContrat, creerPraticien, lignesDe, moisDuTest, pg, pileDisponible, type Praticien } from './fixtures-facturation.js';

const DISPONIBLE = await pileDisponible();
const decrire = describe.skipIf(!DISPONIBLE);

decrire('Envoi des factures : journal envois_factures', () => {
  const { service, anon } = clesLocales() ?? { service: 'absente', anon: 'absente' };
  const serviceClient = createClient(API_URL, service, { auth: { persistSession: false }, realtime: { transport: class {} as unknown as typeof WebSocket } });
  const pro = () => creerPraticien(serviceClient, anon, true);

  async function factureValidee(p: Praticien) {
    const M = moisDuTest();
    const c = await creerContrat(p, M, { seances: [{ jour: 3 }] });
    const f = (await lignesDe(c.contratId, M.periode)).factures[0];
    expect((await p.client.rpc('valider_facture', { p_facture_id: f.id })).error).toBeNull();
    return f.id as string;
  }
  /** Exactement les écritures de l'Edge Function, avec service_role. */
  const journaliser = (factureId: string, praticienId: string, resultat: 'envoye' | 'echec') =>
    serviceClient.from('envois_factures').insert({
      facture_id: factureId, praticien_id: praticienId, destinataire: 'destinataire@example.com', resultat,
      message_id: resultat === 'envoye' ? 'msg-test' : null, erreur: resultat === 'echec' ? 'refusé' : null,
    }).select('id').single();

  it('service_role journalise ; le praticien lit ses envois, un autre praticien ne voit rien', async () => {
    const a = await pro();
    const b = await pro();
    const id = await factureValidee(a);
    expect((await journaliser(id, a.id, 'envoye')).error).toBeNull();
    expect((await journaliser(id, a.id, 'echec')).error).toBeNull();
    expect((await a.client.from('envois_factures').select('resultat').eq('facture_id', id)).data).toHaveLength(2);
    expect((await b.client.from('envois_factures').select('id').eq('facture_id', id)).data).toEqual([]);
    // Lecture imbriquée de l'écran « Factures validées ».
    const r = await a.client.from('factures').select('id, envois_factures(created_at, destinataire, resultat)').eq('id', id).single();
    expect((r.data?.envois_factures as unknown[]).length).toBe(2);
  });

  it('le praticien n\'écrit rien dans le journal ; personne ne le modifie ni ne le supprime', async () => {
    const p = await pro();
    const id = await factureValidee(p);
    const ins = await p.client.from('envois_factures').insert({ facture_id: id, praticien_id: p.id, destinataire: 'x@example.com', resultat: 'envoye', message_id: 'm' });
    expect(ins.error?.message ?? '').toMatch(/permission denied/);
    const ligne = (await journaliser(id, p.id, 'envoye')).data!;
    const refus = (sql: string) => pg(c => c.query(sql, [ligne.id]).then(() => null, (e: Error) => e.message));
    expect(await refus(`UPDATE public.envois_factures SET destinataire = 'y@example.com' WHERE id = $1`)).toMatch(/inaltérable/);
    expect(await refus(`DELETE FROM public.envois_factures WHERE id = $1`)).toMatch(/inaltérable/);
  });

  it('contraintes : adresse plausible, résultat cohérent (message_id si envoyé, erreur si échec)', async () => {
    const p = await pro();
    const id = await factureValidee(p);
    const base = { facture_id: id, praticien_id: p.id };
    expect((await serviceClient.from('envois_factures').insert({ ...base, destinataire: 'pas-une-adresse', resultat: 'envoye', message_id: 'm' })).error?.message).toMatch(/destinataire_format/);
    expect((await serviceClient.from('envois_factures').insert({ ...base, destinataire: 'a@b.fr', resultat: 'envoye' })).error?.message).toMatch(/envois_factures_coherent/);
    expect((await serviceClient.from('envois_factures').insert({ ...base, destinataire: 'a@b.fr', resultat: 'echec' })).error?.message).toMatch(/envois_factures_coherent/);
  });

  it('statut : « envoyee » depuis « validee » (écriture de la fonction), conservé au passage quotidien, puis « payee »', async () => {
    const p = await pro();
    const id = await factureValidee(p);
    const maj = await serviceClient.from('factures').update({ statut: 'envoyee' }).eq('id', id).eq('statut', 'validee').select('statut');
    expect(maj.error).toBeNull();
    expect(maj.data).toEqual([{ statut: 'envoyee' }]);
    await serviceClient.rpc('actualiser_statuts_factures');
    expect((await pg(c => c.query(`SELECT statut FROM public.factures WHERE id = $1`, [id]))).rows[0].statut).toBe('envoyee');
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date());
    expect((await p.client.rpc('marquer_facture_payee', { p_facture_id: id, p_date: today, p_moyen: 'virement' })).data).toBe('payee');
  });
});
