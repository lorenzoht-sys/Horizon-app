-- ============================================================================
-- 20260921_participations_cours_collectifs_presence_annoncee.verif.sql
-- ============================================================================
-- Vérification post-migration. UNE SEULE ligne, multi-colonnes. Chaque colonne doit
-- afficher "OK".
-- ============================================================================

SELECT
  CASE WHEN (
    SELECT count(*) FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'participations_cours_collectifs'
      AND ((column_name = 'presence_annoncee'    AND data_type = 'text')
        OR (column_name = 'presence_annoncee_le' AND data_type = 'timestamp with time zone'))
      AND is_nullable = 'YES' AND column_default IS NULL
  ) = 2 THEN 'OK' ELSE '### ECHEC ###' END AS v1_deux_colonnes,

  CASE WHEN EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.participations_cours_collectifs'::regclass
      AND conname = 'participations_cours_presence_annoncee_valeurs'
      AND pg_get_constraintdef(oid) LIKE '%vient%' AND pg_get_constraintdef(oid) LIKE '%ne_vient_pas%'
  ) THEN 'OK' ELSE '### ECHEC ###' END AS v2_contrainte_valeurs,

  CASE WHEN EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.participations_cours_collectifs'::regclass
      AND conname = 'participations_cours_presence_annoncee_coherente'
  ) THEN 'OK' ELSE '### ECHEC ###' END AS v3_contrainte_coherence,

  CASE WHEN (
    SELECT count(*) FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'participations_cours_collectifs'
  ) = 2 THEN 'OK' ELSE '### ECHEC ###' END AS v4_deux_policies,

  CASE WHEN NOT EXISTS (
    SELECT 1 FROM public.participations_cours_collectifs
    WHERE (presence_annoncee IS NULL) <> (presence_annoncee_le IS NULL)
  ) THEN 'OK' ELSE '### ECHEC ###' END AS v5_aucune_ligne_incoherente;
