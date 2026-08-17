-- ============================================================================
-- 20260817_securite_01_tm6_variantes_rls.sql
-- ============================================================================
--
-- Ferme : [F-01] (volet tm6_variantes) et [F-09] du rapport
-- docs/RAPPORT_SECURITE.md — traités dans le même fichier car F-09
-- (ENABLE ROW LEVEL SECURITY) doit être appliqué avant que les policies
-- resserrées par F-01 ci-dessous ne produisent un effet quelconque : sans
-- RLS activé, des policies existent mais ne filtrent rien.
--
-- Preuve (voir docs/RAPPORT_SECURITE.md, F-01/F-09) : la table
-- `tm6_variantes` (créée par 20260701_tm6_variantes.sql, SANS RLS ni
-- policy dans ce fichier de migration) a pourtant, en production, 4
-- policies `praticien_select/insert/update/delete_tm6_variantes` avec
-- `USING (true)` / `WITH CHECK (true)`, confirmées par requête live le
-- 2026-08-17 (SQL Editor, projet prod) :
--   select schemaname, tablename, policyname, cmd, qual, with_check
--   from pg_policies where schemaname='public' and tablename='tm6_variantes';
-- Ces objets ont donc été créés hors migration versionnée (directement en
-- Supabase Studio), constat déjà documenté pour d'autres tables du projet.
-- Comme `tm6_variantes` n'a pas de colonne `praticien_id` (catalogue de
-- référence partagé, pas de propriétaire individuel), `USING(true)`
-- permet aujourd'hui à N'IMPORTE QUEL praticien authentifié de modifier ou
-- supprimer N'IMPORTE QUELLE ligne du catalogue commun à tous.
--
-- Impact : aucune donnée de santé (catalogue de tests, pas de donnée
-- patient) — mais intégrité du catalogue partagé compromise pour tous les
-- praticiens si un seul altère ou supprime des entrées.
--
-- Correctif : active RLS (idempotent si déjà actif) et restreint les
-- policies d'écriture à `service_role` uniquement ; la lecture reste
-- ouverte à tout praticien connecté (c'est un catalogue de référence, pas
-- une donnée à cloisonner par praticien).
--
-- ⚠️ NON TESTÉ AUTOMATIQUEMENT (le harnais tests/security/rls.spec.ts n'a
-- pas été exécuté sur staging — décision de Lorenzo, voir
-- docs/RAPPORT_SECURITE.md, section "Limite connue"). À TESTER MANUELLEMENT
-- SUR STAGING (SQL Editor) avant tout passage en production — aucun SQL de
-- cette session ne doit être exécuté directement sur la base de prod.
--
-- ── ROLLBACK ────────────────────────────────────────────────────────────
-- Pour revenir exactement à l'état d'avant ce correctif (déconseillé — ça
-- restaure la faille F-01/F-09) :
--
--   ALTER TABLE public.tm6_variantes DISABLE ROW LEVEL SECURITY;
--   DROP POLICY IF EXISTS "praticien_select_tm6_variantes" ON public.tm6_variantes;
--   DROP POLICY IF EXISTS "praticien_insert_tm6_variantes" ON public.tm6_variantes;
--   DROP POLICY IF EXISTS "praticien_update_tm6_variantes" ON public.tm6_variantes;
--   DROP POLICY IF EXISTS "praticien_delete_tm6_variantes" ON public.tm6_variantes;
--   CREATE POLICY "praticien_select_tm6_variantes" ON public.tm6_variantes FOR SELECT TO authenticated USING (true);
--   CREATE POLICY "praticien_insert_tm6_variantes" ON public.tm6_variantes FOR INSERT TO authenticated WITH CHECK (true);
--   CREATE POLICY "praticien_update_tm6_variantes" ON public.tm6_variantes FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
--   CREATE POLICY "praticien_delete_tm6_variantes" ON public.tm6_variantes FOR DELETE TO authenticated USING (true);
--
-- ============================================================================

-- [F-09] Active RLS — idempotent, ne casse rien si déjà actif.
ALTER TABLE public.tm6_variantes ENABLE ROW LEVEL SECURITY;

-- [F-01] Retire les policies d'écriture ouvertes à tout praticien
-- authentifié ; la lecture reste ouverte (catalogue partagé, pas de
-- donnée de santé). Écriture réservée à service_role (back-office futur,
-- ou administration directe du catalogue par l'équipe technique).
DROP POLICY IF EXISTS "praticien_select_tm6_variantes" ON public.tm6_variantes;
CREATE POLICY "praticien_select_tm6_variantes"
  ON public.tm6_variantes
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "praticien_insert_tm6_variantes" ON public.tm6_variantes;
DROP POLICY IF EXISTS "praticien_update_tm6_variantes" ON public.tm6_variantes;
DROP POLICY IF EXISTS "praticien_delete_tm6_variantes" ON public.tm6_variantes;
-- Aucune policy INSERT/UPDATE/DELETE recréée pour `authenticated` : seul
-- service_role (qui contourne RLS) peut désormais écrire dans ce
-- catalogue.

NOTIFY pgrst, 'reload schema';
