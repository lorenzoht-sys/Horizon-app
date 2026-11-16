-- ============================================================================
-- Compléments après restauration d'un dump du schéma public
-- (2026-11-16, lot « transfert de la base » de la migration HDS)
-- ============================================================================
-- À NE PAS confondre avec une migration : ce fichier n'est PAS dans
-- supabase/migrations/. Il se joue sur la base Clever Cloud APRÈS la
-- restauration du schéma et des données (clevercloud/scripts/transferer-base.sh
-- le fait lui-même).
--
-- Pourquoi : `pg_dump --schema=public` n'emporte pas le trigger
-- trg_auth_users_role_par_defaut, parce qu'il est posé sur une table du schéma
-- `auth`. La migration de référence le recrée à la main pour la même raison
-- (20260528000000_baseline_schema_prod.sql). Sans lui, un praticien ajouté à
-- auth.users après la bascule n'aurait aucune ligne dans user_roles.
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
  IF to_regprocedure('public.attribuer_role_par_defaut()') IS NULL THEN
    RAISE EXCEPTION 'public.attribuer_role_par_defaut() absente : restaurer le schéma avant ce fichier.';
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_auth_users_role_par_defaut ON auth.users;
CREATE TRIGGER trg_auth_users_role_par_defaut
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.attribuer_role_par_defaut();

-- ---------- contrôle final ----------
DO $$
DECLARE sans_rls text; orphelins int;
BEGIN
  IF (SELECT count(*) FROM pg_trigger WHERE tgrelid = 'auth.users'::regclass
        AND tgname = 'trg_auth_users_role_par_defaut' AND NOT tgisinternal) <> 1 THEN
    RAISE EXCEPTION 'trigger trg_auth_users_role_par_defaut absent de auth.users';
  END IF;
  -- La section post-data du dump active la RLS : si elle a été oubliée ou
  -- interrompue, les tables seraient ouvertes à tout praticien connecté.
  SELECT string_agg(tablename, ', ') INTO sans_rls
    FROM pg_tables WHERE schemaname = 'public' AND NOT rowsecurity;
  IF sans_rls IS NOT NULL THEN
    RAISE EXCEPTION 'tables sans RLS après restauration : %', sans_rls;
  END IF;
  -- Tout compte doté d'un rôle doit exister dans auth.users (sinon la clé
  -- étrangère aurait refusé la restauration ; contrôle de ceinture).
  SELECT count(*) INTO orphelins FROM public.user_roles r
    WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = r.user_id);
  IF orphelins <> 0 THEN
    RAISE EXCEPTION '% ligne(s) de user_roles sans compte dans auth.users', orphelins;
  END IF;
END $$;

COMMIT;
