// scripts/staging-reset-seances-du-jour.ts
//
// Supprime, sur STAGING, les séances patient enregistrées AUJOURD'HUI.
//
// POURQUOI CE SCRIPT EXISTE
// -------------------------
// `e2e/07-seance-coche-exercice.spec.ts` fait réaliser au patient de démo sa
// séance du jour et l'enregistre. Il existe un index unique
// `seances_patient_no_double_validation_idx` sur
// (participant_id, seance_id, date_seance) : la ligne créée par un run
// occupe donc la journée, et le run SUIVANT reçoit un 23505, converti en
// 409 « Vous avez déjà validé cette séance aujourd'hui »
// (api/patient/seance.ts). Le test passait une fois, puis échouait à chaque
// exécution ultérieure du même jour — constaté le 2026-08-27, où il est
// passé au vert puis retombé au rouge sans qu'une seule ligne de code ait
// changé entre les deux runs.
//
// Ce n'est pas un bug applicatif : refuser une double validation est le
// comportement voulu. C'est le test qui n'était pas rejouable. Ce script
// rétablit l'état de départ avant chaque run, en supprimant UNIQUEMENT les
// séances du jour (`exercices_realises` suit par ON DELETE CASCADE).
//
// Les séances d'historique du seed (datées d'hier) ne sont jamais touchées.
//
// ── Pourquoi l'API REST et non une connexion Postgres directe ────────────
// `STAGING_DATABASE_URL` est une connexion directe, joignable en IPv6
// uniquement : les runners GitHub n'ont pas d'IPv6 et échouent en
// `ENETUNREACH` (limitation déjà documentée dans docs/PLAN-BETA.md, qui
// bloque aussi le bloc « Findings structurels » du harnais). On passe donc
// par PostgREST avec la clé service_role — mêmes secrets que le harnais,
// en HTTPS, donc joignable depuis la CI.
//
// Usage :
//   npx tsx scripts/staging-reset-seances-du-jour.ts --apply

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

// Même principe de garde-fou que les autres scripts de staging, appliqué
// ici à l'URL du projet Supabase : refus explicite de la production, et
// refus par défaut si la cible n'est pas reconnue comme staging.
function assertStagingTarget(url: string): void {
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    throw new Error("SUPABASE_TEST_URL n'est pas une URL valide.");
  }
  if (host.includes(PRODUCTION_REF)) {
    throw new Error('Garde-fou : cette URL pointe vers le projet de PRODUCTION. Abandon.');
  }
  if (!host.includes(STAGING_REF)) {
    throw new Error('Garde-fou : impossible de confirmer que cette URL pointe vers staging (réf. de projet non reconnue). Abandon.');
  }
}

async function main() {
  if (!process.argv.includes('--apply')) {
    throw new Error('Ce script supprime des lignes sur staging — --apply est obligatoire.');
  }

  const envPath = path.resolve(__dirname, '../.env.test.local');
  const parsed = loadEnvFile(envPath);
  for (const [key, value] of Object.entries(parsed)) {
    if (!(key in process.env)) process.env[key] = value;
  }

  const url = process.env.SUPABASE_TEST_URL;
  const serviceKey = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(`SUPABASE_TEST_URL / SUPABASE_TEST_SERVICE_ROLE_KEY introuvables (ni dans ${envPath}, ni dans l'environnement).`);
  }
  assertStagingTarget(url);

  // Date locale du runner, au format attendu par une colonne `date`.
  const aujourdhui = new Date().toISOString().slice(0, 10);

  const reponse = await fetch(
    `${url}/rest/v1/seances_patient?date_seance=eq.${aujourdhui}`,
    {
      method: 'DELETE',
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        Prefer: 'return=representation',
      },
    }
  );

  if (!reponse.ok) {
    const corps = await reponse.text().catch(() => '');
    throw new Error(`Suppression refusée (HTTP ${reponse.status}) : ${corps.slice(0, 300)}`);
  }

  const supprimees = (await reponse.json().catch(() => [])) as unknown[];
  console.log(`Séances du ${aujourdhui} supprimées : ${supprimees.length}`);
}

main().catch(err => {
  console.error('Erreur :', err instanceof Error ? err.message : err);
  process.exit(1);
});
