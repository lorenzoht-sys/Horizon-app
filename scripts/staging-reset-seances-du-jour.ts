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
// changé entre les deux.
//
// Ce n'est pas un bug applicatif : refuser une double validation est le
// comportement voulu. C'est le test qui n'était pas rejouable. Ce script
// rétablit l'état de départ avant chaque run, en supprimant UNIQUEMENT les
// séances du jour (`exercices_realises` suit par ON DELETE CASCADE).
//
// Les séances d'historique du seed (datées d'hier) ne sont jamais touchées.
//
// Usage :
//   npx tsx scripts/staging-reset-seances-du-jour.ts --apply

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

// Garde-fou identique aux autres scripts de staging.
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
  if (!process.argv.includes('--apply')) {
    throw new Error('Ce script supprime des lignes sur staging — --apply est obligatoire.');
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
    const { rowCount } = await client.query(
      `DELETE FROM public.seances_patient WHERE date_seance = CURRENT_DATE`
    );
    console.log(`Séances du jour supprimées : ${rowCount ?? 0}`);
  } finally {
    await client.end();
  }
}

main().catch(err => {
  console.error('Erreur :', err instanceof Error ? err.message : err);
  process.exit(1);
});
