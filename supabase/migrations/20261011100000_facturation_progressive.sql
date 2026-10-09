-- Facturation progressive : le brouillon du mois en cours se construit au fil des séances réalisées.
--
-- Besoin (Pierre, 2026-10-09) : quand une séance passe « réalisée », son montant s'ajoute tout de suite
-- à la facture en préparation du mois ; en fin de mois il ouvre un brouillon déjà complet. Décisions :
--   * le brouillon reste le reflet AUTOMATIQUE des séances (aucun montant libre) : on le corrige en
--     éditant la séance ou le tarif, jamais la facture ;
--   * une facture ne se valide qu'à partir du 1er du mois SUIVANT son mois de prestation.
--
-- 1. recalculer_brouillon_mois(contrat, date) : rappelle generer_brouillon_facture() pour le mois de
--    `date`, si le contrat est facturable à la séance et que le mois n'est pas futur. Elle AVALE toute
--    erreur (typiquement « aucun tarif applicable ») : une opération sur `seances` ne doit jamais
--    échouer à cause de la facturation ; le cron du 1er recalcule et journalise l'erreur.
-- 2. Trigger AFTER INSERT/UPDATE/DELETE sur seances : recalcule pour (contrat, mois) de l'ancienne et de
--    la nouvelle version quand une séance entre dans « réalisée », en sort, ou change de contrat, de
--    date, d'heure ou de type. SECURITY DEFINER : la séance peut être modifiée par le praticien, par une
--    route service_role (patient, structure) ou par le cron ; le calcul d'un brouillon ne dépend pas
--    de l'appelant (le praticien est celui du contrat). Une facture déjà émise n'est jamais touchée
--    (generer_brouillon_facture la renvoie telle quelle).
-- 3. Trigger sur tarifs_contrats : corriger le tarif appliqué met à jour le brouillon (décision du
--    2026-10-09 : « en éditant la séance ou le tarif »). À la création, à la modification ou à la
--    suppression d'une version de tarif, tous les mois où le contrat a des séances réalisées dans la
--    plage de validité (ancienne et nouvelle) sont recalculés. C'est aussi ce qui rattrape une séance
--    saisie AVANT son tarif : le trigger de séance avait avalé l'erreur « aucun tarif applicable ».
--    Les verrous des tarifs utilisés par une facture validée (étape 1) restent seuls juges.
-- 4. Garde-fou : un trigger BEFORE UPDATE refuse le passage brouillon -> validee d'une FACTURE (pas d'un
--    avoir) avant le 1er du mois suivant son mois de prestation, date civile Paris. Il vit dans un
--    trigger et non dans valider_facture() : cette fonction a été redéfinie en entier à chaque étape,
--    et une garde copiée dans son corps se perdrait à la prochaine redéfinition. La règle est ainsi
--    portée par la donnée. Raison d'être : il n'existe qu'UNE facture vivante par contrat et par mois ;
--    valider le 15 verrouillerait le mois et les séances suivantes ne seraient jamais facturées.
--
-- Triggers : seances (3), tarifs_contrats (3), factures (1). Les fonctions sont retirées à anon et authenticated (règle du 2026-08-29 pour les objets sensibles).
-- Aucune table, aucune colonne ajoutée.

-- ---------- 1. recalcul d'un brouillon ----------
CREATE OR REPLACE FUNCTION public.recalculer_brouillon_mois(p_contrat_id uuid, p_date date)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  c          public.contrats%ROWTYPE;
  v_debut    date;
  v_fin      date;
  v_courant  date := date_trunc('month', (now() AT TIME ZONE 'Europe/Paris')::date)::date;
BEGIN
  IF p_contrat_id IS NULL OR p_date IS NULL THEN
    RETURN;
  END IF;
  v_debut := date_trunc('month', p_date)::date;
  v_fin   := (v_debut + interval '1 month')::date;
  IF v_debut > v_courant THEN
    RETURN;  -- jamais de brouillon pour un mois futur
  END IF;

  SELECT * INTO c FROM public.contrats WHERE id = p_contrat_id;
  IF NOT FOUND OR c.mode_facturation <> 'seance' THEN
    RETURN;  -- un forfait ne dépend pas des séances
  END IF;
  -- Mêmes règles que la tâche cron (contratAFacturer, api/_lib/facturationMensuelle.ts).
  IF c.statut NOT IN ('actif', 'termine', 'suspendu') THEN
    RETURN;
  END IF;
  IF NOT (c.date_debut < v_fin AND (c.duree_indeterminee OR (c.date_fin IS NOT NULL AND c.date_fin >= v_debut))) THEN
    RETURN;
  END IF;

  BEGIN
    PERFORM public.generer_brouillon_facture(p_contrat_id, v_debut);
  EXCEPTION WHEN OTHERS THEN
    -- Le sous-bloc annule seulement l'appel : la séance, elle, est enregistrée.
    RAISE WARNING 'recalculer_brouillon_mois(contrat %, mois %) : %', p_contrat_id, v_debut, SQLERRM;
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.recalculer_brouillon_mois(uuid, date) FROM PUBLIC, anon, authenticated;

