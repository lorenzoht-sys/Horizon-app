-- Facturation, étape 1 (4/5) : inaltérabilité des factures émises et de ce qu'elles
-- couvrent (séances, versions de tarif).
--
-- Une facture validée est une pièce comptable : elle ne se corrige que par un avoir.
--
-- Règles
--  * factures : un brouillon se modifie et se supprime librement ; il n'en sort que
--    par valider_facture(). Une facture non brouillon ne peut plus changer, sauf
--    `statut` et `pdf_path` (le PDF est généré après la validation), ni être
--    supprimée, ni revenir à « brouillon ». Le statut « annulee » n'est atteignable
--    que par la validation d'un avoir total. À l'insertion, seul « brouillon » est
--    accepté (sinon on contournerait la numérotation).
--  * lignes_facture : insertion, modification et suppression refusées dès que la
--    facture n'est plus un brouillon.
--  * paiements : acceptés seulement sur une facture émise non annulée.
--  * seances : une séance liée à une ligne d'une facture émise (type « facture »,
--    statut validee/envoyee/payee/en_retard) ne peut plus être supprimée, ni voir
--    changer une colonne qui détermine sa facturation : participant, praticien,
--    contrat, date, heures, durée, type, statut. Les autres colonnes (notes, adresse,
--    coordonnées, signalement d'absence…) restent modifiables : elles ne changent pas
--    ce qui a été facturé. Une facture annulée (avoir total) libère ses séances.
--  * tarifs_contrats : une version utilisée par une facture émise ne peut plus être
--    modifiée ni supprimée, sauf pour être CLOSE (date_fin_validite posée, jamais
--    avant la dernière séance facturée sous cette version) : c'est ce que fait
--    fermerEtCreerNouvelleVersion() (src/hooks/useTarifsContrat.ts) pour changer de
--    tarif. Pour changer un montant, on crée une nouvelle version.
--
-- Les fonctions sont SECURITY DEFINER : elles doivent voir toutes les factures, même
-- celles qu'une policy cacherait à l'utilisateur qui modifie la séance (membre d'une
-- organisation, par exemple), sinon le verrou se contournerait.
--
-- VISIBLE CÔTÉ PRATICIEN : modifier une séance déjà facturée (date, heures, statut…)
-- produira désormais une erreur. À signaler dans l'interface à l'étape suivante.

-- ---------- factures ----------
CREATE OR REPLACE FUNCTION public.factures_controle_insertion()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o public.factures%ROWTYPE;
BEGIN
  IF NEW.statut <> 'brouillon' THEN
    RAISE EXCEPTION 'Une facture se crée en brouillon ; elle est validée par valider_facture()';
  END IF;
  IF NEW.type = 'avoir' THEN
    SELECT * INTO o FROM public.factures WHERE id = NEW.facture_origine_id;
    IF NOT FOUND OR o.type <> 'facture' THEN
      RAISE EXCEPTION 'Un avoir porte sur une facture existante';
    END IF;
    IF o.statut IN ('brouillon', 'annulee') THEN
      RAISE EXCEPTION 'Un avoir ne peut porter que sur une facture émise non annulée (statut %)', o.statut;
    END IF;
    IF o.praticien_id <> NEW.praticien_id OR o.contrat_id <> NEW.contrat_id OR o.participant_id <> NEW.participant_id THEN
      RAISE EXCEPTION 'L''avoir doit avoir le même praticien, contrat et bénéficiaire que la facture d''origine';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.factures_inalterables()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.statut <> 'brouillon' THEN
      RAISE EXCEPTION 'Facture % non supprimable (statut %) : émettre un avoir', OLD.numero, OLD.statut;
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.statut = 'brouillon' THEN
    IF NEW.statut <> 'brouillon'
       AND coalesce(current_setting('horizon.validation_facture', true), '') <> OLD.id::text THEN
      RAISE EXCEPTION 'Sortie du brouillon réservée à valider_facture()';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.statut = 'brouillon' THEN
    RAISE EXCEPTION 'Facture % : retour au brouillon interdit', OLD.numero;
  END IF;
  IF OLD.statut = 'annulee' AND NEW.statut <> 'annulee' THEN
    RAISE EXCEPTION 'Facture % annulée : statut définitif', OLD.numero;
  END IF;
  IF NEW.statut = 'annulee' AND OLD.statut <> 'annulee'
     AND coalesce(current_setting('horizon.annulation_facture', true), '') <> OLD.id::text THEN
    RAISE EXCEPTION 'Facture % : une facture ne s''annule que par un avoir total validé', OLD.numero;
  END IF;
  IF (to_jsonb(NEW) - 'statut' - 'pdf_path' - 'updated_at')
     IS DISTINCT FROM (to_jsonb(OLD) - 'statut' - 'pdf_path' - 'updated_at') THEN
    RAISE EXCEPTION 'Facture % validée : seuls statut et pdf_path peuvent changer', OLD.numero;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS factures_controle_insertion ON public.factures;
CREATE TRIGGER factures_controle_insertion BEFORE INSERT ON public.factures
  FOR EACH ROW EXECUTE FUNCTION public.factures_controle_insertion();
DROP TRIGGER IF EXISTS factures_inalterables ON public.factures;
CREATE TRIGGER factures_inalterables BEFORE UPDATE OR DELETE ON public.factures
  FOR EACH ROW EXECUTE FUNCTION public.factures_inalterables();

-- ---------- lignes_facture ----------
CREATE OR REPLACE FUNCTION public.lignes_facture_inalterables()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_statut text;
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    SELECT statut INTO v_statut FROM public.factures WHERE id = OLD.facture_id;
    IF FOUND AND v_statut <> 'brouillon' THEN
      RAISE EXCEPTION 'Ligne de facture non modifiable : la facture n''est plus un brouillon (statut %)', v_statut;
    END IF;
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    SELECT statut INTO v_statut FROM public.factures WHERE id = NEW.facture_id;
    IF FOUND AND v_statut <> 'brouillon' THEN
      RAISE EXCEPTION 'Ligne de facture non modifiable : la facture n''est plus un brouillon (statut %)', v_statut;
    END IF;
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

DROP TRIGGER IF EXISTS lignes_facture_inalterables ON public.lignes_facture;
CREATE TRIGGER lignes_facture_inalterables BEFORE INSERT OR UPDATE OR DELETE ON public.lignes_facture
  FOR EACH ROW EXECUTE FUNCTION public.lignes_facture_inalterables();

-- ---------- paiements ----------
CREATE OR REPLACE FUNCTION public.paiements_controle()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_statut text;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.facture_id <> OLD.facture_id THEN
    RAISE EXCEPTION 'Un paiement ne peut pas changer de facture';
  END IF;
  SELECT statut INTO v_statut FROM public.factures WHERE id = NEW.facture_id;
  IF v_statut IN ('brouillon', 'annulee') THEN
    RAISE EXCEPTION 'Paiement refusé : la facture est au statut %', v_statut;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS paiements_controle ON public.paiements;
CREATE TRIGGER paiements_controle BEFORE INSERT OR UPDATE ON public.paiements
  FOR EACH ROW EXECUTE FUNCTION public.paiements_controle();

-- ---------- seances ----------
CREATE OR REPLACE FUNCTION public.seances_facturees_inalterables()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.lignes_facture l
    JOIN public.factures f ON f.id = l.facture_id
    WHERE l.seance_id = OLD.id AND f.type = 'facture'
      AND f.statut IN ('validee', 'envoyee', 'payee', 'en_retard')
  ) THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Séance du % déjà facturée : suppression interdite', OLD.date;
  END IF;
  IF (NEW.participant_id, NEW.praticien_id, NEW.contrat_id, NEW.date, NEW.heure_debut,
      NEW.heure_fin, NEW.duree_minutes, NEW.type, NEW.statut)
     IS DISTINCT FROM
     (OLD.participant_id, OLD.praticien_id, OLD.contrat_id, OLD.date, OLD.heure_debut,
      OLD.heure_fin, OLD.duree_minutes, OLD.type, OLD.statut) THEN
    RAISE EXCEPTION 'Séance du % déjà facturée : modification interdite', OLD.date;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS seances_facturees_inalterables ON public.seances;
