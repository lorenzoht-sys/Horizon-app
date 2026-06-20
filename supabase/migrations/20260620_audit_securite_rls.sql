-- ============================================================================
-- 20260620_audit_securite_rls.sql
-- ============================================================================
--
-- Audit complet des policies RLS du projet (suite à la faille trouvée sur
-- seances_patient/exercices_realises, voir 20260620_consolidation_seances_patient.sql).
-- Inventaire exhaustif effectué sur supabase/_staging_schema_dump.sql
-- (dump prod du 2026-06-15, 25 tables, 69 policies) + les migrations
-- versionnées postérieures (retours_seance, templates_structure,
-- tests_etalons_*, exercices_libres_*, déjà correctement scopées).
--
-- FAILLES CRITIQUES CONFIRMÉES (toutes "FOR SELECT TO public USING (true)",
-- combinées en OR avec les policies *_select déjà correctement scopées
-- présentes sur les MÊMES tables — donc strictement redondantes en plus
-- d'être dangereuses) :
--   - "Acces public bilans patient"     ON bilans
--   - "Acces public patient"            ON participants
--   - "Acces public programmes patient" ON programmes
--   - "Acces public seances patient"    ON seances
-- Effet : n'importe quel praticien authentifié pouvait lire les bilans,
-- données personnelles, programmes et séances de TOUS les patients de TOUS
-- les praticiens de la plateforme (pas seulement les siens). Simple DROP
-- (pas de remplacement) : les policies *_select/insert/update/delete déjà
-- présentes sur ces 4 tables couvrent déjà l'accès légitime.
--
-- Ce fichier inclut AUSSI le correctif de seances_patient/exercices_realises
-- (déjà écrit dans 20260620_consolidation_seances_patient.sql) pour qu'une
-- seule migration corrige tout d'un coup, qu'elle soit appliquée avant ou
-- après celle-ci — entièrement idempotent dans les deux cas.
--
-- NETTOYAGE COSMÉTIQUE (aucun risque actif, confirmé : `anon` n'a AUCUN
-- GRANT sur aucune des 25 tables du dump — REVOKE ALL ... FROM anon de
-- 20260613_rls_anon_lockdown.sql est bien global, pas seulement pour les 3
-- tables qu'il mentionnait explicitement) :
--   - "anon_read_exercices"  ON programme_exercices
--   - "anon_read_planning"   ON programme_planning
--   - "anon_read_seances"    ON programme_seances
--   - "anon_read_programmes" ON programmes
--
-- Toutes les autres tables/policies du projet ont été vérifiées et sont
-- correctement scopées (praticien_id = auth.uid(), ou jointure vers les
-- patients du praticien) — voir rapport Checkpoint B pour le détail complet.
--
-- IDEMPOTENTE : DROP POLICY IF EXISTS partout. Aucun changement si déjà
-- appliquée. NE PAS EXÉCUTER SUR PROD SANS VALIDATION PRÉALABLE.
-- ============================================================================

-- ── 1. Failles critiques : policies "Acces public X patient" ───────────────
-- Simple suppression : les policies *_select déjà présentes sur ces 4 tables
-- couvrent déjà l'accès praticien légitime (praticien_id = auth.uid()).

DROP POLICY IF EXISTS "Acces public bilans patient" ON public.bilans;
DROP POLICY IF EXISTS "Acces public patient" ON public.participants;
DROP POLICY IF EXISTS "Acces public programmes patient" ON public.programmes;
DROP POLICY IF EXISTS "Acces public seances patient" ON public.seances;

-- ── 2. Faille critique : seances_patient / exercices_realises ──────────────
-- Reproduit ici aussi (déjà présent dans 20260620_consolidation_seances_patient.sql)
-- pour que cette migration soit auto-suffisante, dans n'importe quel ordre.

DROP POLICY IF EXISTS "patient_gere_ses_seances" ON public.seances_patient;
CREATE POLICY "patient_gere_ses_seances" ON public.seances_patient
  FOR ALL
  USING (participant_id IN (
    SELECT id FROM public.participants WHERE praticien_id = auth.uid()
  ))
  WITH CHECK (participant_id IN (
    SELECT id FROM public.participants WHERE praticien_id = auth.uid()
  ));

DROP POLICY IF EXISTS "patient_gere_ses_exercices" ON public.exercices_realises;
CREATE POLICY "patient_gere_ses_exercices" ON public.exercices_realises
  FOR ALL
  USING (seance_patient_id IN (
    SELECT sp.id FROM public.seances_patient sp
    JOIN public.participants p ON p.id = sp.participant_id
    WHERE p.praticien_id = auth.uid()
  ))
  WITH CHECK (seance_patient_id IN (
    SELECT sp.id FROM public.seances_patient sp
    JOIN public.participants p ON p.id = sp.participant_id
    WHERE p.praticien_id = auth.uid()
  ));

-- ── 3. Nettoyage cosmétique : policies anon_read_* inertes ─────────────────
-- Confirmé inoffensif (anon sans aucun GRANT sur ces tables), supprimées par
-- hygiène pour ne pas laisser de policies fantômes prêtant à confusion.

DROP POLICY IF EXISTS "anon_read_exercices" ON public.programme_exercices;
DROP POLICY IF EXISTS "anon_read_planning" ON public.programme_planning;
DROP POLICY IF EXISTS "anon_read_seances" ON public.programme_seances;
DROP POLICY IF EXISTS "anon_read_programmes" ON public.programmes;
