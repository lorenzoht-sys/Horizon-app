// tests/db/fixtures-facturation.ts
//
// Fixtures communes aux tests de facturation contre la pile Supabase LOCALE
// (facturation-cron.spec.ts, facturation-profil.spec.ts) : praticiens réels avec session
// GoTrue, contrats, séances, lecture des factures. Extraites du test de l'étape 3 pour ne pas
// les dupliquer à l'étape 4.
//
// ⚠️ BASE LOCALE UNIQUEMENT : tout hôte autre que localhost est refusé (pileDisponible).

import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { Client } from 'pg';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { describe } from 'vitest';

export const DB_URL = process.env.FACTURATION_TEST_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
export const API_URL = process.env.FACTURATION_TEST_API_URL ?? 'http://127.0.0.1:54321';
const EST_LOCAL = [DB_URL, API_URL].every(u => ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(new URL(u).hostname));

/** Clés de la pile locale : variables d'environnement, sinon `supabase status` (jamais écrites). */
export function clesLocales(): { service: string; anon: string } | null {
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

export async function pileDisponible(): Promise<boolean> {
  if (!EST_LOCAL) {
    console.warn('[tests/db] facturation : hôte refusé, ces tests ne tournent que sur une pile locale.');
    return false;
  }
  if (!clesLocales()) {
    console.warn('[tests/db] facturation : clés locales introuvables (supabase start, ou FACTURATION_TEST_*_KEY) : suite ignorée.');
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
    console.warn('[tests/db] facturation : pile locale injoignable : suite ignorée (supabase start && supabase db reset).');
    return false;
  } finally {
    await c.end().catch(() => {});
  }
}


// ── Fixtures ──────────────────────────────────────────────────────────────────────────────────

export const ANNEE = 2005 + Math.floor(Math.random() * 20);
let indexMois = 0;
/** Un mois propre à chaque test : les contrats d'un test ne recouvrent jamais le mois d'un autre. */
export function moisDuTest(): { periode: string; debut: string; fin: string; jour: (j: number) => string } {
  const m = String(++indexMois).padStart(2, '0');
  const dernier = new Date(ANNEE, indexMois, 0).getDate();
  return { periode: `${ANNEE}-${m}-01`, debut: `${ANNEE}-${m}-01`, fin: `${ANNEE}-${m}-${dernier}`, jour: j => `${ANNEE}-${m}-${String(j).padStart(2, '0')}` };
}

export const MOT_DE_PASSE = `Test-${randomUUID()}`;

export interface Praticien { id: string; email: string; client: SupabaseClient }

export async function pg<T>(fn: (c: Client) => Promise<T>): Promise<T> {
  const c = new Client({ connectionString: DB_URL });
  await c.connect();
  try { return await fn(c); } finally { await c.end(); }
}

/** Vrai praticien : compte GoTrue avec mot de passe, profil de facturation complet, session ouverte. */
export async function creerPraticien(service: SupabaseClient, anonKey: string, profilComplet = true): Promise<Praticien> {
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

export interface Contrat { participantId: string; contratId: string; seanceIds: string[] }

/** Contrat à la séance (tarif 45 €) du mois donné, avec une séance réalisée par date fournie. */
export async function creerContrat(
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

export async function lignesDe(contratId: string, periode: string) {
  return pg(async c => {
    const f = await c.query(`SELECT id, statut, total::float8 AS total, total_ht::float8 AS ht, circuit, numero FROM public.factures WHERE contrat_id = $1 AND periode = $2`, [contratId, periode]);
    const l = f.rows[0]
      ? await c.query(`SELECT libelle, montant::float8 AS montant FROM public.lignes_facture WHERE facture_id = $1 ORDER BY libelle`, [f.rows[0].id])
      : { rows: [] };
    return { factures: f.rows as { id: string; statut: string; total: number; ht: number; circuit: string; numero: string | null }[], lignes: l.rows as { libelle: string; montant: number }[] };
  });
}

export const sansAlerte = async () => ({ nbEnvoyes: 0, nbEchecs: 0 });
