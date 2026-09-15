-- ============================================================================
-- 20260911_02_jours_fixe_contrats.sql
-- ============================================================================
--
-- Ravive jours_fixe (TEXT[]) : plus jamais alimentée depuis la refonte de
-- juin 2026 (20260622_refonte_contrats.sql, "n'est plus lu par la logique
-- applicative"), cette colonne redevient la source exclusive du motif
-- hebdomadaire pour le renouvellement automatique des contrats à durée
-- indéterminée (api/_lib/renouvellementContrats.ts) : le cron ne dérive plus
-- ce motif des séances déjà générées, seulement de jours_fixe /
-- nb_seances_semaine / durees_seances / heure_debut sur la ligne contrats.
--
-- ContratNouveauPage.tsx rend désormais ce champ obligatoire à la création
-- (sélecteur des 7 jours, même longueur que durees_seances). Les contrats
-- existants ne sont PAS backfillés (décision produit : ressaisie manuelle
-- par le praticien, peu de contrats concernés — voir useContrats.ts,
-- contratsSansJours, pour le signalement de ceux qui en ont encore besoin).
--
-- Pas de NOT NULL : bloquerait la lecture des lignes existantes sans
-- backfill. À la place, un CHECK interdit uniquement l'état incohérent
-- "tableau vide mais non NULL" — NULL (contrat pas encore complété) et
-- tableau non vide restent les deux seuls états valides.
--
-- IDEMPOTENTE : DROP CONSTRAINT IF EXISTS avant re-création.
-- NE PAS EXÉCUTER SUR PROD sans validation préalable.
-- ============================================================================

ALTER TABLE public.contrats
  DROP CONSTRAINT IF EXISTS contrats_jours_fixe_non_vide;

ALTER TABLE public.contrats
  ADD CONSTRAINT contrats_jours_fixe_non_vide
  CHECK (jours_fixe IS NULL OR array_length(jours_fixe, 1) > 0);
