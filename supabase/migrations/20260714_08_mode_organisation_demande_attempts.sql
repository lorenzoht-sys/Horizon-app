-- ============================================================================
-- 20260714_mode_organisation_demande_attempts.sql
-- ============================================================================
--
-- Palier 5 (onboarding) — rate limiting de /api/organisation/demande
-- (formulaire public, sans authentification, de demande de création
-- d'organisation). Table dédiée, sur le même modèle que
-- patient_login_attempts (20260613_patient_login_rate_limit.sql) —
-- délibérément SÉPARÉE plutôt qu'une généralisation de cette dernière avec
-- une colonne "action" : les deux mécanismes protègent des choses de nature
-- différente (accès à des données de santé existantes vs création de
-- nouvelles organisations), les garder distincts évite qu'ils divergent
-- silencieusement si l'un des deux besoins évolue différemment de l'autre.
--
-- Cette table n'est accédée que via la clé service_role (côté serveur).
-- RLS activé par cohérence avec le reste du schéma, mais aucune policy
-- ajoutée pour anon/authenticated : seul service_role (qui contourne RLS)
-- y accède — cohérent avec patient_login_attempts.
--
-- IDEMPOTENTE : CREATE TABLE IF NOT EXISTS.
-- NE PAS EXÉCUTER SUR PROD sans validation préalable.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.organisation_demande_attempts (
  id         bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ip         text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_organisation_demande_attempts_ip_created
  ON public.organisation_demande_attempts (ip, created_at);

ALTER TABLE public.organisation_demande_attempts ENABLE ROW LEVEL SECURITY;

-- Optionnel : purge périodique des anciennes tentatives (> 1 jour), à
-- exécuter manuellement de temps en temps, ou via pg_cron si disponible :
--
-- DELETE FROM public.organisation_demande_attempts
-- WHERE created_at < now() - interval '1 day';
