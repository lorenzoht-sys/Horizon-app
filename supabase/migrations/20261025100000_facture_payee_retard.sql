-- Suivi des statuts d'une facture émise (plan facturation PR 7) : « Marquer payée » et « En retard » à
-- l'échéance.
--
-- Montant dû = total de la facture − avoirs validés qui la corrigent (un avoir TOTAL l'annule déjà :
-- statut annulee, hors périmètre). Payé = somme des paiements (table existante, inaltérable, corrections
-- par montant négatif).
--
-- 1. actualiser_statut_facture(id) : UNE règle pour le statut d'une facture émise (type facture, statut
--    validee / envoyee / en_retard / payee) :
--      payé >= dû            -> payee
--      sinon, échéance passée (date civile Paris) -> en_retard
--      sinon                 -> inchangé, sauf payee (correction d'un paiement) qui redevient validee
--    Seul le statut change : factures_inalterables l'autorise sur une facture émise. Une facture annulée
--    ou un brouillon ne sont jamais touchés. Interne : aucun rôle ne l'appelle directement.
-- 2. Trigger AFTER INSERT sur paiements : le statut suit chaque paiement, tout de suite.
-- 3. marquer_facture_payee(id, date, moyen) : le bouton « Marquer payée ». SECURITY INVOKER : l'insertion
--    du paiement passe par la RLS de paiements (le praticien de la facture). Enregistre UN paiement du
--    reste dû, à la date choisie (pas dans le futur, pas avant l'émission), et renvoie le nouveau statut.
--    Paiements partiels et historique détaillé : PR 16.
-- 4. actualiser_statuts_factures() : passage quotidien (tâche cron « statuts-factures », api/cron/rappels.ts)
--    qui applique la règle à toutes les factures émises : c'est lui qui fait passer « en retard » le
--    lendemain de l'échéance, et qui rattrape une facture soldée par un avoir partiel. service_role seul.
--
-- Limite connue : « envoyee » n'existe pas encore (envoi par e-mail, PR 8). Après une correction de
-- paiement, une facture payée redevient « validee » (ou « en_retard ») ; la PR 8 tiendra compte de l'envoi.
-- Aucune table créée. Fonctions internes retirées à PUBLIC, anon et authenticated.

-- ---------- 1. règle ----------
CREATE OR REPLACE FUNCTION public.actualiser_statut_facture(p_facture_id uuid)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  f        public.factures%ROWTYPE;
  v_du     numeric(12,2);
  v_paye   numeric(12,2);
  v_auj    date := (now() AT TIME ZONE 'Europe/Paris')::date;
  v_statut text;
BEGIN
  SELECT * INTO f FROM public.factures WHERE id = p_facture_id FOR UPDATE;
  IF NOT FOUND OR f.type <> 'facture' OR f.statut NOT IN ('validee', 'envoyee', 'en_retard', 'payee') THEN
    RETURN f.statut;
  END IF;
  SELECT f.total - coalesce(sum(a.total), 0) INTO v_du
    FROM public.factures a
   WHERE a.facture_origine_id = f.id AND a.type = 'avoir' AND a.statut NOT IN ('brouillon', 'annulee');
  SELECT coalesce(sum(montant), 0) INTO v_paye FROM public.paiements WHERE facture_id = f.id;

  v_statut := CASE
    WHEN v_paye >= v_du THEN 'payee'
    WHEN f.echeance IS NOT NULL AND f.echeance < v_auj THEN 'en_retard'
    WHEN f.statut = 'payee' THEN 'validee'
    ELSE f.statut
  END;
  IF v_statut <> f.statut THEN
    UPDATE public.factures SET statut = v_statut WHERE id = f.id;
  END IF;
  RETURN v_statut;
END;
$$;

REVOKE ALL ON FUNCTION public.actualiser_statut_facture(uuid) FROM PUBLIC, anon, authenticated;

-- ---------- 2. le statut suit chaque paiement ----------
CREATE OR REPLACE FUNCTION public.paiements_actualiser_statut()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.actualiser_statut_facture(NEW.facture_id);
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.paiements_actualiser_statut() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS paiements_actualiser_statut ON public.paiements;
CREATE TRIGGER paiements_actualiser_statut AFTER INSERT ON public.paiements
  FOR EACH ROW EXECUTE FUNCTION public.paiements_actualiser_statut();

-- ---------- 3. « Marquer payée » ----------
CREATE OR REPLACE FUNCTION public.marquer_facture_payee(p_facture_id uuid, p_date date, p_moyen text)
RETURNS text
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  f      public.factures%ROWTYPE;
  v_du   numeric(12,2);
  v_paye numeric(12,2);
  v_auj  date := (now() AT TIME ZONE 'Europe/Paris')::date;
BEGIN
  -- Sous la RLS de l'appelant : une facture d'un autre praticien est « introuvable ».
  SELECT * INTO f FROM public.factures WHERE id = p_facture_id AND praticien_id = auth.uid();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Facture introuvable';
  END IF;
  IF f.type <> 'facture' OR f.statut NOT IN ('validee', 'envoyee', 'en_retard') THEN
    RAISE EXCEPTION 'Cette facture ne peut pas être marquée payée (statut %)', f.statut;
  END IF;
  IF p_date IS NULL OR p_date > v_auj THEN
    RAISE EXCEPTION 'Date de paiement invalide : elle ne peut pas être dans le futur';
  END IF;
  IF p_date < f.date_emission THEN
    RAISE EXCEPTION 'Date de paiement invalide : elle précède l''émission de la facture (%)', to_char(f.date_emission, 'DD/MM/YYYY');
  END IF;
  SELECT f.total - coalesce(sum(a.total), 0) INTO v_du
    FROM public.factures a
   WHERE a.facture_origine_id = f.id AND a.type = 'avoir' AND a.statut NOT IN ('brouillon', 'annulee');
  SELECT coalesce(sum(montant), 0) INTO v_paye FROM public.paiements WHERE facture_id = f.id;
  IF v_du - v_paye <= 0 THEN
    RAISE EXCEPTION 'Rien à payer sur cette facture';
  END IF;

  INSERT INTO public.paiements (facture_id, date, montant, moyen) VALUES (f.id, p_date, v_du - v_paye, p_moyen);
  RETURN (SELECT statut FROM public.factures WHERE id = f.id);
END;
$$;

REVOKE ALL ON FUNCTION public.marquer_facture_payee(uuid, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.marquer_facture_payee(uuid, date, text) TO authenticated;

-- ---------- 4. passage quotidien ----------
CREATE OR REPLACE FUNCTION public.actualiser_statuts_factures()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id      uuid;
  v_avant   text;
  v_changes integer := 0;
BEGIN
  FOR v_id, v_avant IN
    SELECT id, statut FROM public.factures
     WHERE type = 'facture' AND statut IN ('validee', 'envoyee', 'en_retard', 'payee')
     ORDER BY id
  LOOP
    IF public.actualiser_statut_facture(v_id) IS DISTINCT FROM v_avant THEN
      v_changes := v_changes + 1;
    END IF;
  END LOOP;
  RETURN v_changes;
END;
$$;

REVOKE ALL ON FUNCTION public.actualiser_statuts_factures() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.actualiser_statuts_factures() TO service_role;

-- ---------- contrôle final ----------
DO $controle$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'paiements_actualiser_statut'
                   AND tgrelid = 'public.paiements'::regclass AND NOT tgisinternal AND tgenabled = 'O') THEN
    RAISE EXCEPTION 'Statuts facture : trigger paiements_actualiser_statut absent ou désactivé';
  END IF;
  IF has_function_privilege('authenticated', 'public.actualiser_statut_facture(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.actualiser_statut_facture(uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.actualiser_statuts_factures()', 'EXECUTE')
     OR has_function_privilege('anon', 'public.actualiser_statuts_factures()', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.actualiser_statuts_factures()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.paiements_actualiser_statut()', 'EXECUTE') THEN
    RAISE EXCEPTION 'Statuts facture : privilèges des fonctions internes incorrects';
  END IF;
  IF has_function_privilege('anon', 'public.marquer_facture_payee(uuid, date, text)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.marquer_facture_payee(uuid, date, text)', 'EXECUTE')
     OR (SELECT prosecdef FROM pg_proc WHERE oid = 'public.marquer_facture_payee(uuid, date, text)'::regprocedure) THEN
    RAISE EXCEPTION 'Statuts facture : marquer_facture_payee doit être SECURITY INVOKER, pour authenticated seulement';
  END IF;
END
$controle$;
