-- ============================================================================
-- 20260817_securite_03_audit_logs_immuable.sql
-- ============================================================================
--
-- Ferme : [F-06] du rapport docs/RAPPORT_SECURITE.md.
--
-- Preuve : `supabase/migrations/20260613_audit_logs.sql` n'a aucune policy
-- UPDATE/DELETE (bien — bloque `authenticated`), mais RLS ne s'applique
-- JAMAIS à `service_role`. Rien au niveau base n'empêche aujourd'hui
-- `service_role` de modifier ou supprimer des lignes d'`audit_logs` — la
-- garantie "append-only" reposait entièrement sur la discipline du code
-- applicatif, pas sur un verrou technique. Confirmé par le test
-- `[F-06]` dans tests/security/rls.spec.ts (conçu pour échouer tant que ce
-- trigger n'existe pas).
--
-- Impact : pour un journal d'audit RGPD (traçabilité des accès aux données
-- de santé de l'espace patient), une garantie applicative seule est
-- insuffisante — un bug ou une route compromise utilisant service_role
-- pourrait altérer ou effacer les traces sans qu'aucune protection DB ne
-- s'y oppose.
--
-- Correctif : trigger BEFORE UPDATE OR DELETE qui lève systématiquement
-- une exception, sans exception pour aucun rôle — y compris service_role.
-- La seule façon de "supprimer" des lignes d'audit devient une purge RGPD
-- délibérée et documentée (désactivation explicite du trigger, voir
-- rollback / procédure ci-dessous), jamais une requête applicative
-- ordinaire.
--
-- ⚠️ NON TESTÉ AUTOMATIQUEMENT contre une vraie base dans cette session
-- (pas de credentials staging disponibles). Le test
-- tests/security/rls.spec.ts (`[F-06] service_role N'EST PAS bloqué...`)
-- est conçu pour échouer AVANT ce correctif et passer APRÈS — à faire
-- tourner sur staging pour confirmer, avant tout passage en production.
--
-- ── ROLLBACK (usage normal, revert du correctif) ───────────────────────
--   DROP TRIGGER IF EXISTS trg_audit_logs_immuable ON public.audit_logs;
--   DROP FUNCTION IF EXISTS public.audit_logs_immuable();
--
-- ── PURGE RGPD DÉLIBÉRÉE (rétention, droit à l'effacement) ─────────────
-- Le trigger bloque aussi une purge légitime de rétention. Procédure pour
-- une purge documentée et tracée (jamais silencieuse) :
--   ALTER TABLE public.audit_logs DISABLE TRIGGER trg_audit_logs_immuable;
--   -- ... exécuter la purge (ex. DELETE FROM public.audit_logs WHERE
--   --     created_at < now() - interval '1 year';) ...
--   ALTER TABLE public.audit_logs ENABLE TRIGGER trg_audit_logs_immuable;
--
-- ============================================================================

CREATE OR REPLACE FUNCTION public.audit_logs_immuable()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs est append-only : UPDATE/DELETE interdits (voir docs/RAPPORT_SECURITE.md, F-06, pour la procédure de purge RGPD délibérée)';
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_logs_immuable ON public.audit_logs;
CREATE TRIGGER trg_audit_logs_immuable
  BEFORE UPDATE OR DELETE ON public.audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.audit_logs_immuable();

NOTIFY pgrst, 'reload schema';
