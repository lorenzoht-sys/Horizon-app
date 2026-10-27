// tests/db/fuite-facturation.spec.ts
//
// Lot M sécurité HDS (2026-10-27) : un praticien B peut-il faire entrer un
// objet d'un praticien A (bénéficiaire, contrat, séance, tarif, facture) dans
// SA facturation — et qu'en voit-il ? Par les fonctions de facturation
// RÉELLES (génération du cron en service_role, trigger de brouillon
// progressif, valider_facture, creer_avoir), contre une pile Supabase LOCALE.
//
// Les tests qui constatent une fuite sont listés dans FUITES_CONSTATEES et
// passent en `it.fails` (verts tant que la fuite existe, rouges le jour où
// elle est corrigée — retirer alors l'entrée). Chaque fuite documente CE QUI
// APPARAÎT réellement côté B : c'est ce qui en fait la gravité.
//
// ⚠️ BASE LOCALE UNIQUEMENT (pileDisponible refuse tout autre hôte).
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { describe, it, expect } from 'vitest';
import { clesLocales, API_URL, creerContrat, creerPraticien, moisDuTest, pg, pileDisponible, type Praticien } from './fixtures-facturation.js';

const DISPONIBLE = await pileDisponible();
const decrire = describe.skipIf(!DISPONIBLE);

// Constat du 2026-10-27 sur la base locale (schéma de main) : H1, H2, H3 et
// H3b en fuite ; H4 (avoirs) rassurant. H1, H3 et H3b sont fermées par la
// migration 20261106100000_facturation_appartenance.sql de ce lot.
export const FUITES_CONSTATEES: Record<string, string> = {
  // FUITE CONSTATÉE — fermée par le lot K1 (#168, seances.contrat_id), pas
  // par ce lot : le test redevient normal quand K1 est dans la branche.
  'seance-sur-contrat-de-A': "seances.contrat_id non vérifié — la séance de B entre dans la facture de A (fermé par K1, #168)",
};

type Ligne = Record<string, any>;
const q = async (sql: string, params: unknown[] = []) => (await pg(c => c.query(sql, params))).rows as Ligne[];

