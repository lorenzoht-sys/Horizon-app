// tests/db/suivi-seances.spec.ts
//
// suivi_facturation_seances (migration 20261024100000) contre une VRAIE pile Supabase locale : chaque état
// et chaque motif, appelés avec le jeton du praticien comme le fait l'écran, et leur concordance avec la
// génération réelle des brouillons (generer_brouillon_facture).
//
// ⚠️ BASE LOCALE UNIQUEMENT (voir fixtures-facturation.ts).
//   supabase start && supabase db reset && npm run test:db

import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { API_URL, clesLocales, creerContrat, creerPraticien, lignesDe, moisDuTest, pg, pileDisponible, type Praticien } from './fixtures-facturation.js';

const DISPONIBLE = await pileDisponible();
const decrire = describe.skipIf(!DISPONIBLE);

decrire('Suivi de la facturation des séances : états et motifs', () => {
  const { service, anon } = clesLocales() ?? { service: 'absente', anon: 'absente' };
  const serviceClient = createClient(API_URL, service, { auth: { persistSession: false }, realtime: { transport: class {} as unknown as typeof WebSocket } });
  const pro = () => creerPraticien(serviceClient, anon, true);

  const suivi = async (p: Praticien, periode: string) => {
    const r = await p.client.rpc('suivi_facturation_seances', { p_mois: periode });
    expect(r.error).toBeNull();
    return (r.data ?? []) as { seance_id: string; etat: string; motif: string | null; numero: string | null; contrat_id: string | null }[];
  };
  const de = (lignes: Awaited<ReturnType<typeof suivi>>, seanceId: string) => lignes.find(l => l.seance_id === seanceId);
  const seance = async (p: Praticien, participantId: string, contratId: string | null, date: string, type = 'seance') => {
    const id = randomUUID();
    await pg(c => c.query(`INSERT INTO public.seances (id, participant_id, praticien_id, contrat_id, date, heure_debut, heure_fin, duree_minutes, type, statut)
                           VALUES ($1, $2, $3, $4, $5, '10:00', '10:45', 45, $6, 'realisee')`, [id, participantId, p.id, contratId, date, type]));
    return id;
  };
  const generer = (contratId: string, periode: string) =>
    pg(c => c.query(`SELECT public.generer_brouillon_facture($1, $2::date) AS id`, [contratId, periode]).then(r => r.rows[0].id as string | null, (e: Error) => e.message));

  it('en préparation (brouillon), puis facturée avec son numéro après validation', async () => {
    const p = await pro();
    const M = moisDuTest();
    const c = await creerContrat(p, M, { seances: [{ jour: 3 }] });
    expect(de(await suivi(p, M.periode), c.seanceIds[0])).toMatchObject({ etat: 'en_preparation', motif: null });
    const f = (await lignesDe(c.contratId, M.periode)).factures[0];
    const v = await p.client.rpc('valider_facture', { p_facture_id: f.id });
    expect(v.error).toBeNull();
    expect(de(await suivi(p, M.periode), c.seanceIds[0])).toMatchObject({ etat: 'facturee', motif: null, numero: v.data });
  });

  it('à corriger « sans tarif » : concorde avec le refus de generer_brouillon_facture', async () => {
    const p = await pro();
    const M = moisDuTest();
    const c = await creerContrat(p, M, { seances: [{ jour: 4 }], tarif: false });
    expect(de(await suivi(p, M.periode), c.seanceIds[0])).toMatchObject({ etat: 'a_facturer', motif: 'sans_tarif' });
    expect(await generer(c.contratId, M.periode)).toMatch(/Aucun tarif applicable/);
  });

  it('à corriger « mois déjà facturé » : séance réalisée après la validation de la facture du mois', async () => {
    const p = await pro();
    const M = moisDuTest();
    const c = await creerContrat(p, M, { seances: [{ jour: 5 }] });
    const f = (await lignesDe(c.contratId, M.periode)).factures[0];
    expect((await p.client.rpc('valider_facture', { p_facture_id: f.id })).error).toBeNull();
    const tardive = await seance(p, c.participantId, c.contratId, M.jour(20));
    expect(de(await suivi(p, M.periode), tardive)).toMatchObject({ etat: 'a_facturer', motif: 'mois_deja_facture' });
    expect(await generer(c.contratId, M.periode)).toBe(f.id);   // la facture émise est renvoyée telle quelle
  });

  it('à corriger « en attente » : brouillon retiré, la séance attend le prochain calcul ; il la reprend', async () => {
    const p = await pro();
    const M = moisDuTest();
    const c = await creerContrat(p, M, { seances: [{ jour: 6 }] });
    await pg(cl => cl.query(`DELETE FROM public.factures WHERE contrat_id = $1 AND statut = 'brouillon'`, [c.contratId]));
    expect(de(await suivi(p, M.periode), c.seanceIds[0])).toMatchObject({ etat: 'a_facturer', motif: 'en_attente' });
    expect(await generer(c.contratId, M.periode)).toMatch(/^[0-9a-f-]{36}$/);
    expect(de(await suivi(p, M.periode), c.seanceIds[0])).toMatchObject({ etat: 'en_preparation' });
  });

  it('à corriger : sans contrat, contrat qui ne couvre pas le mois, contrat à venir', async () => {
    const p = await pro();
    const M = moisDuTest();
    const c = await creerContrat(p, M, { seances: [] });
    const sansContrat = await seance(p, c.participantId, null, M.jour(7));
    // Contrat qui commence le mois suivant : ni la facture progressive ni la tâche du 1er ne le facturent.
    // (Une séance antérieure au début d'un contrat qui couvre le mois, elle, EST facturée : règle existante.)
    const suivant = moisDuTest();
    await pg(cl => cl.query(`UPDATE public.contrats SET date_debut = $2, date_fin = $3 WHERE id = $1`, [c.contratId, suivant.debut, suivant.fin]));
    const avantDebut = await seance(p, c.participantId, c.contratId, M.jour(8));
    const M2 = moisDuTest();
    const c2 = await creerContrat(p, M2, { seances: [] });
    await pg(cl => cl.query(`UPDATE public.contrats SET statut = 'a_venir' WHERE id = $1`, [c2.contratId]));
    const aVenir = await seance(p, c2.participantId, c2.contratId, M2.jour(9));
    const l = await suivi(p, M.periode);
    expect(de(l, sansContrat)).toMatchObject({ etat: 'a_facturer', motif: 'sans_contrat' });
    expect(de(l, avantDebut)).toMatchObject({ etat: 'a_facturer', motif: 'hors_periode_contrat' });
    expect(de(await suivi(p, M2.periode), aVenir)).toMatchObject({ etat: 'a_facturer', motif: 'contrat_a_venir' });
    expect((await lignesDe(c.contratId, M.periode)).factures).toHaveLength(0);
  });

  it('non facturables : bénéficiaire SAP, forfait, bilan initial, bilan d\'un contrat qui ne facture pas les bilans', async () => {
    const p = await pro();
    const M = moisDuTest();
    const sap = await creerContrat(p, M, { seances: [] });
    await pg(cl => cl.query(`UPDATE public.participants SET beneficiaire_sap = true WHERE id = $1`, [sap.participantId]));
    const sSap = await seance(p, sap.participantId, sap.contratId, M.jour(10));
    const forfait = await creerContrat(p, M, { seances: [] });
    await pg(cl => cl.query(`UPDATE public.contrats SET mode_facturation = 'forfait', montant_forfait = 200 WHERE id = $1`, [forfait.contratId]));
    const sForfait = await seance(p, forfait.participantId, forfait.contratId, M.jour(11));
    const b = await creerContrat(p, M, { seances: [] });
    const sInitial = await seance(p, b.participantId, b.contratId, M.jour(12), 'bilan_initial');
    const sBilan = await seance(p, b.participantId, b.contratId, M.jour(13), 'bilan');
    const l = await suivi(p, M.periode);
    expect(de(l, sSap)).toMatchObject({ etat: 'non_facturable', motif: 'beneficiaire_sap' });
    expect(de(l, sForfait)).toMatchObject({ etat: 'non_facturable', motif: 'forfait' });
    expect(de(l, sInitial)).toMatchObject({ etat: 'non_facturable', motif: 'bilan_initial' });
    expect(de(l, sBilan)).toMatchObject({ etat: 'non_facturable', motif: 'bilan_non_facture' });
    // Concordance : aucun brouillon à la séance pour ces deux contrats.
    expect(await generer(sap.contratId, M.periode)).toBeNull();
    expect(await generer(b.contratId, M.periode)).toBeNull();
  });

  it('seulement les séances RÉALISÉES du mois demandé', async () => {
    const p = await pro();
    const M = moisDuTest();
    const c = await creerContrat(p, M, { seances: [{ jour: 3 }, { jour: 4, statut: 'annulee' }, { jour: 5, statut: 'planifiee' }] });
    expect((await suivi(p, M.periode)).map(l => l.seance_id)).toEqual([c.seanceIds[0]]);
  });

  it('cloisonnement : un autre praticien ne voit rien ; anon ne peut pas appeler la fonction', async () => {
    const a = await pro();
    const b = await pro();
    const M = moisDuTest();
    await creerContrat(a, M, { seances: [{ jour: 3 }] });
    expect(await suivi(b, M.periode)).toEqual([]);
    const anonyme = createClient(API_URL, anon, { auth: { persistSession: false } });
    expect((await anonyme.rpc('suivi_facturation_seances', { p_mois: M.periode })).error?.message ?? '').toMatch(/permission denied/);
  });
});
