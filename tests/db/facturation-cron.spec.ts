// tests/db/facturation-cron.spec.ts
//
// Génération mensuelle + écran « Factures à valider » (facturation, étape 3), de bout en bout
// contre une VRAIE pile Supabase locale : Postgres, PostgREST et GoTrue. C'est ce que la
// tâche cron et l'écran font réellement :
//   - la tâche appelle generer_brouillon_facture par RPC avec la clé service_role ;
//   - l'écran lit avec les requêtes de src/lib/facturesAValider.ts (SELECT_BROUILLON…) et valide
//     par supabase.rpc('valider_facture'), avec le JETON DE CONNEXION d'un praticien, sous la RLS.
// Les tests unitaires (api/_lib/facturationMensuelle.test.ts) couvrent la logique de la tâche ;
// ici, on prouve qu'elle marche contre la vraie base (noms de paramètres du RPC, droits de
// service_role, relations embarquées, cloisonnement entre praticiens).
//
// ⚠️ BASE LOCALE UNIQUEMENT, comme tests/db/facturation.spec.ts : tout autre hôte est refusé.
//
//   supabase start && supabase db reset
//   npm run test:db
//
// Les praticiens, contrats et factures créés ici sont COMMITÉS (PostgREST utilise ses propres
// connexions, une transaction annulée ne serait pas visible) et une facture validée est
// inaltérable : ils restent dans la base locale jusqu'au prochain `supabase db reset`. Chaque run
// crée de nouveaux praticiens et choisit une année aléatoire, pour ne jamais dépendre d'un run
// précédent.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { describe, it, expect, vi } from 'vitest';
import { executerFacturationMensuelle, genererBrouillonsDuMois } from '../../api/_lib/facturationMensuelle.js';
import { lireBrouillon, SELECT_BROUILLON, SELECT_PROFIL, lireProfil, profilFacturationManquant } from '../../src/lib/facturesAValider.js';
import { clesLocales, API_URL, creerContrat, creerPraticien, lignesDe, moisDuTest, pg, pileDisponible, sansAlerte } from './fixtures-facturation.js';

const DISPONIBLE = await pileDisponible();
const decrire = describe.skipIf(!DISPONIBLE);

// ── Tests ─────────────────────────────────────────────────────────────────────────────────────

