-- Bénéficiaire « Hors SAP / SAP » : les bénéficiaires SAP sont exclus de la génération automatique
-- des factures (décision 3 du 2026-10-20, plan facturation PR 3). Rien d'autre ne change pour le SAP
-- (attestations, Urssaf : phase 3, non développée).
--
-- 1. participants.beneficiaire_sap : boolean NOT NULL DEFAULT false. Tous les bénéficiaires existants
--    restent « Hors SAP » : aucun changement de facturation au déploiement.
-- 2. generer_brouillon_facture() est l'entonnoir unique des brouillons : la tâche cron du mois écoulé
--    (api/_lib/facturationMensuelle.ts) et la facture progressive (recalculer_brouillon_mois, migration
--    20261011100000) l'appellent toutes deux. La règle y vit donc à UN seul endroit : pour un
--    bénéficiaire SAP, elle ne crée rien, retire un brouillon existant et renvoie NULL (le cron le compte
--    alors comme « sans séance » ou « brouillon supprimé », sans erreur). Le corps est repris À
--    L'IDENTIQUE de 20261008100000 (dernière définition), plus ce seul bloc ; le contrôle final vérifie
--    que la règle des bilans de 20261008100000 est toujours là.
-- 3. Trigger AFTER UPDATE OF beneficiaire_sap sur participants, pour que le changement prenne effet tout
--    de suite et pas au prochain passage du cron :
--      * passage en SAP : ses brouillons de facture (jamais une facture émise, jamais un avoir) sont
--        supprimés ;
--      * retour en Hors SAP : le brouillon du mois en cours et celui du mois écoulé sont recalculés pour
--        chaque contrat à la séance (recalculer_brouillon_mois, qui avale ses erreurs) ; un forfait du
--        mois écoulé est recréé par le cron quotidien du lendemain.
--
-- Aucune table créée : pas de privilège à poser (règle du 2026-08-29). La fonction du trigger est
-- retirée à PUBLIC, anon et authenticated.

-- ---------- 1. colonne ----------
ALTER TABLE public.participants ADD COLUMN IF NOT EXISTS beneficiaire_sap boolean NOT NULL DEFAULT false;

-- ---------- 2. entonnoir des brouillons ----------
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

  -- Bénéficiaire SAP (décision 3 du 2026-10-20) : exclu de la génération automatique. Un brouillon
  -- existant est retiré (il n'a pas de numéro : ce n'est pas une pièce comptable) ; une facture déjà
  -- émise vient d'être renvoyée telle quelle plus haut, elle n'est jamais touchée.
  IF pa.beneficiaire_sap THEN
    IF v_id IS NOT NULL THEN
      DELETE FROM public.factures WHERE id = v_id;  -- brouillon : lignes supprimées en cascade
    END IF;
    RETURN NULL;
  END IF;

  IF c.mode_facturation = 'forfait' THEN
    IF NOT (c.date_debut < v_fin AND (c.duree_indeterminee OR c.date_fin >= v_debut)) THEN
      RAISE EXCEPTION 'Le contrat ne couvre pas la période %', to_char(v_debut, 'MM/YYYY');
    END IF;
    v_eligibles := 1;
  ELSE
    SELECT count(*) INTO v_eligibles
    FROM public.seances s
    WHERE s.contrat_id = c.id AND (s.type = 'seance' OR (c.facturer_bilans AND s.type = 'bilan')) AND s.statut = 'realisee' AND s.date >= v_debut AND s.date < v_fin
      AND NOT EXISTS (
        SELECT 1 FROM public.lignes_facture l JOIN public.factures f2 ON f2.id = l.facture_id
        WHERE l.seance_id = s.id AND f2.type = 'facture' AND f2.statut <> 'annulee'
          AND f2.id IS DISTINCT FROM v_id);

    SELECT string_agg(to_char(s.date, 'DD/MM/YYYY'), ', ' ORDER BY s.date) INTO v_sans_tarif
    FROM public.seances s
    WHERE s.contrat_id = c.id AND (s.type = 'seance' OR (c.facturer_bilans AND s.type = 'bilan')) AND s.statut = 'realisee' AND s.date >= v_debut AND s.date < v_fin
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
           CASE s.type WHEN 'bilan' THEN 'Bilan du ' ELSE 'Séance du ' END || to_char(s.date, 'DD/MM/YYYY') || ' à ' || s.heure_debut
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
    WHERE s.contrat_id = c.id AND (s.type = 'seance' OR (c.facturer_bilans AND s.type = 'bilan')) AND s.statut = 'realisee' AND s.date >= v_debut AND s.date < v_fin
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

