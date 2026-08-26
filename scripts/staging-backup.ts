// scripts/staging-backup.ts
//
// Sauvegarde complète (schéma + données) de staging, à lancer avant toute
// opération destructive (ex. scripts/staging-reseed.ts --apply). Écrit hors
// du dépôt, dans le dossier scratchpad de la session — jamais dans
// supabase/ ni ailleurs dans le repo git.
//
// pg_dump n'est pas installé sur cette machine, et `supabase db dump` exige
// Docker (absent aussi) pour son exécution réelle (le --dry-run, lui,
// fonctionne sans Docker mais imprime les identifiants en clair — jamais
// utilisé ici). Ce script est donc un exporteur maison :
//
//   - SCHÉMA : réutilise scripts/dump-schema.ts tel quel, en sous-processus
//     (pas en import — dump-schema.ts s'exécute au chargement du module, un
//     import direct le déclencherait une seconde fois pour de mauvaises
//     raisons). Sa sortie (toujours supabase/_staging_schema_dump.sql,
//     fichier gitignored) est copiée vers le dossier de sauvegarde puis
//     laissée telle quelle sur place (pas de suppression).
//
//   - DONNÉES : un SELECT * par table + reconstruction en instructions
//     INSERT restaurables (une ligne = un INSERT, colonnes explicites dans
//     l'ordre du schéma). Pas un COPY binaire comme le vrai pg_dump, mais
//     un format texte plus simple à vérifier (grep) et suffisant pour un
//     filet de sécurité avant purge.
//
// Connexion : process.env.STAGING_DATABASE_URL, chargée depuis
// .env.test.local, jamais affichée. Même garde-fou anti-prod que les
// scripts précédents.
//
// Usage :
//   npx tsx scripts/staging-backup.ts

import { Client } from 'pg';
import { readFileSync, writeFileSync, copyFileSync, statSync, mkdirSync } from 'fs';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const STAGING_REF = 'nnfkchhtjrferxnwlcxp';
const PRODUCTION_REF = 'rjgzeuywwknubpwigozq';

// Dossier scratchpad de la session — hors du dépôt par construction.
const BACKUP_DIR = 'C:\\Users\\loren\\AppData\\Local\\Temp\\claude\\C--Users-loren-OneDrive-Bureau-Claude-code-Mouvtrack\\8609b0b7-4a3a-481e-bd1b-6da7d9bee500\\scratchpad';

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

function q(ident: string): string {
  return `"${ident.replace(/"/g, '""')}"`;
}

function escapeStringLiteral(s: string): string {
  return `'${s.replace(/'/g, "''")}'`;
}

function toSqlLiteral(value: unknown): string {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (typeof value === 'number') return String(value);
  if (value instanceof Date) return escapeStringLiteral(value.toISOString());
  if (Array.isArray(value)) {
    if (value.length === 0) return 'ARRAY[]::text[]';
    return `ARRAY[${value.map(toSqlLiteral).join(', ')}]`;
  }
  if (typeof value === 'object') {
    return `${escapeStringLiteral(JSON.stringify(value))}::jsonb`;
  }
  return escapeStringLiteral(String(value));
}

// Réutilise dump-schema.ts en sous-processus, DATABASE_URL passée par
// variable d'environnement au process enfant (jamais en argument CLI,
// jamais affichée par ce script).
function runSchemaDump(connectionString: string): string {
  const dumpScriptPath = path.resolve(__dirname, 'dump-schema.ts');
  const result = spawnSync('npx', ['tsx', `"${dumpScriptPath}"`], {
    env: { ...process.env, DATABASE_URL: connectionString },
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf-8',
    shell: true, // npx est un .cmd sur Windows, ne se lance pas sans shell
  });
  if (result.error) {
    throw new Error(`Impossible de lancer dump-schema.ts : ${result.error.message}`);
  }
  if (result.status !== 0) {
    const firstLines = (result.stderr || '').split('\n').slice(0, 5).join('\n');
    throw new Error(`dump-schema.ts a échoué (code ${result.status}) :\n${firstLines}`);
  }
  return path.resolve(__dirname, '../supabase/_staging_schema_dump.sql');
}

interface TableSummary {
  table: string;
  rows: number;
}

