-- ============================================================================
-- Accès du rôle serveur quand il n'a pas l'attribut BYPASSRLS
-- (2026-11-16, lot « transfert de la base » de la migration HDS)
-- ============================================================================
-- SOLUTION DE REPLI, à ne jouer que si le support Clever Cloud ne peut pas
-- donner l'attribut BYPASSRLS au rôle service_role (seul un superutilisateur
-- le peut). Si service_role a BYPASSRLS, ce fichier est inutile et refuse de
-- s'exécuter.
--
-- Pourquoi : sur Supabase, service_role traverse la RLS grâce à cet attribut.
-- Les routes api/ et les Edge Functions en dépendent : sans lui, elles liraient
-- zéro ligne partout, sans erreur. Ce fichier donne le même accès par une
-- politique explicite sur chaque table du schéma public, réservée à
-- service_role. Les politiques des praticiens ne changent pas : les politiques
-- permissives s'additionnent par rôle, et celle-ci ne vaut que pour
-- service_role, que seul un jeton signé par le serveur peut endosser.
--
-- À rejouer après toute migration qui crée une table (idempotent) : une table
-- sans cette politique serait invisible pour le serveur.
--
-- À NE PAS confondre avec une migration, et à ne JAMAIS appliquer à un projet
-- Supabase. Marqueur d'environnement, comme 01_compat_auth.sql :
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
DECLARE t text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'vault') THEN
    RAISE EXCEPTION 'Schéma vault présent : cette base ressemble à un projet Supabase. Fichier réservé à la cible Clever Cloud.';
  END IF;
  IF (SELECT rolbypassrls FROM pg_roles WHERE rolname = 'service_role') THEN
    RAISE EXCEPTION 'service_role a déjà BYPASSRLS : ce fichier de repli est inutile.';
  END IF;
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename LOOP
    EXECUTE format('DROP POLICY IF EXISTS service_role_acces_serveur ON public.%I', t);
    EXECUTE format('CREATE POLICY service_role_acces_serveur ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)', t);
  END LOOP;
END $$;

-- ---------- contrôle final ----------
DO $$
DECLARE manquantes text; ouvertes text;
BEGIN
  SELECT string_agg(tablename, ', ') INTO manquantes FROM pg_tables pt
   WHERE schemaname = 'public' AND NOT EXISTS (
     SELECT 1 FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = pt.tablename
        AND p.policyname = 'service_role_acces_serveur');
  IF manquantes IS NOT NULL THEN
    RAISE EXCEPTION 'tables sans politique service_role_acces_serveur : %', manquantes;
  END IF;
  -- La politique ne doit valoir que pour service_role, jamais pour un autre rôle.
  SELECT string_agg(tablename, ', ') INTO ouvertes FROM pg_policies
   WHERE schemaname = 'public' AND policyname = 'service_role_acces_serveur'
     AND roles <> ARRAY['service_role']::name[];
  IF ouvertes IS NOT NULL THEN
    RAISE EXCEPTION 'politique service_role_acces_serveur ouverte à un autre rôle sur : %', ouvertes;
  END IF;
END $$;

COMMIT;
