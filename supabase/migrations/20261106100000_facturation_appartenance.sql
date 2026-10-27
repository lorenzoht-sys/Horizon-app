-- ════════════════════════════════════════════════════════════════════════════
-- Facturation : le bénéficiaire, la séance et le tarif d'une facture doivent
-- appartenir au praticien qui l'émet — lot M sécurité HDS
-- ════════════════════════════════════════════════════════════════════════════
--
-- Constaté le 2026-10-27 par tests/db/fuite-facturation.spec.ts (fonctions
-- de facturation réelles, base locale) :
--
--   1. Un praticien B crée un contrat AU FORFAIT sur un bénéficiaire de A ;
--      la génération mensuelle (cron, service_role : sans RLS) lui produit un
--      brouillon ; B le valide ; B LIT alors sur sa facture, par l'API, le
--      nom, le prénom, l'e-mail et l'adresse du bénéficiaire de A
--      (snapshot_destinataire). La création du contrat est fermée par le lot
--      K1 (contrats.participant_id) ; ce verrou-ci, posé sur la facture
--      elle-même, couvre tous les chemins — y compris service_role et un
--      contrat déjà mal rattaché avant K1.
--   2. B insère dans SA facture une ligne qui pointe la séance de A : la
--      séance de A disparaît alors de la facture de A (comptée comme déjà
--      facturée) ; ou le tarif de A, qui devient intouchable pour A.
--   3. La policy factures_praticien contenait une condition toujours vraie
--      (`c.participant_id = c.participant_id`) au lieu de comparer le
--      bénéficiaire du contrat à celui de la facture.
--
-- Points rassurants, testés : un avoir ne peut viser que la facture du même
-- praticien, contrat et bénéficiaire (creer_avoir, factures_controle_insertion).
-- Une séance de B rattachée au contrat de A entrait dans la facture de A :
-- fermé par le lot K1 (seances.contrat_id).
--
-- Le front n'écrit JAMAIS directement dans factures ni lignes_facture (tout
-- passe par generer_brouillon_facture, valider_facture, creer_avoir) : les
-- contrôles stricts ci-dessous ne gênent aucun usage.
--
-- Méthode : ALTER POLICY … WITH CHECK (lecture intacte) et un trigger BEFORE
-- INSERT sur factures (SECURITY DEFINER, search_path figé, aucun droit
-- d'exécution pour PUBLIC, anon ni authenticated). Aucune donnée modifiée.
-- Idempotente, transactionnelle, bloc de contrôle final.

BEGIN;

-- ═══ MARQUEUR DE CIBLE (est_staging) ═══════════════════════════════════════
-- Ce fichier refuse de s'exécuter sur la PRODUCTION tant que la valeur
-- ci-dessous vaut 'staging'. Pour la prod, APRÈS le go et la recette staging :
-- remplacer À LA MAIN 'staging' par 'production' sur la ligne v_cible.
--
-- Repère du staging : la structure de démo de scripts/seed-staging.sql
-- (jeton staging-token-demo-0001), absente de la prod. Une base sans aucun
-- praticien (base locale de `supabase db reset`, job CI base-locale, où les
-- migrations passent avant le seed) est acceptée avec la cible 'staging'.
DO $cible$
DECLARE
  v_cible       text := 'staging';  -- ⚠️ 'staging' | 'production' — À CHANGER À LA MAIN POUR LA PROD
  v_est_staging boolean := EXISTS (SELECT 1 FROM public.structures WHERE token_acces = 'staging-token-demo-0001');
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

-- ─── 1. Trigger de cohérence sur factures (tous chemins, service_role compris)
CREATE OR REPLACE FUNCTION public.factures_coherence_beneficiaire()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c  public.contrats%ROWTYPE;
  pa public.participants%ROWTYPE;
BEGIN
  SELECT * INTO c FROM public.contrats WHERE id = NEW.contrat_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Facture : contrat introuvable';
  END IF;
  IF c.participant_id IS DISTINCT FROM NEW.participant_id THEN
    RAISE EXCEPTION 'Facture : le bénéficiaire doit être celui du contrat';
  END IF;
  SELECT * INTO pa FROM public.participants WHERE id = NEW.participant_id;
  IF coalesce(c.praticien_id, pa.praticien_id) IS DISTINCT FROM NEW.praticien_id THEN
    RAISE EXCEPTION 'Facture : le praticien doit être celui du contrat';
  END IF;
  -- Le bénéficiaire appartient au praticien qui facture, ou à une organisation
  -- active dont ce praticien est membre actif (même règle que acces_participant,
  -- évaluée pour NEW.praticien_id et non pour auth.uid(), absent sous service_role).
  IF pa.praticien_id IS DISTINCT FROM NEW.praticien_id AND NOT (
       pa.organisation_id IS NOT NULL AND EXISTS (
         SELECT 1 FROM public.organisation_membres m
           JOIN public.organisations o ON o.id = m.organisation_id
          WHERE m.organisation_id = pa.organisation_id AND m.user_id = NEW.praticien_id
            AND m.actif AND o.statut = 'active'))
  THEN
    RAISE EXCEPTION 'Facture : ce bénéficiaire n''appartient pas au praticien qui facture';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.factures_coherence_beneficiaire() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.factures_coherence_beneficiaire() FROM anon;
REVOKE ALL ON FUNCTION public.factures_coherence_beneficiaire() FROM authenticated;

DROP TRIGGER IF EXISTS factures_coherence_beneficiaire ON public.factures;
CREATE TRIGGER factures_coherence_beneficiaire
  BEFORE INSERT ON public.factures
  FOR EACH ROW EXECUTE FUNCTION public.factures_coherence_beneficiaire();

-- ─── 2. factures_praticien : condition toujours vraie corrigée ──────────────
ALTER POLICY "factures_praticien" ON public.factures
  WITH CHECK (
    praticien_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.participants p WHERE p.id = factures.participant_id AND p.praticien_id = auth.uid())
    AND EXISTS (SELECT 1 FROM public.contrats c WHERE c.id = factures.contrat_id AND c.participant_id = factures.participant_id)
  );

