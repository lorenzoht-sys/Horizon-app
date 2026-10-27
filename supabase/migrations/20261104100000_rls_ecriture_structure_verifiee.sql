-- ════════════════════════════════════════════════════════════════════════════
-- Écriture : la structure (et l'organisation, le modèle de programme)
-- référencées doivent appartenir au praticien — lot K2 sécurité HDS
-- ════════════════════════════════════════════════════════════════════════════
--
-- Fuites constatées par tests/security/rls-ecriture-cles.spec.ts (PR #167,
-- 2026-10-27). La plus grave, vérifiée de bout en bout : un praticien B
-- rattachait SON bénéficiaire (ou un document) à la structure de A, et le
-- PORTAIL de la structure de A (api/structure/data.ts, service_role, filtre
-- par structure_id) l'affichait — nom, date de naissance, bilans — à
-- quiconque détient le lien de cette structure. B pouvait aussi rattacher
-- son bénéficiaire à une organisation dont il n'est pas membre.
--
-- Méthode : ALTER POLICY … WITH CHECK (lecture garantie intacte, policy
-- absente = échec), comme le lot K1. « Structure / modèle visible » = EXISTS
-- filtré par la RLS de la table référencée (structures et programmes_modeles
-- ne renvoient vers aucune table protégée ici : pas de récursion).
-- « Organisation » = public.est_membre_organisation, fonction existante,
-- déjà employée par orga_acces_participants.
--
-- cours_collectifs.programme_commun_id (famille « faible portée », lot K3)
-- est traité ICI : mêmes policies que structure_id, une seule migration les
-- réécrit. factures_suivi.structure_id est traité par le lot K1 (même
-- policy que factures_suivi.participant_id).
--
-- Aucune fonction nouvelle, aucune donnée modifiée. Idempotente,
-- transactionnelle, bloc de contrôle final.

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

-- ─── participants (structure et organisation) ───────────────────────────────
ALTER POLICY "participants_insert" ON public.participants
  WITH CHECK (praticien_id = auth.uid() AND (structure_id IS NULL OR EXISTS (SELECT 1 FROM public.structures st WHERE st.id = structure_id)) AND (organisation_id IS NULL OR public.est_membre_organisation(organisation_id)));
ALTER POLICY "participants_update" ON public.participants
  WITH CHECK (praticien_id = auth.uid() AND (structure_id IS NULL OR EXISTS (SELECT 1 FROM public.structures st WHERE st.id = structure_id)) AND (organisation_id IS NULL OR public.est_membre_organisation(organisation_id)));
-- La policy d'organisation vérifiait déjà l'organisation, pas la structure.
ALTER POLICY "orga_acces_participants" ON public.participants
  WITH CHECK (public.acces_participant(id) AND (organisation_id IS NULL OR public.est_membre_organisation(organisation_id)) AND (structure_id IS NULL OR EXISTS (SELECT 1 FROM public.structures st WHERE st.id = structure_id)));

-- ─── documents_partages ─────────────────────────────────────────────────────
-- La condition sur le bénéficiaire est recopiée telle quelle.
ALTER POLICY "praticien_gere_partages" ON public.documents_partages
  WITH CHECK (
    participant_id IN (SELECT participants.id FROM public.participants WHERE participants.praticien_id = auth.uid())
    AND (structure_id IS NULL OR EXISTS (SELECT 1 FROM public.structures st WHERE st.id = structure_id))
  );

-- ─── cours_collectifs (structure et modèle de programme) ────────────────────
ALTER POLICY "praticien_gere_cours_collectifs" ON public.cours_collectifs
  WITH CHECK (praticien_id = auth.uid() AND (structure_id IS NULL OR EXISTS (SELECT 1 FROM public.structures st WHERE st.id = structure_id)) AND (programme_commun_id IS NULL OR EXISTS (SELECT 1 FROM public.programmes_modeles m WHERE m.id = programme_commun_id)));
-- Condition d'origine (cours contenant un bénéficiaire accessible) recopiée.
ALTER POLICY "orga_acces_cours_collectifs" ON public.cours_collectifs
  WITH CHECK (EXISTS ( SELECT 1 FROM public.participations_cours_collectifs pcc WHERE pcc.cours_id = cours_collectifs.id AND public.acces_participant(pcc.participant_id)) AND (structure_id IS NULL OR EXISTS (SELECT 1 FROM public.structures st WHERE st.id = structure_id)) AND (programme_commun_id IS NULL OR EXISTS (SELECT 1 FROM public.programmes_modeles m WHERE m.id = programme_commun_id)));

-- ─── templates_structure ────────────────────────────────────────────────────
ALTER POLICY "praticien_gere_templates_structure" ON public.templates_structure
  WITH CHECK (praticien_id = auth.uid() AND (structure_id IS NULL OR EXISTS (SELECT 1 FROM public.structures st WHERE st.id = structure_id)));

-- ═══ Contrôle final ═════════════════════════════════════════════════════════
DO $controle$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('participants', 'participants_insert', 'FROM structures st'),
      ('participants', 'participants_insert', 'est_membre_organisation(organisation_id)'),
      ('participants', 'participants_update', 'FROM structures st'),
      ('participants', 'participants_update', 'est_membre_organisation(organisation_id)'),
      ('participants', 'orga_acces_participants', 'FROM structures st'),
      ('documents_partages', 'praticien_gere_partages', 'FROM structures st'),
      ('cours_collectifs', 'praticien_gere_cours_collectifs', 'FROM structures st'),
      ('cours_collectifs', 'praticien_gere_cours_collectifs', 'FROM programmes_modeles m'),
      ('cours_collectifs', 'orga_acces_cours_collectifs', 'FROM structures st'),
      ('cours_collectifs', 'orga_acces_cours_collectifs', 'FROM participations_cours_collectifs pcc'),
      ('templates_structure', 'praticien_gere_templates_structure', 'FROM structures st')
    ) AS v(tablename, policyname, attendu)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies p
       WHERE p.schemaname = 'public' AND p.tablename = r.tablename AND p.policyname = r.policyname
         AND p.with_check LIKE '%' || r.attendu || '%'
    ) THEN
      RAISE EXCEPTION 'Structure vérifiée (K2) : policy %.% absente ou sans contrôle « % »', r.tablename, r.policyname, r.attendu;
    END IF;
  END LOOP;
  RAISE NOTICE 'Structure vérifiée (K2) : % contrôles vérifiés.', 11;
END
$controle$;
COMMIT;
