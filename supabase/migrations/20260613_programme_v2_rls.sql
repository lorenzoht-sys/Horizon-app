-- ============================================================================
-- 20260613_programme_v2_rls.sql
-- ============================================================================
--
-- Verrouille les 5 tables "programme V2" / historique de séances patient
-- (voir AUDIT.md §6) : seances_patient, exercices_realises,
-- programme_seances, programme_planning, programme_exercices.
--
-- Ces tables existent déjà en production (créées hors-repo via Supabase
-- Studio, utilisées par useProgrammeV2.ts, EspacePatient.tsx, Dashboard.tsx,
-- ParticipantProfile.tsx, AssistantPage.tsx) mais n'ont jamais eu de
-- migration "CREATE TABLE" ni de policy RLS dédiée — elles étaient donc
-- potentiellement lisibles/écrivables par le rôle anon.
--
-- Ce fichier ne fait QUE activer RLS + poser des policies praticien-only
-- (idempotent : ENABLE ROW LEVEL SECURITY et DROP POLICY IF EXISTS). Il
-- suppose que les tables existent déjà (vrai en production ; vrai aussi pour
-- un environnement de staging créé à partir d'un dump de la production —
-- voir supabase/migrations/README.md).
--
-- ⚠️ Repris de sql/rls_final.sql SECTION 4 (branche securisation). Vérifie
-- dans Supabase Studio que les noms de colonnes ci-dessous correspondent
-- bien à la réalité avant d'exécuter cette migration sur un nouvel
-- environnement.

ALTER TABLE public.seances_patient     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exercices_realises  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.programme_seances   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.programme_planning  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.programme_exercices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "praticien_gere_seances_patient" ON public.seances_patient;
CREATE POLICY "praticien_gere_seances_patient" ON public.seances_patient
  FOR ALL USING (
    participant_id IN (SELECT id FROM public.participants WHERE praticien_id = auth.uid())
  )
  WITH CHECK (
    participant_id IN (SELECT id FROM public.participants WHERE praticien_id = auth.uid())
  );

DROP POLICY IF EXISTS "praticien_gere_exercices_realises" ON public.exercices_realises;
CREATE POLICY "praticien_gere_exercices_realises" ON public.exercices_realises
  FOR ALL USING (
    seance_patient_id IN (
      SELECT sp.id FROM public.seances_patient sp
      JOIN public.participants p ON p.id = sp.participant_id
      WHERE p.praticien_id = auth.uid()
    )
  )
  WITH CHECK (
    seance_patient_id IN (
      SELECT sp.id FROM public.seances_patient sp
      JOIN public.participants p ON p.id = sp.participant_id
      WHERE p.praticien_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "praticien_gere_programme_seances" ON public.programme_seances;
CREATE POLICY "praticien_gere_programme_seances" ON public.programme_seances
  FOR ALL USING (
    programme_id IN (
      SELECT pr.id FROM public.programmes pr
      JOIN public.participants pa ON pa.id = pr.participant_id
      WHERE pa.praticien_id = auth.uid()
    )
  )
  WITH CHECK (
    programme_id IN (
      SELECT pr.id FROM public.programmes pr
      JOIN public.participants pa ON pa.id = pr.participant_id
      WHERE pa.praticien_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "praticien_gere_programme_planning" ON public.programme_planning;
CREATE POLICY "praticien_gere_programme_planning" ON public.programme_planning
  FOR ALL USING (
    programme_id IN (
      SELECT pr.id FROM public.programmes pr
      JOIN public.participants pa ON pa.id = pr.participant_id
      WHERE pa.praticien_id = auth.uid()
    )
  )
  WITH CHECK (
    programme_id IN (
      SELECT pr.id FROM public.programmes pr
      JOIN public.participants pa ON pa.id = pr.participant_id
      WHERE pa.praticien_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "praticien_gere_programme_exercices" ON public.programme_exercices;
CREATE POLICY "praticien_gere_programme_exercices" ON public.programme_exercices
  FOR ALL USING (
    seance_id IN (
      SELECT ps.id FROM public.programme_seances ps
      JOIN public.programmes pr ON pr.id = ps.programme_id
      JOIN public.participants pa ON pa.id = pr.participant_id
      WHERE pa.praticien_id = auth.uid()
    )
  )
  WITH CHECK (
    seance_id IN (
      SELECT ps.id FROM public.programme_seances ps
      JOIN public.programmes pr ON pr.id = ps.programme_id
      JOIN public.participants pa ON pa.id = pr.participant_id
      WHERE pa.praticien_id = auth.uid()
    )
  );