decrire('Génération mensuelle contre la vraie base (RPC service_role via PostgREST)', () => {
  const { service, anon } = clesLocales()!;
  const serviceClient = createClient(API_URL, service, { auth: { persistSession: false }, realtime: { transport: class {} as unknown as typeof WebSocket } });

  it('un contrat avec des séances réalisées du mois produit un brouillon correct ; sans séance, rien', async () => {
    const mois = moisDuTest();
    const pro = await creerPraticien(serviceClient, anon);
    const avec = await creerContrat(pro, mois, { seances: [{ jour: 3 }, { jour: 10 }, { jour: 17 }, { jour: 20, statut: 'annulee' }, { jour: 24, statut: 'planifiee' }] });
    const sans = await creerContrat(pro, mois, { seances: [{ jour: 5, statut: 'annulee' }] });

    const bilan = await genererBrouillonsDuMois(serviceClient, mois.periode, { envoyerAlerte: sansAlerte });
    expect(bilan.erreurs.filter(e => [avec.contratId, sans.contratId].includes(e.contratId))).toEqual([]);

    const a = await lignesDe(avec.contratId, mois.periode);
    expect(a.factures).toHaveLength(1);
    expect(a.factures[0]).toMatchObject({ statut: 'brouillon', circuit: 'classique', ht: 135, total: 135, numero: null });   // 3 séances réalisées × 45 €
    expect(a.lignes.map(l => l.montant)).toEqual([45, 45, 45]);
    expect((await lignesDe(sans.contratId, mois.periode)).factures).toHaveLength(0);
  });

  it('relancer la génération ne duplique rien, recalcule le brouillon progressif et ne notifie pas une seconde fois', async () => {
    const mois = moisDuTest();
    const pro = await creerPraticien(serviceClient, anon);
    const c = await creerContrat(pro, mois, { seances: [{ jour: 3 }, { jour: 10 }] });
    const alerte = vi.fn(sansAlerte);
    const appelsPourCePraticien = () => alerte.mock.calls.filter(a => a[1] === pro.id);

    // Facture progressive : le brouillon existe DÉJÀ, construit par le trigger à la saisie des séances.
    const avantCron = await lignesDe(c.contratId, mois.periode);
    expect(avantCron.factures).toHaveLength(1);
    expect(avantCron.factures[0]).toMatchObject({ statut: 'brouillon', total: 90 });

    // Une séance de plus devient « réalisée » : le trigger l'ajoute tout de suite au MÊME brouillon.
    await pg(c2 => c2.query(
      `INSERT INTO public.seances (participant_id, praticien_id, contrat_id, date, heure_debut, heure_fin, duree_minutes, type, statut)
       VALUES ($1, $2, $3, $4, '15:00', '15:45', 45, 'seance', 'realisee')`, [c.participantId, pro.id, c.contratId, mois.jour(25)]));
    const progressif = await lignesDe(c.contratId, mois.periode);
    expect(progressif.factures.map(f => f.id)).toEqual([avantCron.factures[0].id]);
    expect(progressif.factures[0].total).toBe(135);
    expect(progressif.lignes).toHaveLength(3);

    // Le cron recalcule ce brouillon sans le dupliquer ; hors du 1er du mois, il ne notifie pas.
    const bilan = await genererBrouillonsDuMois(serviceClient, mois.periode, { envoyerAlerte: alerte });
    expect(bilan.brouillonsRecalcules).toBeGreaterThanOrEqual(1);
    const apres = await lignesDe(c.contratId, mois.periode);
    expect(apres.factures.map(f => f.id)).toEqual([avantCron.factures[0].id]);
    expect(apres.lignes).toEqual(progressif.lignes);
    expect(appelsPourCePraticien()).toHaveLength(0);

    // Le 1er du mois (le mois devient validable), il notifie une fois pour ce brouillon existant.
    await genererBrouillonsDuMois(serviceClient, mois.periode, { envoyerAlerte: alerte, notifierBrouillonsExistants: true });
    expect(appelsPourCePraticien()).toHaveLength(1);
    expect(appelsPourCePraticien()[0][2]).toMatchObject({ corps: expect.stringMatching(/^1 facture à valider pour /), url: '/factures/a-valider' });
  });

  it('filet de sécurité : des séances qui ont contourné le trigger (import en masse) → le cron crée le brouillon, une seule fois (base réelle)', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const mois = moisDuTest();
    const pro = await creerPraticien(serviceClient, anon);
    const c = await creerContrat(pro, mois, { seances: [] });
    // `session_replication_role = replica` désactive les triggers utilisateur le temps de la session : c'est
    // ce que fait un import en masse, et le cas que le cron du 1er est là pour rattraper.
    await pg(async cl => {
      await cl.query(`SET session_replication_role = replica`);
      for (const j of [3, 10]) {
        await cl.query(
          `INSERT INTO public.seances (participant_id, praticien_id, contrat_id, date, heure_debut, heure_fin, duree_minutes, type, statut)
           VALUES ($1, $2, $3, $4, '10:00', '10:45', 45, 'seance', 'realisee')`, [c.participantId, pro.id, c.contratId, mois.jour(j)]);
      }
    });
    expect((await lignesDe(c.contratId, mois.periode)).factures).toHaveLength(0);   // le trigger n'a pas tourné

    const alerte = vi.fn(sansAlerte);
    const [a, m] = mois.periode.split('-').map(Number);
    const jourSuivant = (j: number) => new Date(Date.UTC(a, m, j, 5, 15));   // le mois d'après, à 05h15 UTC

    const bilan3 = await executerFacturationMensuelle(serviceClient, jourSuivant(3), { envoyerAlerte: alerte });
    expect(bilan3.mois).toBe(mois.periode.slice(0, 7));
    const premier = await lignesDe(c.contratId, mois.periode);
    expect(premier.factures).toHaveLength(1);
    expect(premier.factures[0]).toMatchObject({ statut: 'brouillon', total: 90 });
    expect(alerte.mock.calls.filter(x => x[1] === pro.id)).toHaveLength(1);        // créé par le cron : notifié

    for (const j of [4, 15, 28]) await executerFacturationMensuelle(serviceClient, jourSuivant(j), { envoyerAlerte: alerte });
    const apres = await lignesDe(c.contratId, mois.periode);
    expect(apres.factures.map(f => f.id)).toEqual([premier.factures[0].id]);       // toujours un seul brouillon, le même
    expect(apres.lignes).toEqual(premier.lignes);
    expect(alerte.mock.calls.filter(x => x[1] === pro.id)).toHaveLength(1);        // une seule notification
  });

  it('un contrat en échec (séance sans tarif) n\'empêche pas les autres, et l\'erreur reste visible', async () => {
    const mois = moisDuTest();
    const pro = await creerPraticien(serviceClient, anon);
    const sansTarif = await creerContrat(pro, mois, { seances: [{ jour: 4 }], tarif: false });
    const bon = await creerContrat(pro, mois, { seances: [{ jour: 6 }] });

    const bilan = await genererBrouillonsDuMois(serviceClient, mois.periode, { envoyerAlerte: sansAlerte });
    expect(bilan.erreurs).toContainEqual({ contratId: sansTarif.contratId, erreur: expect.stringContaining('Aucun tarif applicable') });
    expect((await lignesDe(sansTarif.contratId, mois.periode)).factures).toHaveLength(0);
    expect((await lignesDe(bon.contratId, mois.periode)).factures).toHaveLength(1);
  });

  it('le 1er du mois, notifie chaque praticien avec le nombre de ses propres brouillons', async () => {
    const mois = moisDuTest();
    const a = await creerPraticien(serviceClient, anon);
    const b = await creerPraticien(serviceClient, anon);
    await creerContrat(a, mois, { seances: [{ jour: 3 }] });
    await creerContrat(a, mois, { seances: [{ jour: 4 }] });
    await creerContrat(b, mois, { seances: [{ jour: 5 }] });
    const alerte = vi.fn(sansAlerte);
    await genererBrouillonsDuMois(serviceClient, mois.periode, { envoyerAlerte: alerte, notifierBrouillonsExistants: true });
    const corps = (id: string) => alerte.mock.calls.filter(c => c[1] === id).map(c => c[2].corps);
    expect(corps(a.id)).toEqual([expect.stringMatching(/^2 factures à valider pour /)]);
    expect(corps(b.id)).toEqual([expect.stringMatching(/^1 facture à valider pour /)]);
  });
});