decrire('Facturation : objets d\'un autre praticien (lot M)', () => {
  const { service, anon } = clesLocales() ?? { service: 'absente', anon: 'absente' };
  const serviceClient = createClient(API_URL, service, { auth: { persistSession: false }, realtime: { transport: class {} as unknown as typeof WebSocket } });

  // A et B créés UNE fois pour tout le fichier : chaque création ouvre une session GoTrue, et la
  // pile locale limite les connexions à 30 par 5 minutes (supabase/config.toml), partagées par
  // tous les fichiers de tests/db. Chaque test garde son propre mois et ses propres contrats.
  let praticiens: Promise<{ A: Praticien; B: Praticien }> | null = null;
  const lesPraticiens = () => (praticiens ??= (async () => ({
    A: await creerPraticien(serviceClient, anon, true),
    B: await creerPraticien(serviceClient, anon, true),
  }))());

  /** A (avec un bénéficiaire fictif à l'identité reconnaissable, un contrat, une séance réalisée) et B. */
  async function deuxPraticiens() {
    const M = moisDuTest();
    const { A, B } = await lesPraticiens();
    const ctA = await creerContrat(A, M, { seances: [{ jour: 3 }] });
    await q(`UPDATE public.participants SET nom = 'E2E-NomDeA', prenom = 'E2E-PrenomDeA', email = 'e2e-benef-a@exemple.invalid' WHERE id = $1`, [ctA.participantId]);
    return { M, A, B, ctA };
  }

  const fuite = (cle: string) => FUITES_CONSTATEES[cle];
  const test = (cle: string) => (fuite(cle) ? it.fails : it);
  const titre = (cle: string, t: string) => `${t}${fuite(cle) ? ` — FUITE CONSTATÉE : ${fuite(cle)}` : ''}`;

  // ── H1 : contrat de B sur le bénéficiaire de A → facture de B au nom de ce bénéficiaire ──
  test('contrat-beneficiaire-de-A')(titre('contrat-beneficiaire-de-A',
    'B ne peut pas émettre une facture portant l\'identité du bénéficiaire de A'), async () => {
    const { M, B, ctA } = await deuxPraticiens();
    // Forfait : aucun tarif nécessaire (la RLS de tarifs_contrats aurait refusé un tarif à B).
    const contratB = randomUUID();
    await B.client.from('contrats').insert({
      id: contratB, praticien_id: B.id, participant_id: ctA.participantId, date_debut: M.debut, date_fin: M.fin,
      statut: 'actif', mode_facturation: 'forfait', montant_forfait: 100,
    });
    // Génération du brouillon par l'appel EXACT du cron (genererBrouillonsDuMois → RPC
    // generer_brouillon_facture en service_role), limitée à ce contrat : la génération de tout le
    // mois interférait avec les autres fichiers de tests/db (interblocage observé le 2026-10-27).
    await serviceClient.rpc('generer_brouillon_facture', { p_contrat_id: contratB, p_periode: M.periode });
    const [brouillon] = await q(`SELECT id FROM public.factures WHERE contrat_id = $1 AND type = 'facture'`, [contratB]);
    if (brouillon) await B.client.rpc('valider_facture', { p_facture_id: brouillon.id });
    // Ce que B LIT de sa propre facture, par l'API, avec sa session.
    const { data: lu } = await B.client.from('factures').select('numero, snapshot_destinataire').eq('contrat_id', contratB);
    const texte = JSON.stringify(lu ?? []);
    expect(texte, `B lit sur sa facture l'identité du bénéficiaire de A : ${texte}`).not.toMatch(/E2E-NomDeA|E2E-PrenomDeA|e2e-benef-a@|10 rue Test/);
  });

  // ── H2 : séance de B rattachée au contrat de A → entre dans le brouillon de A ──
  test('seance-sur-contrat-de-A')(titre('seance-sur-contrat-de-A',
    'une séance de B rattachée au contrat de A n\'entre pas dans la facture de A'), async () => {
    const { M, A, B, ctA } = await deuxPraticiens();
    const ctB = await creerContrat(B, M, {});
    const avant = await q(`SELECT count(*)::int AS n FROM public.lignes_facture l JOIN public.factures f ON f.id = l.facture_id WHERE f.contrat_id = $1`, [ctA.contratId]);
    await B.client.from('seances').insert({
      praticien_id: B.id, participant_id: ctB.participantId, contrat_id: ctA.contratId, date: M.jour(12),
      heure_debut: '10:00', heure_fin: '10:45', duree_minutes: 45, type: 'seance', statut: 'realisee',
    });
    const apres = await q(`SELECT count(*)::int AS n FROM public.lignes_facture l JOIN public.factures f ON f.id = l.facture_id WHERE f.contrat_id = $1`, [ctA.contratId]);
    expect(apres[0].n, 'le brouillon de A a pris une ligne pour la séance de B').toBe(avant[0].n);
    void A;
  });

  // ── H3 : ligne de facture de B pointant la séance de A → la séance sort de la facture de A ──
  test('ligne-seance-de-A')(titre('ligne-seance-de-A',
    'B ne peut pas rattacher la séance de A à sa propre facture'), async () => {
    const { M, B, ctA } = await deuxPraticiens();
    const ctB = await creerContrat(B, M, { seances: [{ jour: 4 }] });
    const [fB] = await q(`SELECT id FROM public.factures WHERE contrat_id = $1 AND type = 'facture'`, [ctB.contratId]);
    await B.client.from('lignes_facture').insert({ facture_id: fB.id, seance_id: ctA.seanceIds[0], libelle: 'E2E', quantite: 1, prix_unitaire: 1, montant: 1 });
    const volees = await q(`SELECT count(*)::int AS n FROM public.lignes_facture WHERE facture_id = $1 AND seance_id = $2`, [fB.id, ctA.seanceIds[0]]);
    // Conséquence attendue d'une telle ligne : A recalcule son mois et perd sa séance.
    await serviceClient.rpc('generer_brouillon_facture', { p_contrat_id: ctA.contratId, p_periode: M.periode });
    const chezA = await q(`SELECT count(*)::int AS n FROM public.lignes_facture l JOIN public.factures f ON f.id = l.facture_id WHERE f.contrat_id = $1 AND l.seance_id = $2`, [ctA.contratId, ctA.seanceIds[0]]);
    expect(volees[0].n, 'B a rattaché la séance de A à sa facture').toBe(0);
    expect(chezA[0].n, 'la séance de A a disparu de la facture de A').toBe(1);
  });

  // ── H3b : ligne de facture de B pointant le tarif de A → le tarif de A devient intouchable ──
  test('ligne-tarif-de-A')(titre('ligne-tarif-de-A',
    'B ne peut pas rattacher le tarif de A à sa propre facture'), async () => {
    const { M, A, B, ctA } = await deuxPraticiens();
    const ctB = await creerContrat(B, M, { seances: [{ jour: 4 }] });
    const [fB] = await q(`SELECT id FROM public.factures WHERE contrat_id = $1 AND type = 'facture'`, [ctB.contratId]);
    const [tA] = await q(`SELECT id FROM public.tarifs_contrats WHERE contrat_id = $1`, [ctA.contratId]);
    await B.client.from('lignes_facture').insert({ facture_id: fB.id, tarif_contrat_id: tA.id, libelle: 'E2E', quantite: 1, prix_unitaire: 1, montant: 1 });
    const n = await q(`SELECT count(*)::int AS n FROM public.lignes_facture WHERE facture_id = $1 AND tarif_contrat_id = $2`, [fB.id, tA.id]);
    expect(n[0].n, 'B a rattaché le tarif de A à sa facture').toBe(0);
    void A;
  });

  // ── H4 : avoir de B sur la facture de A ──
  it('B ne peut pas créer d\'avoir sur la facture de A (creer_avoir) — point rassurant attendu', async () => {
    const { A, B, ctA } = await deuxPraticiens();
    const [fA] = await q(`SELECT id FROM public.factures WHERE contrat_id = $1 AND type = 'facture'`, [ctA.contratId]);
    expect((await A.client.rpc('valider_facture', { p_facture_id: fA.id })).error).toBeNull();
    const r = await B.client.rpc('creer_avoir', { p_facture_id: fA.id, p_lignes: [], p_geste: 1, p_motif: 'E2E', p_total_attendu: 1 });
    expect(r.error, 'creer_avoir aurait dû refuser').not.toBeNull();
    expect((await q(`SELECT count(*)::int AS n FROM public.factures WHERE facture_origine_id = $1`, [fA.id]))[0].n).toBe(0);
  });

  test('avoir-direct-sur-facture-de-A')(titre('avoir-direct-sur-facture-de-A',
    'B ne peut pas insérer directement un avoir rattaché à la facture de A'), async () => {
    const { M, A, B, ctA } = await deuxPraticiens();
    const [fA] = await q(`SELECT id FROM public.factures WHERE contrat_id = $1 AND type = 'facture'`, [ctA.contratId]);
    expect((await A.client.rpc('valider_facture', { p_facture_id: fA.id })).error).toBeNull();
    const ctB = await creerContrat(B, M, {});
    await B.client.from('factures').insert({
      praticien_id: B.id, contrat_id: ctB.contratId, participant_id: ctB.participantId, periode: M.periode,
      type: 'avoir', facture_origine_id: fA.id, circuit: 'classique', motif: 'E2E',
    });
    const n = await q(`SELECT count(*)::int AS n FROM public.factures WHERE facture_origine_id = $1`, [fA.id]);
    expect(n[0].n, 'B a rattaché un avoir à la facture de A').toBe(0);
  });

  // ── Usage légitime à préserver ──
  it('A émet et valide sa facture, puis crée un avoir sur SA facture (creer_avoir)', async () => {
    const { A, ctA } = await deuxPraticiens();
    const [fA] = await q(`SELECT id FROM public.factures WHERE contrat_id = $1 AND type = 'facture'`, [ctA.contratId]);
    expect((await A.client.rpc('valider_facture', { p_facture_id: fA.id })).error).toBeNull();
    const lignes = await q(`SELECT id, quantite::float8 AS quantite FROM public.lignes_facture WHERE facture_id = $1`, [fA.id]);
    const r = await A.client.rpc('creer_avoir', { p_facture_id: fA.id, p_lignes: lignes.map(l => ({ ligne_id: l.id, quantite: l.quantite })), p_geste: null, p_motif: 'E2E légitime', p_total_attendu: 45 });
    expect(r.error?.message ?? null).toBeNull();
    expect((await q(`SELECT statut FROM public.factures WHERE id = $1`, [fA.id]))[0].statut).toBe('annulee');
  });

  it('un bénéficiaire ARCHIVÉ reste facturable par son praticien (génération du cron)', async () => {
    const { M, A, ctA } = await deuxPraticiens();
    await q(`UPDATE public.participants SET archive = true WHERE id = $1`, [ctA.participantId]);
    const r = await serviceClient.rpc('generer_brouillon_facture', { p_contrat_id: ctA.contratId, p_periode: M.periode });
    expect(r.error?.message ?? null).toBeNull();
    const [f] = await q(`SELECT id, praticien_id FROM public.factures WHERE contrat_id = $1 AND type = 'facture'`, [ctA.contratId]);
    expect(f?.praticien_id).toBe(A.id);
    expect((await A.client.rpc('valider_facture', { p_facture_id: f.id })).error).toBeNull();
  });

  it('un membre d\'organisation facture un bénéficiaire de l\'organisation (accès partagé)', async () => {
    const { M, A, B } = await deuxPraticiens();
    const [org] = await q(`INSERT INTO public.organisations (nom, statut, actif) VALUES ('E2E org facturation', 'active', true) RETURNING id`);
    await q(`INSERT INTO public.organisation_membres (organisation_id, user_id, role, actif) VALUES ($1, $2, 'intervenant', true)`, [org.id, B.id]);
    const [p] = await q(
      `INSERT INTO public.participants (praticien_id, nom, prenom, adresse_rue, adresse_code_postal, adresse_ville, organisation_id, rgpd)
       VALUES ($1, 'E2E-Orga', 'E2E', '1 rue Orga', '00000', 'Villetest', $2, '{"consentementObtenu": true}'::jsonb) RETURNING id`, [A.id, org.id]);
    const [k] = await q(
      `INSERT INTO public.contrats (participant_id, praticien_id, date_debut, date_fin, duree_indeterminee, statut, mode_facturation, montant_forfait)
       VALUES ($1, $2, $3, $4, false, 'actif', 'forfait', 80) RETURNING id`, [p.id, B.id, M.debut, M.fin]);
    const r = await serviceClient.rpc('generer_brouillon_facture', { p_contrat_id: k.id, p_periode: M.periode });
    expect(r.error?.message ?? null, 'facturation légitime d\'un bénéficiaire de l\'organisation refusée').toBeNull();
    expect(await q(`SELECT 1 FROM public.factures WHERE contrat_id = $1 AND praticien_id = $2`, [k.id, B.id])).toHaveLength(1);
  });

  it('une facture validée reste immuable (contrainte d\'inaltérabilité intacte)', async () => {
    const { A, ctA } = await deuxPraticiens();
    const [fA] = await q(`SELECT id FROM public.factures WHERE contrat_id = $1 AND type = 'facture'`, [ctA.contratId]);
    expect((await A.client.rpc('valider_facture', { p_facture_id: fA.id })).error).toBeNull();
    const r = await A.client.from('factures').update({ total: 1 }).eq('id', fA.id);
    expect(r.error, 'une facture validée a pu être modifiée').not.toBeNull();
  });
});

export type { Praticien };
