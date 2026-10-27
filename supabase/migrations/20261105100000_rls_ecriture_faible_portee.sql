-- ════════════════════════════════════════════════════════════════════════════
-- Écriture : dossier d'exercices, programme et exercice de programme
-- référencés doivent être visibles du praticien — lot K3 sécurité HDS
-- ════════════════════════════════════════════════════════════════════════════
--
-- Fuites de portée plus faible constatées par
-- tests/security/rls-ecriture-cles.spec.ts (PR #167, 2026-10-27) : un
-- praticien B pouvait ranger ses exercices dans un dossier de A, ou
-- rattacher la séance (ou un exercice réalisé) d'un de SES bénéficiaires à
-- un programme, une séance ou un exercice de programme de A.
--
-- seances_patient et exercices_realises ne sont écrits par l'application que
-- par service_role (api/patient/seance.ts), que la RLS ne concerne pas ; les
-- policies corrigées ici sont celles qu'un praticien connecté pourrait
-- utiliser directement.
--
-- Méthode : ALTER POLICY … WITH CHECK (lecture garantie intacte, policy
-- absente = échec), comme K1 et K2. « Visible » = EXISTS filtré par la RLS
-- de la table référencée (dossiers_exercices, programmes, programme_seances,
-- programme_exercices ne renvoient vers aucune des tables protégées ici :
-- pas de récursion). Les conditions d'origine sont recopiées telles quelles.
--
-- Non traité ici : participations_cours_collectifs.programme_individuel_id,
-- ajouté à la migration de #166 (mêmes policies : une seule migration les
-- réécrit). cours_collectifs.programme_commun_id : lot K2.
--
-- Aucune fonction nouvelle, aucune donnée modifiée. Idempotente,
-- transactionnelle, bloc de contrôle final.

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

-- ─── dossier_exercice_membres, exercices_personnalises ──────────────────────
ALTER POLICY "praticien_gere_dossier_exercice_membres" ON public.dossier_exercice_membres
  WITH CHECK (praticien_id = auth.uid() AND EXISTS (SELECT 1 FROM public.dossiers_exercices d WHERE d.id = dossier_id));
ALTER POLICY "praticien_gere_exercices_personnalises" ON public.exercices_personnalises
  WITH CHECK (praticien_id = auth.uid() AND (dossier_id IS NULL OR EXISTS (SELECT 1 FROM public.dossiers_exercices d WHERE d.id = dossier_id)));

-- ─── seances_patient (programme et séance de programme) ─────────────────────
ALTER POLICY "orga_acces_seances_patient" ON public.seances_patient
  WITH CHECK (public.acces_participant(participant_id) AND (programme_id IS NULL OR EXISTS (SELECT 1 FROM public.programmes pr WHERE pr.id = programme_id)) AND (seance_id IS NULL OR EXISTS (SELECT 1 FROM public.programme_seances ps WHERE ps.id = seance_id)));
ALTER POLICY "patient_gere_ses_seances" ON public.seances_patient
  WITH CHECK (participant_id IN (SELECT participants.id FROM public.participants WHERE participants.praticien_id = auth.uid()) AND (programme_id IS NULL OR EXISTS (SELECT 1 FROM public.programmes pr WHERE pr.id = programme_id)) AND (seance_id IS NULL OR EXISTS (SELECT 1 FROM public.programme_seances ps WHERE ps.id = seance_id)));
ALTER POLICY "praticien_gere_seances_patient" ON public.seances_patient
  WITH CHECK (participant_id IN (SELECT participants.id FROM public.participants WHERE participants.praticien_id = auth.uid()) AND (programme_id IS NULL OR EXISTS (SELECT 1 FROM public.programmes pr WHERE pr.id = programme_id)) AND (seance_id IS NULL OR EXISTS (SELECT 1 FROM public.programme_seances ps WHERE ps.id = seance_id)));