-- ─── 3. lignes_facture : séance et tarif du contrat de la facture ───────────
ALTER POLICY "lignes_facture_praticien" ON public.lignes_facture
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.factures f WHERE f.id = lignes_facture.facture_id AND f.praticien_id = auth.uid())
    AND (lignes_facture.seance_id IS NULL OR EXISTS (
          SELECT 1 FROM public.factures f JOIN public.seances s ON s.contrat_id = f.contrat_id
           WHERE f.id = lignes_facture.facture_id AND s.id = lignes_facture.seance_id))
    AND (lignes_facture.tarif_contrat_id IS NULL OR EXISTS (
          SELECT 1 FROM public.factures f JOIN public.tarifs_contrats t ON t.contrat_id = f.contrat_id
           WHERE f.id = lignes_facture.facture_id AND t.id = lignes_facture.tarif_contrat_id))
  );

-- ═══ Contrôle final ═════════════════════════════════════════════════════════
DO $controle$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'factures_coherence_beneficiaire'
                  AND tgrelid = 'public.factures'::regclass AND tgenabled = 'O') THEN
    RAISE EXCEPTION 'Facturation (M) : trigger factures_coherence_beneficiaire absent ou désactivé';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid = 'public.factures_coherence_beneficiaire()'::regprocedure
                  AND prosecdef AND proconfig @> ARRAY['search_path=public']) THEN
    RAISE EXCEPTION 'Facturation (M) : fonction de cohérence non SECURITY DEFINER ou search_path non figé';
  END IF;
  IF has_function_privilege('anon', 'public.factures_coherence_beneficiaire()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.factures_coherence_beneficiaire()', 'EXECUTE')
     OR EXISTS (SELECT 1 FROM pg_proc p, aclexplode(p.proacl) a
                 WHERE p.oid = 'public.factures_coherence_beneficiaire()'::regprocedure AND a.grantee = 0) THEN
    RAISE EXCEPTION 'Facturation (M) : la fonction de cohérence est exécutable par PUBLIC, anon ou authenticated';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND policyname = 'factures_praticien'
                  AND with_check LIKE '%c.participant_id = factures.participant_id%') THEN
    RAISE EXCEPTION 'Facturation (M) : factures_praticien sans contrôle contrat ↔ bénéficiaire';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND policyname = 'lignes_facture_praticien'
                  AND with_check LIKE '%JOIN seances s%' AND with_check LIKE '%JOIN tarifs_contrats t%') THEN
    RAISE EXCEPTION 'Facturation (M) : lignes_facture_praticien sans contrôle de la séance et du tarif';
  END IF;
  RAISE NOTICE 'Facturation (M) : trigger, fonction et 2 policies vérifiés.';
END
$controle$;

COMMIT;
