// scripts/staging-apply-securite-lot1.ts
//
// Étape 1, lot 1 : supprime les policies RLS fantômes TO anon —
// programme_seances / programme_planning / programme_exercices (F-05,
// 20260817_securite_02_ghost_policies_programmes.sql) et
// documents_partages (F-10, volet policy fantôme,
// 20260817_securite_06_ghost_policy_documents_partages.sql). Extraits de
// audit-securite-global, jamais exécutés sur un environnement réel jusqu'ici.
//
// Même patron garde-fou que scripts/staging-apply-grant-parity.ts :
// connexion via STAGING_DATABASE_URL (.env.test.local, jamais affichée),
// garde-fou anti-prod, lecture seule par défaut, --apply explicite,
// revérification post-application.
//
// Usage :
//   npx tsx scripts/staging-apply-securite-lot1.ts            (lecture seule)
//   npx tsx scripts/staging-apply-securite-lot1.ts --apply    (applique si nécessaire)

import { Client } from 'pg';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const STAGING_REF = 'nnfkchhtjrferxnwlcxp';
const PRODUCTION_REF = 'rjgzeuywwknubpwigozq';

const MIGRATION_FILES = [
  '20260817_securite_02_ghost_policies_programmes.sql',
  '20260817_securite_06_ghost_policy_documents_partages.sql',
];

const TABLES_TO_CHECK = ['programme_seances', 'programme_planning', 'programme_exercices', 'documents_partages'];

function loadEnvFile(filePath: string): Record<string, string> {
  const out: Record<string, string> = {};
  let content: string;
  try {
    content = readFileSync(filePath, 'utf-8');
  } catch {
    return out;
  }
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function assertStagingTarget(connectionString: string): void {
  let host: string;
  let user: string;
  try {
    const url = new URL(connectionString);
    host = url.hostname;
    user = decodeURIComponent(url.username);
  } catch {
    throw new Error('STAGING_DATABASE_URL n\'est pas une URL de connexion valide.');
  }
  const candidates = [host, user];
  if (candidates.some(c => c.includes(PRODUCTION_REF))) {
    throw new Error('Garde-fou : cette connexion pointe vers la référence de projet PRODUCTION. Abandon.');
  }
  if (!candidates.some(c => c.includes(STAGING_REF))) {
    throw new Error('Garde-fou : impossible de confirmer que cette connexion pointe vers staging (réf. de projet non reconnue). Abandon.');
  }
}

interface GhostPolicy {
  tablename: string;
  policyname: string;
}

async function checkGhostPolicies(client: Client): Promise<GhostPolicy[]> {
  const { rows } = await client.query<GhostPolicy>(
    `SELECT tablename, policyname FROM pg_policies
     WHERE schemaname = 'public' AND tablename = ANY($1) AND 'anon' = ANY(roles)
     ORDER BY tablename, policyname`,
    [TABLES_TO_CHECK]
  );
  return rows;
}

async function applyMigrations(client: Client): Promise<void> {
  await client.query('BEGIN');
  try {
    for (const file of MIGRATION_FILES) {
      const sql = readFileSync(path.resolve(__dirname, '../supabase/migrations/', file), 'utf-8');
      await client.query(sql);
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  }
}

function reportGhosts(label: string, ghosts: GhostPolicy[]): boolean {
  console.log(`--- ${label} ---`);
  if (ghosts.length === 0) {
    console.log('  Aucune policy TO anon fantôme sur les 4 tables surveillées.');
  } else {
    for (const g of ghosts) {
      console.log(`  ⚠ ${g.tablename}.${g.policyname} — TO anon toujours présente`);
    }
  }
  return ghosts.length === 0;
}

async function main() {
  const applyMode = process.argv.includes('--apply');

  const envPath = path.resolve(__dirname, '../.env.test.local');
  const parsed = loadEnvFile(envPath);
  for (const [key, value] of Object.entries(parsed)) {
    if (!(key in process.env)) process.env[key] = value;
  }

  const connectionString = process.env.STAGING_DATABASE_URL;
  if (!connectionString) {
    throw new Error(`STAGING_DATABASE_URL introuvable (ni dans ${envPath}, ni dans l'environnement).`);
  }
  assertStagingTarget(connectionString);

  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();

  try {
    if (!applyMode) {
      await client.query('SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY');
      const clean = reportGhosts('État actuel sur staging', await checkGhostPolicies(client));
      console.log(
        clean
          ? '\nRien à corriger : aucune policy fantôme détectée.'
          : '\nPolicy(ies) fantôme(s) confirmée(s). Relancer avec --apply pour appliquer le lot 1.'
      );
      return;
    }

    const beforeClean = reportGhosts('État avant application', await checkGhostPolicies(client));
    if (beforeClean) {
      console.log('\nRien à faire : déjà propre, aucune action effectuée.');
      return;
    }

    console.log('\nApplication du lot 1 (securite_02 + securite_06)...');
    await applyMigrations(client);

    const afterClean = reportGhosts('État après application', await checkGhostPolicies(client));
    if (!afterClean) {
      throw new Error('Le lot a été appliqué mais des policies fantômes subsistent — à investiguer manuellement.');
    }
    console.log('\nLot 1 appliqué avec succès.');
  } finally {
    await client.end();
  }
}

main().catch(err => {
  console.error('Erreur :', err instanceof Error ? err.message : err);
  process.exit(1);
});