-- Sans WITH CHECK jusqu'ici (son USING en tenait lieu) : rendu explicite.
ALTER POLICY "praticien_voit_seances_patient" ON public.seances_patient
  WITH CHECK (participant_id IN (SELECT participants.id FROM public.participants WHERE participants.praticien_id = auth.uid()) AND (programme_id IS NULL OR EXISTS (SELECT 1 FROM public.programmes pr WHERE pr.id = programme_id)) AND (seance_id IS NULL OR EXISTS (SELECT 1 FROM public.programme_seances ps WHERE ps.id = seance_id)));

-- ─── exercices_realises (exercice de programme) ─────────────────────────────
ALTER POLICY "orga_acces_exercices_realises" ON public.exercices_realises
  WITH CHECK (EXISTS (SELECT 1 FROM public.seances_patient sp WHERE sp.id = exercices_realises.seance_patient_id AND public.acces_participant(sp.participant_id)) AND (exercice_id IS NULL OR EXISTS (SELECT 1 FROM public.programme_exercices pe WHERE pe.id = exercice_id)));
ALTER POLICY "patient_gere_ses_exercices" ON public.exercices_realises
  WITH CHECK (seance_patient_id IN (SELECT sp.id FROM public.seances_patient sp JOIN public.participants p ON p.id = sp.participant_id WHERE p.praticien_id = auth.uid()) AND (exercice_id IS NULL OR EXISTS (SELECT 1 FROM public.programme_exercices pe WHERE pe.id = exercice_id)));
ALTER POLICY "praticien_gere_exercices_realises" ON public.exercices_realises
  WITH CHECK (seance_patient_id IN (SELECT sp.id FROM public.seances_patient sp JOIN public.participants p ON p.id = sp.participant_id WHERE p.praticien_id = auth.uid()) AND (exercice_id IS NULL OR EXISTS (SELECT 1 FROM public.programme_exercices pe WHERE pe.id = exercice_id)));
-- Sans WITH CHECK jusqu'ici : rendu explicite.
ALTER POLICY "praticien_voit_exercices_realises" ON public.exercices_realises
  WITH CHECK (seance_patient_id IN (SELECT sp.id FROM public.seances_patient sp JOIN public.participants p ON p.id = sp.participant_id WHERE p.praticien_id = auth.uid()) AND (exercice_id IS NULL OR EXISTS (SELECT 1 FROM public.programme_exercices pe WHERE pe.id = exercice_id)));

-- ═══ Contrôle final ═════════════════════════════════════════════════════════
DO $controle$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('dossier_exercice_membres', 'praticien_gere_dossier_exercice_membres', 'FROM dossiers_exercices d'),
      ('exercices_personnalises', 'praticien_gere_exercices_personnalises', 'FROM dossiers_exercices d'),
      ('seances_patient', 'orga_acces_seances_patient', 'FROM programme_seances ps'),
      ('seances_patient', 'patient_gere_ses_seances', 'FROM programme_seances ps'),
      ('seances_patient', 'praticien_gere_seances_patient', 'FROM programme_seances ps'),
      ('seances_patient', 'praticien_voit_seances_patient', 'FROM programmes pr'),
      ('exercices_realises', 'orga_acces_exercices_realises', 'FROM programme_exercices pe'),
      ('exercices_realises', 'patient_gere_ses_exercices', 'FROM programme_exercices pe'),
      ('exercices_realises', 'praticien_gere_exercices_realises', 'FROM programme_exercices pe'),
      ('exercices_realises', 'praticien_voit_exercices_realises', 'FROM programme_exercices pe')
    ) AS v(tablename, policyname, attendu)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies p
       WHERE p.schemaname = 'public' AND p.tablename = r.tablename AND p.policyname = r.policyname
         AND p.with_check LIKE '%' || r.attendu || '%'
    ) THEN
      RAISE EXCEPTION 'Faible portée (K3) : policy %.% absente ou sans contrôle « % »', r.tablename, r.policyname, r.attendu;
    END IF;
  END LOOP;
  RAISE NOTICE 'Faible portée (K3) : % contrôles vérifiés.', 10;
END
$controle$;
COMMIT;
