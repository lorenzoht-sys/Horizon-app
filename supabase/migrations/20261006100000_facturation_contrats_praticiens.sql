-- Facturation, étape 1 (1/5) : colonnes de facturation sur contrats et praticiens.
--
-- Décisions (2026-10-06) : le payeur est toujours le bénéficiaire ou un proche,
-- jamais une structure ; chaque praticien facture en son nom. Rien ici ne touche
-- aux données existantes : toutes les colonnes ont un défaut ou sont NULL, et les
-- contrats actuels restent « à la séance, payés par le bénéficiaire ».
--
-- Contrats : mode de facturation (séance ou forfait), montant du forfait, payeur
-- (bénéficiaire ou proche) et coordonnées du proche. Les coordonnées sont
-- exigées dès que le payeur est un proche ; le montant dès que le mode est forfait.
--
-- Praticiens : on complète la table qui porte déjà SIRET, n° SAP et n° TVA. Le
-- profil de facturation est figé dans la facture à la validation (snapshot) : le
-- modifier ensuite ne change aucune facture émise.
--  * Adresse de facturation : facultative, repli sur l'adresse du profil.
--  * Régime de TVA : franchise_293B (pas de TVA) ou assujetti (taux > 0 requis).
--    NULL = pas encore renseigné : la validation d'une facture l'exige.
--  * Conditions de paiement : délai en jours (30 par défaut, 0 à 60) et mention
--    des pénalités de retard (texte libre).
--  * IBAN du praticien : il figure sur ses factures. Normalisé (majuscules, sans
--    espaces) par trigger, puis contrôlé sur son format (pas sur sa clé).
--
-- Idempotent. Aucune nouvelle table : pas de REVOKE/GRANT à poser (les privilèges
-- sont au niveau de la table, déjà en place).

-- ---------- contrats ----------
ALTER TABLE public.contrats
  ADD COLUMN IF NOT EXISTS mode_facturation text NOT NULL DEFAULT 'seance',
  ADD COLUMN IF NOT EXISTS montant_forfait  numeric(10,2),
  ADD COLUMN IF NOT EXISTS payeur_type      text NOT NULL DEFAULT 'beneficiaire',
  ADD COLUMN IF NOT EXISTS payeur_nom       text,
  ADD COLUMN IF NOT EXISTS payeur_adresse   text,
  ADD COLUMN IF NOT EXISTS payeur_email     text;

ALTER TABLE public.contrats DROP CONSTRAINT IF EXISTS contrats_mode_facturation_valide;
ALTER TABLE public.contrats ADD CONSTRAINT contrats_mode_facturation_valide
  CHECK (mode_facturation IN ('seance', 'forfait'));

ALTER TABLE public.contrats DROP CONSTRAINT IF EXISTS contrats_montant_forfait_positif;
ALTER TABLE public.contrats ADD CONSTRAINT contrats_montant_forfait_positif
  CHECK (montant_forfait IS NULL OR montant_forfait > 0);

ALTER TABLE public.contrats DROP CONSTRAINT IF EXISTS contrats_forfait_requiert_montant;
ALTER TABLE public.contrats ADD CONSTRAINT contrats_forfait_requiert_montant
  CHECK (mode_facturation <> 'forfait' OR montant_forfait IS NOT NULL);

ALTER TABLE public.contrats DROP CONSTRAINT IF EXISTS contrats_payeur_type_valide;
ALTER TABLE public.contrats ADD CONSTRAINT contrats_payeur_type_valide
  CHECK (payeur_type IN ('beneficiaire', 'proche'));

ALTER TABLE public.contrats DROP CONSTRAINT IF EXISTS contrats_proche_requiert_coordonnees;
ALTER TABLE public.contrats ADD CONSTRAINT contrats_proche_requiert_coordonnees
  CHECK (payeur_type <> 'proche' OR (
    nullif(btrim(payeur_nom), '')     IS NOT NULL AND
    nullif(btrim(payeur_adresse), '') IS NOT NULL AND
    nullif(btrim(payeur_email), '')   IS NOT NULL
  ));