-- ---------- 2. trigger sur seances ----------
CREATE OR REPLACE FUNCTION public.seances_recalcul_brouillon()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Ancienne version : si elle comptait dans un brouillon, son mois doit être recalculé.
  IF TG_OP IN ('UPDATE', 'DELETE') AND OLD.statut = 'realisee' THEN
    PERFORM public.recalculer_brouillon_mois(OLD.contrat_id, OLD.date);
  END IF;
  -- Nouvelle version : une seule fois si c'est le même contrat et le même mois.
  IF TG_OP IN ('INSERT', 'UPDATE') AND NEW.statut = 'realisee' THEN
    IF NOT (TG_OP = 'UPDATE' AND OLD.statut = 'realisee'
            AND OLD.contrat_id IS NOT DISTINCT FROM NEW.contrat_id
            AND date_trunc('month', OLD.date) = date_trunc('month', NEW.date)) THEN
      PERFORM public.recalculer_brouillon_mois(NEW.contrat_id, NEW.date);
    END IF;
  END IF;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'seances_recalcul_brouillon(séance %) : %', coalesce(NEW.id, OLD.id), SQLERRM;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.seances_recalcul_brouillon() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS seances_recalcul_brouillon_ins ON public.seances;
CREATE TRIGGER seances_recalcul_brouillon_ins
  AFTER INSERT ON public.seances
  FOR EACH ROW WHEN (NEW.statut = 'realisee')
  EXECUTE FUNCTION public.seances_recalcul_brouillon();

DROP TRIGGER IF EXISTS seances_recalcul_brouillon_maj ON public.seances;
CREATE TRIGGER seances_recalcul_brouillon_maj
  AFTER UPDATE OF statut, date, heure_debut, contrat_id, type ON public.seances
  FOR EACH ROW
  WHEN ((OLD.statut = 'realisee' OR NEW.statut = 'realisee')
        AND (OLD.statut IS DISTINCT FROM NEW.statut OR OLD.date IS DISTINCT FROM NEW.date
             OR OLD.heure_debut IS DISTINCT FROM NEW.heure_debut
             OR OLD.contrat_id IS DISTINCT FROM NEW.contrat_id OR OLD.type IS DISTINCT FROM NEW.type))
  EXECUTE FUNCTION public.seances_recalcul_brouillon();

DROP TRIGGER IF EXISTS seances_recalcul_brouillon_sup ON public.seances;
CREATE TRIGGER seances_recalcul_brouillon_sup
  AFTER DELETE ON public.seances
  FOR EACH ROW WHEN (OLD.statut = 'realisee')
  EXECUTE FUNCTION public.seances_recalcul_brouillon();

-- ---------- 3. trigger sur tarifs_contrats ----------
CREATE OR REPLACE FUNCTION public.recalculer_brouillons_plage(p_contrat_id uuid, p_debut date, p_fin date)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_mois date;
BEGIN
  IF p_contrat_id IS NULL OR p_debut IS NULL THEN
    RETURN;
  END IF;
  FOR v_mois IN
    SELECT DISTINCT date_trunc('month', s.date)::date
    FROM public.seances s
    WHERE s.contrat_id = p_contrat_id AND s.statut = 'realisee'
      AND s.date >= p_debut AND (p_fin IS NULL OR s.date <= p_fin)
    ORDER BY 1
  LOOP
    PERFORM public.recalculer_brouillon_mois(p_contrat_id, v_mois);
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.recalculer_brouillons_plage(uuid, date, date) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.tarifs_recalcul_brouillons()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    PERFORM public.recalculer_brouillons_plage(OLD.contrat_id, OLD.date_debut_validite, OLD.date_fin_validite);
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    PERFORM public.recalculer_brouillons_plage(NEW.contrat_id, NEW.date_debut_validite, NEW.date_fin_validite);
  END IF;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'tarifs_recalcul_brouillons : %', SQLERRM;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.tarifs_recalcul_brouillons() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS tarifs_recalcul_brouillons_ins ON public.tarifs_contrats;
CREATE TRIGGER tarifs_recalcul_brouillons_ins
  AFTER INSERT ON public.tarifs_contrats
  FOR EACH ROW EXECUTE FUNCTION public.tarifs_recalcul_brouillons();

