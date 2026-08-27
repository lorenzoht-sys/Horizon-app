// scripts/staging-reseed.ts
//
// Exécute scripts/seed-staging.sql (purge puis recréation des comptes de
// démo praticien A / praticien Démo 2) sur staging. Même mécanisme que
// scripts/staging-fix-acces-participant-pour.ts et
// scripts/staging-apply-grant-parity.ts : lecture seule par défaut,
// garde-fou anti-prod, --apply explicite, rapport détaillé après coup.
//
// Connexion : process.env.STAGING_DATABASE_URL, chargée depuis
// .env.test.local. La valeur n'est jamais affichée ni loggée.
//
// ⚠️ Ce script est DESTRUCTIF en mode --apply : il purge les données
// existantes des comptes de démo (voir l'en-tête de seed-staging.sql).
// Fais un pg_dump complet (schéma + données) du staging actuel AVANT de
// lancer --apply — voir scripts/staging-backup.ts.
//
// Usage :
//   npx tsx scripts/staging-reseed.ts            (lecture seule : compte les lignes existantes, ne touche à rien)
//   npx tsx scripts/staging-reseed.ts --apply     (purge + seed, puis rapporte le nombre de lignes créées par table et par praticien)

import { Client } from 'pg';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const STAGING_REF = 'nnfkchhtjrferxnwlcxp';
const PRODUCTION_REF = 'rjgzeuywwknubpwigozq';

const PRATICIEN_A_EMAIL = 'staging.praticien@example.com';
const PRATICIEN_D2_EMAIL = 'praticien-demo-2@example.com';

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

// [libellé, requête paramétrée sur $1 = praticien_id] — couvre les tables
// avec colonne praticien_id directe, plus les tables enfants (jointure sur
// programmes/programmes_modeles/participants) pour un décompte complet.
const TABLE_COUNTS: [string, string][] = [
  ['praticiens', `SELECT count(*) FROM praticiens WHERE id = $1`],
  ['participants', `SELECT count(*) FROM participants WHERE praticien_id = $1`],
  ['structures', `SELECT count(*) FROM structures WHERE praticien_id = $1`],
  ['bilans', `SELECT count(*) FROM bilans WHERE praticien_id = $1`],
  ['bilans_brouillons', `SELECT count(*) FROM bilans_brouillons WHERE praticien_id = $1`],
  ['contrats', `SELECT count(*) FROM contrats WHERE praticien_id = $1`],
  ['seances (agenda)', `SELECT count(*) FROM seances WHERE praticien_id = $1`],
  ['notes_seances', `SELECT count(*) FROM notes_seances WHERE praticien_id = $1`],
  ['comptes_rendus_seances', `SELECT count(*) FROM comptes_rendus_seances WHERE praticien_id = $1`],
  ['documents_patient', `SELECT count(*) FROM documents_patient WHERE praticien_id = $1`],
  ['factures_suivi', `SELECT count(*) FROM factures_suivi WHERE praticien_id = $1`],
  ['assistant_logs', `SELECT count(*) FROM assistant_logs WHERE praticien_id = $1`],
  ['zones_geographiques', `SELECT count(*) FROM zones_geographiques WHERE praticien_id = $1`],
  ['indisponibilites', `SELECT count(*) FROM indisponibilites WHERE praticien_id = $1`],
  ['evenements_agenda', `SELECT count(*) FROM evenements_agenda WHERE praticien_id = $1`],
  ['templates_structure', `SELECT count(*) FROM templates_structure WHERE praticien_id = $1`],
  ['dossiers_exercices', `SELECT count(*) FROM dossiers_exercices WHERE praticien_id = $1`],
  ['exercices_personnalises', `SELECT count(*) FROM exercices_personnalises WHERE praticien_id = $1`],
  ['dossier_exercice_membres', `SELECT count(*) FROM dossier_exercice_membres WHERE praticien_id = $1`],
  ['programmes', `SELECT count(*) FROM programmes WHERE praticien_id = $1`],
  ['programme_seances', `SELECT count(*) FROM programme_seances ps JOIN programmes p ON p.id = ps.programme_id WHERE p.praticien_id = $1`],
  ['programme_planning', `SELECT count(*) FROM programme_planning pp JOIN programmes p ON p.id = pp.programme_id WHERE p.praticien_id = $1`],
  ['programme_exercices', `SELECT count(*) FROM programme_exercices pe JOIN programme_seances ps ON ps.id = pe.seance_id JOIN programmes p ON p.id = ps.programme_id WHERE p.praticien_id = $1`],
  ['seances_patient', `SELECT count(*) FROM seances_patient sp JOIN participants pa ON pa.id = sp.participant_id WHERE pa.praticien_id = $1`],
  ['programmes_modeles', `SELECT count(*) FROM programmes_modeles WHERE praticien_id = $1`],
  ['programme_modele_seances', `SELECT count(*) FROM programme_modele_seances pms JOIN programmes_modeles pm ON pm.id = pms.modele_id WHERE pm.praticien_id = $1`],
  ['programme_modele_planning', `SELECT count(*) FROM programme_modele_planning pmp JOIN programmes_modeles pm ON pm.id = pmp.modele_id WHERE pm.praticien_id = $1`],
  ['programme_modele_exercices', `SELECT count(*) FROM programme_modele_exercices pme JOIN programme_modele_seances pms ON pms.id = pme.seance_id JOIN programmes_modeles pm ON pm.id = pms.modele_id WHERE pm.praticien_id = $1`],
];

