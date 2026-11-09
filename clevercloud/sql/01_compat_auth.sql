-- ============================================================================
-- Compatibilité « auth » de Supabase sur le PostgreSQL de Clever Cloud
-- (2026-11-09, socle de la migration HDS)
-- ============================================================================
-- À NE PAS confondre avec une migration : ce fichier n'est PAS dans
-- supabase/migrations/ et ne doit JAMAIS être appliqué à un projet Supabase
-- (il y écraserait auth.uid()). Il prépare une base Clever Cloud VIERGE, AVANT
-- la restauration du dump nettoyé (clevercloud/scripts/nettoyer-dump.mjs).
--
-- Pourquoi : 138 politiques RLS et ~50 fonctions appellent auth.uid(), et 25
-- clés étrangères pointent vers auth.users. Plutôt que de réécrire tout cela,
-- on recrée le strict nécessaire, alimenté par les jetons Keycloak que
-- PostgREST place dans request.jwt.claims. Les politiques restent identiques.
--
-- auth.users ne garde QUE l'identifiant et l'e-mail des praticiens : les mots
-- de passe vivent dans Keycloak, plus jamais dans la base de santé.
--
-- Rôles : anon, authenticated et service_role doivent exister AVANT ce script.
-- Sur Clever Cloud, ils se demandent au support (ou le droit CREATE ROLE).
-- Le bloc de contrôle final échoue s'ils manquent.
--
-- Idempotent. Marqueur d'environnement : à exécuter avec
--   psql "$POSTGRESQL_ADDON_URI?sslmode=require" -v cible=staging -f …
-- ============================================================================

\set ON_ERROR_STOP on
\if :{?cible}
\else
  \echo 'Variable « cible » obligatoire : -v cible=staging ou -v cible=production'
  \quit
\endif
\echo 'Cible :' :cible

BEGIN;

-- Extensions utilisées par le schéma (pgcrypto : gen_random_bytes, digest…).
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;

CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE IF NOT EXISTS auth.users (
  id         uuid PRIMARY KEY,
  email      text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE auth.users IS
  'Remplace auth.users de Supabase : identifiant (= sub Keycloak) et e-mail seulement. Aucun mot de passe.';

-- Même lecture que Supabase : ancien réglage request.jwt.claim.sub, puis
-- request.jwt.claims (PostgREST ≥ 9). NULL hors requête authentifiée.
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT nullif(coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
  ), '')::uuid
$$;

CREATE OR REPLACE FUNCTION auth.role() RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
  )
$$;

CREATE OR REPLACE FUNCTION auth.email() RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT coalesce(
    nullif(current_setting('request.jwt.claim.email', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email'
  )
$$;

CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;

-- Accès : lecture des fonctions pour tous les rôles d'API, table réservée au
-- service (règle du 2026-08-29 : REVOKE puis GRANT ciblé).
REVOKE ALL ON SCHEMA auth FROM PUBLIC;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
REVOKE ALL ON auth.users FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON auth.users TO service_role;
GRANT EXECUTE ON FUNCTION auth.uid(), auth.role(), auth.email(), auth.jwt()
  TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA extensions TO anon, authenticated, service_role;

-- Contrôle final : l'état attendu doit être atteint, sinon tout est annulé.
DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      RAISE EXCEPTION 'Rôle % absent : à demander au support Clever Cloud avant ce script.', r;
    END IF;
  END LOOP;
  IF to_regprocedure('auth.uid()') IS NULL OR to_regclass('auth.users') IS NULL THEN
    RAISE EXCEPTION 'Compatibilité auth incomplète.';
  END IF;
  -- Hors requête, auth.uid() doit valoir NULL (jamais un identifiant par défaut).
  IF auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'auth.uid() non nul hors requête authentifiée.';
  END IF;
  PERFORM set_config('request.jwt.claims',
    '{"sub":"00000000-0000-0000-0000-0000000000e2","role":"authenticated"}', true);
  IF auth.uid() <> '00000000-0000-0000-0000-0000000000e2'::uuid OR auth.role() <> 'authenticated' THEN
    RAISE EXCEPTION 'auth.uid()/auth.role() ne lisent pas request.jwt.claims.';
  END IF;
END $$;

COMMIT;
