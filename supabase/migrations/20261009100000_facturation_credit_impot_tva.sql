-- Facturation, étape 2 : éligibilité au crédit d'impôt et taux de TVA encadrés.
--
-- Sources de ces deux règles (à CONFIRMER avec l'expert-comptable pour le détail d'application) :
--  * BOFiP, TVA des services à la personne : https://bofip.impots.gouv.fr/node/10629
--  * Mentions de la facture : https://www.acces-sap.com/actualites/professionnels/facture-services-a-la-personne/
--
-- 1. CRÉDIT D'IMPÔT. contrats.eligible_credit_impot (boolean, NOT NULL, défaut false) dit si le
--    CONTRAT ouvre droit au crédit d'impôt. Ce champ est indépendant du statut SAP du praticien.
--    Règle générale, pour tous les praticiens de la plateforme : un contrat n'est éligible que si
--    eligible_credit_impot = true ET le praticien a un n° SAP actif. Elle est portée par la fonction
--    contrat_eligible_credit_impot(contrat), qui est la seule référence : ne jamais relire
--    eligible_credit_impot seul. « Actif » = un n° SAP renseigné (non vide) sur le profil du
--    praticien : le modèle n'a pas de date de validité ni de statut (voir « à confirmer » dans
--    docs/FACTURATION.md). Le champ peut être coché avant l'obtention du n° SAP : il n'a alors
--    aucun effet tant que le n° SAP manque. La fonction s'exécute avec les droits de l'appelant
--    (la RLS fait foi) ; un contrat introuvable ou non visible n'est pas éligible.
--    À la validation, valider_facture() fige le résultat dans le snapshot du destinataire
--    (eligible_credit_impot) : une facture émise n'est plus modifiable, et changer plus tard le
--    contrat ou le n° SAP ne doit pas réécrire ce qui a été déclaré.
--
-- 2. TVA EN RÉGIME ASSUJETTI. taux_tva ne peut valoir que 5,5 ou 10, jamais un taux libre :
--    * 5,5 : aide essentielle à la vie quotidienne, agrément requis -> exige praticiens.agrement_sap ;
--    * 10  : autres services déclarés.
--    praticiens.agrement_sap (boolean, NOT NULL, défaut false) est la nouvelle case du profil de
--    facturation. Retirer l'agrément d'un praticien à 5,5 % est refusé tant que son taux n'est pas
--    changé. Le franchise_293B reste sans taux (NULL ou 0). La même liste fermée (0, 5,5, 10)
--    s'applique à factures.taux_tva. Le snapshot de l'émetteur porte désormais agrement_sap.
--    Aucun praticien n'est en régime assujetti aujourd'hui (production et staging : regime_tva
--    non renseigné) ; la migration échoue sans rien changer si une ligne existante violait la règle.
--    Hors modèle, à confirmer : l'exonération des services à la personne (art. 261-7-1° du CGI).
--
-- 3. MENTIONS SAP DU PROFIL. Troisième volet, demandé le 2026-10-05 : la page acces-sap.com exige
--    sur la facture le numéro ET la date d'enregistrement de la déclaration de services à la
--    personne, le mode d'intervention (prestataire ou mandataire) et l'adresse d'exécution. Trois
--    colonnes simples sur praticiens, toutes facultatives (NULL) :
--    * date_declaration_sap (date) ;
--    * mode_intervention ('prestataire' ou 'mandataire') ;
--    * adresse_intervention (texte libre).
--    Pas de statut ni de date de fin pour l'instant : « actif » reste « n° SAP non vide » et NE
--    dépend PAS de date_declaration_sap (décision du 2026-10-05). Les trois valeurs sont figées dans
--    snapshot_emetteur à la validation, comme le reste du profil. Rien ne les rend obligatoires à la
--    validation : à décider (voir docs/FACTURATION.md).
--
-- Idempotent. Aucune nouvelle table : pas de REVOKE/GRANT de table à poser. Les droits des
-- fonctions sont posés explicitement (EXECUTE accordé par défaut à anon en production).

