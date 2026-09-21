-- ============================================================================
-- 20260921_cours_collectifs_fix_recursion_rls.sql
-- ============================================================================
--
-- Corrige : « infinite recursion detected in policy for relation
-- "cours_collectifs" » (SQLSTATE 42P17), signalé par Pierre à la création d'un
-- cours collectif. Reproduit sur staging le 2026-09-21 : l'erreur ne touche pas
-- que l'INSERT, elle touche AUSSI tout SELECT sur cours_collectifs ET sur
-- participations_cours_collectifs, pour tout praticien — le chargement des
-- cours dans l'agenda échoue donc lui aussi (useCoursCollectifs ne fait qu'un
-- console.error), depuis l'application de 20260917_cours_collectifs.sql.
--
-- ── Cause ───────────────────────────────────────────────────────────────────
-- Les policies des deux tables se lisent mutuellement, chacune sous RLS :
--
--   cours_collectifs / orga_acces_cours_collectifs
--       EXISTS (SELECT … FROM participations_cours_collectifs …)
--   participations_cours_collectifs / praticien_gere_participations_cours_collectifs
--       cours_id IN (SELECT c.id FROM cours_collectifs c WHERE c.praticien_id = auth.uid())
--
-- Une requête sur cours_collectifs développe orga_acces_… → lit participations
-- (RLS appliquée) → développe praticien_gere_participations_… → lit
-- cours_collectifs (RLS appliquée) → développe orga_acces_… → … Postgres
-- détecte la boucle à la réécriture de la requête, avant toute évaluation :
-- même une requête qui ne pourrait jamais atteindre la seconde branche
-- (« OR » court-circuité) échoue. Les policies étant permissives (combinées
-- par OR), aucune ne « gagne » avant l'autre.
--
-- ── Correctif ───────────────────────────────────────────────────────────────
-- On coupe UNE arête du cycle : participations → cours_collectifs. La lecture
-- « ce cours m'appartient-il ? » passe par une fonction SECURITY DEFINER, qui
-- lit cours_collectifs sans repasser par sa RLS. Même convention que
-- acces_participant() (20260714_01) : SECURITY DEFINER, STABLE,
-- SET search_path = public, REVOKE PUBLIC/anon, GRANT authenticated.
--
-- Pas d'élargissement d'accès : la fonction ne renvoie vrai que pour un cours
-- dont praticien_id = auth.uid(), c'est-à-dire exactement ce que la sous-requête
-- de la policy retournait déjà pour l'appelant. Elle ne révèle rien sur les
-- cours d'un autre praticien.
--
-- L'autre arête (cours_collectifs → participations) reste sous RLS : c'est
-- voulu, orga_acces_cours_collectifs doit continuer à ne voir que les
-- participations auxquelles l'appelant a accès (acces_participant).
--
-- ── Autres tables ───────────────────────────────────────────────────────────
-- Graphe « table → tables lues dans ses policies » construit sur les 122
-- policies de supabase/migrations/*.sql + schema.sql (DROP POLICY pris en
-- compte) : ce cycle est le SEUL. Aucune autre auto-référence. Les policies
-- qui lisent d'autres tables (programme_*, tarifs_contrats, exercices_realises…)
-- pointent vers des tables parentes dont les policies ne relisent pas
-- l'enfant, et acces_participant() est déjà SECURITY DEFINER. Voir le
-- rapport de correction pour les limites de cette vérification (les fichiers
-- ne reflètent pas forcément la base réelle).
--
-- DÉJÀ APPLIQUÉE en staging (2026-09-21, « Success » et test de non-régression
-- de tests/security/rls.spec.ts au vert) puis en production, où la création de
-- cours collectifs, les participations, l'effort perçu et le bien-être ont été
-- testés. Ce fichier consigne a posteriori ce qui tourne déjà ; le rejouer est
-- sans effet (idempotent). Appliquée à la main dans le SQL Editor : connexion
-- Postgres directe indisponible depuis le poste de dev.
--
-- Cette migration est idempotente. Le bloc de vérification final EXÉCUTE une
-- requête sous le rôle authenticated sur chaque table : si la récursion
-- subsistait, il échouerait avec 42P17 (un « Success » du SQL Editor ne prouve
-- rien à lui seul — voir la note d'ordre de 20260917_cours_collectifs.sql).
--
-- ── ROLLBACK ────────────────────────────────────────────────────────────────
-- Remet la policy dans son état cassé (à ne faire que pour comparer) :
--   DROP POLICY IF EXISTS "praticien_gere_participations_cours_collectifs" ON public.participations_cours_collectifs;
--   CREATE POLICY "praticien_gere_participations_cours_collectifs" ON public.participations_cours_collectifs
--     FOR ALL USING (cours_id IN (SELECT c.id FROM public.cours_collectifs c WHERE c.praticien_id = auth.uid()))
--     WITH CHECK (cours_id IN (SELECT c.id FROM public.cours_collectifs c WHERE c.praticien_id = auth.uid()));
--   DROP FUNCTION IF EXISTS public.est_cours_du_praticien(uuid);
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Fonction qui casse le cycle.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.est_cours_du_praticien(p_cours_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.cours_collectifs c
    WHERE c.id = p_cours_id
      AND c.praticien_id = auth.uid()
  );
$$;

-- PostgreSQL accorde EXECUTE à PUBLIC à la création : le REVOKE doit viser
-- PUBLIC, pas seulement anon (voir 20260826_revoke_public_execute_functions.sql).
REVOKE ALL ON FUNCTION public.est_cours_du_praticien(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.est_cours_du_praticien(uuid) TO authenticated;

-- ----------------------------------------------------------------------------
-- 2. Policy de participations_cours_collectifs : plus de lecture directe de
--    cours_collectifs.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "praticien_gere_participations_cours_collectifs" ON public.participations_cours_collectifs;
CREATE POLICY "praticien_gere_participations_cours_collectifs" ON public.participations_cours_collectifs
  FOR ALL USING (public.est_cours_du_praticien(cours_id))
  WITH CHECK (public.est_cours_du_praticien(cours_id));

-- ----------------------------------------------------------------------------
-- 3. Vérification immédiate.
-- ----------------------------------------------------------------------------
DO $migration$
DECLARE
  def_ok        boolean;
  policy_qual   text;
  policy_check  text;
  nb_cours      int;
  nb_part       int;
BEGIN
  -- La fonction est bien SECURITY DEFINER avec un search_path figé.
  SELECT (p.prosecdef AND p.proconfig::text LIKE '%search_path=public%') INTO def_ok
    FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace AND p.proname = 'est_cours_du_praticien';
  IF def_ok IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Echec verification : est_cours_du_praticien absente, ou pas SECURITY DEFINER avec search_path figé';
  END IF;

  -- Ni PUBLIC ni anon ne l'exécutent ; authenticated oui (indispensable : une
  -- policy s'évalue avec les privilèges de l'appelant).
  IF has_function_privilege('anon', 'public.est_cours_du_praticien(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Echec verification : anon peut exécuter est_cours_du_praticien';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.est_cours_du_praticien(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Echec verification : authenticated ne peut pas exécuter est_cours_du_praticien';
  END IF;

  -- La policy ne référence plus cours_collectifs et appelle la fonction.
  SELECT qual, with_check INTO policy_qual, policy_check
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'participations_cours_collectifs'
      AND policyname = 'praticien_gere_participations_cours_collectifs';
  IF policy_qual IS NULL
     OR policy_qual NOT LIKE '%est_cours_du_praticien%' OR policy_qual LIKE '%cours_collectifs%'
     OR policy_check NOT LIKE '%est_cours_du_praticien%' OR policy_check LIKE '%cours_collectifs%' THEN
    RAISE EXCEPTION 'Echec verification : praticien_gere_participations_cours_collectifs n''a pas la forme attendue (qual=%, with_check=%)', policy_qual, policy_check;
  END IF;

  -- Toujours 2 policies par table (rien de perdu ni de doublé).
  SELECT count(*) INTO nb_cours FROM pg_policies WHERE schemaname = 'public' AND tablename = 'cours_collectifs';
  SELECT count(*) INTO nb_part  FROM pg_policies WHERE schemaname = 'public' AND tablename = 'participations_cours_collectifs';
  IF nb_cours <> 2 OR nb_part <> 2 THEN
    RAISE EXCEPTION 'Echec verification : % policy(ies) sur cours_collectifs et % sur participations (2 et 2 attendues)', nb_cours, nb_part;
  END IF;

  -- Preuve fonctionnelle : la requête doit se PLANIFIER et s'exécuter sous
  -- authenticated (RLS appliquée). Si la récursion subsistait, c'est ici que
  -- 42P17 remonterait. auth.uid() est NULL dans ce contexte : 0 ligne attendue
  -- côté praticien, ce qui est sans importance — seule l'absence d'erreur compte.
  SET LOCAL ROLE authenticated;
  PERFORM count(*) FROM public.cours_collectifs;
  PERFORM count(*) FROM public.participations_cours_collectifs;
  RESET ROLE;
END
$migration$;

NOTIFY pgrst, 'reload schema';
