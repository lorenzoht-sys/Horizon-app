-- ============================================================================
-- 20260620_seances_autonomes.sql
-- ============================================================================
--
-- Suivi des séances AUTONOMES (réalisées par le patient seul, via son
-- programme), distinct des séances ENCADRÉES (contrats.nombre_seances_*,
-- table `seances`) qui ne sont pas modifiées par cette migration.
--
-- 1. Objectif de séances autonomes, porté par le programme (et non par le
--    contrat) : un patient peut avoir plusieurs programmes au fil du temps,
--    chacun avec son propre objectif. Colonne ajoutée à `programmes`, déjà
--    sécurisée par les policies "praticien_gere_*" existantes (RLS inchangée
--    par cette migration).
--
-- 2. La validation d'une séance autonome existe déjà : POST
--    /api/patient/seance (service_role) insère une ligne dans
--    `seances_patient`. Il manquait un garde-fou anti-doublon : un index
--    unique empêche de valider deux fois la même séance (même
--    participant + même séance de programme) le même jour.
--
-- PRÉREQUIS : tables programmes, seances_patient (créées hors-repo via
-- Supabase Studio, sécurisées par 20260613_programme_v2_rls.sql).
-- IDEMPOTENTE : IF NOT EXISTS sur toutes les opérations.
-- NE PAS EXÉCUTER SUR PROD sans validation préalable.
-- ============================================================================

-- 1. Objectif de séances autonomes (NULL = aucun objectif fixé par le
--    praticien ; dans ce cas, aucune progression n'est affichée côté patient).
ALTER TABLE public.programmes
ADD COLUMN IF NOT EXISTS objectif_seances_autonomes INTEGER
  CHECK (objectif_seances_autonomes IS NULL OR objectif_seances_autonomes > 0);

-- 2. Anti-double-validation : une même séance de programme ne peut être
--    validée qu'une fois par jour calendaire pour un même participant.
CREATE UNIQUE INDEX IF NOT EXISTS seances_patient_no_double_validation_idx
  ON public.seances_patient (participant_id, seance_id, date_seance);

-- ============================================================================
-- GRANTs explicites (défensif)
-- ============================================================================
-- Incident passé : une table créée via Studio peut ne pas hériter des
-- privilèges par défaut attendus selon le rôle ayant exécuté le DDL
-- (ALTER DEFAULT PRIVILEGES est scopé "FOR ROLE"), ce qui peut provoquer une
-- erreur 42501 malgré des policies RLS correctes. `programmes` et
-- `seances_patient` fonctionnent déjà aujourd'hui (le praticien lit/écrit
-- `programmes`, /api/patient/seance écrit déjà dans `seances_patient`), donc
-- leurs GRANTs de base existent — ces lignes sont un filet de sécurité
-- idempotent, sans effet si les privilèges sont déjà corrects.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.programmes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.seances_patient TO service_role;