-- ---------- 3. effet immédiat d'un changement ----------
CREATE OR REPLACE FUNCTION public.participants_sap_brouillons()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_courant date := date_trunc('month', (now() AT TIME ZONE 'Europe/Paris')::date)::date;
  v_contrat uuid;
BEGIN
  IF NEW.beneficiaire_sap THEN
    DELETE FROM public.factures
     WHERE participant_id = NEW.id AND type = 'facture' AND statut = 'brouillon' AND numero IS NULL;
  ELSE
    FOR v_contrat IN SELECT id FROM public.contrats WHERE participant_id = NEW.id LOOP
      PERFORM public.recalculer_brouillon_mois(v_contrat, (v_courant - interval '1 month')::date);
      PERFORM public.recalculer_brouillon_mois(v_contrat, v_courant);
    END LOOP;
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.participants_sap_brouillons() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS participants_sap_brouillons ON public.participants;
CREATE TRIGGER participants_sap_brouillons
  AFTER UPDATE OF beneficiaire_sap ON public.participants
  FOR EACH ROW WHEN (OLD.beneficiaire_sap IS DISTINCT FROM NEW.beneficiaire_sap)
  EXECUTE FUNCTION public.participants_sap_brouillons();

-- ---------- contrôle final ----------
DO $controle$
DECLARE v_src text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'participants' AND column_name = 'beneficiaire_sap'
                   AND data_type = 'boolean' AND is_nullable = 'NO' AND column_default = 'false') THEN
    RAISE EXCEPTION 'Bénéficiaire SAP : participants.beneficiaire_sap absente ou mal définie (boolean NOT NULL DEFAULT false attendu)';
  END IF;
  SELECT prosrc INTO v_src FROM pg_proc WHERE oid = 'public.generer_brouillon_facture(uuid, date)'::regprocedure;
  IF position('IF pa.beneficiaire_sap THEN' IN v_src) = 0 THEN
    RAISE EXCEPTION 'Bénéficiaire SAP : la garde SAP manque dans generer_brouillon_facture';
  END IF;
  IF position('c.facturer_bilans AND s.type = ''bilan''' IN v_src) = 0 THEN
    RAISE EXCEPTION 'Bénéficiaire SAP : generer_brouillon_facture a perdu la règle des bilans (20261008100000)';
  END IF;
  IF has_function_privilege('anon', 'public.generer_brouillon_facture(uuid, date)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.generer_brouillon_facture(uuid, date)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.generer_brouillon_facture(uuid, date)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Bénéficiaire SAP : privilèges de generer_brouillon_facture modifiés';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'participants_sap_brouillons'
                   AND tgrelid = 'public.participants'::regclass AND NOT tgisinternal AND tgenabled = 'O') THEN
    RAISE EXCEPTION 'Bénéficiaire SAP : trigger participants_sap_brouillons absent ou désactivé';
  END IF;
  IF has_function_privilege('anon', 'public.participants_sap_brouillons()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.participants_sap_brouillons()', 'EXECUTE') THEN
    RAISE EXCEPTION 'Bénéficiaire SAP : fonction du trigger exécutable par anon ou authenticated';
  END IF;
  IF EXISTS (SELECT 1 FROM public.participants WHERE beneficiaire_sap) THEN
    RAISE EXCEPTION 'Bénéficiaire SAP : des bénéficiaires sont SAP dès la création de la colonne';
  END IF;
END
$controle$;
