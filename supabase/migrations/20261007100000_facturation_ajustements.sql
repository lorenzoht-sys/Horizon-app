-- Facturation, étape 1 bis : paiements immuables, adresse du bénéficiaire exigée,
-- TVA (prix HT) et exclusion des bilans.
--
-- 1. Paiements immuables. Un paiement ne se modifie ni ne se supprime, y compris par le
--    service_role (trigger) ; les droits UPDATE/DELETE sont aussi retirés à authenticated et
--    les policies passent de « ALL » à SELECT + INSERT. Une correction passe par une NOUVELLE
--    ligne : pour que ce soit possible, montant > 0 devient montant <> 0 (un montant négatif
--    est une correction ou un remboursement). Garde-fou : la somme des paiements d'une
--    facture ne peut jamais devenir négative (on ne corrige pas plus que ce qui a été
--    enregistré). Les insertions concurrentes sur une même facture s'enchaînent (verrou de
--    la ligne de facture).
--
-- 2. Adresse du bénéficiaire obligatoire à la validation (mention légale) : rue, code postal
--    et ville. Même quand un proche paie : le bénéficiaire reste la personne qui reçoit le
--    service. IBAN et pénalités restent facultatifs. L'adresse du bénéficiaire est ajoutée
--    au snapshot (sous « beneficiaire »).
--
-- 3. TVA. HYPOTHÈSE À CONFIRMER AVEC L'EXPERT-COMPTABLE AVANT LA PREMIÈRE FACTURE EN RÉGIME
--    « assujetti » : le prix du contrat (tarif, frais, forfait) est HT et la TVA s'ajoute
--    dessus. Les lignes restent donc en HT. Nouvelles colonnes de factures : total_ht
--    (somme des lignes), montant_tva, taux_tva ; `total` devient le TTC (= total_ht +
--    montant_tva), et part_client + part_urssaf = total (TTC). La TVA est calculée UNE fois
--    sur le total HT et arrondie au centime (pas ligne par ligne). Régime franchise_293B :
--    taux 0, total = total_ht. Un avoir reprend le taux de sa facture d'origine. Le taux est
--    figé à la validation (taux_tva + snapshot de l'émetteur). Un brouillon affiche le TTC
--    selon le régime du praticien au moment du calcul ; la validation le recalcule.
--    Points à faire valider : arrondi sur le total, taux unique par facture, et le régime
--    d'exonération des services à la personne (art. 261-7-1° du CGI), absent du modèle car
--    seuls franchise_293B et assujetti existent pour l'instant.
--    Reprise des lignes existantes : aucune en production (tables créées à l'étape 1) ; en
--    local, les factures déjà là sont considérées en franchise (total_ht = total, taux 0).
--
-- 4. Bilans exclus de la facturation. Seules les séances de type « seance » (soin) sont
--    facturées ; « bilan » et « bilan_initial » ne le sont pas, EN ATTENTE de la confirmation
--    du praticien référent sur leur éligibilité SAP. Réversible : retirer le filtre
--    `s.type = 'seance'` de generer_brouillon_facture().
--
-- Idempotent. Aucune nouvelle table : pas de REVOKE/GRANT de table à poser (les droits
-- UPDATE/DELETE de paiements sont retirés ci-dessous).

-- ---------- 3. TVA : colonnes ----------
ALTER TABLE public.factures
  ADD COLUMN IF NOT EXISTS total_ht    numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS montant_tva numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS taux_tva    numeric(5,2);

-- Reprise éventuelle (aucune ligne en production). Le trigger d'inaltérabilité est suspendu le
-- temps de cette reprise, qui ne change aucun montant : elle ne fait que ranger l'existant.
ALTER TABLE public.factures DISABLE TRIGGER factures_inalterables;
UPDATE public.factures SET total_ht = total, montant_tva = 0 WHERE total_ht = 0 AND montant_tva = 0 AND total <> 0;
UPDATE public.factures SET taux_tva = 0 WHERE statut <> 'brouillon' AND taux_tva IS NULL;
ALTER TABLE public.factures ENABLE TRIGGER factures_inalterables;

ALTER TABLE public.factures DROP CONSTRAINT IF EXISTS factures_tva_coherente;
ALTER TABLE public.factures ADD CONSTRAINT factures_tva_coherente CHECK (
  total_ht >= 0 AND montant_tva >= 0 AND total = total_ht + montant_tva
  AND (taux_tva IS NULL OR (taux_tva >= 0 AND taux_tva <= 100))
);
ALTER TABLE public.factures DROP CONSTRAINT IF EXISTS factures_taux_tva_emission;
ALTER TABLE public.factures ADD CONSTRAINT factures_taux_tva_emission CHECK (statut = 'brouillon' OR taux_tva IS NOT NULL);

-- ---------- 1. Paiements ----------
ALTER TABLE public.paiements DROP CONSTRAINT IF EXISTS paiements_montant_positif;
ALTER TABLE public.paiements DROP CONSTRAINT IF EXISTS paiements_montant_non_nul;
ALTER TABLE public.paiements ADD CONSTRAINT paiements_montant_non_nul CHECK (montant <> 0);

CREATE OR REPLACE FUNCTION public.paiements_immuables()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'Paiement non modifiable : enregistrer une nouvelle ligne (montant négatif pour corriger)';
END;
$$;

DROP TRIGGER IF EXISTS paiements_immuables ON public.paiements;
CREATE TRIGGER paiements_immuables BEFORE UPDATE OR DELETE ON public.paiements
  FOR EACH ROW EXECUTE FUNCTION public.paiements_immuables();

CREATE OR REPLACE FUNCTION public.paiements_controle()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_statut text; v_deja numeric;
BEGIN
  -- Verrou de la facture : les paiements d'une même facture s'enchaînent.
  SELECT statut INTO v_statut FROM public.factures WHERE id = NEW.facture_id FOR UPDATE;
  IF v_statut IN ('brouillon', 'annulee') THEN
    RAISE EXCEPTION 'Paiement refusé : la facture est au statut %', v_statut;
  END IF;
  SELECT coalesce(sum(montant), 0) INTO v_deja FROM public.paiements WHERE facture_id = NEW.facture_id;
  IF v_deja + NEW.montant < 0 THEN
    RAISE EXCEPTION 'Correction de % € supérieure aux paiements enregistrés (% €)', -NEW.montant, v_deja;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS paiements_controle ON public.paiements;
CREATE TRIGGER paiements_controle BEFORE INSERT ON public.paiements
  FOR EACH ROW EXECUTE FUNCTION public.paiements_controle();

REVOKE ALL ON FUNCTION public.paiements_immuables() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.paiements_controle()  FROM PUBLIC, anon, authenticated;

REVOKE UPDATE, DELETE ON TABLE public.paiements FROM authenticated;

DROP POLICY IF EXISTS "paiements_praticien" ON public.paiements;
DROP POLICY IF EXISTS "paiements_praticien_lecture" ON public.paiements;
CREATE POLICY "paiements_praticien_lecture" ON public.paiements
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.factures f WHERE f.id = facture_id AND f.praticien_id = auth.uid()));
DROP POLICY IF EXISTS "paiements_praticien_insertion" ON public.paiements;
CREATE POLICY "paiements_praticien_insertion" ON public.paiements
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.factures f WHERE f.id = facture_id AND f.praticien_id = auth.uid()));

