// scripts/dump-schema.ts
//
// Génère un dump SQL (schéma "public" uniquement : tables, colonnes,
// contraintes, index, fonctions, triggers, policies RLS, grants) en
// interrogeant information_schema / pg_catalog directement — alternative à
// `supabase db dump` quand Docker n'est pas disponible.
//
// La sortie est écrite dans supabase/_staging_schema_dump.sql (déjà dans
// .gitignore), conformément à GUIDE_STAGING.md étape 2.1 : ce fichier est
// destiné à être collé dans le SQL Editor d'un NOUVEAU projet Supabase vide
// (horizon-staging).
//
// Connexion en LECTURE SEULE (SET TRANSACTION READ ONLY) : seules des
// requêtes SELECT sur les catalogues système sont exécutées, aucune donnée
// patient n'est lue.
//
// Usage (PowerShell) :
//   $env:SUPABASE_DB_PASSWORD = "le-mot-de-passe-db-de-production"
//   npx tsx scripts/dump-schema.ts
//
// Ou avec une chaîne de connexion complète (prioritaire) :
//   $env:DATABASE_URL = "postgresql://user:pass@host:port/postgres"
//   npx tsx scripts/dump-schema.ts

import { Client } from 'pg';
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = path.resolve(__dirname, '../supabase/_staging_schema_dump.sql');

function q(ident: string): string {
  return `"${ident.replace(/"/g, '""')}"`;
}

function buildConnectionConfig() {
  if (process.env.DATABASE_URL) {
    return { connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } };
  }

  const password = process.env.SUPABASE_DB_PASSWORD;
  if (!password) {
    throw new Error(
      'Variable manquante : SUPABASE_DB_PASSWORD (ou DATABASE_URL). ' +
      'Mot de passe DB de production, disponible/réinitialisable dans ' +
      'Supabase Dashboard > Project Settings > Database.'
    );
  }

  const poolerUrlPath = path.resolve(__dirname, '../supabase/.temp/pooler-url');
  let poolerUrl: string;
  try {
    poolerUrl = readFileSync(poolerUrlPath, 'utf-8').trim();
  } catch {
    throw new Error(
      `Impossible de lire ${poolerUrlPath}. Lance "supabase link --project-ref <ref>" ` +
      'ou fournis une chaîne complète via DATABASE_URL.'
    );
  }

  // Format attendu : postgresql://postgres.<ref>@<host>:<port>/postgres
  const m = poolerUrl.match(/^postgresql:\/\/([^@]+)@([^:]+):(\d+)\/(.+)$/);
  if (!m) throw new Error(`Format inattendu pour pooler-url : ${poolerUrl}`);
  const [, user, host, port, database] = m;

  return {
    host,
    port: Number(port),
    database,
    user,
    password,
    ssl: { rejectUnauthorized: false },
  };
}

// ────────────────────────────────────────────────────────────────────────
// Sections du dump
// ────────────────────────────────────────────────────────────────────────

async function dumpExtensions(client: Client): Promise<string[]> {
  const { rows } = await client.query<{ extname: string }>(
    `SELECT extname FROM pg_extension WHERE extname <> 'plpgsql' ORDER BY extname`
  );
  if (rows.length === 0) return [];
  return [
    '-- ── Extensions ──────────────────────────────────────────────────',
    ...rows.map(r => `CREATE EXTENSION IF NOT EXISTS ${q(r.extname)};`),
  ];
}

async function dumpEnums(client: Client): Promise<string[]> {
  const { rows } = await client.query<{ typname: string; labels_sql: string }>(`
    SELECT t.typname,
           string_agg(quote_literal(e.enumlabel), ', ' ORDER BY e.enumsortorder) AS labels_sql
    FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
    GROUP BY t.typname
    ORDER BY t.typname
  `);
  if (rows.length === 0) return [];
  const out = ['-- ── Types personnalisés (enums) ────────────────────────────────'];
  for (const r of rows) {
    out.push(
      `DO $$ BEGIN\n` +
      `  CREATE TYPE public.${q(r.typname)} AS ENUM (${r.labels_sql});\n` +
      `EXCEPTION WHEN duplicate_object THEN NULL;\n` +
      `END $$;`
    );
  }
  return out;
}

interface ColumnRow {
  table_name: string;
  column_name: string;
  data_type: string;
  not_null: boolean;
  column_default: string | null;
  attidentity: string;
  attgenerated: string;
}

