-- ============================================================================
-- 20260622_refonte_contrats.sql
-- ============================================================================
--
-- Refonte des contrats : remplace les "jours fixes" choisis à la création par
-- une fréquence (nb_seances_semaine). Les jours réels de passage sont
-- désormais décidés par le planificateur de tournée (src/lib/planificateur.ts)
-- à partir des disponibilités patient (anamnese.organisation), en optimisant
-- les trajets — y compris pour les contrats déjà en cours.
--
-- jours_fixe reste en base (historique/export), mais n'est plus lu par la
-- logique applicative après cette migration.

ALTER TABLE contrats
  ADD COLUMN IF NOT EXISTS nb_seances_semaine INTEGER NOT NULL DEFAULT 2;

-- Rétrocompatibilité : déduit la fréquence des contrats existants depuis le
-- nombre de jours fixes qu'ils avaient (ex : ['lun','jeu'] → 2 séances/semaine).
UPDATE contrats
SET nb_seances_semaine = array_length(jours_fixe, 1)
WHERE jours_fixe IS NOT NULL AND array_length(jours_fixe, 1) > 0;
