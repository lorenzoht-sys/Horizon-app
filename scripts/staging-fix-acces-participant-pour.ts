// scripts/staging-fix-acces-participant-pour.ts
//
// Vérifie l'état de public.acces_participant_pour() sur staging (JOIN
// organisations + condition o.statut = 'active', introduites par
// supabase/migrations/20260714_mode_organisation_statut_securite.sql) et,
// si demandé explicitement (--apply), rejoue UNIQUEMENT ce fichier de
// migration pour corriger la fonction. Ne touche à rien d'autre.
//
// Connexion : process.env.STAGING_DATABASE_URL, chargée depuis
// .env.test.local (même canal que le rejeu des 24 migrations de l'étape B).
// La valeur n'est jamais affichée ni loggée — seule sa présence/absence et
// un garde-fou sur la réf. de projet (staging vs production) sont vérifiés.
//
// Usage :
//   npx tsx scripts/staging-fix-acces-participant-pour.ts            (lecture seule, rapporte l'état)
//   npx tsx scripts/staging-fix-acces-participant-pour.ts --apply    (corrige si nécessaire)

import { Client } from 'pg';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const STAGING_REF = 'nnfkchhtjrferxnwlcxp';
const PRODUCTION_REF = 'rjgzeuywwknubpwigozq';

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

interface FunctionState {
  hasJoinOrganisations: boolean;
  hasStatutActifCheck: boolean;
}

async function checkAccesParticipantPour(client: Client): Promise<FunctionState> {
  const { rows } = await client.query<{ def: string }>(`
    SELECT pg_get_functiondef(p.oid) AS def
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'acces_participant_pour'
  `);
  if (rows.length === 0) {
    throw new Error('public.acces_participant_pour introuvable sur cette base.');
  }
  const def = rows[0].def;
  return {
    hasJoinOrganisations: /JOIN\s+organisations\s+o\s+ON\s+o\.id\s*=\s*m\.organisation_id/i.test(def),
    hasStatutActifCheck: /o\.statut\s*=\s*'active'/i.test(def),
  };
}

async function applyStatutSecurite(client: Client): Promise<void> {
  const migrationPath = path.resolve(
    __dirname,
    '../supabase/migrations/20260714_06_mode_organisation_statut_securite.sql'
  );
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

function reportState(label: string, state: FunctionState): boolean {
  console.log(`--- ${label} ---`);
  console.log(`  JOIN organisations o ON o.id = m.organisation_id : ${state.hasJoinOrganisations ? 'présent' : 'ABSENT'}`);
  console.log(`  AND o.statut = 'active'                          : ${state.hasStatutActifCheck ? 'présent' : 'ABSENT'}`);
  return state.hasJoinOrganisations && state.hasStatutActifCheck;
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
      // Filet de sécurité supplémentaire en mode lecture seule.
      await client.query('SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY');
    }

    const before = reportState('État actuel sur staging', await checkAccesParticipantPour(client));

    if (!applyMode) {
      console.log(
        before
          ? '\nRien à corriger : la version sécurisée est déjà en place.'
          : "\nVersion non sécurisée confirmée. Relancer avec --apply pour rejouer statut_securite.sql seule."
      );
      return;
    }

    if (before) {
      console.log('\nRien à faire : déjà corrigé, aucune action effectuée.');
      return;
    }

    console.log('\nApplication de supabase/migrations/20260714_mode_organisation_statut_securite.sql...');
    await applyStatutSecurite(client);

    const after = reportState('État après correctif', await checkAccesParticipantPour(client));
    if (!after) {
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
