-- Index de factures_suivi absents en production (relevé du 2026-10-05).
--
-- Pourquoi : 20260604_factures_suivi.sql (archive) les prévoyait, mais la
-- production n'en a aucun hors la clé primaire. Le plus important est
-- idx_factures_unique : un seul enregistrement par bénéficiaire et par mois,
-- garanti par la base et non par le navigateur (la génération mensuelle part
-- aujourd'hui de StatsPage, donc deux onglets ouverts peuvent doubler une ligne).
--
-- Sûr sur les données : factures_suivi est vide en production au 2026-10-05
-- (0 ligne, donc 0 doublon). Le contrôle final le revérifie via l'index.
--
-- Limite : participant_id est nul pour les factures de structure ; l'unicité
-- ne les couvre donc pas (en SQL, les NULL sont distincts). À traiter dans le
-- modèle de facturation.
--
-- Idempotent. Aucune nouvelle table : pas de REVOKE/GRANT à poser.

CREATE UNIQUE INDEX IF NOT EXISTS idx_factures_unique
  ON public.factures_suivi (participant_id, periode_annee, periode_mois);
CREATE INDEX IF NOT EXISTS idx_factures_participant ON public.factures_suivi (participant_id);
CREATE INDEX IF NOT EXISTS idx_factures_structure   ON public.factures_suivi (structure_id);
CREATE INDEX IF NOT EXISTS idx_factures_praticien   ON public.factures_suivi (praticien_id);
CREATE INDEX IF NOT EXISTS idx_factures_periode     ON public.factures_suivi (periode_annee, periode_mois);
CREATE INDEX IF NOT EXISTS idx_factures_statut      ON public.factures_suivi (statut);

DO $controle$
DECLARE v_manquants text;
BEGIN
  SELECT string_agg(n, ', ') INTO v_manquants
  FROM unnest(ARRAY['idx_factures_unique','idx_factures_participant','idx_factures_structure',
                    'idx_factures_praticien','idx_factures_periode','idx_factures_statut']) AS n
  WHERE NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = n);
  IF v_manquants IS NOT NULL THEN
    RAISE EXCEPTION 'factures_suivi : index manquants (%)', v_manquants;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_factures_unique'
                 AND indexdef LIKE 'CREATE UNIQUE INDEX%') THEN
    RAISE EXCEPTION 'idx_factures_unique existe mais n''est pas UNIQUE';
  END IF;
END
$controle$;
