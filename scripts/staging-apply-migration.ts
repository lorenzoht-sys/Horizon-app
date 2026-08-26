// scripts/staging-apply-migration.ts
//
// Applique un ou plusieurs fichiers de migration sur staging, dans une
// transaction unique. Même garde-fou anti-prod que les scripts précédents.
// Générique (étape 1, lots 2-7) : le fichier est passé en argument, pas de
// vérification métier intégrée (chaque lot a sa propre méthode de
// vérification, voir le rapport de chaque application).
//
// Usage :
//   npx tsx scripts/staging-apply-migration.ts --apply <fichier1.sql> [<fichier2.sql> ...]

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

async function main() {
  const args = process.argv.slice(2);
  const applyMode = args.includes('--apply');
  const files = args.filter(a => a !== '--apply');
  if (files.length === 0) {
    throw new Error('Usage: staging-apply-migration.ts --apply <fichier1.sql> [<fichier2.sql> ...]');
  }
  if (!applyMode) {
    throw new Error('Ce script applique toujours pour de vrai — --apply est obligatoire (pas de mode lecture seule ici, la vérification se fait après coup par requête ciblée).');
  }

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
      for (const file of files) {
        const filePath = path.resolve(__dirname, '../supabase/migrations/', file);
        console.log(`Application de ${file}...`);
        const sql = readFileSync(filePath, 'utf-8');
        await client.query(sql);
      }
      await client.query('COMMIT');
      console.log('Transaction validée avec succès.');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    }
  } finally {
    await client.end();
  }
}

main().catch(err => {
  console.error('Erreur :', err instanceof Error ? err.message : err);
  process.exit(1);
});
