-- ============================================================================
-- 20260827_audit_logs_immuable_fk_set_null.sql
-- ============================================================================
--
-- Corrige 20260817_securite_03_audit_logs_immuable.sql (lot 4, F-06), qui
-- rend impossible la SUPPRESSION D'UN PATIENT.
--
-- Cause : audit_logs.participant_id est déclarée
--   participant_id uuid REFERENCES public.participants(id) ON DELETE SET NULL
-- (20260613_audit_logs.sql). SET NULL, pas CASCADE : supprimer un
-- participant ne supprime pas ses lignes d'audit, PostgreSQL exécute un
-- UPDATE dessus pour mettre participant_id à NULL. Or le trigger du lot 4
-- bloque BEFORE UPDATE OR DELETE sans aucune exception — il bloque donc
-- aussi cet UPDATE-là, et la suppression du participant échoue.
--
-- Portée réelle : tout patient s'étant connecté au moins une fois à son
-- espace, puisque c'est la connexion patient qui écrit dans audit_logs
-- (api/_lib/patientAuth.ts:97). Autrement dit, en pratique, la quasi-totalité
-- des patients actifs — et le droit à l'effacement RGPD avec eux. Le trigger
-- censé protéger la traçabilité RGPD empêchait l'effacement RGPD.
--
-- Constaté sur staging le 2026-08-26 (transaction annulée,
-- scripts/staging-dry-run.ts) :
--   - suppression d'un participant SANS ligne audit_logs : OK
--   - suppression d'un participant AVEC une ligne audit_logs :
--     ERREUR « audit_logs est append-only : UPDATE/DELETE interdits »
-- Le harnais ne l'avait pas vu : aucun test ne supprime un participant
-- ayant des traces d'audit.
--
-- Correctif : une exception unique et volontairement étroite — un UPDATE
-- dont le SEUL changement est participant_id passant d'une valeur à NULL,
-- toutes les autres colonnes strictement identiques. C'est exactement ce que
-- fait l'action référentielle, et rien d'autre. Le contenu d'une trace
-- d'audit reste immuable, et sa suppression reste interdite.
--
-- Effet de bord souhaitable : une trace d'audit survit à la suppression du
-- patient, anonymisée (participant_id à NULL). C'est le comportement correct
-- pour un journal RGPD — on efface la personne, on garde la trace de
-- l'accès, sans pouvoir la relier à elle.
--
-- Vérifié sur staging après ce correctif (transaction annulée) :
--   - suppression d'un participant avec traces : passe
--   - falsification de l'ip d'une trace existante : bloquée
--   - suppression d'une ligne d'audit : bloquée
--
-- ⚠️ À appliquer sur staging (qui porte la version fautive) PUIS en
-- production. La production n'a jamais reçu le lot 4 : elle recevra
-- directement cette version corrigée, jamais la fautive.
--
-- Aucun code applicatif ne dépend de ce trigger (api/_lib/patientAuth.ts ne
-- fait qu'un INSERT), donc pas de contrainte d'ordre vis-à-vis du merge —
-- voir la règle dans docs/PLAN-BETA.md.
--
-- ── ROLLBACK ────────────────────────────────────────────────────────────
--   DROP TRIGGER IF EXISTS trg_audit_logs_immuable ON public.audit_logs;
--   DROP FUNCTION IF EXISTS public.audit_logs_immuable();
--   (revient à l'état sans protection append-only, pas à la version fautive)
--
-- ============================================================================

CREATE OR REPLACE FUNCTION public.audit_logs_immuable()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Exception unique : l'action référentielle ON DELETE SET NULL de la FK
  -- participant_id. Toute autre modification reste interdite, y compris un
  -- UPDATE qui mettrait participant_id à NULL en changeant autre chose au
  -- passage (d'où la comparaison stricte de chaque colonne).
  IF TG_OP = 'UPDATE'
     AND OLD.participant_id IS NOT NULL
     AND NEW.participant_id IS NULL
     AND NEW.id         IS NOT DISTINCT FROM OLD.id
     AND NEW.event_type IS NOT DISTINCT FROM OLD.event_type
     AND NEW.ip         IS NOT DISTINCT FROM OLD.ip
     AND NEW.success    IS NOT DISTINCT FROM OLD.success
     AND NEW.created_at IS NOT DISTINCT FROM OLD.created_at
     AND NEW.metadata   IS NOT DISTINCT FROM OLD.metadata
  THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'audit_logs est append-only : UPDATE/DELETE interdits (voir docs/PLAN-BETA.md pour la procédure de purge RGPD délibérée)';
END;
$$;

-- Recréé pour garantir que le trigger pointe bien sur la fonction corrigée,
-- même si un environnement portait une définition antérieure.
DROP TRIGGER IF EXISTS trg_audit_logs_immuable ON public.audit_logs;
CREATE TRIGGER trg_audit_logs_immuable
  BEFORE UPDATE OR DELETE ON public.audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.audit_logs_immuable();

NOTIFY pgrst, 'reload schema';