decrire('Écran « Factures à valider » : lecture et validation avec le jeton d\'un praticien, sous la RLS', () => {
  const { service, anon } = clesLocales()!;
  const serviceClient = createClient(API_URL, service, { auth: { persistSession: false }, realtime: { transport: class {} as unknown as typeof WebSocket } });

  async function dispositif() {
    const mois = moisDuTest();
    const a = await creerPraticien(serviceClient, anon);
    const b = await creerPraticien(serviceClient, anon);
    const ca = await creerContrat(a, mois, { seances: [{ jour: 3 }, { jour: 10 }] });
    const cb = await creerContrat(b, mois, { seances: [{ jour: 7 }] });
    await genererBrouillonsDuMois(serviceClient, mois.periode, { envoyerAlerte: sansAlerte });
    const da = (await lignesDe(ca.contratId, mois.periode)).factures[0].id;
    const db = (await lignesDe(cb.contratId, mois.periode)).factures[0].id;
    return { mois, a, b, ca, cb, da, db };
  }
  const lireEcran = async (client: SupabaseClient) => {
    const { data, error } = await client.from('factures').select(SELECT_BROUILLON).eq('statut', 'brouillon').eq('type', 'facture');
    expect(error).toBeNull();
    return ((data ?? []) as unknown as Record<string, unknown>[]).map(lireBrouillon);
  };

  it('chaque praticien ne voit que SES brouillons, avec lignes, bénéficiaire et séances embarqués', async () => {
    const { mois, a, b, da, db } = await dispositif();
    const vuesA = (await lireEcran(a.client)).filter(f => f.periode === mois.periode);
    const vuesB = (await lireEcran(b.client)).filter(f => f.periode === mois.periode);
    expect(vuesA.map(f => f.id)).toEqual([da]);
    expect(vuesB.map(f => f.id)).toEqual([db]);
    // Ce que l'écran affiche, tel que PostgREST le renvoie réellement.
    expect(vuesA[0]).toMatchObject({ circuit: 'classique', totalHt: 90, montantTva: 0, total: 90, beneficiaire: { prenom: 'Alice', nom: 'BenefCron', adresseVille: 'Villetest' } });
    expect(vuesA[0].lignes.map(l => [l.seanceDate, l.montant, l.libelle.startsWith('Séance du')])).toEqual([
      [mois.jour(3), 45, true], [mois.jour(10), 45, true],
    ]);
    // Un visiteur sans session ne lit rien.
    const anonyme = createClient(API_URL, anon, { auth: { persistSession: false }, realtime: { transport: class {} as unknown as typeof WebSocket } });
    const { data, error } = await anonyme.from('factures').select(SELECT_BROUILLON).eq('statut', 'brouillon');
    expect(error?.code ?? 'aucune erreur').toBe('42501');
    expect(data ?? []).toHaveLength(0);
  });

  it('valider : le brouillon devient une facture numérotée et verrouillée', async () => {
    const { mois, a, ca, da } = await dispositif();
    const { data: numero, error } = await a.client.rpc('valider_facture', { p_facture_id: da });
    expect(error).toBeNull();
    expect(numero).toMatch(/^\d{4}-\d{4}$/);

    const f = (await lignesDe(ca.contratId, mois.periode)).factures[0];
    expect(f).toMatchObject({ id: da, statut: 'validee', numero });
    // Il quitte la liste « à valider » et se retrouve dans les factures validées.
    expect((await lireEcran(a.client)).map(x => x.id)).not.toContain(da);
    const { data: validees } = await a.client.from('factures').select('id, numero, statut').neq('statut', 'brouillon');
    expect(validees).toContainEqual({ id: da, numero, statut: 'validee' });
    // Verrouillée : ni modification ni suppression, même par son propre praticien.
    const modif = await a.client.from('factures').update({ total: 1, part_client: 1 }).eq('id', da);
    expect(modif.error?.message).toMatch(/validée : seuls statut et pdf_path/);
    const suppr = await a.client.from('factures').delete().eq('id', da);
    expect(suppr.error?.message).toMatch(/non supprimable/);
    // Valider deux fois est refusé.
    const encore = await a.client.rpc('valider_facture', { p_facture_id: da });
    expect(encore.error?.message).toMatch(/déjà validée/);
  });

  it('le brouillon d\'un autre praticien n\'est ni visible ni validable', async () => {
    const { mois, a, cb, db } = await dispositif();
    const { data: lecture } = await a.client.from('factures').select('id').eq('id', db);
    expect(lecture).toEqual([]);                                   // invisible sous la RLS

    const { error } = await a.client.rpc('valider_facture', { p_facture_id: db });
    expect(error?.message).toMatch(/Accès refusé/);                // le serveur refuse, même en connaissant l'identifiant
    const f = (await lignesDe(cb.contratId, mois.periode)).factures[0];
    expect(f).toMatchObject({ id: db, statut: 'brouillon', numero: null });
  });

  it('valider en série : numéros consécutifs sans trou, dans l\'ordre', async () => {
    const mois = moisDuTest();
    const a = await creerPraticien(serviceClient, anon);
    const contrats = [await creerContrat(a, mois, { seances: [{ jour: 3 }] }), await creerContrat(a, mois, { seances: [{ jour: 4 }] }), await creerContrat(a, mois, { seances: [{ jour: 5 }] })];
    await genererBrouillonsDuMois(serviceClient, mois.periode, { envoyerAlerte: sansAlerte });
    const ids = await Promise.all(contrats.map(async c => (await lignesDe(c.contratId, mois.periode)).factures[0].id));
    const numeros: string[] = [];
    for (const id of ids) {
      const { data, error } = await a.client.rpc('valider_facture', { p_facture_id: id });
      expect(error).toBeNull();
      numeros.push(String(data));
    }
    const n = numeros.map(x => Number(x.split('-')[1]));
    expect(n).toEqual([n[0], n[0] + 1, n[0] + 2]);
    expect(n[0]).toBe(1);                                          // praticien neuf : la série commence à 0001
  });

  it('profil incomplet ou adresse du bénéficiaire manquante : validation refusée avec un message exploitable, brouillon intact', async () => {
    const mois = moisDuTest();
    const incomplet = await creerPraticien(serviceClient, anon, false);          // ni SIRET ni régime de TVA
    const c1 = await creerContrat(incomplet, mois, { seances: [{ jour: 3 }] });
    const complet = await creerPraticien(serviceClient, anon);
    const c2 = await creerContrat(complet, mois, { seances: [{ jour: 3 }], adresse: false });   // bénéficiaire sans adresse
    await genererBrouillonsDuMois(serviceClient, mois.periode, { envoyerAlerte: sansAlerte });

    const f1 = (await lignesDe(c1.contratId, mois.periode)).factures[0].id;
    const r1 = await incomplet.client.rpc('valider_facture', { p_facture_id: f1 });
    expect(r1.error?.message).toMatch(/^Profil de facturation incomplet : siret, regime_tva/);
    // Même constat côté écran, AVANT le clic : le profil lu par l'écran signale les mêmes manques.
    const { data: profilBrut } = await incomplet.client.from('praticiens').select(SELECT_PROFIL).eq('id', incomplet.id).maybeSingle();
    expect(profilFacturationManquant(lireProfil(profilBrut as Record<string, unknown>))).toEqual(['SIRET', 'régime de TVA']);

    const f2 = (await lignesDe(c2.contratId, mois.periode)).factures[0].id;
    const r2 = await complet.client.rpc('valider_facture', { p_facture_id: f2 });
    expect(r2.error?.message).toMatch(/^Adresse du bénéficiaire incomplète \(mention obligatoire\) : rue, code postal, ville/);
    expect((await lignesDe(c1.contratId, mois.periode)).factures[0].statut).toBe('brouillon');
    expect((await lignesDe(c2.contratId, mois.periode)).factures[0].statut).toBe('brouillon');
  });
});