async function dumpTables(client: Client): Promise<{ sql: string[]; tables: string[] }> {
  const { rows: tableRows } = await client.query<{ relname: string }>(`
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
    ORDER BY c.relname
  `);
  const tables = tableRows.map(r => r.relname);

  const { rows: cols } = await client.query<ColumnRow>(`
    SELECT c.relname AS table_name,
           a.attname AS column_name,
           pg_catalog.format_type(a.atttypid, a.atttypmod) AS data_type,
           a.attnotnull AS not_null,
           pg_get_expr(ad.adbin, ad.adrelid) AS column_default,
           a.attidentity,
           a.attgenerated
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    LEFT JOIN pg_attrdef ad ON ad.adrelid = c.oid AND ad.adnum = a.attnum
    WHERE n.nspname = 'public' AND c.relkind = 'r'
      AND a.attnum > 0 AND NOT a.attisdropped
    ORDER BY c.relname, a.attnum
  `);

  const byTable = new Map<string, ColumnRow[]>();
  for (const col of cols) {
    if (!byTable.has(col.table_name)) byTable.set(col.table_name, []);
    byTable.get(col.table_name)!.push(col);
  }

  const out = ['-- ── Tables ──────────────────────────────────────────────────────'];
  for (const table of tables) {
    const colDefs = (byTable.get(table) ?? []).map(col => {
      let def = `  ${q(col.column_name)} ${col.data_type}`;
      if (col.attgenerated === 's') {
        def += ` GENERATED ALWAYS AS (${col.column_default}) STORED`;
      } else if (col.attidentity === 'a') {
        def += ` GENERATED ALWAYS AS IDENTITY`;
      } else if (col.attidentity === 'd') {
        def += ` GENERATED BY DEFAULT AS IDENTITY`;
      } else if (col.column_default !== null) {
        def += ` DEFAULT ${col.column_default}`;
      }
      if (col.not_null) def += ` NOT NULL`;
      return def;
    });
    out.push(`CREATE TABLE IF NOT EXISTS public.${q(table)} (\n${colDefs.join(',\n')}\n);`);
  }

  return { sql: out, tables };
}

async function dumpConstraints(client: Client): Promise<string[]> {
  const { rows } = await client.query<{ relname: string; conname: string; def: string }>(`
    SELECT rel.relname, con.conname, pg_get_constraintdef(con.oid) AS def
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = rel.relnamespace
    WHERE n.nspname = 'public' AND rel.relkind = 'r'
    ORDER BY rel.relname, con.contype DESC, con.conname
  `);
  if (rows.length === 0) return [];
  const out = ['-- ── Contraintes (PK, FK, UNIQUE, CHECK) ─────────────────────────'];
  for (const r of rows) {
    out.push(
      `DO $$ BEGIN\n` +
      `  ALTER TABLE public.${q(r.relname)} ADD CONSTRAINT ${q(r.conname)} ${r.def};\n` +
      `EXCEPTION WHEN duplicate_object THEN NULL;\n` +
      `END $$;`
    );
  }
  return out;
}

async function dumpIndexes(client: Client): Promise<string[]> {
  // Exclut les index qui supportent déjà une contrainte PK/UNIQUE/EXCLUDE
  // (créés automatiquement par les ALTER TABLE ADD CONSTRAINT ci-dessus).
  const { rows: backing } = await client.query<{ relname: string }>(`
    SELECT i.relname
    FROM pg_constraint con
    JOIN pg_class i ON i.oid = con.conindid
    JOIN pg_namespace n ON n.oid = con.connamespace
    WHERE n.nspname = 'public' AND con.contype IN ('p', 'u', 'x')
  `);
  const backingNames = new Set(backing.map(r => r.relname));

  const { rows } = await client.query<{ indexname: string; indexdef: string; tablename: string }>(`
    SELECT indexname, indexdef, tablename
    FROM pg_indexes
    WHERE schemaname = 'public'
    ORDER BY tablename, indexname
  `);
  const filtered = rows.filter(r => !backingNames.has(r.indexname));
  if (filtered.length === 0) return [];
  const out = ['-- ── Index ───────────────────────────────────────────────────────'];
  for (const r of filtered) {
    out.push(r.indexdef.replace(/^CREATE (UNIQUE )?INDEX /, 'CREATE $1INDEX IF NOT EXISTS ') + ';');
  }
  return out;
}

async function dumpFunctions(client: Client): Promise<string[]> {
  const { rows } = await client.query<{ proname: string; def: string }>(`
    SELECT p.proname, pg_get_functiondef(p.oid) AS def
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
    ORDER BY p.proname
  `);
  if (rows.length === 0) return [];
  return ['-- ── Fonctions ───────────────────────────────────────────────────', ...rows.map(r => r.def + ';')];
}

async function dumpTriggers(client: Client): Promise<string[]> {
  const { rows } = await client.query<{ tgname: string; relname: string; def: string }>(`
    SELECT t.tgname, c.relname, pg_get_triggerdef(t.oid) AS def
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND NOT t.tgisinternal
    ORDER BY c.relname, t.tgname
  `);
  if (rows.length === 0) return [];
  const out = ['-- ── Triggers ────────────────────────────────────────────────────'];
  for (const r of rows) {
    out.push(`DROP TRIGGER IF EXISTS ${q(r.tgname)} ON public.${q(r.relname)};`);
    out.push(r.def + ';');
  }
  return out;
}

