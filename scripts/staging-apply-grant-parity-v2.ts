// scripts/staging-apply-grant-parity-v2.ts
//
// Vérifie l'état des GRANT sur les 14 tables du deuxième lot (révélées par
// la comparaison intégrale de l'étape E) sur staging par rapport à
// production et, si demandé explicitement (--apply), rejoue UNIQUEMENT
// supabase/migrations/20260822_grant_parity_staging_v2.sql pour corriger. Ne
// touche à rien d'autre. Même mécanisme que
// scripts/staging-apply-grant-parity.ts (premier lot, 6 tables).
//
// Connexion : process.env.STAGING_DATABASE_URL, chargée depuis
// .env.test.local. La valeur n'est jamais affichée ni loggée — seule sa
// présence/absence et un garde-fou sur la réf. de projet (staging vs
// production) sont vérifiés.
//
// Usage :
//   npx tsx scripts/staging-apply-grant-parity-v2.ts            (lecture seule, rapporte l'état)
//   npx tsx scripts/staging-apply-grant-parity-v2.ts --apply     (corrige si nécessaire)

import { Client } from 'pg';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const STAGING_REF = 'nnfkchhtjrferxnwlcxp';
const PRODUCTION_REF = 'rjgzeuywwknubpwigozq';

const TABLES = [
  'documents_partages',
  'documents_patient',
  'dossier_exercice_membres',
  'dossiers_exercices',
  'evenements_agenda',
  'exercices_personnalises',
  'organisation_demande_attempts',
  'organisation_invitations',
  'organisation_membres',
  'organisations',
  'programme_modele_exercices',
  'programme_modele_planning',
  'programme_modele_seances',
  'programmes_modeles',
] as const;

const ROLES = ['authenticated', 'service_role'] as const;

const EXPECTED_PRIVILEGES = ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] as const;

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

// Garde-fou : n'exécute rien si la chaîne de connexion ne désigne pas
// clairement staging (par host pour une DATABASE_URL directe, par user pour
// une connexion pooler — voir scripts/dump-schema.ts pour le même principe).
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

interface GrantGap {
  table: string;
  grantee: string;
  missing: string[];
}

async function checkGrants(client: Client): Promise<GrantGap[]> {
  const { rows } = await client.query<{ table_name: string; grantee: string; privilege_type: string }>(
    `SELECT table_name, grantee, privilege_type
     FROM information_schema.role_table_grants
     WHERE table_schema = 'public'
       AND table_name = ANY($1)
       AND grantee = ANY($2)`,
    [TABLES, ROLES]
  );

  const held = new Map<string, Set<string>>();
  for (const r of rows) {
    const key = `${r.table_name}|${r.grantee}`;
    if (!held.has(key)) held.set(key, new Set());
    held.get(key)!.add(r.privilege_type);
  }

  const gaps: GrantGap[] = [];
  for (const table of TABLES) {
    for (const grantee of ROLES) {
      const heldSet = held.get(`${table}|${grantee}`) ?? new Set();
      const missing = EXPECTED_PRIVILEGES.filter(p => !heldSet.has(p));
      if (missing.length > 0) gaps.push({ table, grantee, missing });
    }
  }
  return gaps;
}

async function applyMigration(client: Client): Promise<void> {
  const migrationPath = path.resolve(__dirname, '../supabase/migrations/20260822_grant_parity_staging_v2.sql');
  const sql = readFileSync(migrationPath, 'utf-8');

  await client.query('BEGIN');
  try {
    await client.query(sql);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  }
}

function reportState(label: string, gaps: GrantGap[]): boolean {
  console.log(`--- ${label} ---`);
  if (gaps.length === 0) {
    console.log('  GRANT : conformes à la production sur les 14 tables (authenticated + service_role).');
  } else {
    console.log('  GRANT manquants :');
    for (const g of gaps) {
      console.log(`    - ${g.table} / ${g.grantee} : manque ${g.missing.join(', ')}`);
    }
  }
  return gaps.length === 0;
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
    }

    const beforeOk = reportState('État actuel sur staging', await checkGrants(client));

    if (!applyMode) {
      console.log(
        beforeOk
          ? '\nRien à corriger : déjà conforme à la production.'
          : '\nÉcart(s) confirmé(s). Relancer avec --apply pour rejouer 20260822_grant_parity_staging_v2.sql seule.'
      );
      return;
    }

    if (beforeOk) {
      console.log('\nRien à faire : déjà conforme, aucune action effectuée.');
      return;
    }

    console.log('\nApplication de supabase/migrations/20260822_grant_parity_staging_v2.sql...');
    await applyMigration(client);

    const afterOk = reportState('État après correctif', await checkGrants(client));
    if (!afterOk) {
      throw new Error('Le correctif a été appliqué mais la vérification post-correctif échoue toujours — à investiguer manuellement.');
    }
    console.log('\nCorrigé avec succès.');
  } finally {
    await client.end();
  }
}

main().catch(err => {
  console.error('Erreur :', err instanceof Error ? err.message : err);
  process.exit(1);
});
