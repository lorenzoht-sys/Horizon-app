-- ════════════════════════════════════════════════════════════════════════════
-- Facture complémentaire : une séance réalisée APRÈS la validation de la facture
-- de son mois est facturée par une nouvelle facture du même mois
-- ════════════════════════════════════════════════════════════════════════════
--
-- Décision 5 du 2026-10-20 (docs/FACTURATION.md, à faire confirmer par l'expert-comptable de Pierre) :
-- « séance réalisée après validation de la facture du mois : facture complémentaire ». Jusqu'ici la
-- limite était documentée : une seule facture vivante par contrat et par mois, donc une séance
-- tardive n'était facturée NULLE PART (suivi des séances : « à corriger », motif « mois déjà
-- facturé »). Signalé de nouveau par Pierre le 2026-11-14 : les séances créées sans contrat (corrigé
-- par #200), rattachées ensuite à leur contrat, tombent toutes dans ce cas pour les mois validés.
--
-- Aucune table, aucune colonne. Une facture complémentaire est une facture ordinaire (type
-- 'facture', même contrat, même mois, son propre numéro) qui ne porte que les séances que les
-- autres factures vivantes du mois ne portent pas. C'est déjà ce que calcule
-- generer_brouillon_facture : elle exclut toute séance portée par une autre facture vivante.
--
-- 1. Unicité : l'index « une facture vivante par contrat et par mois » devient « un BROUILLON par
--    contrat et par mois ». Plusieurs factures émises peuvent donc coexister pour un mois ; il n'y a
--    toujours qu'un brouillon en préparation, que generer_brouillon_facture retrouve et recalcule.
-- 2. generer_brouillon_facture : corps repris À L'IDENTIQUE de 20261022100000 (dernière définition :
--    frais en ligne distincte, garde SAP, règle des bilans), seule la recherche de l'existant change :
--      * le brouillon du mois est recalculé comme avant ;
--      * une facture émise n'empêche plus de préparer un brouillon pour les séances qu'elle ne porte
--        pas (mode séance uniquement) ;
--      * forfait : une facture émise suffit, jamais de complément (le forfait ne dépend pas des
--        séances) ;
--      * rien de nouveau à facturer : la fonction renvoie, comme avant, la facture émise du mois (la
--        plus récente), sinon NULL. Les appelants (tâche du 1er, « Refaire la facture du mois »,
--        tests) gardent donc le même contrat.
--    Changement voulu : une séance tardive sans tarif applicable fait maintenant échouer la génération
--    (elle était ignorée en silence). Le trigger de séance avale l'erreur, comme pour un brouillon.
-- 3. Trigger factures_complementaire_controle (BEFORE, brouillon -> émise, type 'facture') : garde les
--    deux garanties que portait l'ancien index, au moment où elles comptent, la validation :
--      * aucune séance de la facture n'est déjà portée par une autre facture vivante (pas de double
--        facturation, quel que soit le chemin d'écriture des lignes) ;
--      * si une facture du même contrat et du même mois est déjà émise, celle-ci doit porter au moins
--        une séance (un forfait ne se facture jamais deux fois).
--    Trigger et non test dans valider_facture : même raison que factures_validation_apres_le_mois
--    (20261011100000), cette fonction est redéfinie en entier à chaque étape. L'exception annule la
--    transaction : aucun numéro consommé.
-- 4. Rattrapage : pour chaque contrat et chaque mois écoulé qui a déjà une facture émise et des
--    séances réalisées facturables qu'aucune facture vivante ne porte, recalculer_brouillon_mois()
--    prépare le brouillon complémentaire (mêmes règles que le trigger de séance, erreurs avalées et
--    journalisées). Ce sont des BROUILLONS : sans numéro, ni PDF, ni envoi, ils attendent la
--    validation de Pierre dans « Factures à valider ». Rien d'autre n'est écrit.
--
-- Hors périmètre : bénéficiaires SAP (exclus de la génération), présentation du PDF (une facture
-- complémentaire est une facture ordinaire, avec son numéro et les dates de ses séances).
-- Privilèges : aucune table créée ; fonction de trigger retirée à PUBLIC, anon et authenticated.
-- Idempotente, transactionnelle, bloc de contrôle final.

BEGIN;

