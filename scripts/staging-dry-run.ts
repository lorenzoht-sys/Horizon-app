// scripts/staging-dry-run.ts
//
// Exécute du SQL sur staging dans une transaction TOUJOURS annulée
// (ROLLBACK systématique, y compris en cas de succès). Sert à observer le
// comportement réel d'une écriture — contrainte, trigger, action
// référentielle — sans laisser la moindre trace en base.
//
// Complète les deux scripts existants :
//   - staging-query.ts          lecture seule, ne peut rien tester en écriture
//   - staging-apply-migration.ts écrit et COMMIT, donc irréversible
//
// Même garde-fou anti-production que les autres scripts.
//
// Usage :
//   npx tsx scripts/staging-dry-run.ts "INSERT INTO ... ; SELECT ..."

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

function assertStagingTarget(connectionString: string): void {
  let host: string;
  let user: string;
  try {
    const url = new URL(connectionString);
    host = url.hostname;
    user = decodeURIComponent(url.username);
  } catch {
    throw new Error("STAGING_DATABASE_URL n'est pas une URL de connexion valide.");
  }
  const candidates = [host, user];
  if (candidates.some(c => c.includes(PRODUCTION_REF))) {
    throw new Error('Garde-fou : cette connexion pointe vers la référence de projet PRODUCTION. Abandon.');
  }
  if (!candidates.some(c => c.includes(STAGING_REF))) {
    throw new Error('Garde-fou : impossible de confirmer que cette connexion pointe vers staging (réf. de projet non reconnue). Abandon.');
  }
}

async function main() {
  const args = process.argv.slice(2);
  let sql: string | undefined;

  // --file : indispensable dès que le SQL contient du dollar-quoting
  // ($$, $fn$...). Passé en ligne de commande, le shell y voit des
  // variables à expanser et casse silencieusement le SQL.
  const fileIdx = args.indexOf('--file');
  if (fileIdx !== -1) {
    const filePath = args[fileIdx + 1];
    if (!filePath) throw new Error('--file attend un chemin de fichier.');
    sql = readFileSync(path.resolve(filePath), 'utf-8');
  } else {
    sql = args[0];
  }
  if (!sql) throw new Error('Usage: staging-dry-run.ts "<SQL>" | --file <chemin.sql>');

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
    await client.query('BEGIN');
    try {
      const result = await client.query(sql);
      const rows = Array.isArray(result) ? result[result.length - 1]?.rows : result.rows;
      console.log(JSON.stringify(rows ?? [], null, 2));
      console.log('\n(succès — transaction annulée, rien n\'a été conservé)');
    } catch (err) {
      console.log('SQL EN ÉCHEC :', err instanceof Error ? err.message : err);
      console.log('\n(échec — transaction annulée, rien n\'a été conservé)');
    } finally {
      // ROLLBACK inconditionnel : ce script ne doit JAMAIS rien persister,
      // même quand le SQL réussit.
      await client.query('ROLLBACK');
    }
  } finally {
    await client.end();
  }
}

main().catch(err => {
  console.error('Erreur :', err instanceof Error ? err.message : err);
  process.exit(1);
});
