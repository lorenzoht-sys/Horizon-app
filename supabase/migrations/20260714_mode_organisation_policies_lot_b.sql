-- ============================================================================
-- 20260714_mode_organisation_policies_lot_b.sql
-- ============================================================================
--
-- Palier 3 (lot B) du mode « organisation employeuse propriétaire » — voir
-- CONCEPTION_MODE_ORGANISATION.md §2.1 et §3 à la racine du dépôt.
--
-- Policies ADDITIVES sur les 4 tables qui n'ont pas de participant_id propre
-- et remontent au participant par jointure (contrairement au lot A, déjà
-- appliqué). Même principe additif : ces policies s'ajoutent aux policies
-- praticien existantes (OR), qui restent intactes et inchangées.
--
-- Les 4 chemins de jointure ont été vérifiés en production le 14/07/2026 par
-- requête sur pg_constraint (définitions FK exactes), pas déduits :
--   - exercices_realises.seance_patient_id_fkey  → seances_patient(id)
--   - programme_seances.programme_id_fkey        → programmes(id)
--   - programme_planning.programme_id_fkey       → programmes(id)
--   - programme_planning.seance_id_fkey           → programme_seances(id)
--   - programme_exercices.seance_id_fkey          → programme_seances(id)
--
-- Cas particulier programme_planning : cette table a DEUX FK vers le
-- participant (directe via programme_id, indirecte via
-- seance_id → programme_seances.programme_id). Les deux colonnes sont
-- NOT NULL et rien en base (pas de CHECK, pas de FK composite, pas de
-- trigger) ne garantit qu'elles pointent vers le même programme — c'est une
-- cohérence purement applicative. Décision : n'utiliser QUE programme_id
-- (le chemin direct), parce que c'est exactement le chemin déjà utilisé par
-- les deux policies praticien existantes sur cette table
-- (praticien_crud_planning, praticien_gere_programme_planning) — on
-- reproduit la logique d'accès existante, on n'en invente pas une nouvelle,
-- et ça évite tout risque lié à une éventuelle divergence entre les deux
-- chemins.
--
-- Portée : les policies praticien existantes sur les 4 tables sont toutes en
-- FOR ALL (praticien_gere_exercices_realises, praticien_gere_programme_seances,
-- praticien_gere_programme_planning, praticien_gere_programme_exercices,
-- confirmées dans 20260613_programme_v2_rls.sql et
-- 20260620_consolidation_seances_patient.sql) → les 4 policies additives
-- ci-dessous sont donc en FOR ALL également.
--
-- IDEMPOTENTE : DROP POLICY IF EXISTS avant chaque CREATE POLICY.
-- NE PAS EXÉCUTER SUR PROD sans validation préalable.
-- ============================================================================


-- ============================================================================
-- 1. exercices_realises
-- ============================================================================
-- seance_patient_id → seances_patient.participant_id

DROP POLICY IF EXISTS "orga_acces_exercices_realises" ON public.exercices_realises;
CREATE POLICY "orga_acces_exercices_realises" ON public.exercices_realises
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.seances_patient sp
      WHERE sp.id = exercices_realises.seance_patient_id
        AND public.acces_participant(sp.participant_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.seances_patient sp
      WHERE sp.id = exercices_realises.seance_patient_id
        AND public.acces_participant(sp.participant_id)
    )
  );


-- ============================================================================
-- 2. programme_seances
-- ============================================================================
-- programme_id → programmes.participant_id

DROP POLICY IF EXISTS "orga_acces_programme_seances" ON public.programme_seances;
CREATE POLICY "orga_acces_programme_seances" ON public.programme_seances
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.programmes pr
      WHERE pr.id = programme_seances.programme_id
        AND public.acces_participant(pr.participant_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.programmes pr
      WHERE pr.id = programme_seances.programme_id
        AND public.acces_participant(pr.participant_id)
    )
  );


-- ============================================================================
-- 3. programme_planning
-- ============================================================================
-- programme_id → programmes.participant_id (chemin direct uniquement,
-- voir justification en tête de fichier — seance_id délibérément ignoré).

DROP POLICY IF EXISTS "orga_acces_programme_planning" ON public.programme_planning;
CREATE POLICY "orga_acces_programme_planning" ON public.programme_planning
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.programmes pr
      WHERE pr.id = programme_planning.programme_id
        AND public.acces_participant(pr.participant_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.programmes pr
      WHERE pr.id = programme_planning.programme_id
        AND public.acces_participant(pr.participant_id)
    )
  );


-- ============================================================================
-- 4. programme_exercices
-- ============================================================================
-- seance_id → programme_seances.programme_id → programmes.participant_id
-- (double jointure)

DROP POLICY IF EXISTS "orga_acces_programme_exercices" ON public.programme_exercices;
CREATE POLICY "orga_acces_programme_exercices" ON public.programme_exercices
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.programme_seances ps
      JOIN public.programmes pr ON pr.id = ps.programme_id
      WHERE ps.id = programme_exercices.seance_id
        AND public.acces_participant(pr.participant_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.programme_seances ps
      JOIN public.programmes pr ON pr.id = ps.programme_id
      WHERE ps.id = programme_exercices.seance_id
        AND public.acces_participant(pr.participant_id)
    )
  );