CREATE TRIGGER seances_facturees_inalterables BEFORE UPDATE OR DELETE ON public.seances
  FOR EACH ROW EXECUTE FUNCTION public.seances_facturees_inalterables();

-- ---------- tarifs_contrats ----------
CREATE OR REPLACE FUNCTION public.tarifs_utilises_inalterables()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_nb integer; v_derniere date;
BEGIN
  SELECT count(*), max(s.date) INTO v_nb, v_derniere
  FROM public.lignes_facture l
  JOIN public.factures f ON f.id = l.facture_id
  LEFT JOIN public.seances s ON s.id = l.seance_id
  WHERE l.tarif_contrat_id = OLD.id AND f.type = 'facture'
    AND f.statut IN ('validee', 'envoyee', 'payee', 'en_retard');

  IF v_nb = 0 THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Version de tarif utilisée par une facture émise : suppression interdite';
  END IF;
  IF (NEW.contrat_id, NEW.tarif_seance, NEW.frais_deplacement, NEW.date_debut_validite)
     IS DISTINCT FROM
     (OLD.contrat_id, OLD.tarif_seance, OLD.frais_deplacement, OLD.date_debut_validite) THEN
    RAISE EXCEPTION 'Version de tarif utilisée par une facture émise : créer une nouvelle version';
  END IF;
  IF NEW.date_fin_validite IS DISTINCT FROM OLD.date_fin_validite THEN
    IF OLD.date_fin_validite IS NOT NULL OR NEW.date_fin_validite IS NULL
       OR NEW.date_fin_validite < coalesce(v_derniere, OLD.date_debut_validite) THEN
      RAISE EXCEPTION 'Version de tarif utilisée par une facture émise : seule sa clôture, après la dernière séance facturée, est permise';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tarifs_utilises_inalterables ON public.tarifs_contrats;
CREATE TRIGGER tarifs_utilises_inalterables BEFORE UPDATE OR DELETE ON public.tarifs_contrats
  FOR EACH ROW EXECUTE FUNCTION public.tarifs_utilises_inalterables();

REVOKE ALL ON FUNCTION public.factures_controle_insertion()       FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.factures_inalterables()             FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.lignes_facture_inalterables()       FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.paiements_controle()                FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.seances_facturees_inalterables()    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tarifs_utilises_inalterables()      FROM PUBLIC, anon, authenticated;

DO $controle$
DECLARE v_manquants text;
BEGIN
  SELECT string_agg(n, ', ') INTO v_manquants
  FROM unnest(ARRAY['factures_controle_insertion','factures_inalterables','lignes_facture_inalterables',
                    'paiements_controle','seances_facturees_inalterables','tarifs_utilises_inalterables']) AS n
  WHERE NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = n AND NOT tgisinternal AND tgenabled = 'O');
  IF v_manquants IS NOT NULL THEN
    RAISE EXCEPTION 'Facturation 4/5 : triggers absents ou désactivés (%)', v_manquants;
  END IF;
  IF has_function_privilege('anon', 'public.factures_inalterables()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.seances_facturees_inalterables()', 'EXECUTE') THEN
    RAISE EXCEPTION 'Facturation 4/5 : une fonction de trigger est exécutable par anon/authenticated';
  END IF;
END
$controle$;