async function dumpData(client: Client, outPath: string): Promise<TableSummary[]> {
  const { rows: tableRows } = await client.query<{ relname: string }>(`
    SELECT c.relname FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
    ORDER BY c.relname
  `);
  const tables = tableRows.map(r => r.relname);

  const lines: string[] = [
    '-- ============================================================',
    `-- Sauvegarde DONNÉES — staging, ${new Date().toISOString()}`,
    '-- Généré par scripts/staging-backup.ts (exporteur maison, pas pg_dump)',
    '-- ============================================================',
    '',
  ];
  const summary: TableSummary[] = [];

  for (const table of tables) {
    const { rows: cols } = await client.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = $1
       ORDER BY ordinal_position`,
      [table]
    );
    const columnNames = cols.map(c => c.column_name);
    if (columnNames.length === 0) continue;

    const { rows: data } = await client.query(`SELECT * FROM public.${q(table)}`);
    summary.push({ table, rows: data.length });

    lines.push(`-- ── ${table} (${data.length} ligne(s)) ──`);
    if (data.length === 0) {
      lines.push('-- (vide)', '');
      continue;
    }
    for (const row of data as Record<string, unknown>[]) {
      const values = columnNames.map(c => toSqlLiteral(row[c]));
      lines.push(`INSERT INTO public.${q(table)} (${columnNames.map(q).join(', ')}) VALUES (${values.join(', ')});`);
    }
    lines.push('');
  }

  writeFileSync(outPath, lines.join('\n'), 'utf-8');
  return summary;
}

async function main() {
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

  mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');

  console.log('--- Sauvegarde schéma (via dump-schema.ts) ---');
  const schemaSrcPath = runSchemaDump(connectionString);
  const schemaOutPath = path.join(BACKUP_DIR, `staging_backup_${stamp}_schema.sql`);
  copyFileSync(schemaSrcPath, schemaOutPath);
  console.log(`Schéma copié vers ${schemaOutPath}`);

  console.log('\n--- Sauvegarde données ---');
  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();
  await client.query('SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY');

  const dataOutPath = path.join(BACKUP_DIR, `staging_backup_${stamp}_data.sql`);
  let summary: TableSummary[];
  try {
    summary = await dumpData(client, dataOutPath);
  } finally {
    await client.end();
  }

  const combinedOutPath = path.join(BACKUP_DIR, `staging_backup_${stamp}_full.sql`);
  const schemaContent = readFileSync(schemaOutPath, 'utf-8');
  const dataContent = readFileSync(dataOutPath, 'utf-8');
  writeFileSync(combinedOutPath, schemaContent + '\n\n' + dataContent, 'utf-8');

  console.log('\n--- Récapitulatif (nombre de lignes par table) ---');
  let total = 0;
  for (const s of summary) {
    if (s.rows > 0) console.log(`  ${s.table.padEnd(32)} ${s.rows}`);
    total += s.rows;
  }
  console.log(`  ${'TOTAL'.padEnd(32)} ${total}`);

  const participantsSummary = summary.find(s => s.table === 'participants');
  console.log('\n--- Vérification échantillon (praticien A) ---');
  console.log(`  Table participants : ${participantsSummary?.rows ?? 0} ligne(s)`);
  // Vérifie la présence par NOM (pas par code_acces) : le code exact peut
  // avoir dérivé depuis l'écriture initiale du seed (constaté le 2026-08-26
  // — la Camille Martin actuellement en staging porte code_acces='CAM001',
  // pas 'CAME2E26', signe que le jeu de données a été modifié à la main
  // depuis). Un contrôle basé sur le code figé aurait fait échouer une
  // sauvegarde par ailleurs parfaitement valide.
  const dataText = readFileSync(dataOutPath, 'utf-8');
  const hasCamille = dataText.includes('Camille') && dataText.includes('Martin');
  console.log(`  "Camille Martin" présente dans le dump (par nom) : ${hasCamille ? 'OUI' : 'NON — ANOMALIE'}`);

  console.log('\n--- Fichiers écrits ---');
  for (const p of [schemaOutPath, dataOutPath, combinedOutPath]) {
    const size = statSync(p).size;
    console.log(`  ${p}  (${size} octets)`);
  }

  if (!hasCamille) {
    throw new Error('Échantillon de contrôle absent du dump — sauvegarde jugée non fiable, ne pas continuer sur cette base.');
  }
  console.log('\nSauvegarde terminée et vérifiée.');
}

main().catch(err => {
  console.error('Erreur :', err instanceof Error ? err.message : err);
  process.exit(1);
});
