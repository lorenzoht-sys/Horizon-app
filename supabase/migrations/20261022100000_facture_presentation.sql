-- Présentation de la facture (plan facturation PR 4, exemple de Pierre du 2026-10-19) :
--   « 4 séances × 50 € = 200 € — Frais de déplacement : 4 × 5 € = 20 € — Total : 220 € ».
--
-- 1. Frais de déplacement en LIGNE DISTINCTE (décision 2 du 2026-10-20) : la ligne d'une séance ne porte
--    plus que le tarif de la séance (avant : tarif + frais, avec « (dont déplacement 5.00 €) » dans le
--    libellé). Les frais forment une ligne « Frais de déplacement : N × 5 € » par montant de frais
--    distinct dans le mois (quantité N, prix unitaire = les frais). Elle est calculée À PARTIR des lignes
--    de séance qui viennent d'être écrites : mêmes séances, mêmes versions de tarif, aucun écart possible.
--    Elle n'a ni seance_id ni tarif_contrat_id : le verrou des tarifs utilisés (tarifs_utilises_inalterables)
--    et celui des séances facturées reposent sur les lignes de séance, qui gardent les deux. Le total HT
--    de la facture est inchangé.
-- 2. Durée de la séance dans le libellé : « Séance du 03/09/2026 à 10:00 (1 h) », « (45 min) »,
--    « (1 h 30) ». Rien si seances.duree_minutes est vide.
-- Le récapitulatif « N séances × 50 € » du PDF est calculé à l'affichage (composer.ts), sans stockage.
--
-- Seule generer_brouillon_facture() change. Son corps est repris À L'IDENTIQUE de 20261021100000 (dernière
-- définition, garde SAP comprise), seul le bloc des lignes de séance est remplacé ; le contrôle final
-- vérifie que la règle des bilans et la garde SAP sont toujours là.
--
-- Factures déjà émises : intactes (lignes inaltérables). Brouillons existants : ils passent au nouveau
-- format à leur prochain recalcul (séance ou tarif modifié, tâche quotidienne du mois écoulé, et au plus
-- tard le 1er du mois suivant, avant d'être validables). La migration n'écrit aucune donnée.
-- Aucune table créée : pas de privilège à poser (règle du 2026-08-29).

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
    -- Une ligne par séance, au tarif de la séance seul, avec sa durée (PR 4, 2026-10-21).
    INSERT INTO public.lignes_facture (facture_id, seance_id, tarif_contrat_id, libelle, quantite, prix_unitaire, montant)
    SELECT v_id, s.id, t.id,
           CASE s.type WHEN 'bilan' THEN 'Bilan du ' ELSE 'Séance du ' END || to_char(s.date, 'DD/MM/YYYY') || ' à ' || s.heure_debut
             || CASE
                  WHEN coalesce(s.duree_minutes, 0) <= 0 THEN ''
                  WHEN s.duree_minutes < 60 THEN ' (' || s.duree_minutes || ' min)'
                  WHEN s.duree_minutes % 60 = 0 THEN ' (' || s.duree_minutes / 60 || ' h)'
                  ELSE ' (' || s.duree_minutes / 60 || ' h ' || lpad((s.duree_minutes % 60)::text, 2, '0') || ')'
                END,
           1, t.tarif_seance, t.tarif_seance
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

    -- Frais de déplacement en ligne distincte (décision 2 du 2026-10-20), calculés depuis les lignes de
    -- séance ci-dessus : une ligne par montant de frais. « 5 € » pour un montant rond, « 7,50 € » sinon.
    INSERT INTO public.lignes_facture (facture_id, libelle, quantite, prix_unitaire, montant)
    SELECT v_id,
           'Frais de déplacement : ' || count(*) || ' × '
             || CASE WHEN t.frais_deplacement = trunc(t.frais_deplacement)
                     THEN to_char(t.frais_deplacement, 'FM999999990')
                     ELSE replace(to_char(t.frais_deplacement, 'FM999999990.00'), '.', ',') END || ' €',
           count(*), t.frais_deplacement, count(*) * t.frais_deplacement
    FROM public.lignes_facture l
    JOIN public.tarifs_contrats t ON t.id = l.tarif_contrat_id
    WHERE l.facture_id = v_id AND l.seance_id IS NOT NULL AND t.frais_deplacement > 0
    GROUP BY t.frais_deplacement
    ORDER BY t.frais_deplacement;
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

-- ---------- contrôle final ----------
DO $controle$
DECLARE v_src text;
BEGIN
  SELECT prosrc INTO v_src FROM pg_proc WHERE oid = 'public.generer_brouillon_facture(uuid, date)'::regprocedure;
  IF position('Frais de déplacement : ' IN v_src) = 0 OR position('dont déplacement' IN v_src) > 0 THEN
    RAISE EXCEPTION 'Présentation facture : generer_brouillon_facture n''a pas la ligne distincte des frais';
  END IF;
  IF position('1, t.tarif_seance, t.tarif_seance' IN v_src) = 0 THEN
    RAISE EXCEPTION 'Présentation facture : la ligne de séance porte encore les frais de déplacement';
  END IF;
  IF position('IF pa.beneficiaire_sap THEN' IN v_src) = 0 THEN
    RAISE EXCEPTION 'Présentation facture : generer_brouillon_facture a perdu la garde SAP (20261021100000)';
  END IF;
  IF position('c.facturer_bilans AND s.type = ''bilan''' IN v_src) = 0 THEN
    RAISE EXCEPTION 'Présentation facture : generer_brouillon_facture a perdu la règle des bilans (20261008100000)';
  END IF;
  IF has_function_privilege('anon', 'public.generer_brouillon_facture(uuid, date)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.generer_brouillon_facture(uuid, date)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.generer_brouillon_facture(uuid, date)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Présentation facture : privilèges de generer_brouillon_facture modifiés';
  END IF;
END
$controle$;
