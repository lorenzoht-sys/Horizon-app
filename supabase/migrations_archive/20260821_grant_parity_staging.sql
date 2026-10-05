-- ============================================================================
-- 20260821_grant_parity_staging.sql
-- ============================================================================
--
-- Corrige deux écarts entre staging et production repérés en comparant
-- supabase/_production_schema_dump.sql et supabase/_staging_schema_dump.sql
-- après le rejeu des 24 migrations sur staging (étape B) :
--
--   1. GRANT manquants sur 6 tables. Sur staging, ces 6 tables n'avaient que
--      les privilèges accordés par leur migration de création d'origine ;
--      des GRANT ultérieurs (ex. 20260613_rls_anon_lockdown.sql et
--      correctifs suivants) qui ont élargi les droits en production n'ont
--      pas d'équivalent explicite rejouable isolément — d'où l'écart.
--      templates_structure n'avait carrément AUCUN grant sur staging
--      (authenticated ni service_role).
--
--   2. rappel_preferences.rappel_jour_seance_heure : DEFAULT '08:00:00' sur
--      staging au lieu de '19:00:00'. La migration d'origine
--      (20260620_rappel_jour_seance.sql) pose bien DEFAULT '19:00:00' — cette
--      valeur ne vient donc d'aucune migration tracée, c'est une dérive
--      constatée uniquement sur staging (modification manuelle probable
--      pendant les tests). Réaligné ici sur la valeur de production.
--
-- Portée : GRANT ré-émis intégralement (pas de calcul différentiel par
-- rôle) — les privilèges déjà détenus sont simplement réaffirmés, sans
-- effet ni erreur. Les 12 GRANT ci-dessous sont recopiés tels quels depuis
-- supabase/_production_schema_dump.sql, aucun privilège inventé ou déduit.
--
-- ⚠️ Ce fichier est un rattrapage STAGING → PRODUCTION (les deux valeurs
-- cibles sont déjà celles en place sur prod). Rejouer ce fichier sur
-- production serait un no-op sans risque, mais il n'a de raison d'être
-- exécuté que sur staging.
--
-- IDEMPOTENTE : GRANT et ALTER COLUMN SET DEFAULT sont tous deux rejouables
-- sans effet si déjà appliqués.
-- ============================================================================


-- ============================================================================
-- 1. GRANT manquants — 6 tables (authenticated + service_role)
-- ============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public."retours_seance" TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public."retours_seance" TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public."templates_structure" TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public."templates_structure" TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public."tests_etalons_activations" TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public."tests_etalons_activations" TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public."tests_etalons_resultats" TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public."tests_etalons_resultats" TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public."exercices_libres_activations" TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public."exercices_libres_activations" TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public."exercices_libres_validations" TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public."exercices_libres_validations" TO service_role;


-- ============================================================================
-- 2. rappel_preferences.rappel_jour_seance_heure — réaligne le DEFAULT
-- ============================================================================
-- N'affecte que les futures lignes sans valeur explicite ; ne réécrit aucune
-- ligne existante (comportement standard d'ALTER COLUMN SET DEFAULT).

ALTER TABLE public.rappel_preferences
  ALTER COLUMN rappel_jour_seance_heure SET DEFAULT '19:00:00'::time without time zone;


-- ============================================================================
-- 3. Rechargement du schéma PostgREST
-- ============================================================================

NOTIFY pgrst, 'reload schema';
