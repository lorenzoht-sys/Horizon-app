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

import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { Client } from 'pg';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { describe, it, expect, vi } from 'vitest';
import { executerFacturationMensuelle, genererBrouillonsDuMois } from '../../api/_lib/facturationMensuelle.js';
import { lireBrouillon, SELECT_BROUILLON, SELECT_PROFIL, lireProfil, profilFacturationManquant } from '../../src/lib/facturesAValider.js';

const DB_URL = process.env.FACTURATION_TEST_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const API_URL = process.env.FACTURATION_TEST_API_URL ?? 'http://127.0.0.1:54321';
const EST_LOCAL = [DB_URL, API_URL].every(u => ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(new URL(u).hostname));

/** Clés de la pile locale : variables d'environnement, sinon `supabase status` (jamais écrites). */
function clesLocales(): { service: string; anon: string } | null {
  const service = process.env.FACTURATION_TEST_SERVICE_KEY;
  const anon = process.env.FACTURATION_TEST_ANON_KEY;
  if (service && anon) return { service, anon };
  try {
    const sortie = execFileSync('supabase', ['status', '-o', 'env'], { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] });
    const lire = (nom: string) => new RegExp(`^${nom}="?([^"\\n]+)"?$`, 'm').exec(sortie)?.[1];
    const s = lire('SERVICE_ROLE_KEY'); const a = lire('ANON_KEY');
    return s && a ? { service: s, anon: a } : null;
  } catch {
    return null;
  }
}

async function pileDisponible(): Promise<boolean> {
  if (!EST_LOCAL) {
    console.warn('[tests/db] facturation-cron : hôte refusé, ces tests ne tournent que sur une pile locale.');
    return false;
  }
  if (!clesLocales()) {
    console.warn('[tests/db] facturation-cron : clés locales introuvables (supabase start, ou FACTURATION_TEST_*_KEY) : suite ignorée.');
    return false;
  }
  const c = new Client({ connectionString: DB_URL, connectionTimeoutMillis: 2000 });
  try {
    await c.connect();
    const { rows } = await c.query(`SELECT to_regproc('public.generer_brouillon_facture') AS f, to_regproc('public.contrat_eligible_credit_impot') AS e`);
    if (!rows[0].f) return false;
    const r = await fetch(`${API_URL}/auth/v1/health`, { signal: AbortSignal.timeout(2000) });
    return r.ok || r.status === 401;
  } catch {
    console.warn('[tests/db] facturation-cron : pile locale injoignable : suite ignorée (supabase start && supabase db reset).');
    return false;
  } finally {
    await c.end().catch(() => {});
  }
}

const DISPONIBLE = await pileDisponible();
const decrire = describe.skipIf(!DISPONIBLE);

// ── Fixtures ──────────────────────────────────────────────────────────────────────────────────

const ANNEE = 2005 + Math.floor(Math.random() * 20);
let indexMois = 0;
/** Un mois propre à chaque test : les contrats d'un test ne recouvrent jamais le mois d'un autre. */
function moisDuTest(): { periode: string; debut: string; fin: string; jour: (j: number) => string } {
  const m = String(++indexMois).padStart(2, '0');
  const dernier = new Date(ANNEE, indexMois, 0).getDate();
  return { periode: `${ANNEE}-${m}-01`, debut: `${ANNEE}-${m}-01`, fin: `${ANNEE}-${m}-${dernier}`, jour: j => `${ANNEE}-${m}-${String(j).padStart(2, '0')}` };
}

const MOT_DE_PASSE = `Test-${randomUUID()}`;

interface Praticien { id: string; email: string; client: SupabaseClient }

async function pg<T>(fn: (c: Client) => Promise<T>): Promise<T> {
  const c = new Client({ connectionString: DB_URL });
  await c.connect();
  try { return await fn(c); } finally { await c.end(); }
}

