-- ============================================================================
-- 20260618_retours_seance.sql
-- ============================================================================
--
-- Retours post-séance autonome du patient.
-- Deux indicateurs cliniques recueillis via l'espace patient :
--   • borg_rpe    : effort perçu (Borg RPE simplifié, 5 niveaux : 2/4/6/8/10)
--   • bien_etre   : ressenti après séance (1=Très bien … 5=Épuisé)
--
-- PRÉREQUIS : tables participants, seances_patient.
-- praticien_id référence directement auth.users(id), comme partout ailleurs
-- dans le schéma (participants.praticien_id, bilans.praticien_id, etc.) —
-- PAS la table praticiens (profil optionnel, créé seulement quand le
-- praticien enregistre ses paramètres : une FK vers praticiens(id) ferait
-- échouer l'insertion pour tout praticien n'ayant jamais ouvert Réglages).
-- IDEMPOTENTE : IF NOT EXISTS / DO $$ sur tous les objets.
-- NE PAS EXÉCUTER SUR PROD sans validation préalable.
-- Écriture réservée à service_role via /api/patient/retour-seance.
-- ============================================================================

CREATE TABLE IF NOT EXISTS retours_seance (
  id             UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  participant_id UUID        NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  -- seance_id nullable : peut ne pas être lié à une seances_patient spécifique
  seance_id      UUID        REFERENCES seances_patient(id) ON DELETE SET NULL,
  praticien_id   UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date           DATE        NOT NULL,
  borg_rpe       SMALLINT    NOT NULL CHECK (borg_rpe BETWEEN 1 AND 10),
  bien_etre      SMALLINT    NOT NULL CHECK (bien_etre BETWEEN 1 AND 5),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_retours_seance_participant
  ON retours_seance (participant_id, date DESC);

ALTER TABLE retours_seance ENABLE ROW LEVEL SECURITY;

-- Praticien : lecture de ses propres patients uniquement.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'retours_seance'
      AND policyname = 'retours_seance_praticien_select'
  ) THEN
    CREATE POLICY retours_seance_praticien_select ON retours_seance
      FOR SELECT USING (praticien_id = auth.uid());
  END IF;
END $$;

-- Aucune policy INSERT/UPDATE/DELETE pour les rôles anon ou authenticated :
-- l'écriture passe exclusivement par /api/patient/retour-seance (service_role).

-- ── Privilèges GRANT (couche distincte de RLS) ─────────────────────────────
-- RLS ne filtre que les LIGNES ; sans un GRANT de base sur la table, toute
-- requête échoue avec "permission denied for table" (42501) AVANT même que
-- les policies RLS ne soient évaluées — y compris pour service_role, qui ne
-- fait que contourner les policies, pas l'absence de GRANT.
-- Les tables historiques (créées avant l'audit sécurité) ont hérité ce GRANT
-- implicitement des privilèges par défaut du projet ; cette table, créée via
-- une migration manuelle (Étape 2.2 du GUIDE_STAGING), doit le déclarer
-- explicitement pour ne pas dépendre d'un réglage de projet potentiellement
-- absent sur un environnement donné (constaté en pratique sur staging).
GRANT SELECT, INSERT ON retours_seance TO service_role;
GRANT SELECT ON retours_seance TO authenticated;
-- anon : aucun privilège (cohérent avec le REVOKE global, voir
-- 20260613_rls_anon_lockdown.sql) — l'espace patient passe exclusivement par
-- /api/patient/* (service_role), jamais par un accès direct anon.
