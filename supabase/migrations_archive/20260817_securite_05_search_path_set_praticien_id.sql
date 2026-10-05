-- ============================================================================
-- 20260817_securite_05_search_path_set_praticien_id.sql
-- ============================================================================
--
-- Ferme : [F-08] du rapport docs/RAPPORT_SECURITE.md.
--
-- Preuve : `set_praticien_id_from_auth()` (définie dans `supabase/schema.sql`,
-- table "historique" antérieure au dossier migrations) est SECURITY DEFINER
-- sans `SET search_path` figé — seule fonction du projet dans ce cas, les 7
-- fonctions plus récentes (`structure_token_valide`, `get_praticien_structure`,
-- `acces_participant_pour`, `est_membre_organisation`, `est_admin_organisation`,
-- `acces_participant`) suivent toutes la convention `SET search_path = public`.
--
-- Impact : vecteur d'élévation de privilège classique en théorie (un objet
-- homonyme dans un schéma placé avant `public` dans le search_path de la
-- session pourrait être exécuté à la place de l'attendu) ; impact réel
-- probablement faible ici car la fonction ne fait qu'un
-- `NEW.praticien_id = auth.uid()`, mais corrigé par cohérence avec le
-- reste du projet.
--
-- Correctif : fixe le search_path sans redéfinir le corps de la fonction
-- (ALTER FUNCTION, pas CREATE OR REPLACE — aucun risque de divergence avec
-- la définition existante en production).
--
-- ⚠️ NON TESTÉ AUTOMATIQUEMENT contre une vraie base dans cette session.
-- Test dédié : tests/security/rls.spec.ts (`[F-08] set_praticien_id_from_auth()
-- a un search_path figé`), conçu pour échouer avant ce correctif. À faire
-- tourner sur staging avant tout passage en production.
--
-- ── ROLLBACK ────────────────────────────────────────────────────────────
--   ALTER FUNCTION public.set_praticien_id_from_auth() RESET search_path;
--
-- ============================================================================

ALTER FUNCTION public.set_praticien_id_from_auth() SET search_path = public;

NOTIFY pgrst, 'reload schema';
