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
-- Les DEUX `REVOKE EXECUTE` plus bas sont nécessaires, aucun ne couvre
-- l'autre. Il a fallu deux incidents pour l'établir :
--
--   1. PostgreSQL accorde EXECUTE à PUBLIC à la création de toute fonction.
--      Un REVOKE sur `anon` seul ne retire rien tant que PUBLIC garde le
--      privilège — faille de la PR #8, trouvée le 2026-08-26.
--
--   2. La PRODUCTION accorde EN PLUS EXECUTE à `anon` NOMMÉMENT, via un
--      `ALTER DEFAULT PRIVILEGES ... ON FUNCTIONS` (relevé le 2026-08-29 ;
--      `20260613_rls_anon_lockdown.sql` a traité TABLES et SEQUENCES, jamais
--      FUNCTIONS). Un grant nominatif ne tombe PAS avec un REVOKE FROM
--      PUBLIC : symétrique exact du point 1.
--
-- C'est aussi l'explication profonde de la PR #8 : `get_praticien_structure`
-- et `structure_token_valide` ne sont pas devenues exécutables par `anon`,
-- elles sont NÉES ainsi. Le chantier de fond est dans docs/PLAN-BETA.md.
--
-- ── ALTER DEFAULT PRIVILEGES : pourquoi les REVOKE ci-dessous ──────────
-- La production porte une règle de privilèges par défaut sur le schéma
-- `public`, absente de staging (constaté le 2026-08-29) :
--
--   pg_default_acl → postgres | public | r |
--     {postgres=arwdDxtm/postgres, authenticated=arwdDxtm/postgres,
--      service_role=arwdDxtm/postgres}
--
-- Conséquence : en production, TOUTE table créée par `postgres` dans
-- `public` naît avec l'intégralité des privilèges déjà accordée à
-- `authenticated` — SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES,
-- TRIGGER, MAINTAIN. Un `GRANT SELECT` ne restreint alors rien : il
-- réaffirme un privilège déjà détenu, et tous les autres subsistent.
--
-- C'est ce qui a fait échouer la première version de cette migration en
-- production le 2026-08-29, sur sa propre auto-vérification
-- (« authenticated a un privilege d'ecriture »). Le garde-fou a joué son
-- rôle : transaction annulée, table non créée. C'est aussi,
-- rétrospectivement, l'explication des écarts de GRANT staging/production
-- rattrapés les 21 et 22 août (20260821/20260822_grant_parity_staging) —
-- hypothèse alors écartée à tort.
--
-- D'où le REVOKE explicite avant tout GRANT. Il ne corrige QUE cette table :
-- la règle par défaut reste en place et continue de s'appliquer à chaque
-- nouvelle table du schéma. La question de la retirer est ouverte, voir
-- docs/PLAN-BETA.md.
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

-- ── Privilèges de table : la couche que RLS ne remplace pas ─────────────
-- Une policy FILTRE ce qu'un rôle déjà autorisé peut voir ; elle n'AUTORISE
-- rien par elle-même. Sans GRANT, PostgREST répond « permission denied for
-- table user_roles » (42501) et les policies ne sont jamais évaluées.
-- Constaté le 2026-08-27 : cette migration a d'abord été écrite sans ces
-- GRANT, et les tests de lecture ont échoué alors que la policy était bonne.
--
-- `authenticated` ne reçoit que SELECT : l'écriture lui est donc fermée aux
-- DEUX niveaux (aucun privilège, et aucune policy). Il faudrait défaire les
-- deux pour rouvrir l'escalade.
-- `anon` ne reçoit rien : le portail patient n'a aucune raison de connaître
-- les rôles applicatifs.
--
-- ⚠️ Le REVOKE ci-dessous n'est PAS décoratif — voir la section
-- « ALTER DEFAULT PRIVILEGES » en tête de fichier. En production, la table
-- naît avec arwdDxtm déjà accordé à `authenticated` : sans REVOKE préalable,
-- le GRANT SELECT n'enlève rien et `authenticated` conserve INSERT, UPDATE,
-- DELETE et TRUNCATE. On repart donc d'une ardoise vide, puis on accorde.
-- L'ordre REVOKE-puis-GRANT rend l'état final indépendant de la présence ou
-- non de la règle par défaut : cette migration donne le même résultat en
-- production et sur staging, qui ne l'a pas.
REVOKE ALL ON TABLE public.user_roles FROM PUBLIC;
REVOKE ALL ON TABLE public.user_roles FROM anon;
REVOKE ALL ON TABLE public.user_roles FROM authenticated;
REVOKE ALL ON TABLE public.user_roles FROM service_role;

GRANT SELECT ON TABLE public.user_roles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.user_roles TO service_role;

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
  privs_authenticated text;
  privs_anon          text;
  privs_public        text;
  execute_fonction    text;
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

  -- ── Qui peut EXECUTER app_role_courant() ─────────────────────────
  -- Ce controle ne testait au depart que PUBLIC. Insuffisant : la production
  -- porte AUSSI un `ALTER DEFAULT PRIVILEGES ... GRANT EXECUTE ON FUNCTIONS`
  -- qui accorde EXECUTE a `anon` NOMMEMENT (constate le 2026-08-29, sur les
  -- deux regles, postgres et supabase_admin). Un grant nominatif ne tombe
  -- pas avec un REVOKE FROM PUBLIC : verifie par simulation le 2026-08-29,
  -- la migration passait au vert avec anon=EXECUTE. C'est la meme mecanique
  -- que la faille de la PR #8, dans l'autre sens.
  --
  -- On compare donc l'ENSEMBLE EXACT des beneficiaires, proprietaire exclu,
  -- plutot que de tester des cas un par un.
  SELECT string_agg(g, ', ' ORDER BY g) INTO execute_fonction
    FROM (
      SELECT CASE WHEN a.grantee = 0 THEN 'PUBLIC'
                  ELSE a.grantee::regrole::text END AS g
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
       WHERE n.nspname = 'public'
         AND p.proname = 'app_role_courant'
         AND a.privilege_type = 'EXECUTE'
         AND a.grantee <> p.proowner
    ) x;
  IF execute_fonction IS DISTINCT FROM 'authenticated, service_role' THEN
    RAISE EXCEPTION 'Echec verification : app_role_courant() est executable par [%], attendu [authenticated, service_role]',
      COALESCE(execute_fonction, 'personne');
  END IF;

  SELECT count(*) INTO n_sans_role
    FROM auth.users u LEFT JOIN public.user_roles r ON r.user_id = u.id
   WHERE r.user_id IS NULL;
  IF n_sans_role > 0 THEN
    RAISE EXCEPTION 'Echec verification : % compte(s) sans role apres backfill', n_sans_role;
  END IF;

  -- ── Les privilèges de table, que RLS ne remplace pas ──────────────
  -- On vérifie l'ACL EXACTE, et non une liste de has_table_privilege().
  -- Une liste doit énumérer les privilèges interdits, et en oublie : la
  -- version précédente ne testait qu'INSERT/UPDATE/DELETE et laissait donc
  -- passer TRUNCATE — qui suffit à vider la table des rôles, et que RLS
  -- n'intercepte jamais (TRUNCATE ignore les policies). Nommer MAINTAIN
  -- (PG17) casserait par ailleurs la migration sur PG16. L'ACL, elle, se
  -- lit sans dépendre ni de la version ni d'une liste à tenir à jour.
  SELECT string_agg(a.privilege_type, ', ' ORDER BY a.privilege_type)
    INTO privs_authenticated
    FROM pg_class c
    CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) a
   WHERE c.oid = 'public.user_roles'::regclass
     AND a.grantee = 'authenticated'::regrole;
  IF privs_authenticated IS DISTINCT FROM 'SELECT' THEN
    RAISE EXCEPTION 'Echec verification : privileges de authenticated sur user_roles = [%], attendu [SELECT] — un REVOKE manque (voir ALTER DEFAULT PRIVILEGES en tete de fichier)',
      COALESCE(privs_authenticated, 'aucun');
  END IF;

  SELECT string_agg(a.privilege_type, ', ' ORDER BY a.privilege_type)
    INTO privs_anon
    FROM pg_class c
    CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) a
   WHERE c.oid = 'public.user_roles'::regclass
     AND a.grantee = 'anon'::regrole;
  IF privs_anon IS NOT NULL THEN
    RAISE EXCEPTION 'Echec verification : anon detient [%] sur user_roles, attendu aucun privilege', privs_anon;
  END IF;

  -- grantee = 0 dans une ACL, c'est PUBLIC : tout rôle présent ou futur.
  SELECT string_agg(a.privilege_type, ', ' ORDER BY a.privilege_type)
    INTO privs_public
    FROM pg_class c
    CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) a
   WHERE c.oid = 'public.user_roles'::regclass
     AND a.grantee = 0;
  IF privs_public IS NOT NULL THEN
    RAISE EXCEPTION 'Echec verification : PUBLIC detient [%] sur user_roles, attendu aucun privilege', privs_public;
  END IF;

  -- ── Signalement : la règle par défaut est-elle encore en place ? ─────
  -- Volontairement un WARNING et non une EXCEPTION : cette migration doit
  -- pouvoir s'appliquer sans attendre l'arbitrage sur la règle elle-même.
  -- Le message rappelle que le REVOKE ci-dessus protège CETTE table, et
  -- elle seule.
  IF EXISTS (
    SELECT 1
      FROM pg_default_acl d
      JOIN pg_namespace n ON n.oid = d.defaclnamespace
      CROSS JOIN LATERAL aclexplode(d.defaclacl) a
     WHERE n.nspname = 'public'
       AND d.defaclobjtype = 'r'
       AND a.grantee = 'authenticated'::regrole
       AND a.privilege_type <> 'SELECT'
  ) THEN
    RAISE WARNING 'ALTER DEFAULT PRIVILEGES actif sur public : toute NOUVELLE table y naitra ouverte en ecriture a authenticated. user_roles est protegee par REVOKE, les autres tables ne le sont que par leur RLS. Voir docs/PLAN-BETA.md.';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