-- ═══ MARQUEUR DE CIBLE (est_staging) ═══════════════════════════════════════
-- Ce fichier refuse de s'exécuter sur la PRODUCTION tant que la valeur
-- ci-dessous vaut 'staging'. Pour la prod, APRÈS le go et la recette staging :
-- remplacer À LA MAIN 'staging' par 'production' sur la ligne v_cible.
--
-- Repère du staging : la structure de démo de scripts/seed-staging.sql
-- (jeton staging-token-demo-0001) ou les comptes de démo du seed, absents de
-- la prod. Une base sans aucun praticien (base locale, job CI) est acceptée
-- avec la cible 'staging'.
DO $cible$
DECLARE
  v_cible       text := 'staging';  -- ⚠️ 'staging' | 'production' — À CHANGER À LA MAIN POUR LA PROD
  v_est_staging boolean := EXISTS (SELECT 1 FROM public.structures WHERE token_acces = 'staging-token-demo-0001')
                        OR EXISTS (SELECT 1 FROM auth.users WHERE email IN ('staging.praticien@example.com', 'staging.praticien2@example.com'));
  v_base_vide   boolean := NOT EXISTS (SELECT 1 FROM public.praticiens);
BEGIN
  IF v_cible NOT IN ('staging', 'production') THEN
    RAISE EXCEPTION 'Marqueur de cible invalide (%) : ''staging'' ou ''production'' attendu.', v_cible;
  END IF;
  IF v_cible = 'staging' AND NOT (v_est_staging OR v_base_vide) THEN
    RAISE EXCEPTION 'Cible « staging », mais cette base n''est PAS le staging (structure de démo absente) : rien n''a été appliqué. Pour la production, changer le marqueur v_cible après le go.';
  END IF;
  IF v_cible = 'production' AND v_est_staging THEN
    RAISE EXCEPTION 'Cible « production », mais cette base est le STAGING (structure de démo présente) : rien n''a été appliqué.';
  END IF;
  RAISE NOTICE 'Cible % confirmée (est_staging = %, base vide = %).', v_cible, v_est_staging, v_base_vide;
END
$cible$;

-- ─── 1. Unicité : un brouillon par contrat et par mois ─────────────────────
-- Créé AVANT de retirer l'ancien index : les données existantes le respectent forcément (au plus une
-- facture vivante, donc au plus un brouillon, par contrat et par mois).
CREATE UNIQUE INDEX IF NOT EXISTS factures_un_brouillon_par_contrat_periode
  ON public.factures (contrat_id, periode) WHERE type = 'facture' AND statut = 'brouillon';
DROP INDEX IF EXISTS public.factures_une_vivante_par_contrat_periode;

-- ─── 2. generer_brouillon_facture ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.generer_brouillon_facture(p_contrat_id uuid, p_periode date)
RETURNS uuid
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  c          public.contrats%ROWTYPE;
  pa         public.participants%ROWTYPE;
  v_debut    date := date_trunc('month', p_periode)::date;
  v_fin      date := (date_trunc('month', p_periode) + interval '1 month')::date;  -- exclusive
  v_praticien uuid;
  v_id       uuid;
  v_emise    uuid;
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

  -- Facture complémentaire (20261118100000) : le brouillon du mois (un au plus, index
  -- factures_un_brouillon_par_contrat_periode) et la dernière facture émise du mois, s'il y en a.
  SELECT id INTO v_id FROM public.factures
  WHERE contrat_id = c.id AND periode = v_debut AND type = 'facture' AND statut = 'brouillon';
  SELECT id INTO v_emise FROM public.factures
  WHERE contrat_id = c.id AND periode = v_debut AND type = 'facture' AND statut NOT IN ('brouillon', 'annulee')
  ORDER BY date_emission DESC, created_at DESC, length(numero) DESC, numero DESC
  LIMIT 1;

  -- Forfait : une facture émise couvre le mois, jamais de complément.
  IF c.mode_facturation = 'forfait' AND v_emise IS NOT NULL THEN
    RETURN v_emise;
  END IF;

  -- Bénéficiaire SAP (décision 3 du 2026-10-20) : exclu de la génération automatique. Un brouillon
  -- existant est retiré (il n'a pas de numéro : ce n'est pas une pièce comptable) ; une facture déjà
  -- émise n'est jamais touchée, elle est renvoyée telle quelle.
  IF pa.beneficiaire_sap THEN
    IF v_id IS NOT NULL THEN
      DELETE FROM public.factures WHERE id = v_id;  -- brouillon : lignes supprimées en cascade
    END IF;
    RETURN v_emise;
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
    RETURN v_emise;  -- rien de (plus) à facturer : la facture émise du mois, sinon NULL
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

