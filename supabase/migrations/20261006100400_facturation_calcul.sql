-- Facturation, étape 1 (5/5) : calcul du brouillon d'un contrat pour un mois.
--
-- generer_brouillon_facture(contrat, mois) -> id du brouillon (ou NULL si rien à facturer).
--
-- Mode « seance » : une ligne par séance au statut « realisee » du mois, au tarif
-- applicable à la DATE de la séance. Même règle que trouverTarifApplicable()
-- (src/lib/tarifsContrats.ts) : version avec date_debut_validite <= date de la séance
-- et date_fin_validite absente ou >= date de la séance (à égalité de validité, la
-- plus récente). Montant de la ligne = tarif_seance + frais_deplacement, comme
-- totalFactureSeance(). Un changement de tarif en cours de mois est donc respecté
-- séance par séance. Séances annulées ou reportées : jamais facturées.
-- Aucun repli silencieux : si une séance n'a aucun tarif applicable, la fonction
-- échoue en nommant la date (« un montant facturé ne se devine pas »).
-- Le type de séance (seance, bilan, bilan_initial) n'est pas filtré : seul le statut
-- compte, d'après la décision du 2026-10-06. À confirmer pour les bilans.
-- Une séance déjà portée par une autre facture vivante (type facture, non annulée)
-- n'est pas refacturée.
--
-- Mode « forfait » : une seule ligne, montant_forfait, sans séance liée. Pas de
-- prorata : le contrat doit simplement couvrir une partie du mois.
--
-- Idempotence : un verrou consultatif sérialise les appels pour un même contrat et un
-- même mois. Relancée, la fonction ne crée jamais un second brouillon : elle recalcule
-- le brouillon existant (mêmes lignes, même total) ; si une facture émise existe déjà
-- pour ce mois, elle renvoie son id sans rien modifier. S'il n'y a plus rien à facturer,
-- le brouillon éventuel est supprimé et la fonction renvoie NULL.
--
-- SECURITY INVOKER : la RLS fait foi. Un praticien ne génère que pour SES contrats ;
-- le service_role (cron futur) passe outre. Pas de facture « en passant » : le circuit
-- est « classique » (le circuit URSSAF viendra à une étape ultérieure).

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
    WHERE s.contrat_id = c.id AND s.statut = 'realisee' AND s.date >= v_debut AND s.date < v_fin
      AND NOT EXISTS (
        SELECT 1 FROM public.lignes_facture l JOIN public.factures f2 ON f2.id = l.facture_id
        WHERE l.seance_id = s.id AND f2.type = 'facture' AND f2.statut <> 'annulee'
          AND f2.id IS DISTINCT FROM v_id);

    SELECT string_agg(to_char(s.date, 'DD/MM/YYYY'), ', ' ORDER BY s.date) INTO v_sans_tarif
    FROM public.seances s
    WHERE s.contrat_id = c.id AND s.statut = 'realisee' AND s.date >= v_debut AND s.date < v_fin
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
    WHERE s.contrat_id = c.id AND s.statut = 'realisee' AND s.date >= v_debut AND s.date < v_fin
      AND NOT EXISTS (
        SELECT 1 FROM public.lignes_facture l JOIN public.factures f2 ON f2.id = l.facture_id
        WHERE l.seance_id = s.id AND f2.type = 'facture' AND f2.statut <> 'annulee' AND f2.id <> v_id)
    ORDER BY s.date, s.heure_debut;
  END IF;

  SELECT coalesce(sum(montant), 0) INTO v_total FROM public.lignes_facture WHERE facture_id = v_id;
  UPDATE public.factures SET total = v_total, part_client = v_total, part_urssaf = 0 WHERE id = v_id;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.generer_brouillon_facture(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generer_brouillon_facture(uuid, date) TO authenticated, service_role;

DO $controle$
BEGIN
  IF to_regprocedure('public.generer_brouillon_facture(uuid,date)') IS NULL THEN
    RAISE EXCEPTION 'Facturation 5/5 : generer_brouillon_facture absente';
  END IF;
  IF has_function_privilege('anon', 'public.generer_brouillon_facture(uuid,date)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Facturation 5/5 : anon peut exécuter generer_brouillon_facture';
  END IF;
  IF (SELECT prosecdef FROM pg_proc WHERE oid = 'public.generer_brouillon_facture(uuid,date)'::regprocedure) THEN
    RAISE EXCEPTION 'Facturation 5/5 : generer_brouillon_facture doit rester SECURITY INVOKER (la RLS fait foi)';
  END IF;
END
$controle$;
