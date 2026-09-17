-- ============================================================================
-- 20260917_tarifs_contrats.verif.sql
-- ============================================================================
-- Vérification post-migration de 20260917_tarifs_contrats.sql. Chaque bloc
-- affiche "OK" ou "### ECHEC ###" — à faire tourner en staging PUIS
-- production avant tout merge, voir la règle du projet "migration en
-- production avant le merge".
-- ============================================================================

-- 1. Table et colonnes attendues.
SELECT
  CASE WHEN count(*) = 7 THEN 'OK' ELSE '### ECHEC ### colonnes manquantes sur tarifs_contrats' END AS verif_1_colonnes
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'tarifs_contrats'
  AND column_name IN ('id', 'contrat_id', 'tarif_seance', 'frais_deplacement', 'date_debut_validite', 'date_fin_validite', 'created_at');

-- 2. RLS activée.
SELECT
  CASE WHEN relrowsecurity THEN 'OK' ELSE '### ECHEC ### RLS non activee sur tarifs_contrats' END AS verif_2_rls_activee
FROM pg_class WHERE relname = 'tarifs_contrats' AND relnamespace = 'public'::regnamespace;

-- 3. Les deux policies attendues, exactement.
SELECT
  CASE WHEN count(*) = 2 THEN 'OK' ELSE '### ECHEC ### ' || count(*) || ' policy(ies) au lieu de 2' END AS verif_3_policies
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'tarifs_contrats'
  AND policyname IN ('praticien_gere_tarifs_contrats', 'orga_acces_tarifs_contrats');

-- 4. Index unique "une seule version active par contrat".
SELECT
  CASE WHEN count(*) = 1 THEN 'OK' ELSE '### ECHEC ### index unique tarifs_contrats_une_version_active absent' END AS verif_4_index_unique
FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'tarifs_contrats' AND indexname = 'tarifs_contrats_une_version_active';

-- 5. Backfill complet : tout contrat avec tarif_seance non nul a une ligne.
SELECT
  CASE WHEN count(*) = 0 THEN 'OK' ELSE '### ECHEC ### ' || count(*) || ' contrat(s) avec tarif_seance non migre(s)' END AS verif_5_backfill_complet
FROM public.contrats c
WHERE c.tarif_seance IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.tarifs_contrats t WHERE t.contrat_id = c.id);

-- 6. Aucune ligne fictive créée pour un contrat sans tarif_seance.
SELECT
  CASE WHEN count(*) = 0 THEN 'OK' ELSE '### ECHEC ### ' || count(*) || ' ligne(s) fictive(s) pour contrat(s) sans tarif_seance' END AS verif_6_pas_de_ligne_fictive
FROM public.tarifs_contrats t
JOIN public.contrats c ON c.id = t.contrat_id
WHERE c.tarif_seance IS NULL;

-- 7. Aucune période invalide (fin avant début).
SELECT
  CASE WHEN count(*) = 0 THEN 'OK' ELSE '### ECHEC ### ' || count(*) || ' periode(s) invalide(s)' END AS verif_7_periodes_valides
FROM public.tarifs_contrats
WHERE date_fin_validite IS NOT NULL AND date_fin_validite < date_debut_validite;

-- 8. Au plus une version active (date_fin_validite NULL) par contrat.
SELECT
  CASE WHEN count(*) = 0 THEN 'OK' ELSE '### ECHEC ### ' || count(*) || ' contrat(s) avec plusieurs versions actives' END AS verif_8_une_seule_version_active
FROM (
  SELECT contrat_id FROM public.tarifs_contrats WHERE date_fin_validite IS NULL
  GROUP BY contrat_id HAVING count(*) > 1
) doublons;

-- 9. Privilèges : authenticated n'a pas DELETE.
SELECT
  CASE WHEN NOT bool_or(privilege_type = 'DELETE') THEN 'OK' ELSE '### ECHEC ### authenticated a DELETE sur tarifs_contrats' END AS verif_9_pas_de_delete_authenticated
FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND table_name = 'tarifs_contrats' AND grantee = 'authenticated';
