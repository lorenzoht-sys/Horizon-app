// scripts/staging-query.ts
//
// Exécute une requête SQL en lecture seule sur staging et affiche le
// résultat. Même garde-fou anti-prod que les autres scripts. Utilisé pour
// les vérifications ciblées des lots de l'étape 1 (F-05/F-07/F-08/F-10,
// gated par STAGING_DATABASE_URL dans tests/security/rls.spec.ts, non
// exécutable via le harnais CI tant que la connexion reste directe).
//
// Usage :
//   npx tsx scripts/staging-query.ts "SELECT ..."
//   npx tsx scripts/staging-query.ts --file <chemin.sql>
//
// PRÉFÉRER --file dès que le SQL tient sur plusieurs lignes. Sous Windows,
// les sauts de ligne d'un argument de ligne de commande sont aplatis avant
// d'arriver ici : une requête multi-ligne commençant par un commentaire
// `--` se retrouve entièrement commentée et renvoie `[]`, SANS erreur. Un
// `[]` qu'on lit spontanément comme « aucune violation trouvée ». Constaté
// le 2026-08-29 en validant la requête de contrôle de `user_roles`. Le
// garde-fou ci-dessous transforme désormais ce piège en erreur bruyante.

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
  let sql: string | undefined;

  const fileIdx = args.indexOf('--file');
  if (fileIdx !== -1) {
    const filePath = args[fileIdx + 1];
    if (!filePath) throw new Error('--file attend un chemin de fichier.');
    sql = readFileSync(path.resolve(filePath), 'utf-8');
  } else {
    sql = args[0];

    // Le piège décrit en tête de fichier : un SQL inline qui contient un
    // commentaire `--` mais plus aucun saut de ligne a été aplati par le
    // shell, et tout ce qui suit le `--` est mort. On refuse plutôt que de
    // renvoyer un `[]` trompeur.
    if (sql && /(^|\s)--/.test(sql) && !/[\r\n]/.test(sql)) {
      throw new Error(
        'SQL inline contenant un commentaire `--` sur une seule ligne : les sauts de ligne ont ' +
        'probablement été aplatis par le shell, et le reste de la requête est commenté. ' +
        'Le résultat aurait été `[]` sans erreur. Utilise --file <chemin.sql>.'
      );
    }
  }
  if (!sql) throw new Error('Usage: staging-query.ts "SELECT ..." | --file <chemin.sql>');

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
    // Lecture seule portée par la TRANSACTION, pas par la SESSION.
    //
    // `SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY` était correct
    // tant que STAGING_DATABASE_URL était une connexion directe : la session
    // mourait avec le process. Depuis la bascule sur le pooler en mode
    // transaction (2026-08-27), le réglage RESTE sur le backend partagé après
    // déconnexion et contamine tous les clients suivants — constaté le même
    // jour : une migration a échoué en « cannot execute CREATE TABLE in a
    // read-only transaction » à cause d'un simple `staging-query.ts` lancé
    // quelques minutes plus tôt.
    //
    // `BEGIN READ ONLY` donne la même garantie sans rien laisser derrière.
    await client.query('BEGIN READ ONLY');
    const { rows } = await client.query(sql);
    console.log(JSON.stringify(rows, null, 2));
    await client.query('ROLLBACK');
  } finally {
    await client.end();
  }
}

main().catch(err => {
  console.error('Erreur :', err instanceof Error ? err.message : err);
  process.exit(1);
});
