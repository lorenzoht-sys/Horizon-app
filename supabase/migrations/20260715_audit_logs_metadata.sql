-- ============================================================================
-- 20260715_audit_logs_metadata.sql
-- ============================================================================
--
-- Ajoute une colonne metadata (JSONB, nullable) à audit_logs
-- (20260613_audit_logs.sql), jusqu'ici limitée à event_type/participant_id/
-- ip/success — insuffisant pour tracer un événement qui a besoin de porter
-- des détails structurés (ex : contratId, nombre de séances, plage de
-- dates). Colonne nullable : tous les événements existants (patient_login,
-- patient_data_access, etc.) continuent d'insérer sans la renseigner.
--
-- Premier usage : traçabilité de la suppression de séances futures lors de
-- la réduction de la date de fin d'un contrat (voir
-- ContratsTab.tsx/supprimer-planifiees.ts) — un événement praticien, pas
-- patient, mais la table reste la même : aucune raison de dupliquer un
-- mécanisme d'audit générique pour une différence de origine de l'action.
--
-- IDEMPOTENTE : rejouable sans effet si déjà appliquée.
-- ============================================================================

ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS metadata JSONB;

NOTIFY pgrst, 'reload schema';
