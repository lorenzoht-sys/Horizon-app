// scripts/staging-push-github-secrets.ts
//
// Pose automatiquement, via `gh secret set`, les secrets GitHub Actions
// dont la valeur est déjà connue :
//
//   - 5 lues depuis .env.test.local (même canal que STAGING_DATABASE_URL
//     utilisé par scripts/staging-reseed.ts et les scripts précédents) :
//       SUPABASE_TEST_URL, SUPABASE_TEST_ANON_KEY,
//       SUPABASE_TEST_SERVICE_ROLE_KEY, PATIENT_SESSION_SECRET,
//       STAGING_DATABASE_URL
//
//   - 1 lue depuis process.env.E2E_PRATICIEN_PASSWORD_VALUE — À POSER DANS
//     TON SHELL JUSTE AVANT DE LANCER CE SCRIPT, jamais dans un fichier
//     (la valeur actuelle du compte staging.praticien@example.com n'est
//     connue que de toi, voir la discussion du point 3) : E2E_PRATICIEN_PASSWORD
//
// Aucune valeur n'est jamais affichée, loguée, ni renvoyée par ce script —
// chaque valeur est transmise à `gh secret set` via STDIN (jamais en
// argument de ligne de commande, pour ne pas apparaître dans une liste de
// processus), et les éventuels messages d'erreur de `gh` (stderr) ne
// contiennent jamais la valeur elle-même, seulement le nom du secret et la
// raison de l'échec.
//
// Usage (PowerShell) :
//   $env:E2E_PRATICIEN_PASSWORD_VALUE = "<mot de passe actuel ou réinitialisé>"
//   npx tsx scripts/staging-push-github-secrets.ts
//
// Les 5 autres valeurs sont lues automatiquement depuis .env.test.local,
// rien d'autre à faire pour elles.

import { readFileSync } from 'fs';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SECRETS_FROM_ENV_FILE = [
  'SUPABASE_TEST_URL',
  'SUPABASE_TEST_ANON_KEY',
  'SUPABASE_TEST_SERVICE_ROLE_KEY',
  'PATIENT_SESSION_SECRET',
  'STAGING_DATABASE_URL',
] as const;

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

interface SetResult {
  name: string;
  status: 'posé' | 'absent' | 'échec';
  detail?: string;
}

// La valeur est transmise via stdin (option `input`), jamais dans argv :
// ne peut donc apparaître ni dans la liste des processus, ni dans un
// message d'erreur Node (spawnSync ne throw pas et ne recompose jamais la
// commande avec ses arguments dans un message — contrairement à
// exec/execFileSync qu'on évite ici précisément pour cette raison).
function setGithubSecret(name: string, value: string): SetResult {
  const result = spawnSync('gh', ['secret', 'set', name], {
    input: value,
    stdio: ['pipe', 'pipe', 'pipe'],
    encoding: 'utf-8',
  });
  if (result.error) {
    return { name, status: 'échec', detail: result.error.message };
  }
  if (result.status !== 0) {
    const firstLine = (result.stderr || '').trim().split('\n')[0] || `code de sortie ${result.status}`;
    return { name, status: 'échec', detail: firstLine };
  }
  return { name, status: 'posé' };
}

function main() {
  const envPath = path.resolve(__dirname, '../.env.test.local');
  const parsed = loadEnvFile(envPath);

  const results: SetResult[] = [];

  for (const name of SECRETS_FROM_ENV_FILE) {
    const value = parsed[name];
    if (!value) {
      results.push({ name, status: 'absent', detail: `clé introuvable dans ${envPath}` });
      continue;
    }
    results.push(setGithubSecret(name, value));
  }

  const praticienPassword = process.env.E2E_PRATICIEN_PASSWORD_VALUE;
  if (!praticienPassword) {
    results.push({
      name: 'E2E_PRATICIEN_PASSWORD',
      status: 'absent',
      detail: '$env:E2E_PRATICIEN_PASSWORD_VALUE non défini dans ce shell',
    });
  } else {
    results.push(setGithubSecret('E2E_PRATICIEN_PASSWORD', praticienPassword));
  }

  console.log('--- Résultat (aucune valeur affichée) ---');
  for (const r of results) {
    const suffix = r.detail ? ` — ${r.detail}` : '';
    console.log(`  ${r.name.padEnd(32)} ${r.status}${suffix}`);
  }

  const failed = results.filter(r => r.status !== 'posé');
  if (failed.length > 0) {
    console.log(`\n${failed.length} secret(s) non posé(s) — voir le détail ci-dessus.`);
    process.exit(1);
  }
  console.log('\nTous les secrets ont été posés avec succès.');
}

main();
