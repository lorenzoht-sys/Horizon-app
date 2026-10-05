-- Facturation : facturation des bilans décidée contrat par contrat.
--
-- Décision du praticien référent (2026-10-08) : ça dépend du praticien. Certains facturent
-- le bilan comme une séance normale, d'autres non. Ce n'est donc pas une règle unique : elle
-- se porte sur le contrat.
--
-- contrats.facturer_bilans (boolean, NOT NULL, défaut false) :
--  * false (défaut) : comportement de l'étape 1 bis, seules les séances de type « seance »
--    (soin) sont facturées. Aucun contrat existant ne change.
--  * true : les séances de type « bilan » réalisées du mois sont aussi facturées, au MÊME tarif
--    que les séances : tarif applicable à leur date dans tarifs_contrats, sans distinction de
--    durée ni de tarif séparé. Une ligne de bilan se libelle « Bilan du … » (et non « Séance
--    du … ») pour que la facture dise ce qu'elle facture ; le montant est celui d'une séance.
--
-- Inchangé, dans les deux cas :
--  * seul le statut « realisee » compte : un bilan annulé, reporté ou planifié n'est jamais facturé ;
--  * « bilan_initial » reste exclu : la décision ne vise que le type « bilan ». À confirmer
--    avec le praticien référent si le bilan initial doit suivre la même règle ;
--  * une séance sans tarif applicable fait échouer la génération en nommant la date : avec
--    facturer_bilans = true, cela vaut aussi pour un bilan (« un montant facturé ne se devine pas ») ;
--  * les factures déjà émises ne bougent pas, quelle que soit la valeur de facturer_bilans ensuite ;
--    un brouillon se recalcule avec la valeur du moment.
--
-- Idempotent. Aucune nouvelle table : pas de REVOKE/GRANT de table à poser (droits au niveau
-- table, déjà en place ; l'ajout de colonne n'en crée pas). Les droits de la fonction sont
-- réaffirmés ci-dessous.

ALTER TABLE public.contrats
  ADD COLUMN IF NOT EXISTS facturer_bilans boolean NOT NULL DEFAULT false;

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

DO $controle$
DECLARE v_src text; v_motif constant text := 'c.facturer_bilans AND s.type = ''bilan''';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'contrats' AND column_name = 'facturer_bilans'
                   AND data_type = 'boolean' AND is_nullable = 'NO' AND column_default = 'false') THEN
    RAISE EXCEPTION 'Facturation bilans : contrats.facturer_bilans absente ou mal définie (boolean NOT NULL DEFAULT false attendu)';
  END IF;
  IF EXISTS (SELECT 1 FROM public.contrats WHERE facturer_bilans) THEN
    RAISE EXCEPTION 'Facturation bilans : des contrats ont facturer_bilans = true dès la création de la colonne';
  END IF;

  SELECT prosrc INTO v_src FROM pg_proc WHERE oid = 'public.generer_brouillon_facture(uuid,date)'::regprocedure;
  IF (length(v_src) - length(replace(v_src, v_motif, ''))) / length(v_motif) <> 3 THEN
    RAISE EXCEPTION 'Facturation bilans : le filtre facturer_bilans doit figurer dans les 3 requêtes (comptage, tarif manquant, lignes)';
  END IF;
  IF v_src LIKE '%bilan_initial%' THEN
    RAISE EXCEPTION 'Facturation bilans : bilan_initial ne doit pas être facturé';
  END IF;
  IF (SELECT prosecdef FROM pg_proc WHERE oid = 'public.generer_brouillon_facture(uuid,date)'::regprocedure) THEN
    RAISE EXCEPTION 'Facturation bilans : generer_brouillon_facture doit rester SECURITY INVOKER';
  END IF;
  IF has_function_privilege('anon', 'public.generer_brouillon_facture(uuid,date)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Facturation bilans : anon peut exécuter generer_brouillon_facture';
  END IF;
END
$controle$;