DROP TRIGGER IF EXISTS tarifs_recalcul_brouillons_maj ON public.tarifs_contrats;
CREATE TRIGGER tarifs_recalcul_brouillons_maj
  AFTER UPDATE OF contrat_id, tarif_seance, frais_deplacement, date_debut_validite, date_fin_validite ON public.tarifs_contrats
  FOR EACH ROW
  WHEN (OLD.contrat_id IS DISTINCT FROM NEW.contrat_id OR OLD.tarif_seance IS DISTINCT FROM NEW.tarif_seance
        OR OLD.frais_deplacement IS DISTINCT FROM NEW.frais_deplacement
        OR OLD.date_debut_validite IS DISTINCT FROM NEW.date_debut_validite
        OR OLD.date_fin_validite IS DISTINCT FROM NEW.date_fin_validite)
  EXECUTE FUNCTION public.tarifs_recalcul_brouillons();

DROP TRIGGER IF EXISTS tarifs_recalcul_brouillons_sup ON public.tarifs_contrats;
CREATE TRIGGER tarifs_recalcul_brouillons_sup
  AFTER DELETE ON public.tarifs_contrats
  FOR EACH ROW EXECUTE FUNCTION public.tarifs_recalcul_brouillons();

-- ---------- 4. garde-fou : pas de validation avant la fin du mois ----------
CREATE OR REPLACE FUNCTION public.factures_validation_apres_le_mois()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_ouverture date := (NEW.periode + interval '1 month')::date;
BEGIN
  IF (now() AT TIME ZONE 'Europe/Paris')::date < v_ouverture THEN
    RAISE EXCEPTION 'Facture de % : validation possible à partir du %, le mois n''est pas terminé',
      to_char(NEW.periode, 'MM/YYYY'), to_char(v_ouverture, 'DD/MM/YYYY');
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.factures_validation_apres_le_mois() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS factures_validation_apres_le_mois ON public.factures;
CREATE TRIGGER factures_validation_apres_le_mois
  BEFORE UPDATE OF statut ON public.factures
  FOR EACH ROW
  WHEN (OLD.statut = 'brouillon' AND NEW.statut = 'validee' AND NEW.type = 'facture')
  EXECUTE FUNCTION public.factures_validation_apres_le_mois();

-- ---------- contrôle final ----------
DO $controle$
BEGIN
  IF (SELECT count(*) FROM pg_trigger
       WHERE tgrelid = 'public.seances'::regclass AND NOT tgisinternal AND tgenabled = 'O'
         AND tgname IN ('seances_recalcul_brouillon_ins', 'seances_recalcul_brouillon_maj', 'seances_recalcul_brouillon_sup')) <> 3 THEN
    RAISE EXCEPTION 'Facturation progressive : triggers de recalcul sur seances absents ou désactivés';
  END IF;
  IF (SELECT count(*) FROM pg_trigger
       WHERE tgrelid = 'public.tarifs_contrats'::regclass AND NOT tgisinternal AND tgenabled = 'O'
         AND tgname IN ('tarifs_recalcul_brouillons_ins', 'tarifs_recalcul_brouillons_maj', 'tarifs_recalcul_brouillons_sup')) <> 3 THEN
    RAISE EXCEPTION 'Facturation progressive : triggers de recalcul sur tarifs_contrats absents ou désactivés';
  END IF;
  -- Le verrou des séances facturées de l'étape 1 doit toujours être là : on ne l'a pas remplacé.
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'seances_facturees_inalterables'
                   AND tgrelid = 'public.seances'::regclass AND NOT tgisinternal) THEN
    RAISE EXCEPTION 'Facturation progressive : verrou seances_facturees_inalterables disparu';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'factures_validation_apres_le_mois'
                   AND tgrelid = 'public.factures'::regclass AND NOT tgisinternal AND tgenabled = 'O') THEN
    RAISE EXCEPTION 'Facturation progressive : garde-fou de validation absent ou désactivé';
  END IF;
  IF has_function_privilege('anon', 'public.recalculer_brouillon_mois(uuid, date)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.recalculer_brouillon_mois(uuid, date)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.recalculer_brouillons_plage(uuid, date, date)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.recalculer_brouillons_plage(uuid, date, date)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.tarifs_recalcul_brouillons()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.tarifs_recalcul_brouillons()', 'EXECUTE')
     OR has_function_privilege('anon', 'public.seances_recalcul_brouillon()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.seances_recalcul_brouillon()', 'EXECUTE')
     OR has_function_privilege('anon', 'public.factures_validation_apres_le_mois()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.factures_validation_apres_le_mois()', 'EXECUTE') THEN
    RAISE EXCEPTION 'Facturation progressive : une fonction interne est exécutable par anon ou authenticated';
  END IF;
  -- valider_facture n'est pas redéfinie : ses contrôles des étapes précédentes doivent rester vrais.
  IF (SELECT prosrc FROM pg_proc WHERE oid = 'public.valider_facture(uuid)'::regprocedure) NOT LIKE '%Adresse du bénéficiaire incomplète%' THEN
    RAISE EXCEPTION 'Facturation progressive : valider_facture a perdu un contrôle des étapes précédentes';
  END IF;
END
$controle$;
