-- Avoirs (plan facturation PR 9, décisions du 2026-10-22) : créer un avoir total ou partiel depuis une
-- facture émise, validé immédiatement (numéro attribué, définitif), avec son PDF.
--
-- Ce qui existait (étape 1) : le type 'avoir' et facture_origine_id, les contrôles d'insertion
-- (factures_controle_insertion), le taux de TVA repris de la facture d'origine et l'annulation de
-- l'origine par un avoir UNIQUE de son montant (valider_facture). Deux failles corrigées ici :
--   * valider_facture ne compare qu'UN avoir au total d'origine : deux avoirs partiels pouvaient
--     ensemble dépasser la facture ;
--   * un avoir partiel suivi d'un avoir du reste n'annulait jamais l'origine.
--
-- Choix : les règles vivent dans des TRIGGERS et non dans valider_facture(), redéfinie en entier à
-- chaque étape (même raison que factures_validation_apres_le_mois, 20261011100000). valider_facture
-- n'est pas modifiée ; ses propres contrôles restent vrais (un avoir seul ne dépasse pas l'origine).
--
-- 1. Colonnes
--    factures.motif              motif de l'avoir (décision 2 : obligatoire, imprimé sur le PDF). Exigé à
--                                la VALIDATION d'un avoir (trigger 2) et non par une contrainte de table :
--                                staging porte deux avoirs de recette antérieurs, sans motif. Interdit sur
--                                une facture.
--    lignes_facture.ligne_origine_id  ligne de la facture d'origine créditée (séance ou frais) : c'est ce
--                                qui empêche de créditer deux fois la même séance et qui permet au suivi
--                                des séances d'afficher « créditée, avoir n° X » (précision du 2026-10-22).
-- 2. Trigger BEFORE factures_avoir_controle (brouillon -> émis d'un avoir) : motif présent ; lignes
--    créditées appartenant à l'origine, quantités cumulées <= celles de l'origine ; cumul des avoirs <=
--    total d'origine ; « solde » : quand le cumul HT atteint le HT d'origine, la TVA de ce dernier avoir
--    est le reste exact de la TVA d'origine (sinon les arrondis par avoir pourraient laisser 0,01 € ou
--    dépasser d'autant, et l'origine ne serait jamais annulée).
-- 3. Trigger AFTER factures_avoir_effets : cumul = total d'origine -> origine annulée (libère ses séances et
--    le mois) ; sinon statut de l'origine recalculé (PR 7 : le reste dû baisse, elle peut devenir payée).
-- 4. creer_avoir(...) : crée l'avoir, ses lignes et le valide en UNE transaction (pas d'avoir brouillon).
--    SECURITY INVOKER (RLS de l'appelant). p_total_attendu : le montant affiché dans la fenêtre de
--    confirmation ; s'il diffère du montant calculé par la base, rien n'est créé (aucun numéro consommé).
-- 5. suivi_facturation_seances : nouvel état 'creditee' (séance d'une facture émise, créditée par un avoir),
--    avec l'identifiant et le numéro de l'avoir. Colonnes renvoyées modifiées : DROP puis CREATE.
--
-- « Refaire la facture du mois » (décision 3) n'a besoin d'aucun objet nouveau : generer_brouillon_facture
-- (accessible au praticien) recrée le brouillon dès que l'origine est annulée.
-- Privilèges : aucune table créée. Fonctions de trigger retirées à PUBLIC/anon/authenticated ; creer_avoir
-- à authenticated et service_role seulement.

-- ---------- 1. colonnes ----------
ALTER TABLE public.factures ADD COLUMN IF NOT EXISTS motif text;
ALTER TABLE public.factures DROP CONSTRAINT IF EXISTS factures_motif_avoir;
ALTER TABLE public.factures ADD CONSTRAINT factures_motif_avoir
  CHECK (motif IS NULL OR (type = 'avoir' AND char_length(motif) <= 500));

ALTER TABLE public.lignes_facture ADD COLUMN IF NOT EXISTS ligne_origine_id uuid
  REFERENCES public.lignes_facture(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS lignes_facture_origine_idx
  ON public.lignes_facture (ligne_origine_id) WHERE ligne_origine_id IS NOT NULL;

-- ---------- 2. contrôle à la validation d'un avoir ----------
CREATE OR REPLACE FUNCTION public.factures_avoir_controle()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  o          public.factures%ROWTYPE;
  v_prec_ht  numeric(12,2);
  v_prec_tva numeric(12,2);
  v_prec_ttc numeric(12,2);
  v_ligne    text;
BEGIN
  IF nullif(btrim(coalesce(NEW.motif, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Avoir : le motif est obligatoire';
  END IF;

  -- Verrou de l'origine : deux avoirs simultanés sur la même facture se suivent.
  SELECT * INTO o FROM public.factures WHERE id = NEW.facture_origine_id FOR UPDATE;

  -- Lignes créditées : de l'origine, et jamais plus que la quantité facturée (tous avoirs émis compris).
  SELECT string_agg(DISTINCT l.libelle, ', ') INTO v_ligne
    FROM public.lignes_facture l
    LEFT JOIN public.lignes_facture lo ON lo.id = l.ligne_origine_id
   WHERE l.facture_id = NEW.id AND l.ligne_origine_id IS NOT NULL
     AND (lo.id IS NULL OR lo.facture_id <> o.id);
  IF v_ligne IS NOT NULL THEN
    RAISE EXCEPTION 'Avoir : ligne étrangère à la facture d''origine (%)', v_ligne;
  END IF;
  SELECT string_agg(lo.libelle, ', ' ORDER BY lo.libelle) INTO v_ligne
    FROM public.lignes_facture lo
    JOIN LATERAL (
      SELECT coalesce(sum(la.quantite), 0) AS credite
        FROM public.lignes_facture la JOIN public.factures a ON a.id = la.facture_id
       WHERE la.ligne_origine_id = lo.id AND a.type = 'avoir' AND (a.id = NEW.id OR a.statut <> 'brouillon')
    ) c ON true
   WHERE lo.facture_id = o.id AND c.credite > lo.quantite;
  IF v_ligne IS NOT NULL THEN
    RAISE EXCEPTION 'Avoir : déjà crédité en totalité (%)', v_ligne;
  END IF;

  SELECT coalesce(sum(total_ht), 0), coalesce(sum(montant_tva), 0), coalesce(sum(total), 0)
    INTO v_prec_ht, v_prec_tva, v_prec_ttc
    FROM public.factures
   WHERE facture_origine_id = o.id AND type = 'avoir' AND statut <> 'brouillon' AND id <> NEW.id;

  -- Solde : cet avoir complète le HT d'origine -> sa TVA est le reste exact de la TVA d'origine.
  IF v_prec_ht + NEW.total_ht = o.total_ht AND NEW.montant_tva <> o.montant_tva - v_prec_tva THEN
    NEW.montant_tva := o.montant_tva - v_prec_tva;
    NEW.total := NEW.total_ht + NEW.montant_tva;
    NEW.part_client := NEW.total;
    NEW.part_urssaf := 0;
  END IF;

  IF v_prec_ttc + NEW.total > o.total THEN
    RAISE EXCEPTION 'L''avoir (% € TTC) dépasse le reste créditable de la facture % (% € TTC)',
      NEW.total, o.numero, o.total - v_prec_ttc;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.factures_avoir_controle() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS factures_avoir_controle ON public.factures;
CREATE TRIGGER factures_avoir_controle
  BEFORE UPDATE OF statut ON public.factures
  FOR EACH ROW
  WHEN (OLD.statut = 'brouillon' AND NEW.statut <> 'brouillon' AND NEW.type = 'avoir')
  EXECUTE FUNCTION public.factures_avoir_controle();

-- ---------- 3. effets sur la facture d'origine ----------
CREATE OR REPLACE FUNCTION public.factures_avoir_effets()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  o       public.factures%ROWTYPE;
  v_cumul numeric(12,2);
BEGIN
  SELECT * INTO o FROM public.factures WHERE id = NEW.facture_origine_id FOR UPDATE;
  IF o.statut = 'annulee' THEN
    RETURN NULL;
  END IF;
  SELECT coalesce(sum(total), 0) INTO v_cumul
    FROM public.factures
   WHERE facture_origine_id = o.id AND type = 'avoir' AND statut <> 'brouillon';
  IF v_cumul = o.total THEN
    PERFORM set_config('horizon.annulation_facture', o.id::text, true);
    UPDATE public.factures SET statut = 'annulee' WHERE id = o.id;
    PERFORM set_config('horizon.annulation_facture', '', true);
  ELSE
    PERFORM public.actualiser_statut_facture(o.id);
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.factures_avoir_effets() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS factures_avoir_effets ON public.factures;
CREATE TRIGGER factures_avoir_effets
  AFTER UPDATE OF statut ON public.factures
  FOR EACH ROW
  WHEN (OLD.statut = 'brouillon' AND NEW.statut <> 'brouillon' AND NEW.type = 'avoir')
  EXECUTE FUNCTION public.factures_avoir_effets();

-- ---------- 4. créer un avoir ----------
-- p_lignes : [{"ligne_id": uuid, "quantite": nombre}] — lignes de l'origine à créditer (quantité <= reste).
-- p_geste  : montant HT d'une ligne « Geste commercial » (NULL ou 0 : aucune).
-- Renvoie { avoir_id, numero, total, origine_annulee, a_rembourser }.
CREATE OR REPLACE FUNCTION public.creer_avoir(
  p_facture_id uuid, p_lignes jsonb, p_geste numeric, p_motif text, p_total_attendu numeric
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  o         public.factures%ROWTYPE;
  v_motif   text := nullif(btrim(coalesce(p_motif, '')), '');
  v_avoir   uuid;
  v_numero  text;
  v_total   numeric(12,2);
  v_statut  text;
  v_du      numeric(12,2);
  v_paye    numeric(12,2);
  v_nb      integer;
  v_valides integer;
BEGIN
  IF v_motif IS NULL THEN
    RAISE EXCEPTION 'Avoir : le motif est obligatoire';
  END IF;
  IF char_length(v_motif) > 500 THEN
    RAISE EXCEPTION 'Avoir : motif trop long (500 caractères au plus)';
  END IF;
  IF p_geste IS NOT NULL AND (p_geste < 0 OR p_geste <> round(p_geste, 2)) THEN
    RAISE EXCEPTION 'Avoir : montant du geste commercial invalide';
  END IF;
  IF p_lignes IS NOT NULL AND jsonb_typeof(p_lignes) <> 'array' THEN
    RAISE EXCEPTION 'Avoir : liste de lignes invalide';
  END IF;

  -- Sous la RLS de l'appelant ET filtré sur lui : l'admin lit tout mais n'émet que pour lui-même.
  SELECT * INTO o FROM public.factures WHERE id = p_facture_id AND praticien_id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Facture introuvable';
  END IF;
  IF o.type <> 'facture' OR o.statut IN ('brouillon', 'annulee') THEN
    RAISE EXCEPTION 'Un avoir ne porte que sur une facture émise non annulée (statut %)', o.statut;
  END IF;
  IF o.circuit <> 'classique' THEN
    RAISE EXCEPTION 'Avoir sur une facture du circuit URSSAF : non pris en charge';
  END IF;

  SELECT count(*), count(*) FILTER (WHERE l.id IS NOT NULL AND l.facture_id = o.id
                                     AND (e->>'quantite') ~ '^[0-9]+(\.[0-9]{1,2})?$'
                                     AND (e->>'quantite')::numeric > 0)
    INTO v_nb, v_valides
    FROM jsonb_array_elements(coalesce(p_lignes, '[]'::jsonb)) e
    LEFT JOIN public.lignes_facture l
      ON (e->>'ligne_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     AND l.id = (e->>'ligne_id')::uuid;
  IF v_valides <> v_nb THEN
    RAISE EXCEPTION 'Avoir : ligne inconnue sur cette facture ou quantité invalide';
  END IF;
  IF v_nb = 0 AND coalesce(p_geste, 0) = 0 THEN
    RAISE EXCEPTION 'Avoir : choisissez au moins une ligne ou un geste commercial';
  END IF;

  INSERT INTO public.factures (praticien_id, contrat_id, participant_id, periode, type, facture_origine_id, circuit, motif)
  VALUES (o.praticien_id, o.contrat_id, o.participant_id, o.periode, 'avoir', o.id, 'classique', v_motif)
  RETURNING id INTO v_avoir;

  INSERT INTO public.lignes_facture (facture_id, seance_id, tarif_contrat_id, ligne_origine_id, libelle, quantite, prix_unitaire, montant)
  SELECT v_avoir, l.seance_id, l.tarif_contrat_id, l.id, l.libelle, q.quantite, l.prix_unitaire, round(q.quantite * l.prix_unitaire, 2)
    FROM (SELECT (e->>'ligne_id')::uuid AS ligne_id, sum((e->>'quantite')::numeric) AS quantite
            FROM jsonb_array_elements(coalesce(p_lignes, '[]'::jsonb)) e GROUP BY 1) q
    JOIN public.lignes_facture l ON l.id = q.ligne_id
   ORDER BY l.libelle;

  IF coalesce(p_geste, 0) > 0 THEN
    INSERT INTO public.lignes_facture (facture_id, libelle, quantite, prix_unitaire, montant)
    VALUES (v_avoir, 'Geste commercial', 1, p_geste, p_geste);
  END IF;

  v_numero := public.valider_facture(v_avoir);

  SELECT total INTO v_total FROM public.factures WHERE id = v_avoir;
  IF p_total_attendu IS NULL OR v_total <> p_total_attendu THEN
    RAISE EXCEPTION 'Avoir : le montant calculé (% €) diffère du montant affiché (% €) ; rechargez la page', v_total, p_total_attendu;
  END IF;

  SELECT statut INTO v_statut FROM public.factures WHERE id = o.id;
  SELECT o.total - coalesce(sum(a.total), 0) INTO v_du
    FROM public.factures a
   WHERE a.facture_origine_id = o.id AND a.type = 'avoir' AND a.statut <> 'brouillon';
  SELECT coalesce(sum(montant), 0) INTO v_paye FROM public.paiements WHERE facture_id = o.id;

  RETURN jsonb_build_object(
    'avoir_id', v_avoir, 'numero', v_numero, 'total', v_total,
    'origine_annulee', v_statut = 'annulee',
    'a_rembourser', greatest(v_paye - v_du, 0));
END;
$$;
REVOKE ALL ON FUNCTION public.creer_avoir(uuid, jsonb, numeric, text, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.creer_avoir(uuid, jsonb, numeric, text, numeric) TO authenticated, service_role;

-- ---------- 5. suivi des séances : état « créditée » ----------
DROP FUNCTION IF EXISTS public.suivi_facturation_seances(date);
CREATE FUNCTION public.suivi_facturation_seances(p_mois date)
RETURNS TABLE (
  seance_id uuid, date date, heure_debut text, type text, participant_id uuid, contrat_id uuid,
  etat text, motif text, facture_id uuid, numero text, avant_debut_contrat boolean,
  avoir_id uuid, numero_avoir text
)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  WITH bornes AS (
    SELECT date_trunc('month', p_mois)::date AS d, (date_trunc('month', p_mois) + interval '1 month')::date AS f
  ),
  s AS (
    SELECT se.*
      FROM public.seances se, bornes b
     WHERE se.praticien_id = auth.uid() AND se.statut = 'realisee' AND se.date >= b.d AND se.date < b.f
  ),
  liee AS (
    -- Facture vivante (non annulée) qui porte la séance, s'il y en a une.
    SELECT DISTINCT ON (l.seance_id) l.seance_id, f.id AS facture_id, f.numero, f.statut
      FROM public.lignes_facture l JOIN public.factures f ON f.id = l.facture_id
     WHERE l.seance_id IN (SELECT id FROM s) AND f.type = 'facture' AND f.statut <> 'annulee'
     ORDER BY l.seance_id, (f.statut = 'brouillon')
  ),
  creditee AS (
    -- Avoir émis qui crédite la ligne de la séance sur sa facture vivante (PR 9).
    SELECT DISTINCT ON (li.seance_id) li.seance_id, a.id AS avoir_id, a.numero AS numero_avoir
      FROM liee li
      JOIN public.lignes_facture lo ON lo.facture_id = li.facture_id AND lo.seance_id = li.seance_id
      JOIN public.lignes_facture la ON la.ligne_origine_id = lo.id
      JOIN public.factures a ON a.id = la.facture_id AND a.type = 'avoir' AND a.statut <> 'brouillon'
     ORDER BY li.seance_id, a.date_emission, a.numero
  )
  SELECT s.id, s.date, s.heure_debut, s.type, s.participant_id, s.contrat_id,
         CASE
           WHEN cr.avoir_id IS NOT NULL THEN 'creditee'
           WHEN li.statut IS NOT NULL AND li.statut <> 'brouillon' THEN 'facturee'
           WHEN li.statut = 'brouillon' THEN 'en_preparation'
           WHEN pa.beneficiaire_sap OR c.mode_facturation = 'forfait' OR s.type = 'bilan_initial'
                OR (s.type = 'bilan' AND NOT coalesce(c.facturer_bilans, false)) THEN 'non_facturable'
           ELSE 'a_facturer'
         END,
         CASE
           WHEN li.statut IS NOT NULL THEN NULL
           WHEN pa.beneficiaire_sap THEN 'beneficiaire_sap'
           WHEN c.mode_facturation = 'forfait' THEN 'forfait'
           WHEN s.type = 'bilan_initial' THEN 'bilan_initial'
           WHEN s.type = 'bilan' AND NOT coalesce(c.facturer_bilans, false) THEN 'bilan_non_facture'
           WHEN c.id IS NULL THEN 'sans_contrat'
           WHEN c.statut NOT IN ('actif', 'termine', 'suspendu') THEN 'contrat_a_venir'
           -- Même règle que recalculer_brouillon_mois et la tâche du 1er : le contrat doit couvrir le MOIS
           -- (generer_brouillon_facture facture alors toutes les séances du mois, même avant son début).
           WHEN NOT EXISTS (SELECT 1 FROM bornes b
                             WHERE c.date_debut < b.f AND (c.duree_indeterminee OR (c.date_fin IS NOT NULL AND c.date_fin >= b.d)))
             THEN 'hors_periode_contrat'
           WHEN NOT EXISTS (SELECT 1 FROM public.tarifs_contrats t
                             WHERE t.contrat_id = c.id AND t.date_debut_validite <= s.date
                               AND (t.date_fin_validite IS NULL OR t.date_fin_validite >= s.date)) THEN 'sans_tarif'
           WHEN EXISTS (SELECT 1 FROM public.factures fm, bornes b
                         WHERE fm.contrat_id = c.id AND fm.periode = b.d AND fm.type = 'facture'
                           AND fm.statut NOT IN ('brouillon', 'annulee')) THEN 'mois_deja_facture'
           ELSE 'en_attente'
         END,
         li.facture_id, li.numero,
         coalesce(s.date < c.date_debut, false),
         cr.avoir_id, cr.numero_avoir
    FROM s
    LEFT JOIN liee li ON li.seance_id = s.id
    LEFT JOIN creditee cr ON cr.seance_id = s.id
    LEFT JOIN public.contrats c ON c.id = s.contrat_id
    LEFT JOIN public.participants pa ON pa.id = s.participant_id
   ORDER BY s.date, s.heure_debut, s.id;
$$;

REVOKE ALL ON FUNCTION public.suivi_facturation_seances(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.suivi_facturation_seances(date) TO authenticated, service_role;

-- ---------- contrôle final ----------
DO $controle$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'factures' AND column_name = 'motif' AND data_type = 'text') THEN
    RAISE EXCEPTION 'Avoirs : factures.motif absente';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conrelid = 'public.factures'::regclass AND conname = 'factures_motif_avoir' AND convalidated) THEN
    RAISE EXCEPTION 'Avoirs : contrainte factures_motif_avoir absente ou non validée';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conrelid = 'public.lignes_facture'::regclass AND contype = 'f'
                   AND confrelid = 'public.lignes_facture'::regclass AND confdeltype = 'r') THEN
    RAISE EXCEPTION 'Avoirs : lignes_facture.ligne_origine_id sans clé étrangère RESTRICT';
  END IF;

  IF (SELECT count(*) FROM pg_trigger
       WHERE tgrelid = 'public.factures'::regclass AND NOT tgisinternal AND tgenabled = 'O'
         AND tgname IN ('factures_avoir_controle', 'factures_avoir_effets')) <> 2 THEN
    RAISE EXCEPTION 'Avoirs : triggers absents ou désactivés';
  END IF;
  IF has_function_privilege('authenticated', 'public.factures_avoir_controle()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.factures_avoir_effets()', 'EXECUTE') THEN
    RAISE EXCEPTION 'Avoirs : fonctions de trigger exécutables par authenticated';
  END IF;

  IF to_regprocedure('public.creer_avoir(uuid, jsonb, numeric, text, numeric)') IS NULL THEN
    RAISE EXCEPTION 'Avoirs : creer_avoir absente';
  END IF;
  IF (SELECT prosecdef FROM pg_proc WHERE oid = 'public.creer_avoir(uuid, jsonb, numeric, text, numeric)'::regprocedure) THEN
    RAISE EXCEPTION 'Avoirs : creer_avoir doit rester SECURITY INVOKER (la RLS fait foi)';
  END IF;
  IF has_function_privilege('anon', 'public.creer_avoir(uuid, jsonb, numeric, text, numeric)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.creer_avoir(uuid, jsonb, numeric, text, numeric)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Avoirs : privilèges de creer_avoir incorrects (authenticated oui, anon non)';
  END IF;

  IF to_regprocedure('public.suivi_facturation_seances(date)') IS NULL
     OR (SELECT prosecdef FROM pg_proc WHERE oid = 'public.suivi_facturation_seances(date)'::regprocedure)
     OR position('auth.uid()' IN (SELECT prosrc FROM pg_proc WHERE oid = 'public.suivi_facturation_seances(date)'::regprocedure)) = 0
     OR position('creditee' IN (SELECT prosrc FROM pg_proc WHERE oid = 'public.suivi_facturation_seances(date)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'Suivi des séances : fonction absente, DEFINER, sans filtre auth.uid() ou sans état « créditée »';
  END IF;
  IF has_function_privilege('anon', 'public.suivi_facturation_seances(date)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.suivi_facturation_seances(date)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Suivi des séances : privilèges incorrects (authenticated oui, anon non)';
  END IF;

  -- valider_facture n'est pas redéfinie : ses contrôles des étapes précédentes doivent rester vrais.
  IF (SELECT prosrc FROM pg_proc WHERE oid = 'public.valider_facture(uuid)'::regprocedure) NOT LIKE '%Adresse du bénéficiaire incomplète%' THEN
    RAISE EXCEPTION 'Avoirs : valider_facture a perdu un contrôle des étapes précédentes';
  END IF;
END
$controle$;
