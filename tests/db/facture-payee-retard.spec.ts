// tests/db/facture-payee-retard.spec.ts
//
// Statuts d'une facture émise (migration 20261025100000, PR 7) contre une VRAIE pile Supabase locale :
// « Marquer payée » (un paiement du reste dû), statut qui suit les paiements et les avoirs, « en retard »
// posé par le passage quotidien après l'échéance.
//
// ⚠️ BASE LOCALE UNIQUEMENT (voir fixtures-facturation.ts).
//   supabase start && supabase db reset && npm run test:db

import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { API_URL, clesLocales, creerContrat, creerPraticien, lignesDe, moisDuTest, pg, pileDisponible, type Praticien } from './fixtures-facturation.js';

const DISPONIBLE = await pileDisponible();
const decrire = describe.skipIf(!DISPONIBLE);
const aujourdhui = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date());

decrire('Facture émise : « Marquer payée » et « En retard »', () => {
  const { service, anon } = clesLocales() ?? { service: 'absente', anon: 'absente' };
  const serviceClient = createClient(API_URL, service, { auth: { persistSession: false }, realtime: { transport: class {} as unknown as typeof WebSocket } });
  const pro = () => creerPraticien(serviceClient, anon, true);

  /** Facture validée de 45 € (une séance), avec le jeton du praticien. */
  async function factureValidee(p: Praticien) {
    const M = moisDuTest();
    const c = await creerContrat(p, M, { seances: [{ jour: 3 }] });
    const f = (await lignesDe(c.contratId, M.periode)).factures[0];
    expect((await p.client.rpc('valider_facture', { p_facture_id: f.id })).error).toBeNull();
    return { id: f.id as string, contrat: c, M };
  }
  const etat = async (id: string) => (await pg(c => c.query(
    `SELECT statut, total::float8 AS total, date_emission::text AS emission, echeance::text AS echeance,
            (SELECT coalesce(sum(montant), 0)::float8 FROM public.paiements WHERE facture_id = $1) AS paye
       FROM public.factures WHERE id = $1`, [id]))).rows[0];
  const marquer = (p: Praticien, id: string, date = aujourdhui(), moyen = 'virement') =>
    p.client.rpc('marquer_facture_payee', { p_facture_id: id, p_date: date, p_moyen: moyen });

  it('« Marquer payée » enregistre un paiement du reste dû et passe la facture en « payée »', async () => {
    const p = await pro();
    const { id } = await factureValidee(p);
    const r = await marquer(p, id);
    expect(r.error).toBeNull();
    expect(r.data).toBe('payee');
    expect(await etat(id)).toMatchObject({ statut: 'payee', total: 45, paye: 45 });
    expect((await marquer(p, id)).error?.message).toMatch(/ne peut pas être marquée payée \(statut payee\)/);
  });

  it('refuse une date dans le futur, ou antérieure à l\'émission ; rien n\'est enregistré', async () => {
    const p = await pro();
    const { id } = await factureValidee(p);
    expect((await marquer(p, id, '2999-01-01')).error?.message).toMatch(/dans le futur/);
    expect((await marquer(p, id, '2000-01-01')).error?.message).toMatch(/précède l'émission/);
    expect(await etat(id)).toMatchObject({ statut: 'validee', paye: 0 });
  });

  it('un avoir partiel validé réduit le reste dû ; un avoir ne se marque pas payé', async () => {
    const p = await pro();
    const { id, contrat, M } = await factureValidee(p);
    const avoirId = randomUUID();
    await pg(async c => {
      await c.query(`INSERT INTO public.factures (id, praticien_id, contrat_id, participant_id, periode, type, facture_origine_id, motif) VALUES ($1, $2, $3, $4, $5, 'avoir', $6, 'Motif de test')`,
        [avoirId, p.id, contrat.contratId, contrat.participantId, M.periode, id]);
      await c.query(`INSERT INTO public.lignes_facture (facture_id, libelle, quantite, prix_unitaire, montant) VALUES ($1, 'Geste commercial', 1, 15, 15)`, [avoirId]);
    });
    expect((await p.client.rpc('valider_facture', { p_facture_id: avoirId })).error).toBeNull();
    const totalAvoir = (await etat(avoirId)).total;
    expect((await marquer(p, avoirId)).error?.message).toMatch(/ne peut pas être marquée payée/);
    expect((await marquer(p, id)).error).toBeNull();
    expect(await etat(id)).toMatchObject({ statut: 'payee', paye: 45 - totalAvoir });
  });

  it('une correction de paiement (montant négatif) fait repasser la facture « validée »', async () => {
    const p = await pro();
    const { id } = await factureValidee(p);
    await marquer(p, id);
    expect((await p.client.from('paiements').insert({ facture_id: id, date: aujourdhui(), montant: -45, moyen: 'virement' })).error).toBeNull();
    expect(await etat(id)).toMatchObject({ statut: 'validee', paye: 0 });
  });

  it('passage quotidien : « en retard » après l\'échéance, puis « payée » au paiement ; sans effet la seconde fois', async () => {
    const p = await pro();
    const { id } = await factureValidee(p);
    // Une facture validée ne se modifie pas : on recule son échéance dans une transaction annulée ensuite.
    const vu = await pg(async c => {
      await c.query('BEGIN');
      try {
        await c.query(`ALTER TABLE public.factures DISABLE TRIGGER factures_inalterables`);
        await c.query(`UPDATE public.factures SET date_emission = date_emission - 30, echeance = date_emission - 20 WHERE id = $1`, [id]);
        await c.query(`ALTER TABLE public.factures ENABLE TRIGGER factures_inalterables`);
        const premier = (await c.query(`SELECT public.actualiser_statuts_factures() AS n`)).rows[0].n;
        const statut1 = (await c.query(`SELECT statut FROM public.factures WHERE id = $1`, [id])).rows[0].statut;
        const second = (await c.query(`SELECT public.actualiser_statuts_factures() AS n`)).rows[0].n;
        await c.query(`INSERT INTO public.paiements (facture_id, date, montant, moyen) VALUES ($1, current_date, 45, 'cheque')`, [id]);
        const statut2 = (await c.query(`SELECT statut FROM public.factures WHERE id = $1`, [id])).rows[0].statut;
        return { premier, statut1, second, statut2 };
      } finally {
        await c.query('ROLLBACK');
      }
    });
    expect(vu.premier).toBeGreaterThanOrEqual(1);
    expect(vu.statut1).toBe('en_retard');
    expect(vu.second).toBe(0);
    expect(vu.statut2).toBe('payee');
  });

  it('une facture à échéance future reste « validée » au passage quotidien', async () => {
    const p = await pro();
    const { id } = await factureValidee(p);
    const e = await etat(id);
    expect(e.echeance >= aujourdhui()).toBe(true);
    await serviceClient.rpc('actualiser_statuts_factures');
    expect((await etat(id)).statut).toBe('validee');
  });

  it('cloisonnement : un autre praticien ne marque rien ; le passage quotidien est réservé à service_role', async () => {
    const a = await pro();
    const b = await pro();
    const { id } = await factureValidee(a);
    expect((await marquer(b, id)).error?.message).toMatch(/Facture introuvable/);
    expect((await b.client.rpc('actualiser_statuts_factures')).error?.message ?? '').toMatch(/permission denied/);
    const anonyme = createClient(API_URL, anon, { auth: { persistSession: false } });
    expect((await anonyme.rpc('marquer_facture_payee', { p_facture_id: id, p_date: aujourdhui(), p_moyen: 'virement' })).error?.message ?? '').toMatch(/permission denied/);
    expect(await etat(id)).toMatchObject({ statut: 'validee', paye: 0 });
  });
});
