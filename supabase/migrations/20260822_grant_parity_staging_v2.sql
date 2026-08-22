-- ============================================================================
-- 20260822_grant_parity_staging_v2.sql
-- ============================================================================
--
-- Deuxième vague de rattrapage GRANT staging → production, après
-- 20260821_grant_parity_staging.sql (6 tables). La comparaison intégrale de
-- l'étape E (supabase/_production_schema_dump.sql vs
-- supabase/_staging_schema_dump.sql, GRANT inclus cette fois) a révélé 14
-- tables supplémentaires en écart, en deux groupes :
--
--   - 10 tables SANS AUCUN grant sur staging (ni authenticated, ni
--     service_role) : documents_partages, documents_patient,
--     dossier_exercice_membres, dossiers_exercices, evenements_agenda,
--     exercices_personnalises, organisation_demande_attempts,
--     organisation_invitations, organisation_membres, organisations.
--
--   - 4 tables avec un jeu de privilèges réduit sur staging (SELECT, INSERT,
--     UPDATE, DELETE seulement, sans TRUNCATE/REFERENCES/TRIGGER) :
--     programme_modele_exercices, programme_modele_planning,
--     programme_modele_seances, programmes_modeles.
--
-- Cause identique au lot précédent : le rejeu des 24 migrations sur staging
-- ne pose que le GRANT minimal fixé par la migration de création d'origine
-- de chaque table. Les GRANT accumulés en production au fil de correctifs
-- ultérieurs (ex. 20260613_rls_anon_lockdown.sql et les correctifs suivants)
-- n'ont pas d'équivalent rejouable isolément — d'où l'écart, qui touche ici
-- des tables créées à des dates différentes (pas seulement le lot
-- mode_organisation du 14 juillet).
--
-- Portée : GRANT ré-émis intégralement (pas de calcul différentiel par
-- rôle), même méthode que 20260821_grant_parity_staging.sql — les
-- privilèges déjà détenus sont simplement réaffirmés, sans effet ni erreur.
-- Les 28 GRANT ci-dessous sont recopiés tels quels depuis
-- supabase/_production_schema_dump.sql, aucun privilège inventé ou déduit.
--
-- ⚠️ Ce fichier est un rattrapage STAGING → PRODUCTION (les valeurs cibles
-- sont déjà celles en place sur prod). Rejouer ce fichier sur production
-- serait un no-op sans risque, mais il n'a de raison d'être exécuté que sur
-- staging.
--
-- IDEMPOTENTE : GRANT rejouables sans effet si déjà appliqués.
-- ============================================================================


-- ============================================================================
-- 1. Tables sans aucun grant sur staging (10 tables)
-- ============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public."documents_partages" TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public."documents_partages" TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public."documents_patient" TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public."documents_patient" TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public."dossier_exercice_membres" TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public."dossier_exercice_membres" TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public."dossiers_exercices" TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public."dossiers_exercices" TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public."evenements_agenda" TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public."evenements_agenda" TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public."exercices_personnalises" TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public."exercices_personnalises" TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public."organisation_demande_attempts" TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public."organisation_demande_attempts" TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public."organisation_invitations" TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public."organisation_invitations" TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public."organisation_membres" TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public."organisation_membres" TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public."organisations" TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public."organisations" TO service_role;


-- ============================================================================
-- 2. Tables avec un jeu de privilèges réduit sur staging (4 tables)
-- ============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public."programme_modele_exercices" TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public."programme_modele_exercices" TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public."programme_modele_planning" TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public."programme_modele_planning" TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public."programme_modele_seances" TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public."programme_modele_seances" TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public."programmes_modeles" TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public."programmes_modeles" TO service_role;


-- ============================================================================
-- 3. Rechargement du schéma PostgREST
-- ============================================================================

NOTIFY pgrst, 'reload schema';