async function dumpRlsAndPolicies(client: Client, tables: string[]): Promise<string[]> {
  const { rows: rls } = await client.query<{ relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean }>(`
    SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
    ORDER BY c.relname
  `);

  const { rows: policies } = await client.query<{
    tablename: string; policyname: string; permissive: string;
    roles_csv: string; cmd: string; qual: string | null; with_check: string | null;
  }>(`
    SELECT tablename, policyname, permissive,
           array_to_string(roles, ',') AS roles_csv,
           cmd, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
    ORDER BY tablename, policyname
  `);

  const out: string[] = [];

  const rlsEnabled = rls.filter(r => r.relrowsecurity);
  if (rlsEnabled.length > 0) {
    out.push('-- ── Row Level Security ─────────────────────────────────────────');
    for (const r of rlsEnabled) {
      out.push(`ALTER TABLE public.${q(r.relname)} ENABLE ROW LEVEL SECURITY;`);
      if (r.relforcerowsecurity) {
        out.push(`ALTER TABLE public.${q(r.relname)} FORCE ROW LEVEL SECURITY;`);
      }
    }
  }

  if (policies.length > 0) {
    out.push('-- ── Policies RLS ────────────────────────────────────────────────');
    for (const p of policies) {
      out.push(`DROP POLICY IF EXISTS ${q(p.policyname)} ON public.${q(p.tablename)};`);
      let stmt = `CREATE POLICY ${q(p.policyname)} ON public.${q(p.tablename)}\n`;
      stmt += `  AS ${p.permissive}\n`;
      stmt += `  FOR ${p.cmd}\n`;
      stmt += `  TO ${p.roles_csv || 'public'}`;
      if (p.qual !== null) stmt += `\n  USING (${p.qual})`;
      if (p.with_check !== null) stmt += `\n  WITH CHECK (${p.with_check})`;
      out.push(stmt + ';');
    }
  }

  return out;
}

const GRANT_ORDER = ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'];

async function dumpGrants(client: Client): Promise<string[]> {
  const { rows } = await client.query<{ table_name: string; grantee: string; privilege_type: string }>(`
    SELECT table_name, grantee, privilege_type
    FROM information_schema.role_table_grants
    WHERE table_schema = 'public' AND grantee IN ('anon', 'authenticated', 'service_role')
    ORDER BY table_name, grantee
  `);
  if (rows.length === 0) return [];

  const grouped = new Map<string, Set<string>>();
  for (const r of rows) {
    const key = `${r.table_name} ${r.grantee}`;
    if (!grouped.has(key)) grouped.set(key, new Set());
    grouped.get(key)!.add(r.privilege_type);
  }

  const out = ['-- ── Grants (anon / authenticated / service_role) ─────────────────'];
  for (const [key, privs] of grouped) {
    const [table, grantee] = key.split(' ');
    const ordered = GRANT_ORDER.filter(p => privs.has(p));
    out.push(`GRANT ${ordered.join(', ')} ON public.${q(table)} TO ${grantee};`);
  }
  return out;
}

// ────────────────────────────────────────────────────────────────────────
// Main
// ────────────────────────────────────────────────────────────────────────

async function main() {
  const client = new Client(buildConnectionConfig());
  await client.connect();
  // Garde-fou : toute requête d'écriture échouera dans cette session.
  await client.query('SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY');

  try {
    const sections: string[][] = [];
    sections.push(await dumpExtensions(client));
    sections.push(await dumpEnums(client));
    const { sql: tableSql, tables } = await dumpTables(client);
    sections.push(tableSql);
    sections.push(await dumpFunctions(client));
    sections.push(await dumpConstraints(client));
    sections.push(await dumpIndexes(client));
    sections.push(await dumpTriggers(client));
    sections.push(await dumpRlsAndPolicies(client, tables));
    sections.push(await dumpGrants(client));

    const header =
      `-- ============================================================\n` +
      `-- Schéma "public" — généré par scripts/dump-schema.ts\n` +
      `-- Source : production, le ${new Date().toISOString()}\n` +
      `-- À coller dans le SQL Editor d'un projet Supabase VIDE\n` +
      `-- (voir GUIDE_STAGING.md, étape 2.1)\n` +
      `-- ============================================================\n`;

    const content = header + '\n' + sections.filter(s => s.length > 0).map(s => s.join('\n\n')).join('\n\n');
    writeFileSync(OUTPUT_PATH, content, 'utf-8');

    console.log(`${tables.length} table(s) trouvée(s) : ${tables.join(', ')}`);
    console.log(`\nDump écrit dans ${OUTPUT_PATH} (${content.length} caractères).`);
  } finally {
    await client.end();
  }
}

main().catch(err => {
  console.error('Erreur :', err);
  process.exit(1);
});
