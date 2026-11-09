// `node --test clevercloud/` : tests du nettoyeur de dump (sans base).
// La validation complète (rejeu des 31 migrations nettoyées sur un
// PostgreSQL standard + sql/01_compat_auth.sql, puis cloisonnement RLS entre
// deux praticiens fictifs) est décrite dans clevercloud/README.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decouper, nettoyer } from './nettoyer-dump.mjs';

test('le découpage respecte les corps $$ et les chaînes contenant ;', () => {
  const sql = `CREATE FUNCTION f() RETURNS int LANGUAGE sql AS $$ SELECT 1; $$;\nSELECT 'a;b';\nDO $x$ BEGIN PERFORM 1; END $x$;`;
  assert.equal(decouper(sql).length, 3);
});

test('retire ce qui est propre à Supabase et garde le reste', () => {
  const sql = [
    'CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "public";',
    'CREATE TABLE "public"."t" ("id" uuid);',
    'ALTER TABLE "public"."t" OWNER TO "postgres";',
    'GRANT ALL ON TABLE "public"."t" TO "authenticated";',
    'GRANT ALL ON TABLE "public"."t" TO "supabase_admin";',
    'ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";',
    "INSERT INTO storage.buckets (id) VALUES ('factures');",
    'CREATE POLICY p ON storage.objects FOR SELECT USING (true);',
    "DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM storage.buckets) THEN RAISE EXCEPTION 'x'; END IF; END $$;",
    'CREATE TRIGGER trg AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.f();',
    "CREATE FUNCTION public.g() RETURNS void LANGUAGE plpgsql AS $$ BEGIN PERFORM net.http_post('u'); END $$;",
  ].join('\n');
  const r = nettoyer(sql);
  assert.match(r.sql, /CREATE TABLE "public"\."t"/);
  assert.match(r.sql, /TO "authenticated"/);
  assert.match(r.sql, /ON auth\.users/, 'le trigger de rôle par défaut est conservé');
  assert.doesNotMatch(r.sql, /pg_net"|OWNER TO|supabase_admin|PUBLICATION|storage\./);
  assert.equal(r.retirees.length, 7);
  assert.deepEqual(r.aAdapter, ['public.g']);
});
