-- Suivi du chiffre d'affaires mensuel par bénéficiaire.
--
-- Besoin (Pierre, 2026-10-09) : un tableau de bord du CA par mois, par praticien, qui combine
--   * le CA réalisé via Horizon : somme des factures VALIDÉES du mois ;
--   * une saisie manuelle du CA externe (aujourd'hui le SAP, l'intégration URSSAF étant en V2),
--     rattachée à un bénéficiaire, avec un libellé libre et un montant.
-- Décisions : montants en HT ; CA = facturé (pas encaissé) ; mois de rattachement = mois de la
-- PRESTATION (factures.periode), pas la date d'émission ; aucune lecture admin sur ca_externe
-- (donnée personnelle du praticien, décision du 2026-10-09).
--
-- 1. ca_externe : saisies manuelles. Ce ne sont PAS des pièces comptables : librement modifiables et
--    supprimables à tout moment, aucun trigger d'immuabilité, aucune facture générée depuis une saisie.
--    Elles n'alimentent que le total de CA affiché. Un bénéficiaire ou un praticien supprimé emporte ses
--    saisies (ON DELETE CASCADE), pour ne pas bloquer leur suppression.
-- 2. RLS : un praticien lit et écrit SES lignes, et seulement pour SES bénéficiaires (le WITH CHECK
--    vérifie aussi que le bénéficiaire lui appartient, à l'insertion comme à la modification). Aucune
--    policy pour anon ni pour un rôle admin.
-- 3. chiffre_affaires_mensuel(debut, fin) : SECURITY INVOKER, donc sous la RLS de l'appelant ; filtre en
--    plus sur auth.uid(), car l'admin lit toutes les factures par la RLS (lecture seule voulue) et ne doit
--    pas obtenir un CA agrégé de tous les praticiens. Elle porte à UN seul endroit la règle « quelles
--    factures comptent » :
--      - type facture, statuts validee / envoyee / payee / en_retard, total HT, au mois de periode ;
--      - jamais un brouillon, jamais une facture annulée ;
--      - un AVOIR se déduit du mois de la facture qu'il corrige, tant que cette facture n'est pas
--        annulée : un avoir total annule sa facture d'origine (statut annulee, donc déjà exclue), il
--        ne faut donc pas la déduire une seconde fois.
--    Renvoie, par mois et par bénéficiaire, le CA Horizon et le CA externe (HT).
--
-- Privilèges : règle du 2026-08-29. REVOKE explicite de tout, puis GRANT ciblé :
--   ca_externe : SELECT/INSERT/UPDATE/DELETE à authenticated (la RLS borne), ALL à service_role.

-- ---------- 1. table ----------
CREATE TABLE IF NOT EXISTS public.ca_externe (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  praticien_id   uuid NOT NULL REFERENCES public.praticiens(id)   ON DELETE CASCADE,
  participant_id uuid NOT NULL REFERENCES public.participants(id) ON DELETE CASCADE,
  mois           date NOT NULL,
  libelle        text NOT NULL,
  montant        numeric(12,2) NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ca_externe_mois_premier_du_mois CHECK (extract(day FROM mois) = 1),
  CONSTRAINT ca_externe_libelle_valide CHECK (nullif(btrim(libelle), '') IS NOT NULL AND char_length(libelle) <= 120),
  CONSTRAINT ca_externe_montant_positif CHECK (montant > 0)
);

CREATE INDEX IF NOT EXISTS ca_externe_praticien_mois_idx ON public.ca_externe (praticien_id, mois);
CREATE INDEX IF NOT EXISTS ca_externe_participant_idx    ON public.ca_externe (participant_id);

DROP TRIGGER IF EXISTS ca_externe_updated_at ON public.ca_externe;
CREATE TRIGGER ca_externe_updated_at BEFORE UPDATE ON public.ca_externe
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------- 2. RLS ----------
ALTER TABLE public.ca_externe ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ca_externe_praticien" ON public.ca_externe;
CREATE POLICY "ca_externe_praticien" ON public.ca_externe
  FOR ALL TO authenticated
  USING (praticien_id = auth.uid())
  WITH CHECK (
    praticien_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.participants p WHERE p.id = participant_id AND p.praticien_id = auth.uid())
  );

-- ---------- privilèges (règle du 2026-08-29) ----------
REVOKE ALL ON TABLE public.ca_externe FROM PUBLIC;
REVOKE ALL ON TABLE public.ca_externe FROM anon;
REVOKE ALL ON TABLE public.ca_externe FROM authenticated;
REVOKE ALL ON TABLE public.ca_externe FROM service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.ca_externe TO authenticated;
GRANT ALL ON TABLE public.ca_externe TO service_role;

