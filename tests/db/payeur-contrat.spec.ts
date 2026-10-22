// tests/db/payeur-contrat.spec.ts
//
// Payeur d'un contrat (point E, E1, sans migration : colonnes et contraintes de 20261006100000) contre une
// VRAIE pile Supabase locale : ce que l'écran écrit (payeurVersMiseAJour, sous la RLS du praticien) est
// accepté ou refusé comme prévu, la facture validée ensuite porte ce payeur, et un autre praticien ne peut
// rien modifier.
//
// ⚠️ BASE LOCALE UNIQUEMENT (voir fixtures-facturation.ts).
//   supabase start && supabase db reset && npm run test:db

import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { SELECT_PAYEUR, lirePayeur, messagePayeurLisible, payeurVersMiseAJour, type FormulairePayeur } from '../../src/lib/payeurContrat.js';
import { API_URL, clesLocales, creerContrat, creerPraticien, moisDuTest, pg, pileDisponible, type Praticien } from './fixtures-facturation.js';

const DISPONIBLE = await pileDisponible();
const decrire = describe.skipIf(!DISPONIBLE);

const PROCHE: FormulairePayeur = { type: 'proche', nom: 'Dominique Test', adresse: '3 rue Fictive\n00000 Villetest', email: 'proche@example.com' };

decrire('Payeur du contrat : écriture par l\'écran et effet sur la facture', () => {
  const { service, anon } = clesLocales() ?? { service: 'absente', anon: 'absente' };
  const serviceClient = createClient(API_URL, service, { auth: { persistSession: false }, realtime: { transport: class {} as unknown as typeof WebSocket } });
  const pro = () => creerPraticien(serviceClient, anon, true);
  const ecrire = (p: Praticien, contratId: string, f: FormulairePayeur) =>
    p.client.from('contrats').update(payeurVersMiseAJour(f)).eq('id', contratId).select(SELECT_PAYEUR);

  it('passer à un proche puis revenir au bénéficiaire (coordonnées effacées)', async () => {
    const p = await pro();
    const ct = await creerContrat(p, moisDuTest());
    const r = await ecrire(p, ct.contratId, PROCHE);
    expect(r.error).toBeNull();
    expect(lirePayeur(r.data![0] as Record<string, unknown>)).toEqual(PROCHE);
    const b = await ecrire(p, ct.contratId, { ...PROCHE, type: 'beneficiaire' });
    expect(lirePayeur(b.data![0] as Record<string, unknown>)).toEqual({ type: 'beneficiaire', nom: '', adresse: '', email: '' });
  });

  it('la base refuse un proche incomplet ou un e-mail invalide, avec un message traduisible', async () => {
    const p = await pro();
    const ct = await creerContrat(p, moisDuTest());
    const sansEmail = await p.client.from('contrats').update({ payeur_type: 'proche', payeur_nom: 'X', payeur_adresse: 'Y', payeur_email: null }).eq('id', ct.contratId);
    expect(messagePayeurLisible(sansEmail.error?.message ?? '')).toMatch(/nom, une adresse et un e-mail/);
    const invalide = await ecrire(p, ct.contratId, { ...PROCHE, email: 'pas-un-email' });
    expect(messagePayeurLisible(invalide.error?.message ?? '')).toBe('Adresse e-mail invalide.');
  });

  it('la facture validée après le changement est adressée au proche (nom, adresse, e-mail figés)', async () => {
    const p = await pro();
    const M = moisDuTest();
    const ct = await creerContrat(p, M, { seances: [{ jour: 3 }] });
    expect((await ecrire(p, ct.contratId, PROCHE)).error).toBeNull();
    const id = (await pg(c => c.query(`SELECT id FROM public.factures WHERE contrat_id = $1 AND type = 'facture'`, [ct.contratId]))).rows[0].id;
    expect((await p.client.rpc('valider_facture', { p_facture_id: id })).error).toBeNull();
    const d = (await pg(c => c.query(`SELECT snapshot_destinataire AS d FROM public.factures WHERE id = $1`, [id]))).rows[0].d;
    expect(d).toMatchObject({ role: 'proche', nom: 'Dominique Test', adresse: '3 rue Fictive\n00000 Villetest', email: 'proche@example.com' });
  });

  it('un autre praticien ne modifie rien (RLS : 0 ligne)', async () => {
    const p = await pro();
    const autre = await pro();
    const ct = await creerContrat(p, moisDuTest());
    const r = await ecrire(autre, ct.contratId, PROCHE);
    expect(r.data ?? []).toHaveLength(0);
    const v = (await pg(c => c.query(`SELECT payeur_type FROM public.contrats WHERE id = $1`, [ct.contratId]))).rows[0].payeur_type;
    expect(v).toBe('beneficiaire');
  });
});
