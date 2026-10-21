-- Suivi de la facturation des séances (plan facturation PR 6) : pour un mois, chaque séance réalisée du
-- praticien connecté avec son état — facturée, en préparation, à facturer, non facturable — et le MOTIF
-- quand elle n'est pas facturée. Lecture seule : aucune table, aucune écriture.
--
-- suivi_facturation_seances(p_mois) : SECURITY INVOKER (RLS de l'appelant) ET filtre sur auth.uid(), comme
-- chiffre_affaires_mensuel : l'admin lit toutes les factures par la RLS (lecture voulue) mais ne doit pas
-- obtenir les séances des autres praticiens ici.
--
-- Règles, dans l'ordre (la première qui s'applique) :
--   facturee        ligne d'une facture émise (validée, envoyée, payée, en retard) ; son numéro est renvoyé
--   en_preparation  ligne du brouillon du mois (facture progressive)
--   non_facturable  voulu, rien à faire : bénéficiaire SAP (décision 3), contrat au forfait (facturé au
--                   mois, sans lien aux séances), bilan initial, bilan d'un contrat qui ne facture pas les
--                   bilans (contrats.facturer_bilans)
--   a_facturer      anomalie à corriger, avec son motif : sans contrat, contrat à venir, contrat qui ne
--                   couvre pas le mois, aucun tarif à cette date, mois déjà facturé (séance réalisée après
--                   la validation : facture complémentaire, décision 5, PR à venir), sinon « en attente »
--                   (le prochain recalcul ou la tâche du 1er la reprendra)
-- Ces règles reprennent celles de generer_brouillon_facture (dernière définition : 20261022100000) et de
-- recalculer_brouillon_mois (20261011100000) ; les tests de base vérifient qu'elles concordent.

CREATE OR REPLACE FUNCTION public.suivi_facturation_seances(p_mois date)
RETURNS TABLE (
  seance_id uuid, date date, heure_debut text, type text, participant_id uuid, contrat_id uuid,
  etat text, motif text, facture_id uuid, numero text
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
  )
  SELECT s.id, s.date, s.heure_debut, s.type, s.participant_id, s.contrat_id,
         CASE
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
         li.facture_id, li.numero
    FROM s
    LEFT JOIN liee li ON li.seance_id = s.id
    LEFT JOIN public.contrats c ON c.id = s.contrat_id
    LEFT JOIN public.participants pa ON pa.id = s.participant_id
   ORDER BY s.date, s.heure_debut, s.id;
$$;

REVOKE ALL ON FUNCTION public.suivi_facturation_seances(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.suivi_facturation_seances(date) TO authenticated, service_role;

-- ---------- contrôle final ----------
DO $controle$
BEGIN
  IF to_regprocedure('public.suivi_facturation_seances(date)') IS NULL THEN
    RAISE EXCEPTION 'Suivi des séances : fonction absente';
  END IF;
  IF (SELECT prosecdef FROM pg_proc WHERE oid = 'public.suivi_facturation_seances(date)'::regprocedure) THEN
    RAISE EXCEPTION 'Suivi des séances : la fonction doit être SECURITY INVOKER';
  END IF;
  IF has_function_privilege('anon', 'public.suivi_facturation_seances(date)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.suivi_facturation_seances(date)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Suivi des séances : privilèges incorrects (authenticated oui, anon non)';
  END IF;
  IF position('auth.uid()' IN (SELECT prosrc FROM pg_proc WHERE oid = 'public.suivi_facturation_seances(date)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'Suivi des séances : filtre sur auth.uid() absent';
  END IF;
END
$controle$;
