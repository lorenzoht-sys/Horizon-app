-- ============================================================================
-- 20260817_securite_06_ghost_policy_documents_partages.sql
-- ============================================================================
--
-- Ferme : [F-10] (volet policy fantôme) du rapport
-- docs/RAPPORT_SECURITE.md — même schéma que F-05, sur `documents_partages`.
--
-- Preuve : `documents_partages` existe réellement en production (confirmé
-- par requête live le 2026-08-17 sur information_schema.tables — contraire
-- à ce qu'affirmait supabase/migrations/README.md). La policy
-- "structure_anon_read_documents_partages" a été créée par
-- `20260608_fix_structure_anon_rls.sql` (bloc conditionnel `DO $$`), et
-- n'a JAMAIS été explicitement DROP par `20260613_rls_anon_lockdown.sql`
-- (qui liste individuellement participants/bilans/seances/programmes/
-- factures_suivi en Section 2, mais pas documents_partages).
--
-- Impact : comme pour F-05, seule la couche `REVOKE ALL ... FROM anon`
-- globale empêche aujourd'hui un accès anonyme à cette table (comptes-
-- rendus partagés avec des structures partenaires — donnée de santé).
-- Une seule couche de défense = traité comme actif : Critique.
--
-- ⚠️ RÈGLE PERMANENTE (identique à F-05) : ce correctif ne touche PAS au
-- `REVOKE ALL ... FROM anon` global de `20260613_rls_anon_lockdown.sql`.
-- Ce verrou reste une deuxième ligne de défense indépendante et ne doit
-- JAMAIS être retiré ou simplifié dans un futur lot de nettoyage.
--
-- ⚠️ NON TESTÉ AUTOMATIQUEMENT contre une vraie base dans cette session.
-- Test dédié : tests/security/rls.spec.ts (`[F-10] aucune policy TO anon
-- ne subsiste sur documents_partages`), conçu pour échouer avant ce
-- correctif. À faire tourner sur staging avant tout passage en production.
--
-- ── ROLLBACK ────────────────────────────────────────────────────────────
-- Pour revenir exactement à l'état d'avant ce correctif (déconseillé —
-- restaure la policy fantôme, sans effet tant que le REVOKE global tient) :
--
--   CREATE POLICY "structure_anon_read_documents_partages" ON public.documents_partages
--     FOR SELECT USING (
--       structure_id IS NOT NULL AND structure_token_valide(structure_id)
--     );
--
-- ============================================================================

-- Table optionnelle selon l'environnement (créée seulement si
-- 20260607_documents_partages.sql a été appliquée — voir F-10, existence
-- confirmée en prod mais pas garantie sur tout environnement, ex. staging
-- fraîchement recréé). Même garde que 20260608_fix_structure_anon_rls.sql.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'documents_partages') THEN
    EXECUTE 'DROP POLICY IF EXISTS "structure_anon_read_documents_partages" ON public.documents_partages';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
