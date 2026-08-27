// scripts/run-harnais-local.mjs
//
// Lance le harnais de sécurité (tests/security/rls.spec.ts) en local, contre
// le projet Supabase de STAGING.
//
// ── Pourquoi ce script existe ────────────────────────────────────────────
// `tests/security/rls.spec.ts` lit uniquement `process.env` : en CI, les
// secrets sont injectés par le workflow, mais rien ne charge
// `.env.test.local` en local. Sans ce lanceur, il faut poser huit variables
// à la main avant chaque exécution — et le harnais finit par ne plus jamais
// être lancé en local, ce qui est exactement ce qui s'est produit.
//
// Le fichier `.env.test.local` est lu par un parseur Node, JAMAIS par
// `source` en bash : il contient le mot de passe Postgres de staging, et une
// ligne mal échappée peut le faire fuiter dans un message d'erreur du shell.
//
// ── Le mot de passe praticien n'est PAS dans ce fichier ──────────────────
// `E2E_PRATICIEN_PASSWORD` présent dans `.env.test.local` est périmé : la
// valeur qui fonctionne n'existe que dans le shell de l'opérateur, posée à
// la main avant chaque run (voir docs/PLAN-BETA.md, « Chantiers annexes »).
// Toute variable déjà présente dans l'environnement a la priorité sur le
// fichier — c'est ce qui permet de la surcharger :
//
//   PowerShell :  $env:E2E_PRATICIEN_PASSWORD = "<valeur>"
//                 npm run test:security
//
//   bash :        E2E_PRATICIEN_PASSWORD="<valeur>" npm run test:security
//
// Sans elle, les tests praticien sont ignorés — et un skip n'est pas un
// succès (voir scripts/verifier-resultat-harnais.mjs).
//
// Usage :
//   npm run test:security               (toute la suite)
//   npm run test:security -- "F-01"     (filtre sur un nom de test)

import { readFileSync } from 'fs';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Résolu depuis l'emplacement du script, jamais codé en dur : deux scripts
// de ce dossier portent déjà un chemin absolu vers le scratchpad d'une
// session terminée, et y écrivent dans le vide (voir docs/PLAN-BETA.md).
const projet = path.resolve(__dirname, '..');
const envPath = path.join(projet, '.env.test.local');

function loadEnvFile(filePath) {
  const out = {};
  let content;
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

const env = { ...process.env };
for (const [key, value] of Object.entries(loadEnvFile(envPath))) {
  // L'environnement l'emporte sur le fichier : c'est ce qui permet de
  // surcharger une valeur périmée sans éditer le fichier.
  if (!(key in env)) env[key] = value;
}

// Non-secrets : déjà en clair dans les logs CI publics (`vars.*`, pas
// `secrets.*`). Valeurs par défaut du seed de staging.
env.E2E_PRATICIEN_EMAIL ??= 'staging.praticien@example.com';
env.E2E_STRUCTURE_TOKEN ??= 'staging-token-demo-0001';

if (!env.E2E_PRATICIEN_PASSWORD) {
  console.error(
    'E2E_PRATICIEN_PASSWORD absent : les tests praticien seront IGNORÉS.\n' +
      'Pose-le dans ton shell avant de lancer — voir l\'en-tête de ce fichier.'
  );
}

const filtre = process.argv[2];
const args = ['vitest', 'run', 'tests/security/rls.spec.ts', '--reporter=verbose'];
if (filtre) args.push('-t', filtre);

spawn('npx', args, { cwd: projet, env, stdio: 'inherit', shell: true })
  .on('exit', code => process.exit(code ?? 1));
