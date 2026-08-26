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
-- Portée : REVOKE pour les 3 fonctions trigger (par hygiène). Pour
-- get_praticien_structure et structure_token_valide, DROP FUNCTION pur —
-- décidé le 2026-08-26 après confirmation qu'aucun appelant applicatif
-- n'existe (grep exhaustif src/ api/ scripts/ tests/ e2e/, zéro résultat) et
-- qu'aucune policy RLS ne les référence (requête live sur pg_policies,
-- résultat vide). Un DROP élimine la surface d'attaque de façon définitive
-- : un REVOKE seul peut être défait par une future migration qui recrée la
-- fonction sans reconsidérer ses grants (exactement ce qui s'est produit
-- avec 20260817_securite_07_revoke_get_praticien_structure.sql, contourné
-- par la recréation de la fonction dans 20260607_praticien_portail_structure.sql
-- avec un GRANT EXECUTE TO anon explicite).
--
-- Risque écarté : un client externe non visible dans ce dépôt qui
-- appellerait ces RPC directement avec la clé anon. Non pertinent ici : le
-- REVOKE FROM PUBLIC/anon plus bas dans cette même migration coupe déjà cet
-- accès avant le DROP — un tel appelant serait donc déjà cassé par le
-- REVOKE, que la fonction soit ensuite supprimée ou non. Le DROP n'ajoute
-- aucun risque de régression supplémentaire par rapport au REVOKE seul.
--
-- Portail structure testé manuellement le 2026-08-27, après l'ajout de
-- structures.expires_at en production : il fonctionne. Le DROP ne casse donc
-- rien du flux légitime (qui passe par GET /api/structure/data en
-- service_role, sans jamais appeler ces deux fonctions).
--
-- ── ROLLBACK ────────────────────────────────────────────────────────────
--   Pour set_praticien_id_from_auth / update_updated_at / update_updated_at_column :
--   GRANT EXECUTE ON FUNCTION public.set_praticien_id_from_auth() TO PUBLIC;
--   GRANT EXECUTE ON FUNCTION public.update_updated_at() TO PUBLIC;
--   GRANT EXECUTE ON FUNCTION public.update_updated_at_column() TO PUBLIC;
--
--   Pour get_praticien_structure et structure_token_valide, le DROP n'est
--   pas réversible par un simple GRANT — il faut recréer la fonction. Voir
--   20260607_praticien_portail_structure.sql pour la définition exacte de
--   get_praticien_structure ; structure_token_valide n'a pas de migration
--   de référence connue et devrait être récupérée depuis un dump récent de
--   production avant toute recréation.
--
-- ============================================================================

-- Pas de REVOKE sur get_praticien_structure ni structure_token_valide : le
-- DROP plus bas les supprime, ce qui retire tous leurs privilèges d'un coup.
-- Un REVOKE sur une fonction absente lève une erreur (contrairement à DROP
-- ... IF EXISTS) et rendrait cette migration non rejouable — sur un
-- environnement où elles ont déjà disparu, comme au second passage.

-- Par hygiène (voir en-tête) — fonctions trigger, non exploitables en
-- pratique mais incohérentes avec le reste du schéma tant qu'elles restent
-- ouvertes à PUBLIC/anon.
REVOKE EXECUTE ON FUNCTION public.set_praticien_id_from_auth() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_praticien_id_from_auth() FROM anon;

REVOKE EXECUTE ON FUNCTION public.update_updated_at() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_updated_at() FROM anon;

REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM anon;

-- Suppression pure : aucun appelant confirmé, architecture remplacée par
-- GET /api/structure/data (service_role) — voir MIGRATION_ANON.md.
DROP FUNCTION IF EXISTS public.get_praticien_structure(text);
DROP FUNCTION IF EXISTS public.structure_token_valide(uuid);

-- ── Auto-vérification ──────────────────────────────────────────────────
-- Fait échouer la migration elle-même (ROLLBACK automatique de la
-- transaction) si l'un des REVOKE/DROP ci-dessus n'a pas eu l'effet
-- attendu, plutôt que de dépendre d'une vérification manuelle après coup.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'get_praticien_structure'
  ) THEN
    RAISE EXCEPTION 'Échec vérification : get_praticien_structure existe encore';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'structure_token_valide'
  ) THEN
    RAISE EXCEPTION 'Échec vérification : structure_token_valide existe encore';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
