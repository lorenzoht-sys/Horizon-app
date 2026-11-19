-- Nettoyage : retrait d'éléments morts (2026-11-19, audit de la base de production).
--
-- Demandé par Lorenzo : « uniquement ce qui n'est pas utilisé et ne le sera pas ».
-- Audit en lecture seule du 19/11 (claude/nettoyage.md du projet) : trois objets
-- sans donnée, sans appel dans le code ni dans les fonctions de la base.
--
--   1. praticiens.logo_url : jamais remplie en production, remplacée par la table
--      logos_factures (20261023100000_facture_logo.sql). Aucune référence hors
--      du schéma de départ.
--   2. public.update_updated_at() : doublon de update_updated_at_column(), aucun
--      trigger ne l'appelle.
--   3. idx_praticiens_token_planning_ics : index simple sur token_planning_ics,
--      déjà couvert par la contrainte unique praticiens_token_planning_ics_key.
--
-- Écartés de ce nettoyage après vérification : contrats.montant_forfait (vide en
-- production mais lu par le calcul des factures au forfait), les tables vides des
-- organisations et du journal de séance (fonctions présentes dans l'application),
-- factures_suivi (anciennes factures : pièces comptables à conserver).
--
-- Garde-fous : chaque suppression revérifie, au moment de l'exécution, qu'elle ne
-- détruit aucune donnée et que rien ne dépend de l'objet. Sinon RAISE, et la
-- transaction entière est annulée. Idempotente (IF EXISTS).

DO $garde$
BEGIN
  -- 1. La colonne doit être vide et ignorée de toutes les fonctions de la base.
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'praticiens' AND column_name = 'logo_url') THEN
    IF EXISTS (SELECT 1 FROM public.praticiens WHERE logo_url IS NOT NULL) THEN
      RAISE EXCEPTION 'Nettoyage : praticiens.logo_url contient des données, suppression annulée';
    END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
             WHERE n.nspname = 'public' AND p.prosrc ~ '\mlogo_url\M') THEN
    RAISE EXCEPTION 'Nettoyage : une fonction de la base utilise logo_url, suppression annulée';
  END IF;

  -- 2. Aucun trigger ne doit appeler la fonction.
  IF EXISTS (SELECT 1 FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid
             JOIN pg_namespace n ON n.oid = p.pronamespace
             WHERE n.nspname = 'public' AND p.proname = 'update_updated_at') THEN
    RAISE EXCEPTION 'Nettoyage : un trigger utilise update_updated_at(), suppression annulée';
  END IF;

  -- 3. La contrainte unique doit couvrir la même colonne avant de retirer l'index simple.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conrelid = 'public.praticiens'::regclass
                   AND conname = 'praticiens_token_planning_ics_key' AND contype = 'u') THEN
    RAISE EXCEPTION 'Nettoyage : contrainte praticiens_token_planning_ics_key absente, index conservé';
  END IF;
END
$garde$;

DROP INDEX IF EXISTS public.idx_praticiens_token_planning_ics;
DROP FUNCTION IF EXISTS public.update_updated_at();
ALTER TABLE public.praticiens DROP COLUMN IF EXISTS logo_url;

-- ---------- contrôle final ----------
DO $controle$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'praticiens' AND column_name = 'logo_url') THEN
    RAISE EXCEPTION 'Nettoyage : praticiens.logo_url toujours présente';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
             WHERE n.nspname = 'public' AND p.proname = 'update_updated_at') THEN
    RAISE EXCEPTION 'Nettoyage : update_updated_at() toujours présente';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_praticiens_token_planning_ics') THEN
    RAISE EXCEPTION 'Nettoyage : idx_praticiens_token_planning_ics toujours présent';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                 WHERE n.nspname = 'public' AND p.proname = 'update_updated_at_column') THEN
    RAISE EXCEPTION 'Nettoyage : update_updated_at_column() a disparu, elle ne devait pas être touchée';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conrelid = 'public.praticiens'::regclass AND conname = 'praticiens_token_planning_ics_key') THEN
    RAISE EXCEPTION 'Nettoyage : la contrainte unique du jeton ICS a disparu';
  END IF;
END
$controle$;
