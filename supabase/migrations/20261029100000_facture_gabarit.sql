-- Gabarit du PDF figé sur la facture (point C, décision du 2026-10-22) : le PDF passe à la charte
-- d'Horizon (Plus Jakarta Sans, couleurs de tailwind.config.js, pied « Facture éditée avec Horizon »).
--
-- Contrainte : une facture émise se recompose À L'OCTET PRÈS (composer.ts est déterministe ; une reprise
-- après incident compare le fichier stocké à la recomposition). Changer de gabarit ne doit donc toucher
-- que les factures validées APRÈS ce changement. Le numéro de gabarit est figé à la validation, comme le
-- logo (20261023100000) et la présentation (20261028100000) :
--
--   factures.gabarit : NULL = gabarit 1 (Helvetica, gris), celui de toutes les factures émises avant
--                      cette migration ; 2 = charte d'Horizon. NULL aussi pour un brouillon.
--
-- Trigger BEFORE factures_gabarit_fige (brouillon -> émise) : pose le gabarit COURANT (2). Il vit dans un
-- trigger et non dans valider_facture(), redéfinie en entier à chaque étape (même raison que
-- factures_snapshot_logo). Un futur gabarit 3 = redéfinir cette fonction ET ajouter le rendu dans
-- composer.ts, sans jamais retirer les précédents. Ensuite, factures_inalterables interdit toute
-- modification de la colonne. Un avoir prend le gabarit courant à SA validation (c'est un document
-- distinct, émis à sa date).
--
-- Privilèges : aucune table créée ; la colonne suit les droits et la RLS existants de factures.
-- Fonction du trigger retirée à PUBLIC, anon et authenticated.

ALTER TABLE public.factures ADD COLUMN IF NOT EXISTS gabarit smallint;
ALTER TABLE public.factures DROP CONSTRAINT IF EXISTS factures_gabarit_valide;
ALTER TABLE public.factures ADD CONSTRAINT factures_gabarit_valide
  CHECK (gabarit IS NULL OR gabarit IN (1, 2));

CREATE OR REPLACE FUNCTION public.factures_gabarit_fige()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.gabarit := 2;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.factures_gabarit_fige() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS factures_gabarit_fige ON public.factures;
CREATE TRIGGER factures_gabarit_fige
  BEFORE UPDATE OF statut ON public.factures
  FOR EACH ROW
  WHEN (OLD.statut = 'brouillon' AND NEW.statut <> 'brouillon')
  EXECUTE FUNCTION public.factures_gabarit_fige();

-- ---------- contrôle final ----------
DO $controle$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'factures' AND column_name = 'gabarit'
                   AND is_nullable = 'YES' AND column_default IS NULL) THEN
    RAISE EXCEPTION 'Gabarit : colonne factures.gabarit absente ou mal définie';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'factures_gabarit_valide' AND convalidated) THEN
    RAISE EXCEPTION 'Gabarit : contrainte factures_gabarit_valide absente ou non validée';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'factures_gabarit_fige'
                   AND tgrelid = 'public.factures'::regclass AND NOT tgisinternal AND tgenabled = 'O') THEN
    RAISE EXCEPTION 'Gabarit : trigger factures_gabarit_fige absent ou désactivé';
  END IF;
  IF has_function_privilege('anon', 'public.factures_gabarit_fige()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.factures_gabarit_fige()', 'EXECUTE') THEN
    RAISE EXCEPTION 'Gabarit : fonction du trigger exécutable par anon ou authenticated';
  END IF;
  -- Un brouillon n'a jamais de gabarit : il est posé à la validation seulement.
  IF EXISTS (SELECT 1 FROM public.factures WHERE statut = 'brouillon' AND gabarit IS NOT NULL) THEN
    RAISE EXCEPTION 'Gabarit : un brouillon porte un gabarit';
  END IF;
  -- Les triggers des étapes précédentes, qui posent au même moment logo et présentation, sont intacts.
  IF (SELECT count(*) FROM pg_trigger WHERE tgrelid = 'public.factures'::regclass AND tgenabled = 'O'
        AND tgname IN ('factures_inalterables', 'factures_snapshot_logo', 'factures_presentation_figee')) <> 3 THEN
    RAISE EXCEPTION 'Gabarit : un trigger des étapes précédentes manque ou est désactivé';
  END IF;
END
$controle$;
