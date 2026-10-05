-- ============================================================================
-- 20260620_rappel_jour_seance.sql
-- ============================================================================
--
-- Remplace la relance d'inactivité ("Pensez à vos exercices !", envoyée si
-- le patient n'a pas validé de séance autonome depuis X jours) par un rappel
-- "veille de séance" : chaque soir (heure réglable, défaut 19:00
-- Europe/Paris), si le patient a une séance ENCADRÉE prévue le LENDEMAIN
-- (table seances, statut 'planifiee'), il reçoit "Vous avez une séance
-- d'exercices demain." Remplacement net (pas de cohabitation des deux
-- types) pour garder l'UI de réglages simple côté praticien — voir
-- api/_lib/rappels.ts et api/cron/rappels.ts pour la logique.
--
-- Le rappel "2h avant la séance" (rappel_seance) n'est pas modifié.
--
-- IDEMPOTENTE. NE PAS EXÉCUTER SUR PROD SANS VALIDATION PRÉALABLE.
-- ============================================================================

ALTER TABLE public.rappel_preferences
  ADD COLUMN IF NOT EXISTS rappel_jour_seance_actif BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS rappel_jour_seance_heure TIME NOT NULL DEFAULT '19:00:00';

ALTER TABLE public.rappel_preferences
  DROP COLUMN IF EXISTS relance_exercices_actif,
  DROP COLUMN IF EXISTS relance_exercices_seuil_jours;

-- Élargit le CHECK sur rappels_envoyes.type pour autoriser le nouveau type.
-- 'relance_exercices' reste autorisé pour ne pas invalider l'historique déjà
-- journalisé (le cron n'écrira plus jamais ce type après déploiement).
ALTER TABLE public.rappels_envoyes DROP CONSTRAINT IF EXISTS rappels_envoyes_type_check;
ALTER TABLE public.rappels_envoyes ADD CONSTRAINT rappels_envoyes_type_check
  CHECK (type IN ('rappel_seance', 'relance_exercices', 'rappel_jour_seance'));
