-- ============================================================================
-- 20260921_participations_cours_collectifs_notes.verif.sql
-- ============================================================================
-- Vérification post-migration de 20260921_participations_cours_collectifs_notes.sql.
-- UNE SEULE ligne, multi-colonnes. Chaque colonne doit afficher "OK".
-- ============================================================================

SELECT
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'participations_cours_collectifs'
      AND column_name = 'notes' AND data_type = 'text' AND is_nullable = 'YES' AND column_default IS NULL
  ) THEN 'OK' ELSE '### ECHEC ###' END AS v1_colonne_notes,

  CASE WHEN (
    SELECT count(*) FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'participations_cours_collectifs'
  ) = 2 THEN 'OK' ELSE '### ECHEC ###' END AS v2_deux_policies,

  -- Aucune ligne existante n'a été touchée : toutes les notes sont NULL.
  CASE WHEN NOT EXISTS (
    SELECT 1 FROM public.participations_cours_collectifs WHERE notes IS NOT NULL
  ) THEN 'OK' ELSE 'INFO : des notes existent déjà (normal après usage)' END AS v3_notes_vides_a_l_origine;
