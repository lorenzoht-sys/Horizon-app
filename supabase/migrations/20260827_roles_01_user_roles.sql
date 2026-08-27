-- ============================================================================
-- 20260827_roles_01_user_roles.sql   (étape 3 — fondation des rôles)
-- ============================================================================
--
-- Pose la table de rôles applicatifs, sans rien y brancher. À l'issue de
-- cette migration, l'application se comporte EXACTEMENT comme avant : aucune
-- route ne lit le rôle, aucune policy existante n'est modifiée, aucun compte
-- admin n'est créé. C'est l'étape 4 et 5.
--
-- ── Pourquoi une table dédiée, et pas une colonne sur `praticiens` ───────
-- C'est le point central de cette étape. Un praticien peut mettre à jour sa
-- propre ligne `praticiens` — c'est ainsi qu'il édite son profil (voir la
-- policy UPDATE de cette table). Une colonne `role` posée là lui donnerait
-- donc le droit de se promouvoir admin en une seule requête, depuis le
-- navigateur, sans rien contourner. Escalade de privilège directe.
--
-- Séparer le rôle dans une table SANS AUCUNE policy d'écriture est ce qui
-- rend cette escalade impossible : il n'existe simplement aucun chemin par
-- lequel un utilisateur authentifié peut écrire son rôle.
--
-- ── Pourquoi `app_role` et pas `role` ────────────────────────────────────
-- `organisation_membres.role` existe déjà et désigne autre chose : un rôle
-- SCOPÉ À UNE ORGANISATION (mode organisation, hors périmètre bêta). Deux
-- colonnes `role` dans le même schéma, avec des sémantiques différentes,
-- finiraient par être confondues dans une policy. `app_role` lève
-- l'ambiguïté à la lecture.
--
-- ── Pourquoi TEXT + CHECK et pas un type ENUM ────────────────────────────
-- Un ENUM nommé `app_role` porterait le même nom que la colonne, ce qui
-- rend les messages d'erreur Postgres pénibles à lire. Et ajouter une
-- valeur à un ENUM (`ALTER TYPE ... ADD VALUE`) ne peut pas s'exécuter dans
-- une transaction sur les versions courantes — mauvaise propriété pour une
-- migration. La contrainte CHECK donne la même garantie, se modifie dans
-- une transaction, et se lit sans aller chercher la définition du type.
--
-- ── Récursion RLS : pourquoi une fonction SECURITY DEFINER ───────────────
-- Le piège classique : une policy sur une table X qui demande « cet
-- utilisateur est-il admin ? » en interrogeant `user_roles` déclenche
-- l'évaluation des policies de `user_roles`, qui peuvent à leur tour
-- interroger X. Postgres part alors en récursion infinie
-- (« infinite recursion detected in policy for relation ... »).
--
-- Ici, la policy de `user_roles` est un simple `user_id = auth.uid()`, sans
-- sous-requête : la récursion ne peut pas s'amorcer aujourd'hui. Mais les
-- policies de l'étape 5 interrogeront `user_roles` depuis d'autres tables,
-- et c'est là que le piège se referme. On pose donc dès maintenant le
-- chemin d'accès correct : `public.app_role_courant()`, SECURITY DEFINER,
-- qui s'exécute avec les droits de son propriétaire (`postgres`, qui a
-- `rolbypassrls`) et ne déclenche donc AUCUNE évaluation de policy.
--
-- L'alternative — lire le rôle depuis un claim JWT personnalisé — a été
-- écartée : elle suppose un Auth Hook Supabase et un jeton régénéré à
-- chaque changement de rôle, donc un rôle qui reste périmé jusqu'à la
-- prochaine connexion. Inacceptable pour une révocation d'admin.
--
-- ── search_path figé et REVOKE explicite ─────────────────────────────────
-- `SET search_path = public` sur la fonction : c'est [F-08], corrigé sur
-- tout le projet le 2026-08-27, on ne le réintroduit pas.
-- `REVOKE EXECUTE ... FROM PUBLIC` : PostgreSQL accorde EXECUTE à PUBLIC
-- automatiquement à la création de toute fonction. C'est la faille trouvée
-- le 2026-08-26 (PR #8), qui traînait depuis juin — un REVOKE sur `anon`
-- seul ne retire rien tant que PUBLIC garde le privilège.
--
-- ── Vérification ─────────────────────────────────────────────────────────
-- tests/security/rls.spec.ts, describe « [RÔLES] user_roles », écrit AVANT
-- cette migration : lecture de sa propre ligne autorisée, lecture de celle
-- d'un autre refusée, écriture de son propre rôle refusée, insertion
-- refusée, et audit inverse (aucune policy existante ne mentionne
-- `user_roles` ni `app_role`).
--
-- ── ROLLBACK ────────────────────────────────────────────────────────────
--   DROP FUNCTION IF EXISTS public.app_role_courant();
--   DROP TABLE IF EXISTS public.user_roles;
-- (Purement additive : rien d'autre à défaire, aucune policy existante
--  n'ayant été modifiée.)
--
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.user_roles (
  user_id    uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  app_role   text NOT NULL CHECK (app_role IN ('admin', 'praticien')),
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.user_roles IS
  'Rôle applicatif par compte (admin | praticien). Aucune policy d''écriture : '
  'modifiable uniquement par service_role. Ne pas remplacer par une colonne sur '
  'praticiens — un praticien peut mettre à jour sa propre ligne et se promouvrait.';

-- ON DELETE CASCADE vers auth.users : une ligne de rôle n'a aucun sens sans
-- le compte qu'elle qualifie. C'est la SEULE cascade introduite ici.
-- Aucune autre FK en cascade (décision d'étape 3).

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Pas de FORCE ROW LEVEL SECURITY : `postgres` et `service_role` ont tous
-- deux l'attribut `rolbypassrls` (vérifié le 2026-08-27), que FORCE ne
-- surpasse pas. Ce serait décoratif, et donc trompeur.

-- ── Lecture : sa propre ligne, rien d'autre ─────────────────────────────
DROP POLICY IF EXISTS "user_roles_lecture_propre_ligne" ON public.user_roles;
CREATE POLICY "user_roles_lecture_propre_ligne"
  ON public.user_roles
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- ── Écriture : AUCUNE POLICY, délibérément ──────────────────────────────
-- Ce n'est pas un oubli. `authenticated` et `anon` n'ont pas `rolbypassrls`
-- (vérifié) : sans policy INSERT/UPDATE/DELETE, aucune écriture ne leur est
-- possible, quel que soit le chemin. Le jour où quelqu'un ajoute une policy
-- d'écriture ici, il rouvre l'escalade que cette table existe pour fermer.

-- ── Backfill : tous les comptes existants sont praticiens ───────────────
-- Idempotent (ON CONFLICT), donc rejouable. Sur un environnement neuf sans
-- compte, la requête ne fait rien.
INSERT INTO public.user_roles (user_id, app_role)
SELECT u.id, 'praticien' FROM auth.users u
ON CONFLICT (user_id) DO NOTHING;

-- ── Lecture du rôle sans déclencher de policy ───────────────────────────
CREATE OR REPLACE FUNCTION public.app_role_courant()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT app_role FROM public.user_roles WHERE user_id = auth.uid();
$$;

COMMENT ON FUNCTION public.app_role_courant() IS
  'Rôle applicatif de l''appelant, lu sans déclencher les policies de user_roles '
  '(SECURITY DEFINER). À utiliser dans les policies des autres tables plutôt '
  'qu''une sous-requête sur user_roles, qui provoquerait une récursion RLS.';

-- PostgreSQL accorde EXECUTE à PUBLIC à la création : le retirer d'abord,
-- puis accorder explicitement à qui en a besoin. Un REVOKE sur `anon` seul
-- ne retirerait rien tant que PUBLIC garde le privilège (leçon de la PR #8).
REVOKE EXECUTE ON FUNCTION public.app_role_courant() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.app_role_courant() FROM anon;
GRANT  EXECUTE ON FUNCTION public.app_role_courant() TO authenticated;
GRANT  EXECUTE ON FUNCTION public.app_role_courant() TO service_role;

-- ── Auto-vérification ───────────────────────────────────────────────────
-- Fait échouer la migration (et donc annuler la transaction) si l'un des
-- invariants n'est pas tenu, plutôt que de dépendre d'un contrôle manuel.
DO $$
DECLARE
  n_policies_ecriture int;
  n_sans_role         int;
BEGIN
  SELECT count(*) INTO n_policies_ecriture
    FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'user_roles' AND cmd <> 'SELECT';
  IF n_policies_ecriture > 0 THEN
    RAISE EXCEPTION 'Echec verification : % policy(ies) d''ecriture sur user_roles — l''escalade de privilege est rouverte', n_policies_ecriture;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_class WHERE oid = 'public.user_roles'::regclass AND relrowsecurity
  ) THEN
    RAISE EXCEPTION 'Echec verification : RLS non activee sur user_roles';
  END IF;

  IF EXISTS (
    SELECT 1 FROM aclexplode(COALESCE(
      (SELECT proacl FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'app_role_courant'),
      acldefault('f', 10)
    )) a WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'Echec verification : app_role_courant() est encore executable par PUBLIC';
  END IF;

  SELECT count(*) INTO n_sans_role
    FROM auth.users u LEFT JOIN public.user_roles r ON r.user_id = u.id
   WHERE r.user_id IS NULL;
  IF n_sans_role > 0 THEN
    RAISE EXCEPTION 'Echec verification : % compte(s) sans role apres backfill', n_sans_role;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
