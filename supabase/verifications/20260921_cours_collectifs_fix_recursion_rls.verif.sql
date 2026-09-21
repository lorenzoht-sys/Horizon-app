-- ============================================================================
-- 20260921_cours_collectifs_fix_recursion_rls.verif.sql
-- ============================================================================
-- Vérification post-migration de 20260921_cours_collectifs_fix_recursion_rls.sql.
-- UNE SEULE ligne, multi-colonnes (le SQL Editor Supabase n'affiche que le
-- dernier résultat d'une suite de requêtes). Chaque colonne doit afficher "OK".
--
-- Les colonnes v1 à v5 ne sont que des contrôles de catalogue. La preuve
-- FONCTIONNELLE (la seule qui établit que la récursion a disparu) est à faire
-- à part, sous le rôle authenticated : les deux requêtes doivent s'exécuter
-- SANS erreur 42P17 (0 ligne ou plus, peu importe) :
--
--   BEGIN;
--   SET LOCAL ROLE authenticated;
--   SELECT count(*) FROM public.cours_collectifs;
--   SELECT count(*) FROM public.participations_cours_collectifs;
--   ROLLBACK;
--
-- (La migration exécute déjà cette preuve dans son bloc DO final.)
-- ============================================================================

SELECT
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace AND p.proname = 'est_cours_du_praticien'
      AND p.prosecdef AND p.proconfig::text LIKE '%search_path=public%'
  ) THEN 'OK' ELSE '### ECHEC ###' END AS v1_fonction_security_definer,

  CASE WHEN NOT has_function_privilege('anon', 'public.est_cours_du_praticien(uuid)', 'EXECUTE')
  THEN 'OK' ELSE '### ECHEC ###' END AS v2_anon_sans_execute,

  CASE WHEN has_function_privilege('authenticated', 'public.est_cours_du_praticien(uuid)', 'EXECUTE')
  THEN 'OK' ELSE '### ECHEC ###' END AS v3_authenticated_execute,

  CASE WHEN (
    SELECT qual NOT LIKE '%cours_collectifs%' AND qual LIKE '%est_cours_du_praticien%'
       AND with_check NOT LIKE '%cours_collectifs%' AND with_check LIKE '%est_cours_du_praticien%'
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'participations_cours_collectifs'
      AND policyname = 'praticien_gere_participations_cours_collectifs'
  ) THEN 'OK' ELSE '### ECHEC ###' END AS v4_policy_sans_lecture_de_cours,

  CASE WHEN (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'cours_collectifs') = 2
        AND (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'participations_cours_collectifs') = 2
  THEN 'OK' ELSE '### ECHEC ###' END AS v5_deux_policies_par_table;
