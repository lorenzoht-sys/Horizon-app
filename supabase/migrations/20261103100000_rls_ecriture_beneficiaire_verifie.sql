-- ════════════════════════════════════════════════════════════════════════════
-- Écriture : le bénéficiaire (et le contrat, la séance) référencés doivent
-- appartenir au praticien — lot K1 sécurité HDS
-- ════════════════════════════════════════════════════════════════════════════
--
-- Fuites constatées par tests/security/rls-ecriture-cles.spec.ts (PR #167,
-- 2026-10-27) : la règle d'écriture de ces tables ne vérifiait que
-- « praticien_id = auth.uid() ». Un praticien B pouvait écrire un bilan, un
-- contrat, une séance… dans le dossier d'un bénéficiaire de A, rattacher sa
-- séance au contrat de A (et donc au brouillon de facture de A), ou
-- repointer ses propres lignes vers les objets de A.
--
-- Méthode : ALTER POLICY … WITH CHECK, jamais DROP/CREATE. ALTER POLICY ne
-- peut modifier que la règle d'écriture : la LECTURE (USING) reste
-- strictement identique, sans recopier ses sous-requêtes. Une policy absente
-- (dérive entre bases) fait échouer la migration au lieu d'être recréée à
-- l'aveugle. Rejouable sans effet.
--
-- Règles :
--   bénéficiaire  → public.acces_participant(participant_id) : propriétaire
--                    OU membre actif de son organisation ; un bénéficiaire
--                    archivé reste accessible (la fonction ne lit pas
--                    `archive`). Fonction existante, déjà utilisée par toutes
--                    les policies orga_*.
--   contrat, séance, structure → EXISTS sur la table référencée, filtrée
--                    par SA PROPRE RLS : l'objet doit être visible de
--                    l'utilisateur (à lui, ou accessible par son
--                    organisation). Aucune de ces tables ne renvoie vers la
--                    table protégée : pas de récursion de policies.
--
-- factures_suivi : la policy porte aussi structure_id (famille « structure »,
-- lot K2). Elle est traitée entièrement ICI pour qu'aucune autre migration
-- ne réécrive la même policy et n'efface ce contrôle.
--
-- Aucune fonction nouvelle, aucune donnée modifiée, aucune policy de lecture
-- touchée. Idempotente, transactionnelle, bloc de contrôle final.

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

-- ─── bilans ─────────────────────────────────────────────────────────────────
ALTER POLICY "bilans_insert" ON public.bilans
  WITH CHECK (praticien_id = auth.uid() AND public.acces_participant(participant_id));
ALTER POLICY "bilans_update" ON public.bilans
  WITH CHECK (praticien_id = auth.uid() AND public.acces_participant(participant_id));

-- ─── contrats ───────────────────────────────────────────────────────────────
ALTER POLICY "contrats_insert" ON public.contrats
  WITH CHECK (praticien_id = auth.uid() AND public.acces_participant(participant_id));
ALTER POLICY "contrats_update" ON public.contrats
  WITH CHECK (praticien_id = auth.uid() AND public.acces_participant(participant_id));

-- ─── seances (bénéficiaire et contrat) ──────────────────────────────────────
ALTER POLICY "seances_insert" ON public.seances
  WITH CHECK (
    praticien_id = auth.uid()
    AND public.acces_participant(participant_id)
    AND (contrat_id IS NULL OR EXISTS (SELECT 1 FROM public.contrats k WHERE k.id = contrat_id))
  );
ALTER POLICY "seances_update" ON public.seances
  WITH CHECK (
    praticien_id = auth.uid()
    AND public.acces_participant(participant_id)
    AND (contrat_id IS NULL OR EXISTS (SELECT 1 FROM public.contrats k WHERE k.id = contrat_id))
  );
-- La policy d'organisation vérifiait déjà le bénéficiaire, pas le contrat :
-- B y passait avec SON bénéficiaire et le contrat de A.
ALTER POLICY "orga_acces_seances" ON public.seances
  WITH CHECK (
    public.acces_participant(participant_id)
    AND (contrat_id IS NULL OR EXISTS (SELECT 1 FROM public.contrats k WHERE k.id = contrat_id))
  );

-- ─── programmes ─────────────────────────────────────────────────────────────
ALTER POLICY "programmes_insert" ON public.programmes
  WITH CHECK (praticien_id = auth.uid() AND public.acces_participant(participant_id));
ALTER POLICY "programmes_update" ON public.programmes
  WITH CHECK (praticien_id = auth.uid() AND public.acces_participant(participant_id));

