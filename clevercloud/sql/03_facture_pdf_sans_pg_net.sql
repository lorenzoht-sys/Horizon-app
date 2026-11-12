-- ============================================================================
-- Facture PDF sans pg_net ni Vault, sur le PostgreSQL de Clever Cloud
-- (2026-11-12, lot « facture PDF » de la migration HDS)
-- ============================================================================
-- À NE PAS confondre avec une migration : ce fichier n'est PAS dans
-- supabase/migrations/ et ne doit JAMAIS être appliqué à un projet Supabase
-- (les PDF de factures n'y seraient plus générés). Il se joue sur la base
-- Clever Cloud APRÈS la restauration du schéma. Il refuse de s'exécuter si le
-- schéma `vault` existe, signe d'une base Supabase.
--
-- Pourquoi : public.declencher_pdf_facture() lit un secret dans Vault et
-- appelle l'Edge Function par pg_net. Sur une base sans ces deux extensions,
-- son corps lève une erreur à chaque validation de facture ; elle est
-- rattrapée (la validation réussit), mais aucun PDF n'est généré et un
-- avertissement est journalisé à chaque fois.
--
-- Sur la cible, la génération est assurée par l'application
-- (clevercloud/serveur/repriseFactures.mjs, REPRISE_FACTURES_PDF=1), qui
-- cherche les factures validées sans pdf_path. La fonction du trigger devient
-- donc neutre. Le trigger lui-même est conservé : le schéma reste identique à
-- celui du dépôt, seul le corps de cette fonction diffère.
--
-- Idempotent. Marqueur d'environnement, comme 01_compat_auth.sql :
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

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'vault') THEN
    RAISE EXCEPTION 'Schéma vault présent : cette base ressemble à un projet Supabase. Fichier réservé à la cible Clever Cloud.';
  END IF;
  IF to_regprocedure('public.declencher_pdf_facture()') IS NULL THEN
    RAISE EXCEPTION 'public.declencher_pdf_facture() absente : restaurer le schéma avant ce fichier.';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.declencher_pdf_facture()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  -- Cible Clever Cloud : le PDF est généré par l'application, qui reprend les
  -- factures validées sans pdf_path (clevercloud/serveur/repriseFactures.mjs).
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.declencher_pdf_facture() FROM PUBLIC, anon, authenticated;

-- ---------- contrôle final ----------
DO $$
BEGIN
  IF (SELECT prosrc FROM pg_proc WHERE oid = 'public.declencher_pdf_facture()'::regprocedure) ~* 'vault|net\.http' THEN
    RAISE EXCEPTION 'declencher_pdf_facture() cite encore vault ou pg_net';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'factures_pdf_apres_validation'
                   AND tgrelid = 'public.factures'::regclass AND NOT tgisinternal) THEN
    RAISE EXCEPTION 'trigger factures_pdf_apres_validation absent : le schéma ne correspond plus au dépôt';
  END IF;
  IF has_function_privilege('anon', 'public.declencher_pdf_facture()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.declencher_pdf_facture()', 'EXECUTE') THEN
    RAISE EXCEPTION 'declencher_pdf_facture() exécutable par anon ou authenticated';
  END IF;
END $$;

COMMIT;