async function getPraticienId(client: Client, email: string): Promise<string | null> {
  const { rows } = await client.query<{ id: string }>('SELECT id FROM auth.users WHERE email = $1', [email]);
  return rows[0]?.id ?? null;
}

async function reportCounts(client: Client, label: string, praticienId: string | null): Promise<void> {
  console.log(`--- ${label} ---`);
  if (!praticienId) {
    console.log('  (compte introuvable dans auth.users — pas encore créé ?)');
    return;
  }
  let total = 0;
  for (const [tableLabel, sql] of TABLE_COUNTS) {
    const { rows } = await client.query<{ count: string }>(sql, [praticienId]);
    const count = Number(rows[0]?.count ?? 0);
    total += count;
    console.log(`  ${tableLabel.padEnd(28)} ${count}`);
  }
  console.log(`  ${'TOTAL'.padEnd(28)} ${total}`);
}

async function applySeed(client: Client): Promise<void> {
  const sqlPath = path.resolve(__dirname, '../scripts/seed-staging.sql');
  const sql = readFileSync(sqlPath, 'utf-8');

  // Exige explicitement une session en écriture.
  //
  // Depuis la bascule de STAGING_DATABASE_URL sur le pooler en mode
  // transaction (2026-08-27), les backends sont partagés : un
  // `SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY` posé par un
  // script de lecture y survit à la déconnexion et fait échouer toute
  // écriture ultérieure, sans rapport apparent avec sa cause. Constaté ici :
  // « cannot execute DELETE in a read-only transaction », après un simple
  // `staging-query.ts`. Un script qui écrit doit poser lui-même la condition
  // dont il dépend.
  await client.query('SET SESSION CHARACTERISTICS AS TRANSACTION READ WRITE');
  await client.query('BEGIN');
  try {
    await client.query(sql);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  }
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
      const praticienAId = await getPraticienId(client, PRATICIEN_A_EMAIL);
      const praticienD2Id = await getPraticienId(client, PRATICIEN_D2_EMAIL);
      console.log('État actuel (lecture seule, rien exécuté) :\n');
      await reportCounts(client, `Praticien A (${PRATICIEN_A_EMAIL})`, praticienAId);
      console.log('');
      await reportCounts(client, `Praticien Démo 2 (${PRATICIEN_D2_EMAIL})`, praticienD2Id);
      console.log('\nRelancer avec --apply pour purger et recréer ce jeu de données.');
      return;
    }

    console.log('Application de scripts/seed-staging.sql (purge + seed)...\n');
    await applySeed(client);

    const praticienAId = await getPraticienId(client, PRATICIEN_A_EMAIL);
    const praticienD2Id = await getPraticienId(client, PRATICIEN_D2_EMAIL);
    console.log('État après reseed :\n');
    await reportCounts(client, `Praticien A (${PRATICIEN_A_EMAIL})`, praticienAId);
    console.log('');
    await reportCounts(client, `Praticien Démo 2 (${PRATICIEN_D2_EMAIL})`, praticienD2Id);
    console.log('\nReseed terminé avec succès.');
  } finally {
    await client.end();
  }
}

main().catch(err => {
  console.error('Erreur :', err instanceof Error ? err.message : err);
  process.exit(1);
});
