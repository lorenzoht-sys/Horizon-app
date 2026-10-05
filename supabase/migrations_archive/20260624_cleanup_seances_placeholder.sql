-- ============================================================================
-- 20260624_cleanup_seances_placeholder.sql
-- ============================================================================
--
-- Nettoyage des séances "placeholder" générées automatiquement par l'ancienne
-- logique de création de contrat : toutes créées à 08:00 exactement, sans
-- optimisation de trajet.
--
-- CONTEXTE : avant la refonte (refonte-generation-seances), la création d'un
-- contrat générait immédiatement des séances à heure_debut='08:00'. Le
-- planificateur essayait ensuite de les modifier, créant des doublons et des
-- mises à jour silencieusement échouées. Cette migration supprime ces séances
-- pour que le planificateur parte d'un état propre.
--
-- GARDE-FOUS :
--   - Uniquement statut='planifiee' (jamais realisee ni annulee)
--   - Uniquement heure_debut='08:00:00' (signature des placeholders)
--   - Uniquement date >= CURRENT_DATE (ne jamais toucher à l'historique)
--
-- IDEMPOTENTE : ne supprime que ce qui correspond exactement aux critères ;
-- une deuxième exécution ne trouve rien à supprimer.
--
-- NE PAS EXÉCUTER SUR PROD sans vérification préalable :
--   SELECT COUNT(*) FROM seances
--   WHERE statut = 'planifiee'
--     AND heure_debut = '08:00:00'
--     AND date >= CURRENT_DATE;
-- ============================================================================

DELETE FROM seances
WHERE statut    = 'planifiee'
  AND heure_debut = '08:00:00'
  AND date        >= CURRENT_DATE;