-- ---------- 1. Crédit d'impôt ----------
ALTER TABLE public.contrats
  ADD COLUMN IF NOT EXISTS eligible_credit_impot boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.contrat_eligible_credit_impot(p_contrat_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT coalesce(bool_or(
           c.eligible_credit_impot AND nullif(btrim(p.numero_sap), '') IS NOT NULL
         ), false)
  FROM public.contrats c
  LEFT JOIN public.participants pa ON pa.id = c.participant_id
  LEFT JOIN public.praticiens   p  ON p.id = coalesce(c.praticien_id, pa.praticien_id)
  WHERE c.id = p_contrat_id;
$$;

REVOKE ALL ON FUNCTION public.contrat_eligible_credit_impot(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.contrat_eligible_credit_impot(uuid) TO authenticated, service_role;

-- ---------- 2. TVA : agrément et taux fermés ----------
ALTER TABLE public.praticiens
  ADD COLUMN IF NOT EXISTS agrement_sap boolean NOT NULL DEFAULT false;

ALTER TABLE public.praticiens DROP CONSTRAINT IF EXISTS praticiens_taux_tva_coherent;
ALTER TABLE public.praticiens ADD CONSTRAINT praticiens_taux_tva_coherent CHECK (
  (regime_tva = 'assujetti' AND taux_tva IS NOT NULL
     AND (taux_tva = 10 OR (taux_tva = 5.5 AND agrement_sap)))
  OR (regime_tva = 'franchise_293B' AND (taux_tva IS NULL OR taux_tva = 0))
  OR (regime_tva IS NULL AND taux_tva IS NULL)
);

ALTER TABLE public.factures DROP CONSTRAINT IF EXISTS factures_taux_tva_autorises;
ALTER TABLE public.factures ADD CONSTRAINT factures_taux_tva_autorises
  CHECK (taux_tva IS NULL OR taux_tva IN (0, 5.5, 10));

-- ---------- 3. Mentions SAP du profil ----------
ALTER TABLE public.praticiens
  ADD COLUMN IF NOT EXISTS date_declaration_sap date,
  ADD COLUMN IF NOT EXISTS mode_intervention    text,
  ADD COLUMN IF NOT EXISTS adresse_intervention text;

ALTER TABLE public.praticiens DROP CONSTRAINT IF EXISTS praticiens_mode_intervention_valide;
ALTER TABLE public.praticiens ADD CONSTRAINT praticiens_mode_intervention_valide
  CHECK (mode_intervention IS NULL OR mode_intervention IN ('prestataire', 'mandataire'));

-- ---------- valider_facture : agrément, éligibilité et mentions SAP figés dans les snapshots ----------
CREATE OR REPLACE FUNCTION public.valider_facture(p_facture_id uuid)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  f          public.factures%ROWTYPE;
  p          public.praticiens%ROWTYPE;
  c          public.contrats%ROWTYPE;
  pa         public.participants%ROWTYPE;
  o          public.factures%ROWTYPE;
  v_nb       integer;
  v_ht       numeric(12,2);
  v_taux     numeric(5,2);
  v_tva      numeric(12,2);
  v_total    numeric(12,2);
  v_date     date;
  v_numero   text;
  v_manque   text[] := ARRAY[]::text[];
  v_dest     jsonb;
  v_adresse_benef jsonb;
  v_eligible boolean;
  v_part_client numeric(12,2);
  v_part_urssaf numeric(12,2);
BEGIN
  SELECT * INTO f FROM public.factures WHERE id = p_facture_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Facture introuvable';
  END IF;

  IF auth.uid() IS DISTINCT FROM f.praticien_id
     AND coalesce(current_setting('role', true), 'none') NOT IN ('none', 'service_role', 'postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'Accès refusé à cette facture';
  END IF;

  IF f.statut <> 'brouillon' THEN
    RAISE EXCEPTION 'Facture % déjà validée (statut %)', f.numero, f.statut;
  END IF;

  SELECT count(*), coalesce(sum(montant), 0) INTO v_nb, v_ht
  FROM public.lignes_facture WHERE facture_id = f.id;
  IF v_nb = 0 THEN
    RAISE EXCEPTION 'Validation impossible : la facture n''a aucune ligne';
  END IF;

  SELECT * INTO p FROM public.praticiens WHERE id = f.praticien_id;
  SELECT * INTO c FROM public.contrats WHERE id = f.contrat_id;
  SELECT * INTO pa FROM public.participants WHERE id = f.participant_id;

  -- Profil d'émetteur complet ? (IBAN et pénalités restent facultatifs.)
  IF nullif(btrim(p.siret), '') IS NULL THEN v_manque := array_append(v_manque, 'siret'); END IF;
  IF nullif(btrim(p.nom), '') IS NULL THEN v_manque := array_append(v_manque, 'nom'); END IF;
  IF p.regime_tva IS NULL THEN v_manque := array_append(v_manque, 'regime_tva'); END IF;
  IF nullif(btrim(coalesce(p.facturation_adresse_rue, p.adresse_rue)), '') IS NULL
     OR nullif(btrim(coalesce(p.facturation_code_postal, p.adresse_code_postal)), '') IS NULL
     OR nullif(btrim(coalesce(p.facturation_ville, p.adresse_ville)), '') IS NULL THEN
    v_manque := array_append(v_manque, 'adresse');
  END IF;
  IF array_length(v_manque, 1) > 0 THEN
    RAISE EXCEPTION 'Profil de facturation incomplet : %', array_to_string(v_manque, ', ');
  END IF;

  -- Adresse du bénéficiaire : mention légale, exigée même si un proche paie.
  IF nullif(btrim(pa.adresse_rue), '') IS NULL THEN v_manque := array_append(v_manque, 'rue'); END IF;
  IF nullif(btrim(pa.adresse_code_postal), '') IS NULL THEN v_manque := array_append(v_manque, 'code postal'); END IF;
  IF nullif(btrim(pa.adresse_ville), '') IS NULL THEN v_manque := array_append(v_manque, 'ville'); END IF;
  IF array_length(v_manque, 1) > 0 THEN
    RAISE EXCEPTION 'Adresse du bénéficiaire incomplète (mention obligatoire) : %', array_to_string(v_manque, ', ');
  END IF;
  v_adresse_benef := jsonb_build_object('rue', pa.adresse_rue, 'code_postal', pa.adresse_code_postal, 'ville', pa.adresse_ville);

  -- Destinataire : le proche payeur s'il y en a un, sinon le bénéficiaire.
  IF c.payeur_type = 'proche' THEN
    v_dest := jsonb_build_object('role', 'proche', 'nom', c.payeur_nom,
                                 'adresse', c.payeur_adresse, 'email', c.payeur_email);
  ELSE
    v_dest := jsonb_build_object('role', 'beneficiaire', 'nom', pa.nom, 'prenom', pa.prenom,
                                 'adresse', v_adresse_benef, 'email', pa.email);
  END IF;
  v_dest := v_dest || jsonb_build_object('beneficiaire',
              jsonb_build_object('nom', pa.nom, 'prenom', pa.prenom, 'adresse', v_adresse_benef));

  -- Éligibilité au crédit d'impôt figée à l'émission : contrat coché ET n° SAP du praticien actif.
  v_eligible := public.contrat_eligible_credit_impot(c.id);
  v_dest := v_dest || jsonb_build_object('eligible_credit_impot', v_eligible);

  -- TVA : lignes en HT, TVA ajoutée sur le total HT (arrondie une fois). Un avoir reprend
  -- le taux de sa facture d'origine.
  IF f.type = 'avoir' THEN
    SELECT * INTO o FROM public.factures WHERE id = f.facture_origine_id FOR UPDATE;
    IF o.statut IN ('brouillon', 'annulee') THEN
      RAISE EXCEPTION 'L''avoir porte sur une facture % (statut %)', coalesce(o.numero, 'brouillon'), o.statut;
    END IF;
    v_taux := coalesce(o.taux_tva, 0);
  ELSE
    v_taux := CASE WHEN p.regime_tva = 'assujetti' THEN coalesce(p.taux_tva, 0) ELSE 0 END;
  END IF;
  v_tva := round(v_ht * v_taux / 100, 2);
  v_total := v_ht + v_tva;

  IF f.type = 'avoir' AND v_total > o.total THEN
    RAISE EXCEPTION 'L''avoir (% € TTC) dépasse la facture d''origine (% € TTC)', v_total, o.total;
  END IF;

  -- Répartition : classique = tout à la charge du client ; urssaf = la répartition posée sur
  -- le brouillon doit déjà être cohérente avec le total TTC recalculé.
  IF f.circuit = 'classique' THEN
    v_part_client := v_total; v_part_urssaf := 0;
  ELSE
    v_part_client := f.part_client; v_part_urssaf := f.part_urssaf;
    IF v_part_client + v_part_urssaf <> v_total THEN
      RAISE EXCEPTION 'Répartition client/URSSAF (% + %) différente du total (%)', v_part_client, v_part_urssaf, v_total;
    END IF;
  END IF;

  v_date := (now() AT TIME ZONE 'Europe/Paris')::date;
  PERFORM set_config('horizon.validation_facture', f.id::text, true);
  v_numero := public.attribuer_numero_facture(f.praticien_id, extract(year FROM v_date)::integer);

  UPDATE public.factures SET
    numero = v_numero,
    statut = 'validee',
    date_emission = v_date,
    echeance = v_date + p.delai_paiement_jours,
    total_ht = v_ht, montant_tva = v_tva, taux_tva = v_taux, total = v_total,
    part_client = v_part_client, part_urssaf = v_part_urssaf,
    snapshot_emetteur = jsonb_build_object(
      'prenom', p.prenom, 'nom', p.nom, 'societe', p.societe, 'titre', p.titre,
      'siret', p.siret, 'numero_sap', p.numero_sap, 'numero_tva', p.numero_tva,
      'adresse', jsonb_build_object(
        'rue', coalesce(p.facturation_adresse_rue, p.adresse_rue),
        'code_postal', coalesce(p.facturation_code_postal, p.adresse_code_postal),
        'ville', coalesce(p.facturation_ville, p.adresse_ville)),
      'email', p.email, 'telephone', p.telephone,
      'regime_tva', p.regime_tva, 'taux_tva', v_taux,
      'delai_paiement_jours', p.delai_paiement_jours, 'penalites_retard', p.penalites_retard,
      'iban', p.iban, 'agrement_sap', p.agrement_sap,
      'date_declaration_sap', p.date_declaration_sap, 'mode_intervention', p.mode_intervention,
      'adresse_intervention', p.adresse_intervention),
    snapshot_destinataire = v_dest
  WHERE id = f.id;
  PERFORM set_config('horizon.validation_facture', '', true);

  IF f.type = 'avoir' AND v_total = o.total THEN
    PERFORM set_config('horizon.annulation_facture', o.id::text, true);
    UPDATE public.factures SET statut = 'annulee' WHERE id = o.id;
    PERFORM set_config('horizon.annulation_facture', '', true);
  END IF;

  RETURN v_numero;
END;
$$;

REVOKE ALL ON FUNCTION public.valider_facture(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.valider_facture(uuid) TO authenticated, service_role;

DO $controle$
DECLARE v_src text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'contrats' AND column_name = 'eligible_credit_impot'
                   AND data_type = 'boolean' AND is_nullable = 'NO' AND column_default = 'false') THEN
    RAISE EXCEPTION 'Facturation étape 2 : contrats.eligible_credit_impot absente ou mal définie';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'praticiens' AND column_name = 'agrement_sap'
                   AND data_type = 'boolean' AND is_nullable = 'NO' AND column_default = 'false') THEN
    RAISE EXCEPTION 'Facturation étape 2 : praticiens.agrement_sap absente ou mal définie';
  END IF;
  IF EXISTS (SELECT 1 FROM public.contrats WHERE eligible_credit_impot) THEN
    RAISE EXCEPTION 'Facturation étape 2 : des contrats sont éligibles dès la création du champ';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conrelid = 'public.praticiens'::regclass AND conname = 'praticiens_taux_tva_coherent' AND convalidated
                   AND pg_get_constraintdef(oid) LIKE '%agrement_sap%' AND pg_get_constraintdef(oid) LIKE '%5.5%'
                   AND pg_get_constraintdef(oid) LIKE '%IS NOT NULL%') THEN
    RAISE EXCEPTION 'Facturation étape 2 : contrainte de taux de TVA absente, non validée ou incomplète';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conrelid = 'public.factures'::regclass AND conname = 'factures_taux_tva_autorises' AND convalidated) THEN
    RAISE EXCEPTION 'Facturation étape 2 : factures_taux_tva_autorises absente ou non validée';
  END IF;
  IF EXISTS (SELECT 1 FROM public.praticiens
             WHERE regime_tva = 'assujetti' AND NOT (taux_tva = 10 OR (taux_tva = 5.5 AND agrement_sap))) THEN
    RAISE EXCEPTION 'Facturation étape 2 : un praticien assujetti a un taux non autorisé';
  END IF;

  IF to_regprocedure('public.contrat_eligible_credit_impot(uuid)') IS NULL THEN
    RAISE EXCEPTION 'Facturation étape 2 : contrat_eligible_credit_impot absente';
  END IF;
  IF has_function_privilege('anon', 'public.contrat_eligible_credit_impot(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.valider_facture(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Facturation étape 2 : anon peut exécuter une fonction de facturation';
  END IF;
  IF (SELECT prosecdef FROM pg_proc WHERE oid = 'public.contrat_eligible_credit_impot(uuid)'::regprocedure) THEN
    RAISE EXCEPTION 'Facturation étape 2 : contrat_eligible_credit_impot doit rester SECURITY INVOKER (la RLS fait foi)';
  END IF;

  SELECT prosrc INTO v_src FROM pg_proc WHERE oid = 'public.valider_facture(uuid)'::regprocedure;
  IF v_src NOT LIKE '%''agrement_sap'', p.agrement_sap%' OR v_src NOT LIKE '%contrat_eligible_credit_impot%' THEN
    RAISE EXCEPTION 'Facturation étape 2 : valider_facture ne fige pas l''agrément et l''éligibilité';
  END IF;
  IF v_src NOT LIKE '%''date_declaration_sap'', p.date_declaration_sap%'
     OR v_src NOT LIKE '%''mode_intervention'', p.mode_intervention%'
     OR v_src NOT LIKE '%''adresse_intervention'', p.adresse_intervention%' THEN
    RAISE EXCEPTION 'Facturation étape 2 : valider_facture ne fige pas les mentions SAP du profil';
  END IF;
  IF (SELECT count(*) FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'praticiens'
        AND column_name IN ('date_declaration_sap', 'mode_intervention', 'adresse_intervention')
        AND is_nullable = 'YES') <> 3 THEN
    RAISE EXCEPTION 'Facturation étape 2 : colonnes de mentions SAP absentes ou non facultatives';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conrelid = 'public.praticiens'::regclass AND conname = 'praticiens_mode_intervention_valide' AND convalidated) THEN
    RAISE EXCEPTION 'Facturation étape 2 : praticiens_mode_intervention_valide absente ou non validée';
  END IF;
END
$controle$;
