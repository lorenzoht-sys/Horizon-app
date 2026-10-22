// tests/db/facture-avoir.spec.ts
//
// Avoirs (migration 20261027100000, PR 9) contre une VRAIE pile Supabase locale : creer_avoir (total,
// partiel par lignes, geste commercial), cumul jamais au-delà de la facture, annulation par le cumul,
// TVA « solde », facture payée (à rembourser), « Refaire la facture du mois », suivi « créditée ».
//
// ⚠️ BASE LOCALE UNIQUEMENT (voir fixtures-facturation.ts).
//   supabase start && supabase db reset && npm run test:db

import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { API_URL, clesLocales, creerContrat, creerPraticien, moisDuTest, pg, pileDisponible, type Praticien } from './fixtures-facturation.js';

const DISPONIBLE = await pileDisponible();
const decrire = describe.skipIf(!DISPONIBLE);
const aujourdhui = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date());

interface Ligne { id: string; libelle: string; quantite: number; montant: number; seance_id: string | null }

decrire('Avoirs : creer_avoir et effets sur la facture d\'origine', () => {
  const { service, anon } = clesLocales() ?? { service: 'absente', anon: 'absente' };
  const serviceClient = createClient(API_URL, service, { auth: { persistSession: false }, realtime: { transport: class {} as unknown as typeof WebSocket } });
  const pro = () => creerPraticien(serviceClient, anon, true);

  /** Facture validée : n séances au tarif donné (+ frais), praticien assujetti si taux. */
  async function factureValidee(p: Praticien, o: { seances?: number; tarif?: number; frais?: number; taux?: number } = {}) {
    const M = moisDuTest();
    if (o.taux) await pg(c => c.query(`UPDATE public.praticiens SET regime_tva = 'assujetti', taux_tva = $2 WHERE id = $1`, [p.id, o.taux]));
    const ct = await creerContrat(p, M, { seances: Array.from({ length: o.seances ?? 2 }, (_, i) => ({ jour: 3 + i })), tarif: false });
    // Tarif posé APRÈS les séances : son insertion recalcule le brouillon du mois (20261011100000).
    await pg(c => c.query(`INSERT INTO public.tarifs_contrats (contrat_id, tarif_seance, frais_deplacement, date_debut_validite) VALUES ($1, $2, $3, $4)`,
      [ct.contratId, o.tarif ?? 45, o.frais ?? 0, M.debut]));
    const id = (await pg(c => c.query(`SELECT id FROM public.factures WHERE contrat_id = $1 AND type = 'facture'`, [ct.contratId]))).rows[0].id as string;
    expect((await p.client.rpc('valider_facture', { p_facture_id: id })).error).toBeNull();
    const lignes = (await pg(c => c.query(
      `SELECT id, libelle, quantite::float8 AS quantite, montant::float8 AS montant, seance_id FROM public.lignes_facture WHERE facture_id = $1 ORDER BY libelle`, [id]))).rows as Ligne[];
    return { id, ct, M, lignes };
  }
  const etat = async (id: string) => (await pg(c => c.query(
    `SELECT statut, numero, total::float8 AS total, total_ht::float8 AS ht, montant_tva::float8 AS tva, motif FROM public.factures WHERE id = $1`, [id]))).rows[0];
  const nbAvoirs = async (origine: string) => Number((await pg(c => c.query(`SELECT count(*) FROM public.factures WHERE facture_origine_id = $1`, [origine]))).rows[0].count);
  const avoir = (p: Praticien, facture: string, lignes: { ligne_id: string; quantite: number }[], total: number, o: { geste?: number; motif?: string } = {}) =>
    p.client.rpc('creer_avoir', { p_facture_id: facture, p_lignes: lignes, p_geste: o.geste ?? null, p_motif: o.motif ?? 'Séance annulée', p_total_attendu: total });
  const tout = (lignes: Ligne[]) => lignes.map(l => ({ ligne_id: l.id, quantite: l.quantite }));

  it('avoir total : numéro, motif, origine annulée, séances libérées ; « Refaire la facture du mois » recrée le brouillon', async () => {
    const p = await pro();
    const f = await factureValidee(p);
    const r = await avoir(p, f.id, tout(f.lignes), 90, { motif: 'Erreur de bénéficiaire' });
    expect(r.error).toBeNull();
    expect(r.data).toMatchObject({ total: 90, origine_annulee: true, a_rembourser: 0 });
    expect(r.data.numero).toMatch(/^\d{4}-\d{4}$/);
    expect(await etat(r.data.avoir_id)).toMatchObject({ statut: 'validee', total: 90, motif: 'Erreur de bénéficiaire' });
    expect((await etat(f.id)).statut).toBe('annulee');
    const refait = await p.client.rpc('generer_brouillon_facture', { p_contrat_id: f.ct.contratId, p_periode: f.M.periode });
    expect(refait.error).toBeNull();
    expect(refait.data).not.toBe(f.id);
    expect(await etat(refait.data)).toMatchObject({ statut: 'brouillon', total: 90 });
  });

  it('avoir partiel : la séance créditée l\'est une seule fois ; le reste annule l\'origine (cumul)', async () => {
    const p = await pro();
    const f = await factureValidee(p);
    const [l1, l2] = f.lignes;
    const a1 = await avoir(p, f.id, [{ ligne_id: l1.id, quantite: 1 }], 45);
    expect(a1.error).toBeNull();
    expect(a1.data).toMatchObject({ total: 45, origine_annulee: false });
    expect((await etat(f.id)).statut).toBe('validee');
    expect((await avoir(p, f.id, [{ ligne_id: l1.id, quantite: 1 }], 45)).error?.message).toMatch(/déjà crédité en totalité/);

    const suivi = await p.client.rpc('suivi_facturation_seances', { p_mois: f.M.periode });
    expect(suivi.error).toBeNull();
    const parSeance = Object.fromEntries((suivi.data as Record<string, unknown>[]).map(s => [s.seance_id, s]));
    expect(parSeance[l1.seance_id!]).toMatchObject({ etat: 'creditee', numero: (await etat(f.id)).numero, numero_avoir: a1.data.numero });
    expect(parSeance[l2.seance_id!]).toMatchObject({ etat: 'facturee', avoir_id: null });

    const a2 = await avoir(p, f.id, [{ ligne_id: l2.id, quantite: 1 }], 45);
    expect(a2.error).toBeNull();
    expect(a2.data.origine_annulee).toBe(true);
    expect((await etat(f.id)).statut).toBe('annulee');
  });

  it('geste commercial : borné au reste créditable ; le cumul exact annule l\'origine', async () => {
    const p = await pro();
    const f = await factureValidee(p);
    expect((await avoir(p, f.id, [], 50, { geste: 50 })).error).toBeNull();
    expect((await avoir(p, f.id, [], 50, { geste: 50 })).error?.message).toMatch(/dépasse le reste créditable .* \(40\.00 € TTC\)/);
    const r = await avoir(p, f.id, [], 40, { geste: 40 });
    expect(r.error).toBeNull();
    expect(r.data.origine_annulee).toBe(true);
  });

  it('frais de déplacement : une partie de la quantité se crédite, jamais plus que facturé', async () => {
    const p = await pro();
    const f = await factureValidee(p, { seances: 2, tarif: 45, frais: 5 });
    const frais = f.lignes.find(l => l.libelle.startsWith('Frais de déplacement'))!;
    const seance = f.lignes.find(l => l.seance_id)!;
    expect(frais.quantite).toBe(2);
    const r = await avoir(p, f.id, [{ ligne_id: seance.id, quantite: 1 }, { ligne_id: frais.id, quantite: 1 }], 50);
    expect(r.error).toBeNull();
    expect((await avoir(p, f.id, [{ ligne_id: frais.id, quantite: 2 }], 10)).error?.message).toMatch(/déjà crédité en totalité/);
    expect((await avoir(p, f.id, [{ ligne_id: frais.id, quantite: 1 }], 5)).error).toBeNull();
  });

  it('facture payée : avoir accepté, « à rembourser » renvoyé, la facture reste payée', async () => {
    const p = await pro();
    const f = await factureValidee(p);
    expect((await p.client.rpc('marquer_facture_payee', { p_facture_id: f.id, p_date: aujourdhui(), p_moyen: 'virement' })).error).toBeNull();
    const r = await avoir(p, f.id, [{ ligne_id: f.lignes[0].id, quantite: 1 }], 45);
    expect(r.error).toBeNull();
    expect(r.data).toMatchObject({ a_rembourser: 45, origine_annulee: false });
    expect((await etat(f.id)).statut).toBe('payee');
  });

  it('avoir partiel : un paiement du reste dû rend l\'origine payée', async () => {
    const p = await pro();
    const f = await factureValidee(p);
    await pg(c => c.query(`INSERT INTO public.paiements (facture_id, date, montant, moyen) VALUES ($1, $2, 45, 'cheque')`, [f.id, aujourdhui()]));
    expect((await etat(f.id)).statut).not.toBe('payee');
    expect((await avoir(p, f.id, [{ ligne_id: f.lignes[0].id, quantite: 1 }], 45)).error).toBeNull();
    expect((await etat(f.id)).statut).toBe('payee');
  });

  it('TVA « solde » : les arrondis par avoir n\'empêchent jamais d\'annuler la facture', async () => {
    const p = await pro();
    // 3 × 0,05 € HT à 10 % : TVA d'origine arrondie à 0,02 ; chaque avoir d'une ligne porterait 0,01.
    const f = await factureValidee(p, { seances: 3, tarif: 0.05, taux: 10 });
    expect(await etat(f.id)).toMatchObject({ ht: 0.15, tva: 0.02, total: 0.17 });
    expect((await avoir(p, f.id, [{ ligne_id: f.lignes[0].id, quantite: 1 }], 0.06)).error).toBeNull();
    expect((await avoir(p, f.id, [{ ligne_id: f.lignes[1].id, quantite: 1 }], 0.06)).error).toBeNull();
    const dernier = await avoir(p, f.id, [{ ligne_id: f.lignes[2].id, quantite: 1 }], 0.05);
    expect(dernier.error).toBeNull();
    expect(await etat(dernier.data.avoir_id)).toMatchObject({ ht: 0.05, tva: 0, total: 0.05 });
    expect((await etat(f.id)).statut).toBe('annulee');
  });

  it('refus : motif vide, montant affiché faux (rien créé, aucun numéro consommé), facture d\'un autre, ligne étrangère', async () => {
    const p = await pro();
    const f = await factureValidee(p);
    const autre = await factureValidee(p);
    expect((await avoir(p, f.id, tout(f.lignes), 90, { motif: '   ' })).error?.message).toMatch(/motif est obligatoire/);
    expect((await avoir(p, f.id, tout(f.lignes), 89)).error?.message).toMatch(/diffère du montant affiché/);
    expect((await avoir(p, f.id, [], 0)).error?.message).toMatch(/au moins une ligne/);
    expect((await avoir(p, f.id, [{ ligne_id: autre.lignes[0].id, quantite: 1 }], 45)).error?.message).toMatch(/ligne inconnue/);
    expect((await avoir(p, f.id, [{ ligne_id: f.lignes[0].id, quantite: 0 }], 0)).error?.message).toMatch(/quantité invalide/);
    const intrus = await pro();
    expect((await avoir(intrus, f.id, tout(f.lignes), 90)).error?.message).toMatch(/Facture introuvable/);
    expect(await nbAvoirs(f.id)).toBe(0);
    // Le numéro suivant n'a pas été consommé par les refus : l'avoir prend le numéro qui suit « autre ».
    const ok = await avoir(p, f.id, tout(f.lignes), 90);
    const suivant = (n: string) => `${n.slice(0, 5)}${String(Number(n.slice(5)) + 1).padStart(4, '0')}`;
    expect(ok.data.numero).toBe(suivant((await etat(autre.id)).numero));
  });

  it('refus : facture brouillon, facture annulée ; anon ne peut pas exécuter creer_avoir', async () => {
    const p = await pro();
    const f = await factureValidee(p);
    expect((await avoir(p, f.id, tout(f.lignes), 90)).error).toBeNull();
    expect((await avoir(p, f.id, tout(f.lignes), 90)).error?.message).toMatch(/non annulée \(statut annulee\)/);
    const brouillon = (await p.client.rpc('generer_brouillon_facture', { p_contrat_id: f.ct.contratId, p_periode: f.M.periode })).data as string;
    expect((await avoir(p, brouillon, [], 10, { geste: 10 })).error?.message).toMatch(/statut brouillon/);
    const anonyme = createClient(API_URL, anon, { auth: { persistSession: false }, realtime: { transport: class {} as unknown as typeof WebSocket } });
    expect((await anonyme.rpc('creer_avoir', { p_facture_id: f.id, p_lignes: [], p_geste: 1, p_motif: 'x', p_total_attendu: 1 })).error).not.toBeNull();
  });

  it('valider_facture directe (sans creer_avoir) : le cumul est aussi borné et le motif exigé', async () => {
    const p = await pro();
    const f = await factureValidee(p);
    const brut = async (montant: number, motif: string | null) => pg(async c => {
      const a = await c.query(`INSERT INTO public.factures (praticien_id, contrat_id, participant_id, periode, type, facture_origine_id, motif)
                               VALUES ($1, $2, $3, $4, 'avoir', $5, $6) RETURNING id`, [p.id, f.ct.contratId, f.ct.participantId, f.M.periode, f.id, motif]);
      await c.query(`INSERT INTO public.lignes_facture (facture_id, libelle, quantite, prix_unitaire, montant) VALUES ($1, 'Avoir', 1, $2, $2)`, [a.rows[0].id, montant]);
      return a.rows[0].id as string;
    });
    expect((await p.client.rpc('valider_facture', { p_facture_id: await brut(10, null) })).error?.message).toMatch(/motif est obligatoire/);
    expect((await p.client.rpc('valider_facture', { p_facture_id: await brut(60, 'Geste') })).error).toBeNull();
    expect((await p.client.rpc('valider_facture', { p_facture_id: await brut(60, 'Geste') })).error?.message).toMatch(/dépasse le reste créditable/);
  });
});