-- ─── 3. Garde à la validation d'une facture ────────────────────────────────
CREATE OR REPLACE FUNCTION public.factures_complementaire_controle()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_detail text;
  v_numero text;
BEGIN
  -- Pas de double facturation : aucune séance de cette facture n'est portée par une autre facture
  -- vivante (brouillon compris : deux validations simultanées se refusent l'une l'autre).
  SELECT string_agg(DISTINCT l.libelle || ' (' || coalesce('facture n° ' || f2.numero, 'autre brouillon') || ')', ', ')
    INTO v_detail
    FROM public.lignes_facture l
    JOIN public.lignes_facture l2 ON l2.seance_id = l.seance_id AND l2.facture_id <> l.facture_id
    JOIN public.factures f2 ON f2.id = l2.facture_id AND f2.type = 'facture' AND f2.statut <> 'annulee'
   WHERE l.facture_id = NEW.id AND l.seance_id IS NOT NULL;
  IF v_detail IS NOT NULL THEN
    RAISE EXCEPTION 'Séance déjà facturée : %', v_detail;
  END IF;

  -- Facture complémentaire : seulement pour des séances (un forfait ne se facture jamais deux fois).
  SELECT f2.numero INTO v_numero
    FROM public.factures f2
   WHERE f2.contrat_id = NEW.contrat_id AND f2.periode = NEW.periode AND f2.type = 'facture'
     AND f2.statut NOT IN ('brouillon', 'annulee') AND f2.id <> NEW.id
   ORDER BY f2.date_emission DESC, f2.created_at DESC, length(f2.numero) DESC, f2.numero DESC
   LIMIT 1;
  IF v_numero IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.lignes_facture l WHERE l.facture_id = NEW.id AND l.seance_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Facture de % déjà émise (n° %) : une facture complémentaire ne porte que des séances',
      to_char(NEW.periode, 'MM/YYYY'), v_numero;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.factures_complementaire_controle() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS factures_complementaire_controle ON public.factures;
CREATE TRIGGER factures_complementaire_controle
  BEFORE UPDATE OF statut ON public.factures
  FOR EACH ROW
  WHEN (OLD.statut = 'brouillon' AND NEW.statut <> 'brouillon' AND NEW.type = 'facture')
  EXECUTE FUNCTION public.factures_complementaire_controle();

-- ─── 4. Rattrapage des séances tardives des mois déjà facturés ─────────────
DO $rattrapage$
DECLARE
  r         record;
  v_avant   integer;
  v_apres   integer;
BEGIN
  SELECT count(*) INTO v_avant FROM public.factures WHERE type = 'facture' AND statut = 'brouillon';
  FOR r IN
    SELECT DISTINCT s.contrat_id, date_trunc('month', s.date)::date AS mois
      FROM public.seances s
      JOIN public.contrats c ON c.id = s.contrat_id
     WHERE s.statut = 'realisee'
       AND (s.type = 'seance' OR (c.facturer_bilans AND s.type = 'bilan'))
       AND c.mode_facturation = 'seance'
       AND EXISTS (SELECT 1 FROM public.factures f
                    WHERE f.contrat_id = s.contrat_id AND f.periode = date_trunc('month', s.date)::date
                      AND f.type = 'facture' AND f.statut NOT IN ('brouillon', 'annulee'))
       AND NOT EXISTS (SELECT 1 FROM public.lignes_facture l JOIN public.factures f ON f.id = l.facture_id
                        WHERE l.seance_id = s.id AND f.type = 'facture' AND f.statut <> 'annulee')
     ORDER BY 1, 2
  LOOP
    -- Mêmes règles que le trigger de séance (statut et dates du contrat, SAP, mois futur exclu) ;
    -- une erreur (séance sans tarif) est journalisée et laisse la séance « à corriger ».
    PERFORM public.recalculer_brouillon_mois(r.contrat_id, r.mois);
  END LOOP;
  SELECT count(*) INTO v_apres FROM public.factures WHERE type = 'facture' AND statut = 'brouillon';
  RAISE NOTICE 'Facture complémentaire : % brouillon(s) complémentaire(s) préparé(s) par le rattrapage.', v_apres - v_avant;
END
$rattrapage$;