ALTER TABLE public.contrats DROP CONSTRAINT IF EXISTS contrats_payeur_email_format;
ALTER TABLE public.contrats ADD CONSTRAINT contrats_payeur_email_format
  CHECK (payeur_email IS NULL OR payeur_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$');

-- ---------- praticiens ----------
ALTER TABLE public.praticiens
  ADD COLUMN IF NOT EXISTS facturation_adresse_rue text,
  ADD COLUMN IF NOT EXISTS facturation_code_postal text,
  ADD COLUMN IF NOT EXISTS facturation_ville       text,
  ADD COLUMN IF NOT EXISTS regime_tva              text,
  ADD COLUMN IF NOT EXISTS taux_tva                numeric(5,2),
  ADD COLUMN IF NOT EXISTS delai_paiement_jours    integer NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS penalites_retard        text,
  ADD COLUMN IF NOT EXISTS iban                    text;

ALTER TABLE public.praticiens DROP CONSTRAINT IF EXISTS praticiens_regime_tva_valide;
ALTER TABLE public.praticiens ADD CONSTRAINT praticiens_regime_tva_valide
  CHECK (regime_tva IS NULL OR regime_tva IN ('franchise_293B', 'assujetti'));

ALTER TABLE public.praticiens DROP CONSTRAINT IF EXISTS praticiens_taux_tva_coherent;
ALTER TABLE public.praticiens ADD CONSTRAINT praticiens_taux_tva_coherent
  CHECK (
    (regime_tva = 'assujetti' AND taux_tva IS NOT NULL AND taux_tva > 0 AND taux_tva <= 100)
    OR (regime_tva = 'franchise_293B' AND (taux_tva IS NULL OR taux_tva = 0))
    OR (regime_tva IS NULL AND taux_tva IS NULL)
  );

ALTER TABLE public.praticiens DROP CONSTRAINT IF EXISTS praticiens_delai_paiement_valide;
ALTER TABLE public.praticiens ADD CONSTRAINT praticiens_delai_paiement_valide
  CHECK (delai_paiement_jours BETWEEN 0 AND 60);

ALTER TABLE public.praticiens DROP CONSTRAINT IF EXISTS praticiens_iban_format;
ALTER TABLE public.praticiens ADD CONSTRAINT praticiens_iban_format
  CHECK (iban IS NULL OR iban ~ '^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$');

CREATE OR REPLACE FUNCTION public.normaliser_iban_praticien()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.iban IS NOT NULL THEN
    NEW.iban := nullif(upper(regexp_replace(NEW.iban, '\s', '', 'g')), '');
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.normaliser_iban_praticien() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS praticiens_normaliser_iban ON public.praticiens;
CREATE TRIGGER praticiens_normaliser_iban
  BEFORE INSERT OR UPDATE OF iban ON public.praticiens
  FOR EACH ROW EXECUTE FUNCTION public.normaliser_iban_praticien();

DO $controle$
DECLARE v_manquants text;
BEGIN
  SELECT string_agg(c, ', ') INTO v_manquants
  FROM unnest(ARRAY[
    'contrats.mode_facturation','contrats.montant_forfait','contrats.payeur_type',
    'contrats.payeur_nom','contrats.payeur_adresse','contrats.payeur_email',
    'praticiens.facturation_adresse_rue','praticiens.facturation_code_postal','praticiens.facturation_ville',
    'praticiens.regime_tva','praticiens.taux_tva','praticiens.delai_paiement_jours',
    'praticiens.penalites_retard','praticiens.iban']) AS c
  WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = split_part(c, '.', 1) AND column_name = split_part(c, '.', 2));
  IF v_manquants IS NOT NULL THEN
    RAISE EXCEPTION 'Facturation 1/5 : colonnes manquantes (%)', v_manquants;
  END IF;

  IF (SELECT count(*) FROM pg_constraint
      WHERE convalidated AND conname IN (
        'contrats_mode_facturation_valide','contrats_montant_forfait_positif','contrats_forfait_requiert_montant',
        'contrats_payeur_type_valide','contrats_proche_requiert_coordonnees','contrats_payeur_email_format',
        'praticiens_regime_tva_valide','praticiens_taux_tva_coherent','praticiens_delai_paiement_valide',
        'praticiens_iban_format')) <> 10 THEN
    RAISE EXCEPTION 'Facturation 1/5 : contraintes manquantes ou non validées';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'praticiens_normaliser_iban' AND NOT tgisinternal) THEN
    RAISE EXCEPTION 'Facturation 1/5 : trigger de normalisation IBAN absent';
  END IF;
END
$controle$;
