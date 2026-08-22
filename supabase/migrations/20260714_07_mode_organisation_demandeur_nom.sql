-- ============================================================================
-- 20260714_mode_organisation_demandeur_nom.sql
-- ============================================================================
--
-- Palier 5 (onboarding) — colonne manquante repérée en préparant l'endpoint
-- /api/organisation/demande : demandeur_nom était prévue dans le plan
-- initial (nom de la personne qui soumet la demande de création, distinct
-- de email_contact) mais n'a jamais été ajoutée par une migration.
--
-- Nullable au niveau du schéma (cohérence avec les autres colonnes de
-- organisations) : le champ est rendu obligatoire au niveau applicatif, par
-- la validation de l'endpoint /api/organisation/demande, pas par une
-- contrainte NOT NULL ici — évite de bloquer une éventuelle correction
-- manuelle en base plus tard (ex. une demande créée avant un futur correctif
-- de validation).
--
-- IDEMPOTENTE : ADD COLUMN IF NOT EXISTS.
-- NE PAS EXÉCUTER SUR PROD sans validation préalable.
-- ============================================================================

ALTER TABLE public.organisations
  ADD COLUMN IF NOT EXISTS demandeur_nom TEXT;

NOTIFY pgrst, 'reload schema';
