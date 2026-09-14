// scripts/staging-renseigner-titre-praticien.ts
//
// Renseigne le `titre` d'un compte praticien sur STAGING.
//
// POURQUOI CE SCRIPT EXISTE
// -------------------------
// `App.tsx` envoie vers /onboarding tout praticien dont `titre` est vide
// (`needsOnboarding`). Le compte `staging.praticien2@example.com`, créé à la
// main le 2026-09-08 sans passer par `scripts/seed-staging.sql`, n'avait pas
// de titre : les dix tests e2e partaient en réalité sur /onboarding, et le
// helper de connexion validait quand même — voir e2e/helpers.ts.
//
// Le seed, lui, pose toujours `titre` ('Enseignant APA', lignes 236 et 531) :
// c'est le contournement du seed qui a créé le trou, pas le seed.
//
// ── Pourquoi un script et non un UPDATE à la main ────────────────────────
// Un UPDATE tapé dans un éditeur SQL ne porte ni le garde-fou anti-production
// ni la vérification du résultat. Ce script refuse la production, exige
// --apply pour écrire, et relit la ligne après écriture.
//
// ── Pourquoi l'API REST et non une connexion Postgres directe ────────────
// `STAGING_DATABASE_URL` est joignable en IPv6 uniquement : les runners
// GitHub n'ont pas d'IPv6 et échouent en `ENETUNREACH`. Même raison que
// scripts/staging-reset-etat-e2e.ts — on passe par PostgREST en HTTPS.
//
// Usage :
//   npx tsx scripts/staging-renseigner-titre-praticien.ts
//   npx tsx scripts/staging-renseigner-titre-praticien.ts --apply
//   npx tsx scripts/staging-renseigner-titre-praticien.ts --apply --email autre@example.com --titre "Kinésithérapeute"
//
// Sans --apply, le script affiche l'état actuel et ne touche à rien.

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const STAGING_REF = 'nnfkchhtjrferxnwlcxp';
const PRODUCTION_REF = 'rjgzeuywwknubpwigozq';

// Valeurs par défaut : le compte visé par la suite e2e, et le titre déjà
// employé par le seed pour les autres praticiens de staging. Reprendre la
// même valeur évite d'introduire une troisième convention.
const EMAIL_PAR_DEFAUT = 'staging.praticien2@example.com';
const TITRE_PAR_DEFAUT = 'Enseignant APA';

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

// Même garde-fou que les autres scripts de staging : refus explicite de la
// production, et refus par défaut si la cible n'est pas reconnue.
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
    throw new Error(
      'Garde-fou : impossible de confirmer que cette URL pointe vers staging (réf. de projet non reconnue). Abandon.'
    );
  }
}

function argument(nom: string, defaut: string): string {
  const i = process.argv.indexOf(`--${nom}`);
  if (i === -1) return defaut;
  const valeur = process.argv[i + 1];
  if (!valeur || valeur.startsWith('--')) {
    throw new Error(`--${nom} attend une valeur.`);
  }
  return valeur;
}

type LignePraticien = { id: string; email: string; titre: string | null };

async function main() {
  const appliquer = process.argv.includes('--apply');
  const email = argument('email', EMAIL_PAR_DEFAUT);
  const titre = argument('titre', TITRE_PAR_DEFAUT);

  const envPath = path.resolve(__dirname, '../.env.test.local');
  const parsed = loadEnvFile(envPath);
  for (const [key, value] of Object.entries(parsed)) {
    if (!(key in process.env)) process.env[key] = value;
  }

  const url = process.env.SUPABASE_TEST_URL;
  const serviceKey = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      `SUPABASE_TEST_URL / SUPABASE_TEST_SERVICE_ROLE_KEY introuvables (ni dans ${envPath}, ni dans l'environnement).`
    );
  }
  assertStagingTarget(url);

  const entetes = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  };

  const filtreEmail = `email=eq.${encodeURIComponent(email)}`;
  const lecture = `${url}/rest/v1/praticiens?${filtreEmail}&select=id,email,titre`;

  // ── 1. État avant ───────────────────────────────────────────────────────
  const avantReponse = await fetch(lecture, { headers: entetes });
  if (!avantReponse.ok) {
    const corps = await avantReponse.text().catch(() => '');
    throw new Error(`Lecture refusée (HTTP ${avantReponse.status}) : ${corps.slice(0, 300)}`);
  }
  const avant = (await avantReponse.json()) as LignePraticien[];

  if (avant.length === 0) {
    throw new Error(
      `Aucune ligne dans \`praticiens\` pour ${email}. Ce script renseigne un titre manquant, ` +
        'il ne crée pas le praticien : voir scripts/seed-staging.sql.'
    );
  }
  if (avant.length > 1) {
    throw new Error(`${avant.length} lignes pour ${email} — situation inattendue, abandon.`);
  }

  console.log(`Compte : ${email}`);
  console.log(`Avant  : titre = ${avant[0].titre === null ? 'NULL' : JSON.stringify(avant[0].titre)}`);

  if (avant[0].titre) {
    console.log('Le titre est déjà renseigné — rien à faire.');
    return;
  }

  if (!appliquer) {
    console.log(`\nÀ appliquer : titre = ${JSON.stringify(titre)}`);
    console.log('Relancer avec --apply pour écrire.');
    return;
  }

  // ── 2. Écriture ─────────────────────────────────────────────────────────
  // Filtrée sur `titre=is.null` en plus de l'email : si quelqu'un a renseigné
  // le titre entre la lecture et l'écriture, le PATCH ne porte sur rien plutôt
  // que d'écraser une valeur qu'on n'a pas lue.
  const ecriture = await fetch(`${url}/rest/v1/praticiens?${filtreEmail}&titre=is.null`, {
    method: 'PATCH',
    headers: entetes,
    body: JSON.stringify({ titre }),
  });
  if (!ecriture.ok) {
    const corps = await ecriture.text().catch(() => '');
    throw new Error(`Écriture refusée (HTTP ${ecriture.status}) : ${corps.slice(0, 300)}`);
  }
  const modifiees = (await ecriture.json()) as unknown[];

  // ── 3. Contre-épreuve ───────────────────────────────────────────────────
  const apresReponse = await fetch(lecture, { headers: entetes });
  const apres = (await apresReponse.json()) as LignePraticien[];

  console.log(`Lignes modifiées : ${modifiees.length}`);
  console.log(`Après  : titre = ${apres[0]?.titre === null ? 'NULL' : JSON.stringify(apres[0]?.titre)}`);

  if (!apres[0]?.titre) {
    throw new Error('Le titre est toujours vide après écriture — la correction a échoué.');
  }
  console.log('\nOK — needsOnboarding() renverra désormais false pour ce compte.');
}

main().catch(err => {
  console.error('Erreur :', err instanceof Error ? err.message : err);
  process.exit(1);
});