-- ─── notes_seances (bénéficiaire et séance) ─────────────────────────────────
ALTER POLICY "notes_seances_insert" ON public.notes_seances
  WITH CHECK (
    praticien_id = auth.uid()
    AND public.acces_participant(participant_id)
    AND (seance_id IS NULL OR EXISTS (SELECT 1 FROM public.seances s WHERE s.id = seance_id))
  );
ALTER POLICY "notes_seances_update" ON public.notes_seances
  WITH CHECK (
    praticien_id = auth.uid()
    AND public.acces_participant(participant_id)
    AND (seance_id IS NULL OR EXISTS (SELECT 1 FROM public.seances s WHERE s.id = seance_id))
  );
ALTER POLICY "orga_acces_notes_seances" ON public.notes_seances
  WITH CHECK (
    public.acces_participant(participant_id)
    AND (seance_id IS NULL OR EXISTS (SELECT 1 FROM public.seances s WHERE s.id = seance_id))
  );

-- ─── comptes_rendus_seances ─────────────────────────────────────────────────
ALTER POLICY "crs_insert" ON public.comptes_rendus_seances
  WITH CHECK (praticien_id = auth.uid() AND public.acces_participant(participant_id));
ALTER POLICY "crs_update" ON public.comptes_rendus_seances
  WITH CHECK (praticien_id = auth.uid() AND public.acces_participant(participant_id));

-- ─── bilans_brouillons ──────────────────────────────────────────────────────
ALTER POLICY "own" ON public.bilans_brouillons
  WITH CHECK (auth.uid() = praticien_id AND public.acces_participant(participant_id));

-- ─── factures_suivi (bénéficiaire ET structure, voir l'en-tête) ─────────────
ALTER POLICY "praticien_gere_factures" ON public.factures_suivi
  WITH CHECK (
    praticien_id = auth.uid()
    AND (participant_id IS NULL OR public.acces_participant(participant_id))
    AND (structure_id IS NULL OR EXISTS (SELECT 1 FROM public.structures st WHERE st.id = structure_id))
  );

-- ─── assistant_logs ─────────────────────────────────────────────────────────
-- patient_id NULL = question posée sans bénéficiaire sélectionné.
ALTER POLICY "praticien voit ses logs" ON public.assistant_logs
  WITH CHECK (praticien_id = auth.uid() AND (patient_id IS NULL OR public.acces_participant(patient_id)));

-- ═══ Contrôle final ═════════════════════════════════════════════════════════
DO $controle$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('bilans', 'bilans_insert', 'acces_participant(participant_id)'),
      ('bilans', 'bilans_update', 'acces_participant(participant_id)'),
      ('contrats', 'contrats_insert', 'acces_participant(participant_id)'),
      ('contrats', 'contrats_update', 'acces_participant(participant_id)'),
      ('seances', 'seances_insert', 'FROM contrats k'),
      ('seances', 'seances_update', 'FROM contrats k'),
      ('seances', 'orga_acces_seances', 'FROM contrats k'),
      ('programmes', 'programmes_insert', 'acces_participant(participant_id)'),
      ('programmes', 'programmes_update', 'acces_participant(participant_id)'),
      ('notes_seances', 'notes_seances_insert', 'FROM seances s'),
      ('notes_seances', 'notes_seances_update', 'FROM seances s'),
      ('notes_seances', 'orga_acces_notes_seances', 'FROM seances s'),
      ('comptes_rendus_seances', 'crs_insert', 'acces_participant(participant_id)'),
      ('comptes_rendus_seances', 'crs_update', 'acces_participant(participant_id)'),
      ('bilans_brouillons', 'own', 'acces_participant(participant_id)'),
      ('factures_suivi', 'praticien_gere_factures', 'FROM structures st'),
      ('assistant_logs', 'praticien voit ses logs', 'acces_participant(patient_id)')
    ) AS v(tablename, policyname, attendu)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies p
       WHERE p.schemaname = 'public' AND p.tablename = r.tablename AND p.policyname = r.policyname
         AND p.with_check LIKE '%' || r.attendu || '%'
    ) THEN
      RAISE EXCEPTION 'Bénéficiaire vérifié (K1) : policy %.% absente ou sans contrôle « % »', r.tablename, r.policyname, r.attendu;
    END IF;
  END LOOP;
  RAISE NOTICE 'Bénéficiaire vérifié (K1) : % contrôles vérifiés.', 17;
END
$controle$;

COMMIT;