/** Vrai praticien : compte GoTrue avec mot de passe, profil de facturation complet, session ouverte. */
async function creerPraticien(service: SupabaseClient, anonKey: string, profilComplet = true): Promise<Praticien> {
  const email = `cron-${randomUUID()}@fact.test`;
  const { data, error } = await service.auth.admin.createUser({ email, password: MOT_DE_PASSE, email_confirm: true });
  if (error || !data.user) throw new Error(`createUser : ${error?.message}`);
  const id = data.user.id;
  await pg(c => c.query(
    `INSERT INTO public.praticiens (id, nom, prenom, email, siret, adresse_rue, adresse_code_postal, adresse_ville, regime_tva, delai_paiement_jours)
     VALUES ($1, 'PratCron', 'Alex', $2, $3, '1 rue Test', '00000', 'Villetest', $4, 30)`,
    [id, email, profilComplet ? '00000000000018' : null, profilComplet ? 'franchise_293B' : null],
  ));
  const client = createClient(API_URL, anonKey, { auth: { persistSession: false, autoRefreshToken: false }, realtime: { transport: class {} as unknown as typeof WebSocket } });
  const { error: errConnexion } = await client.auth.signInWithPassword({ email, password: MOT_DE_PASSE });
  if (errConnexion) throw new Error(`connexion : ${errConnexion.message}`);
  return { id, email, client };
}

interface Contrat { participantId: string; contratId: string; seanceIds: string[] }

/** Contrat à la séance (tarif 45 €) du mois donné, avec une séance réalisée par date fournie. */
async function creerContrat(
  pro: Praticien, mois: ReturnType<typeof moisDuTest>,
  opts: { seances?: { jour: number; statut?: string }[]; tarif?: boolean; adresse?: boolean } = {},
): Promise<Contrat> {
  const participantId = randomUUID();
  const contratId = randomUUID();
  const seanceIds: string[] = [];
  await pg(async c => {
    await c.query(
      `INSERT INTO public.participants (id, praticien_id, nom, prenom, adresse_rue, adresse_code_postal, adresse_ville, rgpd)
       VALUES ($1, $2, 'BenefCron', 'Alice', $3, $4, $5, '{"consentementObtenu": true}'::jsonb)`,
      [participantId, pro.id, opts.adresse === false ? null : '10 rue Test', opts.adresse === false ? null : '00000', opts.adresse === false ? null : 'Villetest'],
    );
    await c.query(
      `INSERT INTO public.contrats (id, participant_id, praticien_id, date_debut, date_fin, duree_indeterminee, statut, jours_fixe)
       VALUES ($1, $2, $3, $4, $5, false, 'actif', ARRAY['lun'])`,
      [contratId, participantId, pro.id, mois.debut, mois.fin],
    );
    if (opts.tarif !== false) {
      await c.query(`INSERT INTO public.tarifs_contrats (contrat_id, tarif_seance, date_debut_validite) VALUES ($1, 45, $2)`, [contratId, mois.debut]);
    }
    for (const s of opts.seances ?? []) {
      const id = randomUUID();
      await c.query(
        `INSERT INTO public.seances (id, participant_id, praticien_id, contrat_id, date, heure_debut, heure_fin, duree_minutes, type, statut)
         VALUES ($1, $2, $3, $4, $5, '10:00', '10:45', 45, 'seance', $6)`,
        [id, participantId, pro.id, contratId, mois.jour(s.jour), s.statut ?? 'realisee'],
      );
      seanceIds.push(id);
    }
  });
  return { participantId, contratId, seanceIds };
}

async function lignesDe(contratId: string, periode: string) {
  return pg(async c => {
    const f = await c.query(`SELECT id, statut, total::float8 AS total, total_ht::float8 AS ht, circuit, numero FROM public.factures WHERE contrat_id = $1 AND periode = $2`, [contratId, periode]);
    const l = f.rows[0]
      ? await c.query(`SELECT libelle, montant::float8 AS montant FROM public.lignes_facture WHERE facture_id = $1 ORDER BY libelle`, [f.rows[0].id])
      : { rows: [] };
    return { factures: f.rows as { id: string; statut: string; total: number; ht: number; circuit: string; numero: string | null }[], lignes: l.rows as { libelle: string; montant: number }[] };
  });
}