-- ---------- 2 + 3. valider_facture : adresse du bénéficiaire, TVA ----------
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
      'iban', p.iban),
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

-- ---------- 4. generer_brouillon_facture : séances de soin seulement, totaux HT/TVA/TTC ----------
CREATE OR REPLACE FUNCTION public.generer_brouillon_facture(p_contrat_id uuid, p_periode date)
RETURNS uuid
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  c          public.contrats%ROWTYPE;
  pa         public.participants%ROWTYPE;
  v_debut    date := date_trunc('month', p_periode)::date;
  v_fin      date := (date_trunc('month', p_periode) + interval '1 month')::date;  -- exclusive
  v_praticien uuid;
  v_existant public.factures%ROWTYPE;
  v_id       uuid;
  v_eligibles integer;
  v_sans_tarif text;
  v_total    numeric(12,2);
  v_taux     numeric(5,2);
  v_tva      numeric(12,2);
  v_mois     text[] := ARRAY['janvier','février','mars','avril','mai','juin','juillet',
                             'août','septembre','octobre','novembre','décembre'];
BEGIN
  IF p_contrat_id IS NULL OR p_periode IS NULL THEN
    RAISE EXCEPTION 'Contrat et période obligatoires';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_contrat_id::text || v_debut::text, 0));

  SELECT * INTO c FROM public.contrats WHERE id = p_contrat_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contrat introuvable';
  END IF;
  SELECT * INTO pa FROM public.participants WHERE id = c.participant_id;
  v_praticien := coalesce(c.praticien_id, pa.praticien_id);
  IF v_praticien IS NULL THEN
    RAISE EXCEPTION 'Contrat sans praticien';
  END IF;

  SELECT * INTO v_existant FROM public.factures
  WHERE contrat_id = c.id AND periode = v_debut AND type = 'facture' AND statut <> 'annulee';
  IF FOUND AND v_existant.statut <> 'brouillon' THEN
    RETURN v_existant.id;  -- déjà émise : rien à recalculer
  END IF;
  v_id := v_existant.id;   -- NULL si pas de brouillon

  IF c.mode_facturation = 'forfait' THEN
    IF NOT (c.date_debut < v_fin AND (c.duree_indeterminee OR c.date_fin >= v_debut)) THEN
      RAISE EXCEPTION 'Le contrat ne couvre pas la période %', to_char(v_debut, 'MM/YYYY');
    END IF;
    v_eligibles := 1;
  ELSE
    SELECT count(*) INTO v_eligibles
    FROM public.seances s
    WHERE s.contrat_id = c.id AND s.type = 'seance' AND s.statut = 'realisee' AND s.date >= v_debut AND s.date < v_fin
      AND NOT EXISTS (
        SELECT 1 FROM public.lignes_facture l JOIN public.factures f2 ON f2.id = l.facture_id
        WHERE l.seance_id = s.id AND f2.type = 'facture' AND f2.statut <> 'annulee'
          AND f2.id IS DISTINCT FROM v_id);

    SELECT string_agg(to_char(s.date, 'DD/MM/YYYY'), ', ' ORDER BY s.date) INTO v_sans_tarif
    FROM public.seances s
    WHERE s.contrat_id = c.id AND s.type = 'seance' AND s.statut = 'realisee' AND s.date >= v_debut AND s.date < v_fin
      AND NOT EXISTS (
        SELECT 1 FROM public.lignes_facture l JOIN public.factures f2 ON f2.id = l.facture_id
        WHERE l.seance_id = s.id AND f2.type = 'facture' AND f2.statut <> 'annulee'
          AND f2.id IS DISTINCT FROM v_id)
      AND NOT EXISTS (
        SELECT 1 FROM public.tarifs_contrats t
        WHERE t.contrat_id = c.id AND t.date_debut_validite <= s.date
          AND (t.date_fin_validite IS NULL OR t.date_fin_validite >= s.date));
    IF v_sans_tarif IS NOT NULL THEN
      RAISE EXCEPTION 'Aucun tarif applicable pour la ou les séances du % : créer une version de tarif', v_sans_tarif;
    END IF;
  END IF;

  IF v_eligibles = 0 THEN
    IF v_id IS NOT NULL THEN
      DELETE FROM public.factures WHERE id = v_id;  -- brouillon : lignes supprimées en cascade
    END IF;
    RETURN NULL;
  END IF;

  IF v_id IS NULL THEN
    INSERT INTO public.factures (praticien_id, contrat_id, participant_id, periode, circuit)
    VALUES (v_praticien, c.id, c.participant_id, v_debut, 'classique')
    RETURNING id INTO v_id;
  ELSE
    DELETE FROM public.lignes_facture WHERE facture_id = v_id;
  END IF;

  IF c.mode_facturation = 'forfait' THEN
    INSERT INTO public.lignes_facture (facture_id, libelle, quantite, prix_unitaire, montant)
    VALUES (v_id,
            'Forfait mensuel — ' || v_mois[extract(month FROM v_debut)::integer] || ' ' || extract(year FROM v_debut)::integer,
            1, c.montant_forfait, c.montant_forfait);
  ELSE
    INSERT INTO public.lignes_facture (facture_id, seance_id, tarif_contrat_id, libelle, quantite, prix_unitaire, montant)
    SELECT v_id, s.id, t.id,
           'Séance du ' || to_char(s.date, 'DD/MM/YYYY') || ' à ' || s.heure_debut
             || CASE WHEN t.frais_deplacement > 0
                     THEN ' (dont déplacement ' || to_char(t.frais_deplacement, 'FM990.00') || ' €)' ELSE '' END,
           1, t.tarif_seance + t.frais_deplacement, t.tarif_seance + t.frais_deplacement
    FROM public.seances s
    JOIN LATERAL (
      SELECT * FROM public.tarifs_contrats tc
      WHERE tc.contrat_id = c.id AND tc.date_debut_validite <= s.date
        AND (tc.date_fin_validite IS NULL OR tc.date_fin_validite >= s.date)
      ORDER BY tc.date_debut_validite DESC LIMIT 1
    ) t ON true
    WHERE s.contrat_id = c.id AND s.type = 'seance' AND s.statut = 'realisee' AND s.date >= v_debut AND s.date < v_fin
      AND NOT EXISTS (
        SELECT 1 FROM public.lignes_facture l JOIN public.factures f2 ON f2.id = l.facture_id
        WHERE l.seance_id = s.id AND f2.type = 'facture' AND f2.statut <> 'annulee' AND f2.id <> v_id)
    ORDER BY s.date, s.heure_debut;
  END IF;

  -- Lignes en HT. La TVA du régime courant du praticien s'ajoute sur le total HT (arrondie
  -- au centime, une seule fois) ; elle est recalculée à la validation avec le régime d'alors.
  SELECT coalesce(sum(montant), 0) INTO v_total FROM public.lignes_facture WHERE facture_id = v_id;
  SELECT CASE WHEN regime_tva = 'assujetti' THEN coalesce(taux_tva, 0) ELSE 0 END INTO v_taux
  FROM public.praticiens WHERE id = v_praticien;
  v_tva := round(v_total * coalesce(v_taux, 0) / 100, 2);
  UPDATE public.factures
  SET total_ht = v_total, montant_tva = v_tva, total = v_total + v_tva,
      part_client = v_total + v_tva, part_urssaf = 0
  WHERE id = v_id;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.generer_brouillon_facture(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generer_brouillon_facture(uuid, date) TO authenticated, service_role;

DO $controle$
BEGIN
  -- TVA
  IF (SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'factures'
      AND column_name IN ('total_ht', 'montant_tva', 'taux_tva')) <> 3 THEN
    RAISE EXCEPTION 'Facturation 1 bis : colonnes de TVA manquantes';
  END IF;
  IF (SELECT count(*) FROM pg_constraint WHERE convalidated AND conrelid = 'public.factures'::regclass
      AND conname IN ('factures_tva_coherente', 'factures_taux_tva_emission')) <> 2 THEN
    RAISE EXCEPTION 'Facturation 1 bis : contraintes de TVA manquantes ou non validées';
  END IF;
  IF EXISTS (SELECT 1 FROM public.factures WHERE total <> total_ht + montant_tva) THEN
    RAISE EXCEPTION 'Facturation 1 bis : des factures ont un total incohérent avec HT + TVA';
  END IF;

  -- Paiements immuables
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'paiements_immuables' AND NOT tgisinternal AND tgenabled = 'O')
     OR NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'paiements_controle' AND NOT tgisinternal AND tgenabled = 'O') THEN
    RAISE EXCEPTION 'Facturation 1 bis : triggers de paiements absents ou désactivés';
  END IF;
  IF has_table_privilege('authenticated', 'public.paiements', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.paiements', 'DELETE') THEN
    RAISE EXCEPTION 'Facturation 1 bis : authenticated a encore UPDATE/DELETE sur paiements';
  END IF;
  IF NOT has_table_privilege('authenticated', 'public.paiements', 'SELECT')
     OR NOT has_table_privilege('authenticated', 'public.paiements', 'INSERT') THEN
    RAISE EXCEPTION 'Facturation 1 bis : authenticated doit pouvoir lire et insérer des paiements';
  END IF;
  IF (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'paiements'
      AND policyname IN ('paiements_praticien_lecture', 'paiements_praticien_insertion', 'paiements_admin_lecture')) <> 3
     OR EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'paiements'
                AND cmd IN ('UPDATE', 'DELETE', 'ALL')) THEN
    RAISE EXCEPTION 'Facturation 1 bis : policies de paiements inattendues';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'paiements_montant_positif') THEN
    RAISE EXCEPTION 'Facturation 1 bis : paiements_montant_positif existe encore';
  END IF;

  -- Fonctions : droits et filtre des bilans
  IF has_function_privilege('anon', 'public.valider_facture(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.generer_brouillon_facture(uuid,date)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Facturation 1 bis : anon peut exécuter une fonction de facturation';
  END IF;
  IF (SELECT prosrc FROM pg_proc WHERE oid = 'public.generer_brouillon_facture(uuid,date)'::regprocedure) NOT LIKE '%s.type = ''seance''%' THEN
    RAISE EXCEPTION 'Facturation 1 bis : le filtre des séances de soin est absent';
  END IF;
  IF (SELECT prosecdef FROM pg_proc WHERE oid = 'public.generer_brouillon_facture(uuid,date)'::regprocedure) THEN
    RAISE EXCEPTION 'Facturation 1 bis : generer_brouillon_facture doit rester SECURITY INVOKER';
  END IF;
  IF (SELECT prosrc FROM pg_proc WHERE oid = 'public.valider_facture(uuid)'::regprocedure) NOT LIKE '%Adresse du bénéficiaire incomplète%' THEN
    RAISE EXCEPTION 'Facturation 1 bis : valider_facture n''exige pas l''adresse du bénéficiaire';
  END IF;
END
$controle$;
