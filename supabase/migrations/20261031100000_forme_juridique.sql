-- Forme juridique du praticien et mention « EI » (décision du 2026-10-22).
--
-- Depuis le 15 mai 2022, un entrepreneur individuel (micro-entrepreneur compris) doit faire figurer « EI »
-- ou « entrepreneur individuel » à côté de son nom sur ses factures. Pierre est auto-entrepreneur.
--
-- 1. praticiens.forme_juridique : 'ei' (entrepreneur individuel) ou 'societe'. NULL = pas encore
--    renseignée. AUCUN praticien existant n'est rempli d'office : c'est au praticien de la déclarer.
-- 2. Trigger BEFORE factures_forme_juridique (brouillon -> émise, avoirs compris) :
--    - forme juridique absente : refus, avec le même début de message que le contrôle du profil dans
--      valider_facture (« Profil de facturation incomplet : forme_juridique »), que l'écran traduit et
--      relie au profil de facturation ;
--    - sinon : la forme est FIGÉE dans snapshot_emetteur ('forme_juridique'), comme le logo
--      (20261023100000). Le PDF imprime « EI » d'après le snapshot, jamais d'après le profil courant.
--    Il vit dans un trigger et non dans valider_facture(), redéfinie en entier à chaque étape (même
--    raison que factures_snapshot_logo). Ordre des triggers BEFORE (alphabétique) : celui-ci passe avant
--    factures_inalterables, qui ne contrôle à ce moment que l'origine de la sortie du brouillon.
--    L'exception annule toute la validation, numéro de facture compris.
--
-- Factures déjà émises : inchangées (pas de clé dans leur snapshot, PDF identique).
-- Privilèges : aucune table créée ; la colonne suit les droits et la RLS existants de praticiens.
-- Fonction du trigger retirée à PUBLIC, anon et authenticated.

ALTER TABLE public.praticiens ADD COLUMN IF NOT EXISTS forme_juridique text;
ALTER TABLE public.praticiens DROP CONSTRAINT IF EXISTS praticiens_forme_juridique_valide;
ALTER TABLE public.praticiens ADD CONSTRAINT praticiens_forme_juridique_valide
  CHECK (forme_juridique IS NULL OR forme_juridique IN ('ei', 'societe'));

CREATE OR REPLACE FUNCTION public.factures_forme_juridique()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_forme text;
BEGIN
  SELECT forme_juridique INTO v_forme FROM public.praticiens WHERE id = NEW.praticien_id;
  IF v_forme IS NULL THEN
    RAISE EXCEPTION 'Profil de facturation incomplet : forme_juridique';
  END IF;
  NEW.snapshot_emetteur := coalesce(NEW.snapshot_emetteur, '{}'::jsonb) || jsonb_build_object('forme_juridique', v_forme);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.factures_forme_juridique() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS factures_forme_juridique ON public.factures;
CREATE TRIGGER factures_forme_juridique
  BEFORE UPDATE OF statut ON public.factures
  FOR EACH ROW
  WHEN (OLD.statut = 'brouillon' AND NEW.statut <> 'brouillon')
  EXECUTE FUNCTION public.factures_forme_juridique();

-- ---------- contrôle final ----------
DO $controle$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'praticiens' AND column_name = 'forme_juridique'
                   AND is_nullable = 'YES' AND column_default IS NULL) THEN
    RAISE EXCEPTION 'Forme juridique : colonne praticiens.forme_juridique absente ou mal définie';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'praticiens_forme_juridique_valide' AND convalidated) THEN
    RAISE EXCEPTION 'Forme juridique : contrainte praticiens_forme_juridique_valide absente ou non validée';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'factures_forme_juridique'
                   AND tgrelid = 'public.factures'::regclass AND NOT tgisinternal AND tgenabled = 'O') THEN
    RAISE EXCEPTION 'Forme juridique : trigger factures_forme_juridique absent ou désactivé';
  END IF;
  IF has_function_privilege('anon', 'public.factures_forme_juridique()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.factures_forme_juridique()', 'EXECUTE') THEN
    RAISE EXCEPTION 'Forme juridique : fonction du trigger exécutable par anon ou authenticated';
  END IF;
  IF (SELECT count(*) FROM pg_trigger WHERE tgrelid = 'public.factures'::regclass AND tgenabled = 'O'
        AND tgname IN ('factures_inalterables', 'factures_snapshot_logo', 'factures_presentation_figee', 'factures_gabarit_fige')) <> 4 THEN
    RAISE EXCEPTION 'Forme juridique : un trigger des étapes précédentes manque ou est désactivé';
  END IF;
END
$controle$;
