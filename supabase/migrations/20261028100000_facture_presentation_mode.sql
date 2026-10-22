-- Mode de présentation de la facture (demande de Pierre, point A, décisions du 2026-10-22), étape A1 :
-- réglages et mode figé à la validation. Le rendu « globale » (PDF, aperçu) arrive avec A2.
--
--   « detaillee » : présentation actuelle (une ligne par séance, frais de déplacement à part, récapitulatif).
--   « globale »   : une seule ligne « Accompagnement en activité physique adaptée — septembre 2026 :
--                   4 séances, déplacements inclus ». Total identique.
-- En base, RIEN ne change dans les lignes : toujours une ligne par séance (suivi des séances, anti-double
-- facturation, avoirs par séance). Le regroupement n'existe qu'à l'affichage et dans le PDF.
--
-- 1. praticiens.presentation_facture  : choix par défaut du praticien (Paramètres de facturation),
--                                       'detaillee' par défaut (comportement actuel inchangé).
-- 2. contrats.presentation_facture    : NULL = « par défaut » (celui du praticien), sinon 'detaillee' ou
--                                       'globale' : s'adapter à un bénéficiaire ou à une structure.
-- 3. factures.presentation            : mode FIGÉ à la validation (comme le logo, 20261023100000), pour
--                                       qu'un PDF se recompose à l'identique. NULL pour un brouillon et pour
--                                       les factures émises avant cette migration (lu comme 'detaillee').
--                                       Un avoir reprend le mode de sa facture d'origine.
-- 4. Trigger BEFORE factures_presentation_figee (brouillon -> validee) : pose factures.presentation. Il vit
--    dans un trigger et non dans valider_facture(), redéfinie en entier à chaque étape (même raison que
--    factures_snapshot_logo). Ensuite, factures_inalterables interdit toute modification de la colonne.
--
-- Contrat au forfait : déjà une seule ligne ; le mode n'y change rien (décision 3 du 2026-10-22).
-- Privilèges : aucune table créée ; les colonnes suivent les droits et la RLS existants de leur table.
-- Fonction du trigger retirée à PUBLIC, anon et authenticated.

-- ---------- 1 à 3. colonnes ----------
ALTER TABLE public.praticiens ADD COLUMN IF NOT EXISTS presentation_facture text NOT NULL DEFAULT 'detaillee';
ALTER TABLE public.praticiens DROP CONSTRAINT IF EXISTS praticiens_presentation_facture_valide;
ALTER TABLE public.praticiens ADD CONSTRAINT praticiens_presentation_facture_valide
  CHECK (presentation_facture IN ('detaillee', 'globale'));

ALTER TABLE public.contrats ADD COLUMN IF NOT EXISTS presentation_facture text;
ALTER TABLE public.contrats DROP CONSTRAINT IF EXISTS contrats_presentation_facture_valide;
ALTER TABLE public.contrats ADD CONSTRAINT contrats_presentation_facture_valide
  CHECK (presentation_facture IS NULL OR presentation_facture IN ('detaillee', 'globale'));

ALTER TABLE public.factures ADD COLUMN IF NOT EXISTS presentation text;
ALTER TABLE public.factures DROP CONSTRAINT IF EXISTS factures_presentation_valide;
ALTER TABLE public.factures ADD CONSTRAINT factures_presentation_valide
  CHECK (presentation IS NULL OR presentation IN ('detaillee', 'globale'));

-- ---------- 4. mode figé à la validation ----------
CREATE OR REPLACE FUNCTION public.factures_presentation_figee()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.type = 'avoir' THEN
    SELECT coalesce(o.presentation, 'detaillee') INTO NEW.presentation
      FROM public.factures o WHERE o.id = NEW.facture_origine_id;
  ELSE
    SELECT coalesce(c.presentation_facture, p.presentation_facture, 'detaillee') INTO NEW.presentation
      FROM public.contrats c, public.praticiens p
     WHERE c.id = NEW.contrat_id AND p.id = NEW.praticien_id;
  END IF;
  NEW.presentation := coalesce(NEW.presentation, 'detaillee');
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.factures_presentation_figee() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS factures_presentation_figee ON public.factures;
CREATE TRIGGER factures_presentation_figee
  BEFORE UPDATE OF statut ON public.factures
  FOR EACH ROW
  WHEN (OLD.statut = 'brouillon' AND NEW.statut <> 'brouillon')
  EXECUTE FUNCTION public.factures_presentation_figee();

-- ---------- contrôle final ----------
DO $controle$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'praticiens' AND column_name = 'presentation_facture'
                   AND is_nullable = 'NO' AND column_default LIKE '''detaillee''%') THEN
    RAISE EXCEPTION 'Présentation : praticiens.presentation_facture absente ou mal définie';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'contrats' AND column_name = 'presentation_facture' AND is_nullable = 'YES')
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'factures' AND column_name = 'presentation' AND is_nullable = 'YES') THEN
    RAISE EXCEPTION 'Présentation : colonnes contrats.presentation_facture ou factures.presentation absentes';
  END IF;
  IF (SELECT count(*) FROM pg_constraint
       WHERE conname IN ('praticiens_presentation_facture_valide', 'contrats_presentation_facture_valide', 'factures_presentation_valide')
         AND convalidated) <> 3 THEN
    RAISE EXCEPTION 'Présentation : contraintes de valeurs absentes ou non validées';
  END IF;
  IF EXISTS (SELECT 1 FROM public.praticiens WHERE presentation_facture <> 'detaillee') THEN
    RAISE EXCEPTION 'Présentation : un praticien n''est pas en « detaillee » à la création du champ';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'factures_presentation_figee'
                   AND tgrelid = 'public.factures'::regclass AND NOT tgisinternal AND tgenabled = 'O') THEN
    RAISE EXCEPTION 'Présentation : trigger factures_presentation_figee absent ou désactivé';
  END IF;
  IF has_function_privilege('anon', 'public.factures_presentation_figee()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.factures_presentation_figee()', 'EXECUTE') THEN
    RAISE EXCEPTION 'Présentation : fonction du trigger exécutable par anon ou authenticated';
  END IF;
  -- valider_facture n'est pas redéfinie : ses contrôles des étapes précédentes doivent rester vrais.
  IF (SELECT prosrc FROM pg_proc WHERE oid = 'public.valider_facture(uuid)'::regprocedure) NOT LIKE '%Adresse du bénéficiaire incomplète%' THEN
    RAISE EXCEPTION 'Présentation : valider_facture a perdu un contrôle des étapes précédentes';
  END IF;
END
$controle$;
