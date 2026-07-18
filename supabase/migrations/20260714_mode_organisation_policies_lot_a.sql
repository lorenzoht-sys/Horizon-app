-- ============================================================================
-- 20260714_mode_organisation_policies_lot_a.sql
-- ============================================================================
--
-- Palier 3 (lot A) du mode « organisation employeuse propriétaire » — voir
-- CONCEPTION_MODE_ORGANISATION.md §2.1 et §3 à la racine du dépôt.
--
-- Policies ADDITIVES sur participants (racine) + les 16 tables du lot A qui
-- ont un participant_id propre (pas de jointure — le lot B, avec jointure,
-- fait l'objet d'un fichier séparé après validation de celui-ci). Chaque
-- policy s'ADDITIONNE aux policies existantes (policies PERMISSIVE = OR) :
-- un praticien libéral passe toujours par ses policies actuelles
-- (praticien_id = auth.uid()), inchangées et non touchées ici ; un salarié
-- d'organisation passe par la policy ajoutée ici, via acces_participant().
--
-- Portée de chaque policy additive = EXACTEMENT la portée de la policy
-- praticien existante sur la même table, vérifiée table par table avant
-- écriture (schema.sql, migrations 20260601/20260615/20260618/20260620) :
--   - 10 tables en CRUD complet (le praticien peut tout faire sur ses
--     dossiers) → policy additive FOR ALL.
--   - 6 tables où le praticien n'a aujourd'hui que la lecture (écriture
--     réservée à service_role, via /api/patient/* ou le cron de rappels)
--     → policy additive FOR SELECT seule. Donner l'écriture aux salariés
--     d'organisation sur ces 6 tables serait une régression de sécurité :
--     ils auraient plus de droits qu'un praticien libéral sur ses propres
--     patients.
--
-- Colonnes participant_id vérifiées en production le 14/07/2026
-- (information_schema.columns) avant écriture : uuid partout, NOT NULL sauf
-- seances_patient et audit_logs (nullable, sans impact : acces_participant(NULL)
-- renvoie false).
--
-- IDEMPOTENTE : DROP POLICY IF EXISTS avant chaque CREATE POLICY.
-- NE PAS EXÉCUTER SUR PROD sans validation préalable.
-- ============================================================================


-- ============================================================================
-- 0. participants (racine — cas particulier, voir §3 du document)
-- ============================================================================
-- La policy porte sur id (pas participant_id : participants EST le
-- participant). Le WITH CHECK ajoute une exigence propre à l'INSERT/UPDATE :
-- si organisation_id est renseigné, l'auteur doit être membre de CETTE
-- organisation — on ne crée pas (ou ne rattache pas) un bénéficiaire à une
-- organisation dont on n'est pas membre, même si l'accès via praticien_id
-- serait par ailleurs valide.

DROP POLICY IF EXISTS "orga_acces_participants" ON public.participants;
CREATE POLICY "orga_acces_participants" ON public.participants
  FOR ALL TO authenticated
  USING (public.acces_participant(id))
  WITH CHECK (
    public.acces_participant(id)
    AND (organisation_id IS NULL OR public.est_membre_organisation(organisation_id))
  );


-- ============================================================================
-- 1. Tables en CRUD complet côté praticien (10 tables) → policy FOR ALL
-- ============================================================================

DROP POLICY IF EXISTS "orga_acces_bilans" ON public.bilans;
CREATE POLICY "orga_acces_bilans" ON public.bilans
  FOR ALL TO authenticated
  USING (public.acces_participant(participant_id))
  WITH CHECK (public.acces_participant(participant_id));

DROP POLICY IF EXISTS "orga_acces_contrats" ON public.contrats;
CREATE POLICY "orga_acces_contrats" ON public.contrats
  FOR ALL TO authenticated
  USING (public.acces_participant(participant_id))
  WITH CHECK (public.acces_participant(participant_id));

DROP POLICY IF EXISTS "orga_acces_seances" ON public.seances;
CREATE POLICY "orga_acces_seances" ON public.seances
  FOR ALL TO authenticated
  USING (public.acces_participant(participant_id))
  WITH CHECK (public.acces_participant(participant_id));

DROP POLICY IF EXISTS "orga_acces_notes_seances" ON public.notes_seances;
CREATE POLICY "orga_acces_notes_seances" ON public.notes_seances
  FOR ALL TO authenticated
  USING (public.acces_participant(participant_id))
  WITH CHECK (public.acces_participant(participant_id));

DROP POLICY IF EXISTS "orga_acces_programmes" ON public.programmes;
CREATE POLICY "orga_acces_programmes" ON public.programmes
  FOR ALL TO authenticated
  USING (public.acces_participant(participant_id))
  WITH CHECK (public.acces_participant(participant_id));

DROP POLICY IF EXISTS "orga_acces_comptes_rendus_seances" ON public.comptes_rendus_seances;
CREATE POLICY "orga_acces_comptes_rendus_seances" ON public.comptes_rendus_seances
  FOR ALL TO authenticated
  USING (public.acces_participant(participant_id))
  WITH CHECK (public.acces_participant(participant_id));

DROP POLICY IF EXISTS "orga_acces_tests_etalons_activations" ON public.tests_etalons_activations;
CREATE POLICY "orga_acces_tests_etalons_activations" ON public.tests_etalons_activations
  FOR ALL TO authenticated
  USING (public.acces_participant(participant_id))
  WITH CHECK (public.acces_participant(participant_id));

DROP POLICY IF EXISTS "orga_acces_exercices_libres_activations" ON public.exercices_libres_activations;
CREATE POLICY "orga_acces_exercices_libres_activations" ON public.exercices_libres_activations
  FOR ALL TO authenticated
  USING (public.acces_participant(participant_id))
  WITH CHECK (public.acces_participant(participant_id));

DROP POLICY IF EXISTS "orga_acces_documents_patient" ON public.documents_patient;
CREATE POLICY "orga_acces_documents_patient" ON public.documents_patient
  FOR ALL TO authenticated
  USING (public.acces_participant(participant_id))
  WITH CHECK (public.acces_participant(participant_id));

DROP POLICY IF EXISTS "orga_acces_seances_patient" ON public.seances_patient;
CREATE POLICY "orga_acces_seances_patient" ON public.seances_patient
  FOR ALL TO authenticated
  USING (public.acces_participant(participant_id))
  WITH CHECK (public.acces_participant(participant_id));


-- ============================================================================
-- 2. Tables où le praticien n'a aujourd'hui que la lecture (6 tables)
--    → policy FOR SELECT seule (écriture réservée à service_role, inchangée)
-- ============================================================================

DROP POLICY IF EXISTS "orga_lecture_retours_seance" ON public.retours_seance;
CREATE POLICY "orga_lecture_retours_seance" ON public.retours_seance
  FOR SELECT TO authenticated
  USING (public.acces_participant(participant_id));

DROP POLICY IF EXISTS "orga_lecture_tests_etalons_resultats" ON public.tests_etalons_resultats;
CREATE POLICY "orga_lecture_tests_etalons_resultats" ON public.tests_etalons_resultats
  FOR SELECT TO authenticated
  USING (public.acces_participant(participant_id));

DROP POLICY IF EXISTS "orga_lecture_exercices_libres_validations" ON public.exercices_libres_validations;
CREATE POLICY "orga_lecture_exercices_libres_validations" ON public.exercices_libres_validations
  FOR SELECT TO authenticated
  USING (public.acces_participant(participant_id));

DROP POLICY IF EXISTS "orga_lecture_audit_logs" ON public.audit_logs;
CREATE POLICY "orga_lecture_audit_logs" ON public.audit_logs
  FOR SELECT TO authenticated
  USING (
    participant_id IS NOT NULL
    AND public.acces_participant(participant_id)
  );

DROP POLICY IF EXISTS "orga_lecture_push_subscriptions" ON public.push_subscriptions;
CREATE POLICY "orga_lecture_push_subscriptions" ON public.push_subscriptions
  FOR SELECT TO authenticated
  USING (public.acces_participant(participant_id));

DROP POLICY IF EXISTS "orga_lecture_rappels_envoyes" ON public.rappels_envoyes;
CREATE POLICY "orga_lecture_rappels_envoyes" ON public.rappels_envoyes
  FOR SELECT TO authenticated
  USING (public.acces_participant(participant_id));
