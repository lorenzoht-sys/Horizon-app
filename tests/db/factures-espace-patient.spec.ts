// tests/db/factures-espace-patient.spec.ts
//
// Factures de l'espace patient (point D, D2 : api/_lib/facturesPatient.ts) contre une VRAIE pile Supabase
// locale : la liste et l'URL signée passent par documents_du_beneficiaire ; un brouillon, la facture d'un
// autre bénéficiaire ou une facture masquée (proche payeur, réglage à non) ne donnent jamais d'URL.
// L'expiration de l'URL (60 s) est vérifiée en recette staging, pas ici (test trop long).
//
// ⚠️ BASE LOCALE UNIQUEMENT (voir fixtures-facturation.ts).
//   supabase start && supabase db reset && npm run test:db

import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { lireFacturesPatient, urlPdfFacturePatient } from '../../api/_lib/facturesPatient.js';
import { API_URL, clesLocales, creerContrat, creerPraticien, moisDuTest, pg, pileDisponible, type Praticien } from './fixtures-facturation.js';

const DISPONIBLE = await pileDisponible();
const decrire = describe.skipIf(!DISPONIBLE);

decrire('Factures dans l\'espace patient : liste et URL signée du PDF', () => {
  const { service, anon } = clesLocales() ?? { service: 'absente', anon: 'absente' };
  const serviceClient = createClient(API_URL, service, { auth: { persistSession: false }, realtime: { transport: class {} as unknown as typeof WebSocket } });
  const pro = () => creerPraticien(serviceClient, anon, true);

  async function facture(p: Praticien, o: { proche?: boolean; valider?: boolean } = {}) {
    const M = moisDuTest();
    const ct = await creerContrat(p, M, { seances: [{ jour: 3 }] });
    if (o.proche) {
      await pg(c => c.query(`UPDATE public.contrats SET payeur_type = 'proche', payeur_nom = 'Proche Test', payeur_adresse = '3 rue Fictive 00000 Villetest', payeur_email = 'proche@example.com' WHERE id = $1`, [ct.contratId]));
    }
    const id = (await pg(c => c.query(`SELECT id FROM public.factures WHERE contrat_id = $1 AND type = 'facture'`, [ct.contratId]))).rows[0].id as string;
    if (o.valider !== false) {
      expect((await p.client.rpc('valider_facture', { p_facture_id: id })).error).toBeNull();
      // Le PDF est produit par l'Edge Function, absente en local : on dépose un fichier fictif à sa place.
      const numero = (await pg(c => c.query(`SELECT numero FROM public.factures WHERE id = $1`, [id]))).rows[0].numero as string;
      const chemin = `${p.id}/${numero}.pdf`;
      const up = await serviceClient.storage.from('factures').upload(chemin, new Blob(['%PDF-1.4 fictif'], { type: 'application/pdf' }), { upsert: true });
      expect(up.error).toBeNull();
      await pg(c => c.query(`UPDATE public.factures SET pdf_path = $2 WHERE id = $1`, [id, chemin]));
    }
    return { id, participantId: ct.participantId };
  }

  it('liste du bénéficiaire : ses factures émises, sans chemin de fichier ; URL signée qui sert bien le PDF', async () => {
    const p = await pro();
    const f = await facture(p);
    const liste = await lireFacturesPatient(serviceClient, f.participantId);
    expect(liste.map(x => [x.id, x.pdfDisponible])).toEqual([[f.id, true]]);
    expect(JSON.stringify(liste)).not.toContain(p.id);
    const r = await urlPdfFacturePatient(serviceClient, f.participantId, f.id);
    expect(r.ok).toBe(true);
    if (r.ok) {
      const rep = await fetch(r.url);
      expect(rep.status).toBe(200);
      expect(await rep.text()).toContain('%PDF');
    }
  });

  it('un brouillon n\'apparaît jamais et ne donne pas d\'URL', async () => {
    const p = await pro();
    const f = await facture(p, { valider: false });
    expect(await lireFacturesPatient(serviceClient, f.participantId)).toEqual([]);
    expect(await urlPdfFacturePatient(serviceClient, f.participantId, f.id)).toMatchObject({ ok: false, statut: 404 });
  });

  it('la facture d\'un autre bénéficiaire (même praticien ou non) : 404', async () => {
    const p = await pro();
    const a = await facture(p);
    const b = await facture(p);
    const autre = await facture(await pro());
    expect(await urlPdfFacturePatient(serviceClient, a.participantId, b.id)).toMatchObject({ ok: false, statut: 404 });
    expect(await urlPdfFacturePatient(serviceClient, a.participantId, autre.id)).toMatchObject({ ok: false, statut: 404 });
    expect((await lireFacturesPatient(serviceClient, a.participantId)).map(x => x.id)).toEqual([a.id]);
  });

  it('payée par un proche, case décochée : absente de la liste et pas d\'URL ; recochée : de retour', async () => {
    const p = await pro();
    const f = await facture(p, { proche: true });
    await pg(c => c.query(`UPDATE public.praticiens SET factures_proche_visibles = false WHERE id = $1`, [p.id]));
    expect(await lireFacturesPatient(serviceClient, f.participantId)).toEqual([]);
    expect(await urlPdfFacturePatient(serviceClient, f.participantId, f.id)).toMatchObject({ ok: false, statut: 404 });
    await pg(c => c.query(`UPDATE public.praticiens SET factures_proche_visibles = true WHERE id = $1`, [p.id]));
    expect((await lireFacturesPatient(serviceClient, f.participantId)).map(x => x.id)).toEqual([f.id]);
  });
});