-- ---------- 3. agrégation ----------
CREATE OR REPLACE FUNCTION public.chiffre_affaires_mensuel(p_debut date, p_fin date)
RETURNS TABLE (mois date, participant_id uuid, ca_horizon numeric, ca_externe numeric)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  WITH bornes AS (
    SELECT date_trunc('month', p_debut)::date AS d, date_trunc('month', p_fin)::date AS f
  ),
  lignes AS (
    -- Factures émises, au mois de la prestation, en HT.
    SELECT fa.periode AS mois, fa.participant_id, fa.total_ht AS horizon, 0::numeric AS externe
      FROM public.factures fa, bornes b
     WHERE fa.praticien_id = auth.uid()
       AND fa.type = 'facture'
       AND fa.statut IN ('validee', 'envoyee', 'payee', 'en_retard')
       AND fa.periode BETWEEN b.d AND b.f
    UNION ALL
    -- Avoirs : déduits du mois de la facture corrigée, si elle n'est pas annulée (avoir total).
    SELECT o.periode, av.participant_id, -av.total_ht, 0::numeric
      FROM public.factures av
      JOIN public.factures o ON o.id = av.facture_origine_id
      CROSS JOIN bornes b
     WHERE av.praticien_id = auth.uid()
       AND av.type = 'avoir'
       AND av.statut IN ('validee', 'envoyee', 'payee', 'en_retard')
       AND o.statut <> 'annulee'
       AND o.periode BETWEEN b.d AND b.f
    UNION ALL
    -- Saisies manuelles du praticien.
    SELECT e.mois, e.participant_id, 0::numeric, e.montant
      FROM public.ca_externe e, bornes b
     WHERE e.praticien_id = auth.uid()
       AND e.mois BETWEEN b.d AND b.f
  )
  SELECT l.mois, l.participant_id, sum(l.horizon)::numeric(12,2), sum(l.externe)::numeric(12,2)
    FROM lignes l
   GROUP BY l.mois, l.participant_id
   ORDER BY l.mois, l.participant_id;
$$;

REVOKE ALL ON FUNCTION public.chiffre_affaires_mensuel(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.chiffre_affaires_mensuel(date, date) TO authenticated, service_role;

-- ---------- contrôle final ----------
DO $controle$
BEGIN
  IF to_regclass('public.ca_externe') IS NULL THEN
    RAISE EXCEPTION 'CA mensuel : table ca_externe absente';
  END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.ca_externe'::regclass) THEN
    RAISE EXCEPTION 'CA mensuel : RLS inactive sur ca_externe';
  END IF;
  IF (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ca_externe') <> 1
     OR NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ca_externe'
                      AND policyname = 'ca_externe_praticien' AND cmd = 'ALL' AND roles = '{authenticated}') THEN
    RAISE EXCEPTION 'CA mensuel : policies de ca_externe inattendues (une seule, pour authenticated)';
  END IF;
  -- Aucune lecture admin sur ca_externe (décision du 2026-10-09) : aucune policy fondée sur le rôle.
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ca_externe'
               AND (COALESCE(qual, '') || COALESCE(with_check, '')) ~* '(user_roles|app_role)') THEN
    RAISE EXCEPTION 'CA mensuel : ca_externe ne doit avoir aucune policy fondée sur le rôle';
  END IF;
  IF has_table_privilege('anon', 'public.ca_externe', 'SELECT')
     OR has_table_privilege('anon', 'public.ca_externe', 'INSERT')
     OR NOT has_table_privilege('authenticated', 'public.ca_externe', 'SELECT')
     OR NOT has_table_privilege('authenticated', 'public.ca_externe', 'INSERT')
     OR NOT has_table_privilege('authenticated', 'public.ca_externe', 'UPDATE')
     OR NOT has_table_privilege('authenticated', 'public.ca_externe', 'DELETE')
     OR NOT has_table_privilege('service_role', 'public.ca_externe', 'SELECT') THEN
    RAISE EXCEPTION 'CA mensuel : privilèges de ca_externe incorrects';
  END IF;
  IF (SELECT count(*) FROM pg_constraint WHERE conrelid = 'public.ca_externe'::regclass
        AND conname IN ('ca_externe_mois_premier_du_mois', 'ca_externe_libelle_valide', 'ca_externe_montant_positif')) <> 3 THEN
    RAISE EXCEPTION 'CA mensuel : contraintes de ca_externe absentes';
  END IF;
  IF to_regprocedure('public.chiffre_affaires_mensuel(date, date)') IS NULL
     OR has_function_privilege('anon', 'public.chiffre_affaires_mensuel(date, date)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.chiffre_affaires_mensuel(date, date)', 'EXECUTE') THEN
    RAISE EXCEPTION 'CA mensuel : fonction chiffre_affaires_mensuel absente ou mal protégée';
  END IF;
  -- La fonction s'exécute sous la RLS de l'appelant.
  IF (SELECT prosecdef FROM pg_proc WHERE oid = 'public.chiffre_affaires_mensuel(date, date)'::regprocedure) THEN
    RAISE EXCEPTION 'CA mensuel : chiffre_affaires_mensuel doit être SECURITY INVOKER';
  END IF;
  -- Aucun trigger d'immuabilité sur ca_externe : seul updated_at.
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.ca_externe'::regclass AND NOT tgisinternal
               AND tgname <> 'ca_externe_updated_at') THEN
    RAISE EXCEPTION 'CA mensuel : ca_externe ne doit avoir aucun trigger de verrouillage';
  END IF;
END
$controle$;
