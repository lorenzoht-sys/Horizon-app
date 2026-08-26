-- ============================================================================
-- 20260826_revoke_public_execute_functions.sql
-- ============================================================================
--
-- Corrige un trou systémique découvert en auditant le lot 3 de l'étape 1
-- (F-11) : PostgreSQL accorde EXECUTE à PUBLIC automatiquement à la
-- création de toute fonction. Un `REVOKE EXECUTE ... FROM anon` seul ne
-- retire donc RIEN de concret — anon (comme authenticated, comme n'importe
-- quel rôle) continue d'exécuter la fonction par héritage implicite de
-- PUBLIC. Constaté par requête live sur staging le 2026-08-26 :
--   - get_praticien_structure(text) : anon_exec = true, public_exec = true
--     — malgré 20260817_securite_07_revoke_get_praticien_structure.sql déjà
--     appliqué (REVOKE ... FROM anon seul, insuffisant).
--   - structure_token_valide(uuid) : anon_exec = true, public_exec = true
--     — malgré 20260613_rls_anon_lockdown.sql:57 (même erreur, il y a des
--     mois). Ce correctif n'a donc jamais réellement fermé l'accès anonyme.
--
-- Audit complet des 10 fonctions de public sur staging (2026-08-26) : 5
-- exécutables par anon/PUBLIC au total. Les 3 autres (set_praticien_id_from_auth,
-- update_updated_at, update_updated_at_column) sont des fonctions TRIGGER
-- (RETURNS trigger) — Postgres refuse leur appel direct hors contexte de
-- trigger, donc peu exploitables en pratique malgré le même trou de GRANT.
-- Traitées ici par hygiène (cohérence du schéma), pas parce qu'un exploit
-- réel a été démontré pour elles. Un REVOKE EXECUTE ne casse jamais
-- l'invocation automatique d'un trigger : Postgres l'invoque par son
-- mécanisme interne, sans vérifier le privilège EXECUTE de l'utilisateur
-- qui déclenche l'INSERT/UPDATE/DELETE.
--
-- Vérification préalable (2026-08-26) : `grep -rn
-- "get_praticien_structure\|structure_token_valide" src/ api/ scripts/
-- tests/ e2e/` → AUCUN appelant applicatif, ni pour l'une ni pour l'autre,
-- quel que soit le rôle. authenticated et service_role ont aujourd'hui
-- EXECUTE sur ces 2 fonctions, mais uniquement par héritage implicite de
-- PUBLIC (aucun grant explicite propre à eux) — un REVOKE FROM PUBLIC leur
-- retire donc aussi l'accès. Sans risque fonctionnel confirmé (aucun
-- appelant identifié pour aucun rôle), mais à savoir si un besoin légitime
-- apparaissait plus tard : il faudrait alors un GRANT explicite au rôle
-- concerné, pas compter sur PUBLIC.
--
-- Portée : REVOKE uniquement (pas de DROP FUNCTION) — cohérent avec le lot
-- 3 original, un nettoyage plus profond reste une décision séparée.
--
-- ⚠️ NON APPLIQUÉE — préparée pour revue avant application sur staging puis
-- (séparément, après audit) sur production.
--
-- ── ROLLBACK ────────────────────────────────────────────────────────────
--   GRANT EXECUTE ON FUNCTION public.get_praticien_structure(text) TO PUBLIC;
--   GRANT EXECUTE ON FUNCTION public.structure_token_valide(uuid) TO PUBLIC;
--   GRANT EXECUTE ON FUNCTION public.set_praticien_id_from_auth() TO PUBLIC;
--   GRANT EXECUTE ON FUNCTION public.update_updated_at() TO PUBLIC;
--   GRANT EXECUTE ON FUNCTION public.update_updated_at_column() TO PUBLIC;
--
-- ============================================================================

REVOKE EXECUTE ON FUNCTION public.get_praticien_structure(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_praticien_structure(text) FROM anon;

REVOKE EXECUTE ON FUNCTION public.structure_token_valide(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.structure_token_valide(uuid) FROM anon;

-- Par hygiène (voir en-tête) — fonctions trigger, non exploitables en
-- pratique mais incohérentes avec le reste du schéma tant qu'elles restent
-- ouvertes à PUBLIC/anon.
REVOKE EXECUTE ON FUNCTION public.set_praticien_id_from_auth() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_praticien_id_from_auth() FROM anon;

REVOKE EXECUTE ON FUNCTION public.update_updated_at() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_updated_at() FROM anon;

REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM anon;

-- ── Auto-vérification ──────────────────────────────────────────────────
-- Fait échouer la migration elle-même (ROLLBACK automatique de la
-- transaction) si l'un des REVOKE ci-dessus n'a pas eu l'effet attendu,
-- plutôt que de dépendre d'une vérification manuelle après coup.
DO $$
BEGIN
  IF has_function_privilege('anon', 'public.get_praticien_structure(text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Échec vérification : anon peut encore exécuter get_praticien_structure';
  END IF;
  IF has_function_privilege('anon', 'public.structure_token_valide(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Échec vérification : anon peut encore exécuter structure_token_valide';
  END IF;
  IF has_function_privilege('public', 'public.get_praticien_structure(text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Échec vérification : PUBLIC peut encore exécuter get_praticien_structure';
  END IF;
  IF has_function_privilege('public', 'public.structure_token_valide(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Échec vérification : PUBLIC peut encore exécuter structure_token_valide';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
