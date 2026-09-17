-- ============================================================================
-- 20260917_cours_collectifs.verif.sql
-- ============================================================================
-- Vérification post-migration de 20260917_cours_collectifs.sql. UNE SEULE
-- ligne, multi-colonnes (le SQL Editor Supabase n'affiche que le dernier
-- résultat d'une suite de requêtes — leçon retenue de la vérification
-- tarifs_contrats). Chaque colonne doit afficher "OK".
-- ============================================================================

SELECT
  CASE WHEN (
    SELECT count(*) FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'cours_collectifs'
      AND column_name IN ('id','praticien_id','structure_id','titre','date','heure_debut',
                           'duree_minutes','programme_commun_id','mode_facturation','statut','created_at')
  ) = 11 THEN 'OK' ELSE '### ECHEC ###' END AS v1_colonnes_cours_collectifs,

  CASE WHEN (
    SELECT count(*) FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'participations_cours_collectifs'
      AND column_name IN ('id','cours_id','participant_id','statut_presence',
                           'programme_individuel_id','ressenti_borg','ressenti_bienetre','created_at')
  ) = 8 THEN 'OK' ELSE '### ECHEC ###' END AS v2_colonnes_participations,

  CASE WHEN (
    SELECT relrowsecurity FROM pg_class
    WHERE relname = 'cours_collectifs' AND relnamespace = 'public'::regnamespace
  ) THEN 'OK' ELSE '### ECHEC ###' END AS v3_rls_active_cours_collectifs,

  CASE WHEN (
    SELECT relrowsecurity FROM pg_class
    WHERE relname = 'participations_cours_collectifs' AND relnamespace = 'public'::regnamespace
  ) THEN 'OK' ELSE '### ECHEC ###' END AS v4_rls_active_participations,

  CASE WHEN (
    SELECT count(*) FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'cours_collectifs'
      AND policyname IN ('praticien_gere_cours_collectifs', 'orga_acces_cours_collectifs')
  ) = 2 THEN 'OK' ELSE '### ECHEC ###' END AS v5_policies_cours_collectifs,

  CASE WHEN (
    SELECT count(*) FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'participations_cours_collectifs'
      AND policyname IN ('praticien_gere_participations_cours_collectifs', 'orga_acces_participations_cours_collectifs')
  ) = 2 THEN 'OK' ELSE '### ECHEC ###' END AS v6_policies_participations,

  CASE WHEN (
    SELECT count(*) FROM pg_constraint
    WHERE conrelid = 'public.participations_cours_collectifs'::regclass
      AND contype = 'u'
  ) >= 1 THEN 'OK' ELSE '### ECHEC ###' END AS v7_contrainte_unique_participant,

  CASE WHEN (
    SELECT count(*) FROM pg_constraint
    WHERE conrelid = 'public.cours_collectifs'::regclass
      AND conname = 'cours_collectifs_structure_requise_si_facturation_structure'
  ) = 1 THEN 'OK' ELSE '### ECHEC ###' END AS v8_contrainte_structure_requise,

  -- Vérification explicite du privilège DELETE (pas seulement du REVOKE) :
  -- c'est ce qui avait échoué silencieusement sur tarifs_contrats.
  CASE WHEN NOT EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
    WHERE table_schema = 'public' AND table_name = 'cours_collectifs'
      AND grantee = 'authenticated' AND privilege_type = 'DELETE'
  ) THEN 'OK' ELSE '### ECHEC ### authenticated a DELETE' END AS v9_pas_de_delete_cours_collectifs,

  CASE WHEN NOT EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
    WHERE table_schema = 'public' AND table_name = 'participations_cours_collectifs'
      AND grantee = 'authenticated' AND privilege_type = 'DELETE'
  ) THEN 'OK' ELSE '### ECHEC ### authenticated a DELETE' END AS v10_pas_de_delete_participations;
