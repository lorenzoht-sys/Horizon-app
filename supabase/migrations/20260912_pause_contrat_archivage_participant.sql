-- ============================================================================
-- 20260912_pause_contrat_archivage_participant.sql
-- ============================================================================
--
-- 1. Mise en pause d'un contrat (contrats.statut = 'suspendu') : date de
--    reprise prévue, nullable — purement informative/planificatrice, jamais
--    lue par le cron (api/_lib/renouvellementContrats.ts sélectionne
--    statut = 'actif', donc un contrat suspendu n'est de toute façon jamais
--    candidat). Utilisée uniquement par l'écran ContratsTab.tsx pour calculer
--    le point de départ de la régénération à la reprise (jamais dans le
--    passé — voir calculerDebutReprise, src/utils/horaires.ts).
--
-- 2. Archivage d'un bénéficiaire : colonne explicite sur participants,
--    volontairement PAS dérivée de l'absence de contrat actif (un
--    bénéficiaire sans contrat actif n'est pas forcément "fini" — nouveau
--    patient pas encore planifié, ou entre deux contrats). Bascule
--    manuelle, jamais automatique : ni "terminer un contrat" n'archive le
--    bénéficiaire, ni "archiver" ne touche à ses contrats. Même forme que
--    le précédent déjà en base (organisation_membres.actif + date_fin,
--    20260714_01_mode_organisation_fondations.sql).
--
-- IDEMPOTENTE : ADD COLUMN IF NOT EXISTS ne fait rien si la colonne existe déjà.
-- NE PAS EXÉCUTER SUR PROD sans validation préalable.
-- ============================================================================

ALTER TABLE public.contrats
  ADD COLUMN IF NOT EXISTS date_reprise_prevue DATE;

ALTER TABLE public.participants
  ADD COLUMN IF NOT EXISTS archive BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS date_archivage DATE;
