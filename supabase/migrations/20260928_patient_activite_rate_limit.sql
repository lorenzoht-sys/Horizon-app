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
END
$migration$;

-- Optionnel : purge périodique des anciennes tentatives (> 1 jour), à
-- exécuter manuellement de temps en temps, ou via pg_cron si disponible :
--
-- DELETE FROM public.patient_activite_rate_limit
-- WHERE created_at < now() - interval '1 day';

-- Sans ce NOTIFY, PostgREST peut continuer à ignorer la table nouvellement
-- créée jusqu'à son prochain rafraîchissement de cache — et
-- checkActiviteRateLimit()/recordActiviteAttempt() (api/_lib/activiteRateLimit.ts)
-- n'exposent pas l'erreur PostgREST qui en résulterait : `count` reste
-- `null`, donc `(count ?? 0) < seuil.max` reste vrai indéfiniment. Constaté
-- en CI (PR #103, 2026-09-28) : la table existait bien, mais le rate limit
-- ne s'est jamais déclenché (12 requêtes, 12 fois 200) tant que cette ligne
-- manquait ici.
NOTIFY pgrst, 'reload schema';
