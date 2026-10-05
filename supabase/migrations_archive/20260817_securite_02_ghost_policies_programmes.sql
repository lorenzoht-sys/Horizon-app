-- ============================================================================
-- 20260817_securite_02_ghost_policies_programmes.sql
-- ============================================================================
--
-- Ferme : [F-05] du rapport docs/RAPPORT_SECURITE.md.
--
-- Preuve : `supabase/migrations/20260620_consolidation_seances_patient.sql`
-- lignes 67-69, 112-114, 163-165 — policies `FOR SELECT TO anon USING (true)`
-- sur `programme_seances`, `programme_planning`, `programme_exercices`,
-- créées APRÈS que `20260620_audit_securite_rls.sql` ait supprimé ces
-- mêmes policies (ordre lexicographique des deux fichiers datés du même
-- jour : `audit_...` s'exécute avant `consolidation_...`).
--
-- Impact : aujourd'hui, seule la couche `REVOKE ALL ... FROM anon` globale
-- (20260613_rls_anon_lockdown.sql, Section 3) empêche un accès anonyme
-- complet à ces 3 tables de données patient. Une seule couche de défense
-- est traitée comme active dans ce rapport (barème imposé par Lorenzo) :
-- Critique.
--
-- ⚠️ RÈGLE PERMANENTE (rappelée ici, voir aussi docs/RAPPORT_SECURITE.md) :
-- ce correctif ne touche PAS au `REVOKE ALL ... FROM anon` global de
-- `20260613_rls_anon_lockdown.sql`. Ce verrou est une deuxième ligne de
-- défense indépendante des policies RLS — il ne doit JAMAIS être retiré,
-- simplifié ou considéré comme redondant dans un futur lot de nettoyage,
-- même après ce correctif. Défense en profondeur : les deux couches
-- restent nécessaires en permanence, indépendamment l'une de l'autre.
--
-- ⚠️ NON TESTÉ AUTOMATIQUEMENT (voir docs/RAPPORT_SECURITE.md, section
-- "Limite connue" — le harnais tests/security/rls.spec.ts n'a pas été
-- exécuté sur staging). À TESTER MANUELLEMENT SUR STAGING (SQL Editor)
-- avant tout passage en production.
--
-- ── ROLLBACK ────────────────────────────────────────────────────────────
-- Pour revenir exactement à l'état d'avant ce correctif (déconseillé — ça
-- restaure les 3 policies fantômes, sans effet tant que le REVOKE global
-- tient, mais latentes) — noms vérifiés contre
-- 20260620_consolidation_seances_patient.sql lignes 67-69/112-114/163-165 :
--
--   CREATE POLICY "anon_read_seances" ON public.programme_seances
--     FOR SELECT TO anon USING (true);
--   CREATE POLICY "anon_read_planning" ON public.programme_planning
--     FOR SELECT TO anon USING (true);
--   CREATE POLICY "anon_read_exercices" ON public.programme_exercices
--     FOR SELECT TO anon USING (true);
--
-- ============================================================================

DROP POLICY IF EXISTS "anon_read_seances" ON public.programme_seances;
DROP POLICY IF EXISTS "anon_read_planning" ON public.programme_planning;
DROP POLICY IF EXISTS "anon_read_exercices" ON public.programme_exercices;

NOTIFY pgrst, 'reload schema';
