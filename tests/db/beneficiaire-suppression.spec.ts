// tests/db/beneficiaire-suppression.spec.ts
//
// Suppression d'un bénéficiaire (migration 20261020100000) contre une VRAIE pile Supabase locale :
// refusée dès qu'il existe un historique financier (factures — brouillons compris —, avoirs, CA externe),
// avec un message clair et compté ; un bénéficiaire sans historique financier se supprime comme avant.
// La requête est celle de l'écran (useParticipants.deleteParticipant), avec le jeton du praticien.
//
// ⚠️ BASE LOCALE UNIQUEMENT (voir fixtures-facturation.ts).
//   supabase start && supabase db reset && npm run test:db

import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { genererBrouillonsDuMois } from '../../api/_lib/facturationMensuelle.js';
import { messageSuppressionBeneficiaire } from '../../src/lib/suppressionBeneficiaire.js';
import { API_URL, clesLocales, creerContrat, creerPraticien, lignesDe, moisDuTest, pg, pileDisponible, sansAlerte, type Praticien } from './fixtures-facturation.js';

const DISPONIBLE = await pileDisponible();
const decrire = describe.skipIf(!DISPONIBLE);

decrire('Suppression d\'un bénéficiaire : bloquée par un historique financier', () => {
  const { service, anon } = clesLocales() ?? { service: 'absente', anon: 'absente' };
  const serviceClient = createClient(API_URL, service, { auth: { persistSession: false }, realtime: { transport: class {} as unknown as typeof WebSocket } });
  const pro = () => creerPraticien(serviceClient, anon, true);
  const M = moisDuTest();

  /** Exactement la requête de l'écran. */
  const supprimer = (p: Praticien, id: string) => p.client.from('participants').delete().eq('id', id).select('id');
  const existe = async (id: string) => (await pg(c => c.query(`SELECT count(*)::int AS n FROM public.participants WHERE id = $1`, [id]))).rows[0].n === 1;

  it('un BROUILLON de facture suffit à bloquer, avec un message clair et compté ; rien n\'est supprimé', async () => {
    const p = await pro();
    const c = await creerContrat(p, M, { seances: [{ jour: 3 }] });
    await genererBrouillonsDuMois(serviceClient, M.periode, { envoyerAlerte: sansAlerte });
    expect((await lignesDe(c.contratId, M.periode)).factures[0].statut).toBe('brouillon');

    const r = await supprimer(p, c.participantId);
    expect(r.error?.message).toBe('Ce bénéficiaire a un historique financier (1 facture(s), 0 avoir(s), 0 saisie(s) de CA externe) : il ne peut pas être supprimé. Archivez-le à la place.');
    expect(r.error?.code).toBe('23503');
    expect(messageSuppressionBeneficiaire(r.error!)).toBe(r.error!.message);   // ce que l'écran affiche
    expect(await existe(c.participantId)).toBe(true);
    const restes = await pg(cl => cl.query(`SELECT (SELECT count(*) FROM public.seances WHERE participant_id = $1)::int AS seances, (SELECT count(*) FROM public.contrats WHERE participant_id = $1)::int AS contrats`, [c.participantId]));
    expect(restes.rows[0]).toEqual({ seances: 1, contrats: 1 });   // aucune cascade partielle
  });

  it('une facture validée et son avoir sont comptés séparément', async () => {
    const p = await pro();
    const c = await creerContrat(p, M, { seances: [{ jour: 4 }] });
    await genererBrouillonsDuMois(serviceClient, M.periode, { envoyerAlerte: sansAlerte });
    const f = (await lignesDe(c.contratId, M.periode)).factures[0];
    expect((await p.client.rpc('valider_facture', { p_facture_id: f.id })).error).toBeNull();
    const avoirId = randomUUID();
    await pg(async cl => {
      await cl.query(`INSERT INTO public.factures (id, praticien_id, contrat_id, participant_id, periode, type, facture_origine_id, motif) VALUES ($1, $2, $3, $4, $5, 'avoir', $6, 'Motif de test')`, [avoirId, p.id, c.contratId, c.participantId, M.periode, f.id]);
      await cl.query(`INSERT INTO public.lignes_facture (facture_id, libelle, quantite, prix_unitaire, montant) VALUES ($1, 'Avoir', 1, 10, 10)`, [avoirId]);
    });
    expect((await p.client.rpc('valider_facture', { p_facture_id: avoirId })).error).toBeNull();

    const r = await supprimer(p, c.participantId);
    expect(r.error?.message).toMatch(/\(1 facture\(s\), 1 avoir\(s\), 0 saisie\(s\) de CA externe\)/);
    expect(await existe(c.participantId)).toBe(true);
  });

  it('une saisie de CA externe suffit aussi, et n\'est plus supprimée en cascade', async () => {
    const p = await pro();
    const c = await creerContrat(p, M, { seances: [] });
    expect((await p.client.from('ca_externe').insert({ praticien_id: p.id, participant_id: c.participantId, mois: M.periode, libelle: 'SAP externe', montant: 40 })).error).toBeNull();

    const r = await supprimer(p, c.participantId);
    expect(r.error?.message).toMatch(/\(0 facture\(s\), 0 avoir\(s\), 1 saisie\(s\) de CA externe\)/);
    expect(await existe(c.participantId)).toBe(true);
    expect((await pg(cl => cl.query(`SELECT count(*)::int AS n FROM public.ca_externe WHERE participant_id = $1`, [c.participantId]))).rows[0].n).toBe(1);
  });

  it('le refus vaut aussi pour service_role (la base décide, pas l\'interface)', async () => {
    const p = await pro();
    const c = await creerContrat(p, M, { seances: [] });
    await p.client.from('ca_externe').insert({ praticien_id: p.id, participant_id: c.participantId, mois: M.periode, libelle: 'SAP externe', montant: 5 });
    const r = await serviceClient.from('participants').delete().eq('id', c.participantId).select('id');
    expect(r.error?.message).toMatch(/historique financier/);
    expect(await existe(c.participantId)).toBe(true);
  });

  it('sans historique financier, la suppression se fait comme avant, cascades comprises', async () => {
    const p = await pro();
    const c = await creerContrat(p, M, { seances: [{ jour: 5 }], tarif: false });   // séance sans tarif : aucun brouillon
    expect((await lignesDe(c.contratId, M.periode)).factures).toHaveLength(0);
    const r = await supprimer(p, c.participantId);
    expect(r.error).toBeNull();
    expect(r.data).toEqual([{ id: c.participantId }]);
    expect(await existe(c.participantId)).toBe(false);
    const restes = await pg(cl => cl.query(`SELECT (SELECT count(*) FROM public.seances WHERE participant_id = $1)::int AS seances, (SELECT count(*) FROM public.contrats WHERE participant_id = $1)::int AS contrats`, [c.participantId]));
    expect(restes.rows[0]).toEqual({ seances: 0, contrats: 0 });
  });

  it('un autre praticien ne supprime rien (0 ligne), ce que l\'écran traite comme un échec', async () => {
    const a = await pro();
    const b = await pro();
    const c = await creerContrat(a, M, { seances: [], tarif: false });
    const r = await supprimer(b, c.participantId);
    expect(r.error).toBeNull();
    expect(r.data ?? []).toEqual([]);
    expect(await existe(c.participantId)).toBe(true);
  });
});
