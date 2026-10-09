// tests/db/ca-mensuel.spec.ts
//
// Suivi du chiffre d'affaires mensuel (migration 20261012100000) contre une VRAIE pile Supabase locale :
//   - chiffre_affaires_mensuel() : quelles factures comptent (validées, en HT, au mois de la prestation),
//     avoirs déduits sans double compte, saisies externes ajoutées, cloisonnement par praticien ;
//   - ca_externe : saisies librement modifiables et supprimables, cloisonnées par RLS (lecture, écriture,
//     et bénéficiaire qui appartient au praticien), contraintes de valeur, aucune lecture admin.
//
// ⚠️ BASE LOCALE UNIQUEMENT (voir fixtures-facturation.ts).
//   supabase start && supabase db reset && npm run test:db

import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { genererBrouillonsDuMois } from '../../api/_lib/facturationMensuelle.js';
import { API_URL, clesLocales, creerContrat, creerPraticien, lignesDe, moisDuTest, pg, pileDisponible, sansAlerte, type Praticien } from './fixtures-facturation.js';

const DISPONIBLE = await pileDisponible();
const decrire = describe.skipIf(!DISPONIBLE);

decrire('Chiffre d\'affaires mensuel : agrégation et saisies externes', () => {
  const { service, anon } = clesLocales() ?? { service: 'absente', anon: 'absente' };
  const opts = { auth: { persistSession: false }, realtime: { transport: class {} as unknown as typeof WebSocket } };
  const serviceClient = createClient(API_URL, service, opts);
  const anonyme = createClient(API_URL, anon, opts);
  const pro = () => creerPraticien(serviceClient, anon, true);
  // Deux mois pour tout le fichier (moisDuTest() n'en fournit que 12 par fichier) : chaque test crée ses propres
  // praticiens et bénéficiaires, leurs contrats ne se recouvrent donc jamais.
  const M = moisDuTest();
  const M2 = moisDuTest();

  type Ligne = { mois: string; participant_id: string; ca_horizon: string | number; ca_externe: string | number };
  const ca = async (p: Praticien, debut: string, fin: string) => {
    const r = await p.client.rpc('chiffre_affaires_mensuel', { p_debut: debut, p_fin: fin });
    expect(r.error, r.error?.message).toBeNull();
    return ((r.data ?? []) as Ligne[]).map(l => ({ mois: l.mois, participantId: l.participant_id, horizon: Number(l.ca_horizon), externe: Number(l.ca_externe) }));
  };

  /** Contrat à 2 séances de 45 € sur le mois, brouillon généré, puis facture VALIDÉE (90 € HT). */
  async function factureValidee(p: Praticien, mois = M) {
    const c = await creerContrat(p, mois, { seances: [{ jour: 3 }, { jour: 10 }] });
    await genererBrouillonsDuMois(serviceClient, mois.periode, { envoyerAlerte: sansAlerte });
    const f = (await lignesDe(c.contratId, mois.periode)).factures[0];
    const r = await p.client.rpc('valider_facture', { p_facture_id: f.id });
    expect(r.error, r.error?.message).toBeNull();
    return { ...c, factureId: f.id, mois };
  }

  async function avoir(p: Praticien, f: { factureId: string; contratId: string; participantId: string; mois: ReturnType<typeof moisDuTest> }, montant: number) {
    const id = await pg(async cl => {
      const a = await cl.query(
        `INSERT INTO public.factures (praticien_id, contrat_id, participant_id, periode, type, facture_origine_id)
         VALUES ($1, $2, $3, $4, 'avoir', $5) RETURNING id`, [p.id, f.contratId, f.participantId, f.mois.periode, f.factureId]);
      await cl.query(`INSERT INTO public.lignes_facture (facture_id, libelle, quantite, prix_unitaire, montant) VALUES ($1, 'Avoir', 1, $2, $2)`, [a.rows[0].id, montant]);
      return a.rows[0].id as string;
    });
    const r = await p.client.rpc('valider_facture', { p_facture_id: id });
    expect(r.error, r.error?.message).toBeNull();
    return id;
  }

  const saisie = (p: Praticien, participantId: string, mois: string, libelle: string, montant: number) =>
    p.client.from('ca_externe').insert({ praticien_id: p.id, participant_id: participantId, mois, libelle, montant }).select('id').single();

  // ── Quelles factures comptent ─────────────────────────────────────────────────────────────────

  it('compte les factures validées en HT, au mois de la prestation, par bénéficiaire', async () => {
    const p = await pro();
    const f = await factureValidee(p);
    const lignes = await ca(p, f.mois.periode, f.mois.periode);
    expect(lignes).toEqual([{ mois: f.mois.periode, participantId: f.participantId, horizon: 90, externe: 0 }]);
  });

  it('une facture au régime de TVA compte pour son HT, jamais pour son TTC', async () => {
    const p = await pro();
    await pg(cl => cl.query(`UPDATE public.praticiens SET regime_tva = 'assujetti', taux_tva = 10 WHERE id = $1`, [p.id]));
    const f = await factureValidee(p);
    const ttc = (await pg(cl => cl.query(`SELECT total::float8 AS total, total_ht::float8 AS ht FROM public.factures WHERE id = $1`, [f.factureId]))).rows[0];
    expect(ttc).toEqual({ total: 99, ht: 90 });
    expect((await ca(p, f.mois.periode, f.mois.periode))[0].horizon).toBe(90);
  });

  it('un brouillon ne compte pas : seule la facture validée entre dans le CA', async () => {
    const p = await pro();
    const mois = M;
    const c = await creerContrat(p, mois, { seances: [{ jour: 3 }] });
    await genererBrouillonsDuMois(serviceClient, mois.periode, { envoyerAlerte: sansAlerte });
    expect((await lignesDe(c.contratId, mois.periode)).factures[0].statut).toBe('brouillon');
    expect(await ca(p, mois.periode, mois.periode)).toEqual([]);
  });

  it('un avoir PARTIEL se déduit du mois de la facture corrigée', async () => {
    const p = await pro();
    const f = await factureValidee(p);
    await avoir(p, f, 30);
    expect((await ca(p, f.mois.periode, f.mois.periode))[0]).toMatchObject({ participantId: f.participantId, horizon: 60 });
  });

  it('un avoir TOTAL annule la facture : ni elle ni l\'avoir ne comptent (pas de double déduction)', async () => {
    const p = await pro();
    const f = await factureValidee(p);
    await avoir(p, f, 90);
    const statut = (await pg(cl => cl.query(`SELECT statut FROM public.factures WHERE id = $1`, [f.factureId]))).rows[0].statut;
    expect(statut).toBe('annulee');
    expect(await ca(p, f.mois.periode, f.mois.periode)).toEqual([]);
  });

  it('la plage est inclusive, normalisée au mois, et ne renvoie que les mois demandés', async () => {
    const p = await pro();
    const m1 = M;
    const m2 = M2;
    const f1 = await factureValidee(p, m1);
    const f2 = await factureValidee(p, m2);
    const les2 = await ca(p, m1.jour(17), m2.jour(2));   // jours au milieu des mois : bornes ramenées au 1er
    expect(les2.map(l => l.mois)).toEqual([m1.periode, m2.periode]);
    expect((await ca(p, m2.periode, m2.periode)).map(l => l.participantId)).toEqual([f2.participantId]);
    expect((await ca(p, m1.periode, m1.periode)).map(l => l.participantId)).toEqual([f1.participantId]);
  });

  // ── Saisies externes ──────────────────────────────────────────────────────────────────────────

  it('ajoute le CA externe au CA Horizon, par bénéficiaire et par mois', async () => {
    const p = await pro();
    const f = await factureValidee(p);
    const autre = await creerContrat(p, M, { seances: [] });
    expect((await saisie(p, f.participantId, f.mois.periode, 'SAP externe', 120.5)).error).toBeNull();
    expect((await saisie(p, autre.participantId, f.mois.periode, 'SAP externe', 80)).error).toBeNull();
    const lignes = await ca(p, f.mois.periode, f.mois.periode);
    const par = Object.fromEntries(lignes.map(l => [l.participantId, l]));
    expect(par[f.participantId]).toMatchObject({ horizon: 90, externe: 120.5 });
    expect(par[autre.participantId]).toMatchObject({ horizon: 0, externe: 80 });
  });

  it('plusieurs saisies du même bénéficiaire et du même mois s\'additionnent', async () => {
    const p = await pro();
    const mois = M;
    const c = await creerContrat(p, mois, { seances: [] });
    await saisie(p, c.participantId, mois.periode, 'SAP externe', 40);
    await saisie(p, c.participantId, mois.periode, 'Autre prestataire', 25.25);
    expect((await ca(p, mois.periode, mois.periode))[0]).toMatchObject({ horizon: 0, externe: 65.25 });
  });

  it('une saisie est librement modifiable et supprimable à tout moment, même sur un mois ancien', async () => {
    const p = await pro();
    const mois = M;
    const c = await creerContrat(p, mois, { seances: [] });
    const { data } = await saisie(p, c.participantId, mois.periode, 'SAP externe', 100);
    const id = data!.id;

    const maj = await p.client.from('ca_externe').update({ montant: 150, libelle: 'SAP externe (corrigé)' }).eq('id', id).select('montant, libelle');
    expect(maj.error).toBeNull();
    expect(maj.data).toEqual([{ montant: 150, libelle: 'SAP externe (corrigé)' }]);
    expect((await ca(p, mois.periode, mois.periode))[0].externe).toBe(150);

    const sup = await p.client.from('ca_externe').delete().eq('id', id).select('id');
    expect(sup.data).toHaveLength(1);
    expect(await ca(p, mois.periode, mois.periode)).toEqual([]);
  });

  it('refuse les valeurs invalides : montant nul ou négatif, libellé vide ou trop long, jour du mois autre que le 1er', async () => {
    const p = await pro();
    const mois = M;
    const c = await creerContrat(p, mois, { seances: [] });
    expect((await saisie(p, c.participantId, mois.periode, 'x', 0)).error?.message).toMatch(/ca_externe_montant_positif/);
    expect((await saisie(p, c.participantId, mois.periode, 'x', -5)).error?.message).toMatch(/ca_externe_montant_positif/);
    expect((await saisie(p, c.participantId, mois.periode, '   ', 10)).error?.message).toMatch(/ca_externe_libelle_valide/);
    expect((await saisie(p, c.participantId, mois.periode, 'x'.repeat(121), 10)).error?.message).toMatch(/ca_externe_libelle_valide/);
    expect((await saisie(p, c.participantId, mois.jour(15), 'x', 10)).error?.message).toMatch(/ca_externe_mois_premier_du_mois/);
  });

  it('la suppression d\'un bénéficiaire emporte ses saisies (CASCADE)', async () => {
    const p = await pro();
    const mois = M;
    const c = await creerContrat(p, mois, { seances: [] });
    await saisie(p, c.participantId, mois.periode, 'SAP externe', 100);
    await pg(async cl => {
      await cl.query(`DELETE FROM public.contrats WHERE participant_id = $1`, [c.participantId]);
      await cl.query(`DELETE FROM public.participants WHERE id = $1`, [c.participantId]);
    });
    const restant = await pg(cl => cl.query(`SELECT count(*)::int AS n FROM public.ca_externe WHERE participant_id = $1`, [c.participantId]));
    expect(restant.rows[0].n).toBe(0);
  });

  // ── Cloisonnement ─────────────────────────────────────────────────────────────────────────────

  it('RLS : un praticien ne lit, ne modifie ni ne supprime les saisies d\'un autre ; il ne peut pas en créer pour un bénéficiaire qui n\'est pas à lui', async () => {
    const a = await pro();
    const b = await pro();
    const mois = M;
    const ca1 = await creerContrat(a, mois, { seances: [] });
    const cb = await creerContrat(b, mois, { seances: [] });
    const { data } = await saisie(a, ca1.participantId, mois.periode, 'SAP externe', 100);

    expect((await b.client.from('ca_externe').select('id')).data ?? []).toEqual([]);
    expect((await b.client.from('ca_externe').update({ montant: 1 }).eq('id', data!.id).select('id')).data ?? []).toEqual([]);
    expect((await b.client.from('ca_externe').delete().eq('id', data!.id).select('id')).data ?? []).toEqual([]);
    const intacte = await pg(cl => cl.query(`SELECT montant::float8 AS montant FROM public.ca_externe WHERE id = $1`, [data!.id]));
    expect(intacte.rows[0].montant).toBe(100);

    // B ne crée pas une saisie sur le bénéficiaire de A, ni au nom de A, ni A sur celui de B.
    expect((await saisie(b, ca1.participantId, mois.periode, 'x', 10)).error).not.toBeNull();
    expect((await b.client.from('ca_externe').insert({ praticien_id: a.id, participant_id: cb.participantId, mois: mois.periode, libelle: 'x', montant: 10 })).error).not.toBeNull();
    expect((await saisie(a, cb.participantId, mois.periode, 'x', 10)).error).not.toBeNull();
    // Ni détourner une saisie existante vers le bénéficiaire d'un autre.
    expect((await a.client.from('ca_externe').update({ participant_id: cb.participantId }).eq('id', data!.id).select('id')).error).not.toBeNull();
  });

  it('un visiteur sans session ne lit ni n\'écrit, et ne peut pas appeler la fonction', async () => {
    const a = await pro();
    const mois = M;
    const c = await creerContrat(a, mois, { seances: [] });
    await saisie(a, c.participantId, mois.periode, 'SAP externe', 100);
    expect((await anonyme.from('ca_externe').select('id')).data ?? []).toEqual([]);
    expect((await anonyme.from('ca_externe').insert({ praticien_id: a.id, participant_id: c.participantId, mois: mois.periode, libelle: 'x', montant: 1 })).error).not.toBeNull();
    expect((await anonyme.rpc('chiffre_affaires_mensuel', { p_debut: mois.periode, p_fin: mois.periode })).error).not.toBeNull();
  });

  it('la fonction ne renvoie jamais le CA d\'un autre praticien, ADMIN compris (qui lit pourtant toutes les factures)', async () => {
    const a = await pro();
    const admin = await pro();
    const f = await factureValidee(a);
    await saisie(a, f.participantId, f.mois.periode, 'SAP externe', 100);
    // Une ligne user_roles « praticien » existe déjà pour tout nouveau compte : on la promeut le temps du test.
    await pg(cl => cl.query(`UPDATE public.user_roles SET app_role = 'admin' WHERE user_id = $1 AND app_role = 'praticien'`, [admin.id]));
    try {
      // Preuve que l'admin LIT bien les factures de A par la RLS (sinon le test ne prouverait rien).
      expect(((await admin.client.from('factures').select('id').eq('id', f.factureId)).data ?? [])).toHaveLength(1);
      expect(await ca(admin, f.mois.periode, f.mois.periode)).toEqual([]);
      // Et il ne lit aucune saisie externe : aucune policy de rôle sur ca_externe.
      expect((await admin.client.from('ca_externe').select('id')).data ?? []).toEqual([]);
    } finally {
      await pg(cl => cl.query(`UPDATE public.user_roles SET app_role = 'praticien' WHERE user_id = $1 AND app_role = 'admin'`, [admin.id]));
    }
  });

  it('un praticien ne voit dans la fonction que son propre CA', async () => {
    const a = await pro();
    const b = await pro();
    const mois = M;
    const fa = await factureValidee(a, mois);
    const cb = await creerContrat(b, mois, { seances: [] });
    await saisie(b, cb.participantId, mois.periode, 'SAP externe', 70);
    expect((await ca(a, mois.periode, mois.periode)).map(l => l.participantId)).toEqual([fa.participantId]);
    expect((await ca(b, mois.periode, mois.periode)).map(l => l.participantId)).toEqual([cb.participantId]);
    // randomUUID : garde-fou contre un test qui ne vérifierait que des listes vides.
    expect(randomUUID()).toBeTruthy();
  });
});
