-- ============================================================================
-- 20260829_roles_02_trigger_role_par_defaut.sql   (étape 4 — prérequis)
-- ============================================================================
--
-- Bouche un trou ouvert par l'étape 3 : son backfill était PONCTUEL. Tout
-- compte créé après elle n'a aucune ligne `user_roles`, donc
-- `app_role_courant()` renvoie NULL pour lui.
--
-- Ce n'est pas théorique : `/register` (src/pages/RegisterPage.tsx, route
-- publique déclarée dans src/App.tsx) permet à n'importe qui de créer un
-- compte praticien. Chacun de ces comptes est aujourd'hui sans rôle.
--
-- ── Pourquoi un trigger, et pas un INSERT côté application ───────────────
-- `user_roles` n'a AUCUNE policy d'écriture, délibérément (étape 3) : le
-- navigateur ne peut donc pas écrire la ligne, et c'est exactement ce qu'on
-- veut — sinon l'escalade de privilège que l'étape 3 ferme se rouvre.
-- Restait le service_role depuis une route serveur : mais l'inscription
-- passe par `supabase.auth.signUp()` côté client, sans route serveur. Le
-- trigger est le seul point qui voit TOUTES les créations de compte, quelle
-- que soit leur origine — /register, Studio, ou l'interface admin à venir.
--
-- ── Pourquoi 'praticien' et jamais 'admin' ──────────────────────────────
-- Moindre privilège. Ce trigger ne doit jamais pouvoir fabriquer un admin :
-- la valeur est écrite en dur, elle ne vient d'aucune donnée d'entrée. Un
-- admin se crée exclusivement par service_role, hors de ce chemin.
--
-- ── Aucun changement de privilège pour personne ─────────────────────────
-- Les comptes concernés se comportent DÉJÀ comme des praticiens (aucune
-- policy ne lit encore le rôle). Cette migration écrit une ligne qui
-- constate l'existant. Elle est purement additive.
--
-- ── REVOKE sur la fonction : obligatoire, pas décoratif ─────────────────
-- La production accorde EXECUTE à `anon` NOMMÉMENT sur toute nouvelle
-- fonction de `public` (pg_default_acl, relevé le 2026-08-29 ;
-- 20260613_rls_anon_lockdown.sql a traité TABLES et SEQUENCES, jamais
-- FUNCTIONS — voir le chantier planifié dans docs/PLAN-BETA.md). Une
-- fonction SECURITY DEFINER exécutable par anon, c'est la faille de la
-- PR #8. Il faut les DEUX REVOKE : celui sur PUBLIC ne retire pas un grant
-- nominatif à anon, et réciproquement.
--
-- Un trigger n'a pas besoin qu'un rôle détienne EXECUTE pour se déclencher :
-- retirer EXECUTE à tout le monde ne casse rien, et ferme l'appel direct.
--
-- ── ROLLBACK ────────────────────────────────────────────────────────────
--   DROP TRIGGER IF EXISTS trg_auth_users_role_par_defaut ON auth.users;
--   DROP FUNCTION IF EXISTS public.attribuer_role_par_defaut();
-- (Les lignes `user_roles` déjà créées peuvent rester : elles ne font que
--  constater l'existant.)
--
-- ============================================================================

CREATE OR REPLACE FUNCTION public.attribuer_role_par_defaut()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Valeur en dur : ce chemin ne doit jamais pouvoir produire un admin.
  -- ON CONFLICT : idempotent, et sans effet si la ligne existe déjà.
  INSERT INTO public.user_roles (user_id, app_role)
  VALUES (NEW.id, 'praticien')
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.attribuer_role_par_defaut() IS
  'Donne le rôle « praticien » à tout compte auth nouvellement créé. Valeur en '
  'dur : ce chemin ne peut pas produire un admin. Un admin se cree uniquement '
  'par service_role.';

-- On retire à TOUT LE MONDE, service_role compris : un trigger se déclenche
-- sans que le rôle appelant détienne EXECUTE (le privilège n'est exigé qu'à
-- la CRÉATION du trigger). Personne n'a donc de raison de pouvoir l'appeler
-- directement.
--
-- État final voulu : AUCUN bénéficiaire hors propriétaire. C'est aussi ce qui
-- rend cette migration identique en production et sur staging : si on
-- laissait service_role, l'état final dépendrait de la règle par défaut, que
-- la production a et pas staging — et l'auto-vérification échouerait sur
-- staging après être passée en production.
REVOKE EXECUTE ON FUNCTION public.attribuer_role_par_defaut() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.attribuer_role_par_defaut() FROM anon;
REVOKE EXECUTE ON FUNCTION public.attribuer_role_par_defaut() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.attribuer_role_par_defaut() FROM service_role;

DROP TRIGGER IF EXISTS trg_auth_users_role_par_defaut ON auth.users;
CREATE TRIGGER trg_auth_users_role_par_defaut
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.attribuer_role_par_defaut();

-- Rattrapage des comptes créés entre l'étape 3 et aujourd'hui.
INSERT INTO public.user_roles (user_id, app_role)
SELECT u.id, 'praticien' FROM auth.users u
ON CONFLICT (user_id) DO NOTHING;

-- ── Auto-vérification ───────────────────────────────────────────────────
-- Ensembles exacts, jamais de cas énumérés un par un (règle de méthode,
-- docs/PLAN-BETA.md).
DO $$
DECLARE
  execute_fonction text;
  n_sans_role      int;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgrelid = 'auth.users'::regclass
       AND tgname = 'trg_auth_users_role_par_defaut'
       AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'Echec verification : le trigger trg_auth_users_role_par_defaut est absent de auth.users';
  END IF;

  SELECT string_agg(g, ', ' ORDER BY g) INTO execute_fonction
    FROM (
      SELECT CASE WHEN a.grantee = 0 THEN 'PUBLIC'
                  ELSE a.grantee::regrole::text END AS g
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
       WHERE n.nspname = 'public'
         AND p.proname = 'attribuer_role_par_defaut'
         AND a.privilege_type = 'EXECUTE'
         AND a.grantee <> p.proowner
    ) x;
  IF execute_fonction IS NOT NULL THEN
    RAISE EXCEPTION 'Echec verification : attribuer_role_par_defaut() est executable par [%], attendu par personne',
      execute_fonction;
  END IF;

  SELECT count(*) INTO n_sans_role
    FROM auth.users u LEFT JOIN public.user_roles r ON r.user_id = u.id
   WHERE r.user_id IS NULL;
  IF n_sans_role > 0 THEN
    RAISE EXCEPTION 'Echec verification : % compte(s) sans role apres rattrapage', n_sans_role;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
