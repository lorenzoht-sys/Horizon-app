-- ============================================================================
-- 20260622_durees_seances_contrats.sql
-- ============================================================================
--
-- Durées de séance individuelles par contrat : un contrat à N séances/semaine
-- peut désormais prescrire une durée différente par séance (ex : 45 min puis
-- 60 min pour un contrat à 2 séances/semaine), au lieu d'une seule durée
-- appliquée à toutes les séances générées.
--
-- durees_seances[i] correspond à la i-ème séance de la semaine dans l'ordre
-- chronologique (séance 1 = la première de la semaine, etc.).
--
-- duree_minutes est conservé comme valeur représentative (= durees_seances[1],
-- index 1-based en SQL) pour les affichages existants qui montrent un seul
-- nombre (fiche patient, PDF...).

ALTER TABLE contrats
  ADD COLUMN IF NOT EXISTS durees_seances INTEGER[] NOT NULL DEFAULT '{45}';

-- Rétrocompatibilité : un contrat existant avait une seule durée pour toutes
-- ses séances — on la duplique nb_seances_semaine fois.
UPDATE contrats
SET durees_seances = array_fill(duree_minutes, ARRAY[GREATEST(nb_seances_semaine, 1)])
WHERE duree_minutes IS NOT NULL;