const sansAlerte = async () => ({ nbEnvoyes: 0, nbEchecs: 0 });

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

  it('relancer la génération ne duplique rien, ne réécrit rien et ne notifie pas une seconde fois', async () => {
    const mois = moisDuTest();
    const pro = await creerPraticien(serviceClient, anon);
    const c = await creerContrat(pro, mois, { seances: [{ jour: 3 }, { jour: 10 }] });
    const alerte = vi.fn(sansAlerte);

    await genererBrouillonsDuMois(serviceClient, mois.periode, { envoyerAlerte: alerte });
    const premier = await lignesDe(c.contratId, mois.periode);
    expect(premier.factures).toHaveLength(1);
    const appelsPourCePraticien = () => alerte.mock.calls.filter(a => a[1] === pro.id);
    expect(appelsPourCePraticien()).toHaveLength(1);
    expect(appelsPourCePraticien()[0][2]).toMatchObject({ corps: expect.stringMatching(/^1 facture à valider pour /), url: '/factures/a-valider' });

    // Une séance de plus devient « réalisée » après la génération : une relance ne doit PAS réécrire le brouillon.
    await pg(c2 => c2.query(
      `INSERT INTO public.seances (participant_id, praticien_id, contrat_id, date, heure_debut, heure_fin, duree_minutes, type, statut)
       VALUES ($1, $2, $3, $4, '15:00', '15:45', 45, 'seance', 'realisee')`, [c.participantId, pro.id, c.contratId, mois.jour(25)]));
    const second = await genererBrouillonsDuMois(serviceClient, mois.periode, { envoyerAlerte: alerte });

    const apres = await lignesDe(c.contratId, mois.periode);
    expect(apres.factures).toHaveLength(1);
    expect(apres.factures[0].id).toBe(premier.factures[0].id);
    expect(apres.lignes).toEqual(premier.lignes);                  // brouillon intact : la 3e séance n'y est pas entrée
    expect(second.dejaExistants).toBeGreaterThanOrEqual(1);
    expect(appelsPourCePraticien()).toHaveLength(1);               // aucune notification de plus
  });

  it('le cron manqué le 1er génère les brouillons au passage suivant, une seule fois (base réelle)', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const mois = moisDuTest();
    const pro = await creerPraticien(serviceClient, anon);
    const c = await creerContrat(pro, mois, { seances: [{ jour: 3 }, { jour: 10 }] });
    const alerte = vi.fn(sansAlerte);
    const [a, m] = mois.periode.split('-').map(Number);
    const jourSuivant = (j: number) => new Date(Date.UTC(a, m, j, 5, 15));   // le mois d'après, à 05h15 UTC

    expect((await lignesDe(c.contratId, mois.periode)).factures).toHaveLength(0);   // le 1er : rien n'a tourné
    const bilan3 = await executerFacturationMensuelle(serviceClient, jourSuivant(3), { envoyerAlerte: alerte });
    expect(bilan3.mois).toBe(mois.periode.slice(0, 7));
    const premier = await lignesDe(c.contratId, mois.periode);
    expect(premier.factures).toHaveLength(1);
    expect(premier.factures[0]).toMatchObject({ statut: 'brouillon', total: 90 });

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

  it('notifie chaque praticien avec le nombre de ses propres brouillons créés', async () => {
    const mois = moisDuTest();
    const a = await creerPraticien(serviceClient, anon);
    const b = await creerPraticien(serviceClient, anon);
    await creerContrat(a, mois, { seances: [{ jour: 3 }] });
    await creerContrat(a, mois, { seances: [{ jour: 4 }] });
    await creerContrat(b, mois, { seances: [{ jour: 5 }] });
    const alerte = vi.fn(sansAlerte);
    await genererBrouillonsDuMois(serviceClient, mois.periode, { envoyerAlerte: alerte });
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