-- ═══ Contrôle final ═════════════════════════════════════════════════════════
DO $controle$
DECLARE v_src text;
BEGIN
  IF to_regclass('public.factures_une_vivante_par_contrat_periode') IS NOT NULL THEN
    RAISE EXCEPTION 'Facture complémentaire : l''ancien index factures_une_vivante_par_contrat_periode est toujours là';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'factures'
                  AND indexname = 'factures_un_brouillon_par_contrat_periode'
                  AND indexdef LIKE 'CREATE UNIQUE%' AND indexdef LIKE '%(contrat_id, periode)%'
                  AND indexdef LIKE '%''brouillon''%') THEN
    RAISE EXCEPTION 'Facture complémentaire : index unique factures_un_brouillon_par_contrat_periode absent ou mal défini';
  END IF;

  SELECT prosrc INTO v_src FROM pg_proc WHERE oid = 'public.generer_brouillon_facture(uuid, date)'::regprocedure;
  IF position('RETURN v_emise;  -- rien de (plus) à facturer' IN v_src) = 0
     OR position('c.mode_facturation = ''forfait'' AND v_emise IS NOT NULL' IN v_src) = 0 THEN
    RAISE EXCEPTION 'Facture complémentaire : generer_brouillon_facture n''a pas la recherche brouillon / facture émise';
  END IF;
  -- Ce que les définitions précédentes avaient ajouté doit être toujours là.
  IF position('Frais de déplacement : ' IN v_src) = 0 OR position('1, t.tarif_seance, t.tarif_seance' IN v_src) = 0 THEN
    RAISE EXCEPTION 'Facture complémentaire : generer_brouillon_facture a perdu la ligne distincte des frais (20261022100000)';
  END IF;
  IF position('IF pa.beneficiaire_sap THEN' IN v_src) = 0 THEN
    RAISE EXCEPTION 'Facture complémentaire : generer_brouillon_facture a perdu la garde SAP (20261021100000)';
  END IF;
  IF position('c.facturer_bilans AND s.type = ''bilan''' IN v_src) = 0 THEN
    RAISE EXCEPTION 'Facture complémentaire : generer_brouillon_facture a perdu la règle des bilans (20261008100000)';
  END IF;
  IF has_function_privilege('anon', 'public.generer_brouillon_facture(uuid, date)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.generer_brouillon_facture(uuid, date)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.generer_brouillon_facture(uuid, date)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Facture complémentaire : privilèges de generer_brouillon_facture modifiés';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'factures_complementaire_controle'
                  AND tgrelid = 'public.factures'::regclass AND tgenabled = 'O') THEN
    RAISE EXCEPTION 'Facture complémentaire : trigger factures_complementaire_controle absent ou désactivé';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid = 'public.factures_complementaire_controle()'::regprocedure
                  AND prosecdef AND proconfig @> ARRAY['search_path=public']) THEN
    RAISE EXCEPTION 'Facture complémentaire : fonction de contrôle non SECURITY DEFINER ou search_path non figé';
  END IF;
  IF has_function_privilege('anon', 'public.factures_complementaire_controle()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.factures_complementaire_controle()', 'EXECUTE')
     OR EXISTS (SELECT 1 FROM pg_proc p, aclexplode(p.proacl) a
                 WHERE p.oid = 'public.factures_complementaire_controle()'::regprocedure AND a.grantee = 0) THEN
    RAISE EXCEPTION 'Facture complémentaire : la fonction de contrôle est exécutable par PUBLIC, anon ou authenticated';
  END IF;

  -- Les gardes des étapes précédentes, sur les mêmes transitions, sont toujours actives.
  IF (SELECT count(*) FROM pg_trigger
       WHERE tgrelid = 'public.factures'::regclass AND NOT tgisinternal AND tgenabled = 'O'
         AND tgname IN ('factures_inalterables', 'factures_validation_apres_le_mois', 'factures_avoir_controle', 'factures_avoir_effets')) <> 4 THEN
    RAISE EXCEPTION 'Facture complémentaire : une garde de facturation antérieure est absente ou désactivée';
  END IF;

  -- Aucune séance n'est portée par deux factures vivantes (le rattrapage n'en a pas créé).
  IF EXISTS (SELECT 1 FROM public.lignes_facture l JOIN public.factures f ON f.id = l.facture_id
              WHERE l.seance_id IS NOT NULL AND f.type = 'facture' AND f.statut <> 'annulee'
              GROUP BY l.seance_id HAVING count(DISTINCT f.id) > 1) THEN
    RAISE EXCEPTION 'Facture complémentaire : une séance est portée par deux factures vivantes';
  END IF;
  RAISE NOTICE 'Facture complémentaire : index, fonction, trigger et absence de double facturation vérifiés.';
END
$controle$;

COMMIT;
