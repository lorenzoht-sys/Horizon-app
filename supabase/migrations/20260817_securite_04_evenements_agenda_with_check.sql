-- ============================================================================
-- 20260817_securite_04_evenements_agenda_with_check.sql
-- ============================================================================
--
-- Ferme : [F-07] du rapport docs/RAPPORT_SECURITE.md — hygiène, PAS un
-- correctif d'exploitabilité réelle.
--
-- Preuve : `supabase/migrations/20260715_evenements_agenda.sql:52-54` —
--   CREATE POLICY "evenements_agenda_update" ON public.evenements_agenda
--     FOR UPDATE USING (praticien_id = auth.uid());
-- pas de clause WITH CHECK.
--
-- Impact : AUCUN vecteur d'exploitation réel — PostgreSQL applique par
-- défaut la clause USING comme WITH CHECK implicite pour une policy UPDATE
-- qui n'en définit pas (comportement documenté de Postgres, pas une faille
-- de ce projet). Ce correctif est purement pour la lisibilité/l'auditabilité
-- du schéma, afin qu'un futur lecteur ne suppose pas — à tort — qu'il y a
-- un trou de sécurité ici. Test dédié tests/security/rls.spec.ts
-- (`[F-07] (hygiène, pas un exploit)`) documenté comme tel.
--
-- Correctif : ajoute WITH CHECK (praticien_id = auth.uid()) explicitement,
-- même condition que USING — aucun changement de comportement réel attendu.
--
-- ⚠️ NON TESTÉ AUTOMATIQUEMENT contre une vraie base dans cette session.
-- À faire tourner sur staging avant tout passage en production, comme les
-- autres migrations de ce lot (procédure identique, risque de régression
-- nul attendu ici).
--
-- ── ROLLBACK ────────────────────────────────────────────────────────────
--   DROP POLICY IF EXISTS "evenements_agenda_update" ON public.evenements_agenda;
--   CREATE POLICY "evenements_agenda_update" ON public.evenements_agenda
--     FOR UPDATE USING (praticien_id = auth.uid());
--
-- ============================================================================

DROP POLICY IF EXISTS "evenements_agenda_update" ON public.evenements_agenda;
CREATE POLICY "evenements_agenda_update" ON public.evenements_agenda
  FOR UPDATE
  USING (praticien_id = auth.uid())
  WITH CHECK (praticien_id = auth.uid());

NOTIFY pgrst, 'reload schema';
