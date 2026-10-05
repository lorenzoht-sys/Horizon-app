-- Facturation, étape 1 (3/5) : numérotation et validation d'une facture.
--
-- Numérotation : AAAA-NNNN, séquentielle par praticien, avec remise à 1 chaque
-- année civile (AAAA = année de la date d'émission). Avoirs et factures partagent
-- la même série chronologique.
--
-- Sans trou, y compris en cas d'accès concurrents : on n'utilise PAS une séquence
-- Postgres (nextval n'est pas transactionnel : un rollback laisserait un trou). Le
-- compteur est une ligne de compteurs_facture, incrémentée par
-- INSERT … ON CONFLICT DO UPDATE : la ligne est verrouillée jusqu'à la fin de la
-- transaction de validation. Deux validations simultanées d'un même praticien
-- s'enchaînent donc ; si la transaction échoue ou est annulée, l'incrément est
-- annulé avec elle. Un brouillon (numéro NULL) ou un brouillon supprimé ne consomme
-- jamais de numéro. Seule la validation en consomme un.
--
-- valider_facture(id) : seul chemin pour sortir du brouillon. Elle vérifie que le
-- profil du praticien est complet, fige l'émetteur et le destinataire (snapshots),
-- recalcule les totaux depuis les lignes, attribue le numéro, pose date d'émission
-- et échéance, puis passe le statut à « validee ». Pour un avoir qui annule
-- exactement le total de sa facture d'origine, elle passe aussi l'origine à
-- « annulee » (avoir partiel : l'origine reste telle quelle).
--
-- Elle pose deux variables locales à la transaction (horizon.validation_facture et
-- horizon.annulation_facture) que les triggers de la migration 4/5 exigent pour
-- laisser sortir une facture du brouillon ou la passer à « annulee ». Un client ne
-- peut donc pas poser lui-même un numéro ni annuler une facture par un UPDATE.
--
-- Droits : valider_facture à authenticated et service_role ; attribuer_numero_facture
-- à service_role seulement. En production, les privilèges par défaut de `postgres`
-- donnent EXECUTE à anon sur toute nouvelle fonction : REVOKE explicite ci-dessous.

CREATE OR REPLACE FUNCTION public.attribuer_numero_facture(p_praticien_id uuid, p_annee integer)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_n integer;
BEGIN
  INSERT INTO public.compteurs_facture AS c (praticien_id, annee, dernier_numero)
  VALUES (p_praticien_id, p_annee, 1)
  ON CONFLICT (praticien_id, annee) DO UPDATE SET dernier_numero = c.dernier_numero + 1
  RETURNING c.dernier_numero INTO v_n;
  RETURN p_annee::text || '-' || lpad(v_n::text, 4, '0');
END;
$$;

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
  v_total    numeric(12,2);
  v_date     date;
  v_numero   text;
  v_manque   text[] := ARRAY[]::text[];
  v_dest     jsonb;
  v_part_client numeric(12,2);
  v_part_urssaf numeric(12,2);
BEGIN
  SELECT * INTO f FROM public.factures WHERE id = p_facture_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Facture introuvable';
  END IF;

  -- Accès : le praticien propriétaire, le service_role, ou une session postgres
  -- directe (SQL Editor : le réglage `role` vaut alors 'none'). On lit le réglage
  -- `role` et non current_user, qui vaut toujours le propriétaire dans une fonction
  -- SECURITY DEFINER. anon n'a de toute façon pas EXECUTE.
  IF auth.uid() IS DISTINCT FROM f.praticien_id
     AND coalesce(current_setting('role', true), 'none') NOT IN ('none', 'service_role', 'postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'Accès refusé à cette facture';
  END IF;

  IF f.statut <> 'brouillon' THEN
    RAISE EXCEPTION 'Facture % déjà validée (statut %)', f.numero, f.statut;
  END IF;

  SELECT count(*), coalesce(sum(montant), 0) INTO v_nb, v_total
  FROM public.lignes_facture WHERE facture_id = f.id;
  IF v_nb = 0 THEN
    RAISE EXCEPTION 'Validation impossible : la facture n''a aucune ligne';
  END IF;

  SELECT * INTO p FROM public.praticiens WHERE id = f.praticien_id;
  SELECT * INTO c FROM public.contrats WHERE id = f.contrat_id;
  SELECT * INTO pa FROM public.participants WHERE id = f.participant_id;

  -- Profil d'émetteur complet ?
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

  -- Destinataire : le proche payeur s'il y en a un, sinon le bénéficiaire.
  IF c.payeur_type = 'proche' THEN
    v_dest := jsonb_build_object('role', 'proche', 'nom', c.payeur_nom,
                                 'adresse', c.payeur_adresse, 'email', c.payeur_email);
  ELSE
    v_dest := jsonb_build_object('role', 'beneficiaire', 'nom', pa.nom, 'prenom', pa.prenom,
                                 'adresse', jsonb_build_object('rue', pa.adresse_rue,
                                   'code_postal', pa.adresse_code_postal, 'ville', pa.adresse_ville),
                                 'email', pa.email);
  END IF;
  v_dest := v_dest || jsonb_build_object('beneficiaire', jsonb_build_object('nom', pa.nom, 'prenom', pa.prenom));

  -- Avoir : doit porter sur une facture émise, pour au plus son montant.
  IF f.type = 'avoir' THEN
    SELECT * INTO o FROM public.factures WHERE id = f.facture_origine_id FOR UPDATE;
    IF o.statut IN ('brouillon', 'annulee') THEN
      RAISE EXCEPTION 'L''avoir porte sur une facture % (statut %)', coalesce(o.numero, 'brouillon'), o.statut;
    END IF;
    IF v_total > o.total THEN
      RAISE EXCEPTION 'L''avoir (% €) dépasse la facture d''origine (% €)', v_total, o.total;
    END IF;
  END IF;

  -- Répartition : classique = tout à la charge du client ; urssaf = la répartition
  -- posée sur le brouillon doit déjà être cohérente avec le total recalculé.
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
    total = v_total, part_client = v_part_client, part_urssaf = v_part_urssaf,
    snapshot_emetteur = jsonb_build_object(
      'prenom', p.prenom, 'nom', p.nom, 'societe', p.societe, 'titre', p.titre,
      'siret', p.siret, 'numero_sap', p.numero_sap, 'numero_tva', p.numero_tva,
      'adresse', jsonb_build_object(
        'rue', coalesce(p.facturation_adresse_rue, p.adresse_rue),
        'code_postal', coalesce(p.facturation_code_postal, p.adresse_code_postal),
        'ville', coalesce(p.facturation_ville, p.adresse_ville)),
      'email', p.email, 'telephone', p.telephone,
      'regime_tva', p.regime_tva, 'taux_tva', p.taux_tva,
      'delai_paiement_jours', p.delai_paiement_jours, 'penalites_retard', p.penalites_retard,
      'iban', p.iban),
    snapshot_destinataire = v_dest
  WHERE id = f.id;
  PERFORM set_config('horizon.validation_facture', '', true);

  -- Avoir total : la facture d'origine est annulée.
  IF f.type = 'avoir' AND v_total = o.total THEN
    PERFORM set_config('horizon.annulation_facture', o.id::text, true);
    UPDATE public.factures SET statut = 'annulee' WHERE id = o.id;
    PERFORM set_config('horizon.annulation_facture', '', true);
  END IF;

  RETURN v_numero;
END;
$$;

REVOKE ALL ON FUNCTION public.attribuer_numero_facture(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.attribuer_numero_facture(uuid, integer) TO service_role;
REVOKE ALL ON FUNCTION public.valider_facture(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.valider_facture(uuid) TO authenticated, service_role;

DO $controle$
BEGIN
  IF to_regprocedure('public.attribuer_numero_facture(uuid,integer)') IS NULL
     OR to_regprocedure('public.valider_facture(uuid)') IS NULL THEN
    RAISE EXCEPTION 'Facturation 3/5 : fonctions absentes';
  END IF;
  IF has_function_privilege('anon', 'public.valider_facture(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.attribuer_numero_facture(uuid,integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Facturation 3/5 : anon peut exécuter une fonction de facturation';
  END IF;
  IF has_function_privilege('authenticated', 'public.attribuer_numero_facture(uuid,integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Facturation 3/5 : authenticated ne doit pas pouvoir attribuer un numéro directement';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.valider_facture(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Facturation 3/5 : authenticated doit pouvoir valider ses factures';
  END IF;
END
$controle$;
