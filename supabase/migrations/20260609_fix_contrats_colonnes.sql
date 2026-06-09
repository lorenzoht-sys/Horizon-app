-- Correction : colonnes manquantes dans la table contrats
-- Ces colonnes sont référencées dans le code mais absentes du schéma initial.
-- Utilisation de IF NOT EXISTS pour être idempotent (safe à re-exécuter).

ALTER TABLE contrats
  ADD COLUMN IF NOT EXISTS duree_indeterminee BOOLEAN DEFAULT FALSE;

ALTER TABLE contrats
  ADD COLUMN IF NOT EXISTS tarif_seance DECIMAL(10,2);
