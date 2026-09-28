-- ============================================================================
-- 20260928_patient_activite_rate_limit.sql
-- ============================================================================
--
-- Rate limit générique pour les actions AUTHENTIFIÉES de /api/patient/activite
-- ('seance-absence' dans ce lot ; 'cours-presence', 'test-etalon',
-- 'exercice-libre' peuvent réutiliser la même table plus tard sans nouvelle
-- migration, via la colonne `type`).
--
-- Distincte de patient_login_attempts (20260613_patient_login_rate_limit.sql),
-- qui protège la CONNEXION (par IP, avant tout jeton). Celle-ci protège les
-- actions d'un jeton déjà valide : la clé est donc participant_id, pas l'IP —
-- un jeton compromis reste limité même utilisé depuis des IP différentes, et
-- un foyer partageant une IP n'est jamais bridé à tort.
--
-- Cette table n'est accédée que via la clé service_role (côté serveur). RLS
-- est activé par cohérence avec le reste du schéma, mais aucune policy n'est
-- ajoutée pour anon/authenticated : seul service_role (qui contourne RLS)
-- peut y accéder.
--
-- ── Privilèges — REVOKE puis GRANT explicite ────────────────────────────────
-- Règle du projet pour toute nouvelle table dans public depuis le 2026-08-29
-- (voir docs/PLAN-BETA.md, « CHANTIER PLANIFIÉ — retirer la règle de
-- privilèges par défaut ») : il n'y a plus de GRANT par défaut à service_role
-- pour les tables créées après cette date. Sans le GRANT explicite ci-dessous,
-- service_role lui-même n'a AUCUN privilège sur cette table — constaté en CI
-- (PR #103, 2026-09-28) : "permission denied for table
-- patient_activite_rate_limit" (code 42501) dès la première lecture, malgré
-- une table par ailleurs correctement créée. patient_login_attempts (la
-- table sœur, connexion patient) n'a pas ce GRANT dans sa propre migration —
-- elle est antérieure au 2026-08-29 et a hérité de l'ancienne règle par
-- défaut, qui ne s'applique plus aux tables nouvelles.
--
-- ── ROLLBACK ────────────────────────────────────────────────────────────────
--   DROP TABLE IF EXISTS public.patient_activite_rate_limit;
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.patient_activite_rate_limit (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  participant_id uuid NOT NULL REFERENCES public.participants(id) ON DELETE CASCADE,
  type           text NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_patient_activite_rate_limit_participant_type_created
  ON public.patient_activite_rate_limit (participant_id, type, created_at);

ALTER TABLE public.patient_activite_rate_limit ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.patient_activite_rate_limit FROM PUBLIC;
REVOKE ALL ON TABLE public.patient_activite_rate_limit FROM anon;
REVOKE ALL ON TABLE public.patient_activite_rate_limit FROM authenticated;
REVOKE ALL ON TABLE public.patient_activite_rate_limit FROM service_role;

GRANT ALL ON TABLE public.patient_activite_rate_limit TO service_role;

DO $migration$
BEGIN
  IF (SELECT count(*) FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'patient_activite_rate_limit') <> 1 THEN
    RAISE EXCEPTION 'Echec verification : table patient_activite_rate_limit absente';
  END IF;

  IF NOT (SELECT relrowsecurity FROM pg_class WHERE relname = 'patient_activite_rate_limit' AND relnamespace = 'public'::regnamespace) THEN
    RAISE EXCEPTION 'Echec verification : RLS non activee sur patient_activite_rate_limit';
  END IF;

  -- Aucune policy anon/authenticated : seul service_role doit pouvoir y accéder.
  IF (SELECT count(*) FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'patient_activite_rate_limit') <> 0 THEN
    RAISE EXCEPTION 'Echec verification : aucune policy attendue sur patient_activite_rate_limit (service_role uniquement)';
  END IF;

  -- service_role doit pouvoir lire/écrire ; anon et authenticated, jamais.
  IF NOT has_table_privilege('service_role', 'public.patient_activite_rate_limit', 'SELECT')
     OR NOT has_table_privilege('service_role', 'public.patient_activite_rate_limit', 'INSERT') THEN
    RAISE EXCEPTION 'Echec verification : service_role doit avoir SELECT et INSERT sur patient_activite_rate_limit';
  END IF;
  IF has_table_privilege('anon', 'public.patient_activite_rate_limit', 'SELECT')
     OR has_table_privilege('authenticated', 'public.patient_activite_rate_limit', 'SELECT') THEN
    RAISE EXCEPTION 'Echec verification : anon/authenticated ne doivent avoir aucun privilege sur patient_activite_rate_limit';
  END IF;
END
$migration$;

-- Optionnel : purge périodique des anciennes tentatives (> 1 jour), à
-- exécuter manuellement de temps en temps, ou via pg_cron si disponible :
--
-- DELETE FROM public.patient_activite_rate_limit
-- WHERE created_at < now() - interval '1 day';

NOTIFY pgrst, 'reload schema';
