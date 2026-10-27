-- ════════════════════════════════════════════════════════════════════════════
-- Fermeture de 4 fuites d'ÉCRITURE entre praticiens (lot H sécurité HDS)
-- ════════════════════════════════════════════════════════════════════════════
--
-- Constatées par le harnais RLS (tests/security/rls.spec.ts, PR #164) sur le
-- staging le 2026-10-27. Aucune fuite en lecture. La règle d'écriture ne
-- vérifiait que « la ligne porte mon praticien_id », jamais « le bénéficiaire
-- (ou le cours) référencé m'appartient » :
--
--   tests_etalons_activations     B rattache SA ligne à un bénéficiaire de A
--   exercices_libres_activations  idem
--   rappel_preferences            idem (et bloque A par l'index unique)
--   participations_cours_collectifs  B inscrit SON bénéficiaire au cours de A,
--                                 puis voit et modifie ce cours via
--                                 orga_acces_cours_collectifs
--
-- Correctif : seul le WITH CHECK change. Les USING (donc la LECTURE) sont
-- recopiés à l'identique. Aucune donnée n'est modifiée.
--
-- « Le bénéficiaire m'appartient » = public.acces_participant(participant_id),
-- la fonction déjà utilisée par toutes les policies « orga_* » : propriétaire
-- du bénéficiaire OU membre actif de son organisation. Un bénéficiaire
-- archivé reste accessible à son praticien (acces_participant ne lit pas
-- `archive`).
--
-- Une seule fonction nouvelle, public.cours_accessible : une sous-requête
-- EXISTS sur participations_cours_collectifs DANS une policy de cette même
-- table relancerait la récursion de policies (42P17) corrigée le 2026-09-21
-- (cours_collectifs ⇄ participations). SECURITY DEFINER, search_path figé,
-- REVOKE explicite (les privilèges par défaut de la prod accordent ALL ON
-- FUNCTIONS à anon), EXECUTE pour authenticated et service_role seulement.
--
-- Idempotente, transactionnelle, bloc de contrôle final.

BEGIN;

-- ═══ MARQUEUR DE CIBLE (est_staging) ═══════════════════════════════════════
-- Ce fichier refuse de s'exécuter sur la PRODUCTION tant que la valeur
-- ci-dessous vaut 'staging'. Pour la prod, APRÈS le go et la recette staging :
-- remplacer À LA MAIN 'staging' par 'production' sur la ligne v_cible.
--
-- Repère du staging : la structure de démo de scripts/seed-staging.sql
-- (jeton staging-token-demo-0001), absente de la prod. Une base sans aucun
-- praticien (base locale de `supabase db reset`, job CI base-locale, où les
-- migrations passent avant le seed) est acceptée avec la cible 'staging'.
DO $cible$
DECLARE
  v_cible       text := 'staging';  -- ⚠️ 'staging' | 'production' — À CHANGER À LA MAIN POUR LA PROD
  v_est_staging boolean := EXISTS (SELECT 1 FROM public.structures WHERE token_acces = 'staging-token-demo-0001');
  v_base_vide   boolean := NOT EXISTS (SELECT 1 FROM public.praticiens);
BEGIN
  IF v_cible NOT IN ('staging', 'production') THEN
    RAISE EXCEPTION 'Marqueur de cible invalide (%) : ''staging'' ou ''production'' attendu.', v_cible;
  END IF;
  IF v_cible = 'staging' AND NOT (v_est_staging OR v_base_vide) THEN
    RAISE EXCEPTION 'Cible « staging », mais cette base n''est PAS le staging (structure de démo absente) : rien n''a été appliqué. Pour la production, changer le marqueur v_cible après le go.';
  END IF;
  IF v_cible = 'production' AND v_est_staging THEN
    RAISE EXCEPTION 'Cible « production », mais cette base est le STAGING (structure de démo présente) : rien n''a été appliqué.';
  END IF;
  RAISE NOTICE 'Cible % confirmée (est_staging = %, base vide = %).', v_cible, v_est_staging, v_base_vide;
END
$cible$;

-- ─── Fonction d'aide : le cours est-il visible pour l'utilisateur ? ─────────
-- Vrai si le cours lui appartient, ou s'il contient déjà un bénéficiaire
-- auquel il a accès : exactement la règle de LECTURE de cours_collectifs
-- (praticien_gere_cours_collectifs + orga_acces_cours_collectifs). On ne peut
-- donc écrire une participation que dans un cours qu'on voit déjà.
CREATE OR REPLACE FUNCTION public.cours_accessible(p_cours_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.cours_collectifs c
     WHERE c.id = p_cours_id AND c.praticien_id = auth.uid()
  ) OR EXISTS (
    SELECT 1 FROM public.participations_cours_collectifs pcc
     WHERE pcc.cours_id = p_cours_id
       AND public.acces_participant(pcc.participant_id)
  );
$$;

REVOKE ALL ON FUNCTION public.cours_accessible(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cours_accessible(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.cours_accessible(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.cours_accessible(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cours_accessible(uuid) TO service_role;

-- ─── 1. tests_etalons_activations ───────────────────────────────────────────
DROP POLICY IF EXISTS "tests_etalons_activations_praticien_all" ON public.tests_etalons_activations;
CREATE POLICY "tests_etalons_activations_praticien_all" ON public.tests_etalons_activations
  USING (praticien_id = auth.uid())
  WITH CHECK (praticien_id = auth.uid() AND public.acces_participant(participant_id));

-- ─── 2. exercices_libres_activations ────────────────────────────────────────
DROP POLICY IF EXISTS "exercices_libres_activations_praticien_all" ON public.exercices_libres_activations;
CREATE POLICY "exercices_libres_activations_praticien_all" ON public.exercices_libres_activations
  USING (praticien_id = auth.uid())
  WITH CHECK (praticien_id = auth.uid() AND public.acces_participant(participant_id));

-- ─── 3. rappel_preferences ──────────────────────────────────────────────────
-- participant_id NULL = réglages globaux du praticien (useRappelPreferences) :
-- aucun bénéficiaire à vérifier.
DROP POLICY IF EXISTS "praticien_gere_rappel_preferences" ON public.rappel_preferences;
CREATE POLICY "praticien_gere_rappel_preferences" ON public.rappel_preferences
  USING (praticien_id = auth.uid())
  WITH CHECK (
    praticien_id = auth.uid()
    AND (participant_id IS NULL OR public.acces_participant(participant_id))
  );

-- ─── 4. participations_cours_collectifs ─────────────────────────────────────
-- Propriétaire du cours : le bénéficiaire inscrit doit aussi lui être
-- accessible (sinon A pourrait, symétriquement, inscrire un bénéficiaire de B).
DROP POLICY IF EXISTS "praticien_gere_participations_cours_collectifs" ON public.participations_cours_collectifs;
CREATE POLICY "praticien_gere_participations_cours_collectifs" ON public.participations_cours_collectifs
  USING (public.est_cours_du_praticien(cours_id))
  WITH CHECK (public.est_cours_du_praticien(cours_id) AND public.acces_participant(participant_id));

-- Accès organisation : en plus du bénéficiaire, le cours doit être visible.
-- C'est la fuite constatée : acces_participant seul laissait B inscrire son
-- propre bénéficiaire à n'importe quel cours.
DROP POLICY IF EXISTS "orga_acces_participations_cours_collectifs" ON public.participations_cours_collectifs;
CREATE POLICY "orga_acces_participations_cours_collectifs" ON public.participations_cours_collectifs
  TO authenticated
  USING (public.acces_participant(participant_id))
  WITH CHECK (public.acces_participant(participant_id) AND public.cours_accessible(cours_id));

-- ═══ Contrôle final ═════════════════════════════════════════════════════════
DO $controle$
DECLARE
  r record;
BEGIN
  -- Écriture : chaque WITH CHECK contrôle désormais le bénéficiaire (et le cours).
  FOR r IN
    SELECT * FROM (VALUES
      ('tests_etalons_activations',       'tests_etalons_activations_praticien_all',         'acces_participant(participant_id)'),
      ('exercices_libres_activations',    'exercices_libres_activations_praticien_all',      'acces_participant(participant_id)'),
      ('rappel_preferences',              'praticien_gere_rappel_preferences',               'acces_participant(participant_id)'),
      ('participations_cours_collectifs', 'praticien_gere_participations_cours_collectifs',  'acces_participant(participant_id)'),
      ('participations_cours_collectifs', 'orga_acces_participations_cours_collectifs',      'cours_accessible(cours_id)')
    ) AS v(tablename, policyname, attendu)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies p
       WHERE p.schemaname = 'public' AND p.tablename = r.tablename AND p.policyname = r.policyname
         AND p.with_check LIKE '%' || r.attendu || '%'
    ) THEN
      RAISE EXCEPTION 'Fuites d''écriture : policy %.% absente ou sans contrôle « % »', r.tablename, r.policyname, r.attendu;
    END IF;
  END LOOP;

  -- Lecture inchangée : les USING sont ceux d'avant.
  IF (SELECT count(*) FROM pg_policies
       WHERE schemaname = 'public'
         AND policyname IN ('tests_etalons_activations_praticien_all', 'exercices_libres_activations_praticien_all', 'praticien_gere_rappel_preferences')
         AND qual = '(praticien_id = auth.uid())') <> 3 THEN
    RAISE EXCEPTION 'Fuites d''écriture : le USING (lecture) d''une policy praticien a changé';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND policyname = 'praticien_gere_participations_cours_collectifs' AND qual = 'est_cours_du_praticien(cours_id)')
     OR NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND policyname = 'orga_acces_participations_cours_collectifs' AND qual = 'acces_participant(participant_id)') THEN
    RAISE EXCEPTION 'Fuites d''écriture : le USING (lecture) d''une policy de participations a changé';
  END IF;

  -- Fonction : SECURITY DEFINER, search_path figé, ni PUBLIC ni anon.
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
     WHERE oid = 'public.cours_accessible(uuid)'::regprocedure
       AND prosecdef
       AND proconfig @> ARRAY['search_path=public']
  ) THEN
    RAISE EXCEPTION 'Fuites d''écriture : cours_accessible n''est pas SECURITY DEFINER à search_path figé';
  END IF;
  IF has_function_privilege('anon', 'public.cours_accessible(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Fuites d''écriture : anon peut exécuter cours_accessible';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_proc p, aclexplode(p.proacl) a
     WHERE p.oid = 'public.cours_accessible(uuid)'::regprocedure AND a.grantee = 0
  ) THEN
    RAISE EXCEPTION 'Fuites d''écriture : PUBLIC peut exécuter cours_accessible';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.cours_accessible(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Fuites d''écriture : authenticated ne peut pas exécuter cours_accessible';
  END IF;

  RAISE NOTICE 'Fuites d''écriture : 5 policies et la fonction cours_accessible vérifiées.';
END
$controle$;

COMMIT;
