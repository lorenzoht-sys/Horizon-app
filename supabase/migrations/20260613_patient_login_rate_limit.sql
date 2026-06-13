-- ============================================================================
-- 20260613_patient_login_rate_limit.sql
-- ============================================================================
--
-- Version migration de sql/t3_patient_rate_limit.sql (branche securisation).
-- Crée la table utilisée par api/_lib/patientAuth.ts (checkRateLimit /
-- recordLoginAttempt) pour limiter les tentatives de connexion patient à
-- 5 par IP toutes les 15 minutes.
--
-- Cette table n'est accédée que via la clé service_role (côté serveur).
-- RLS est activé par cohérence avec le reste du schéma, mais aucune policy
-- n'est ajoutée pour anon/authenticated : seul service_role (qui contourne
-- RLS) peut y accéder.

CREATE TABLE IF NOT EXISTS public.patient_login_attempts (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ip text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_patient_login_attempts_ip_created
  ON public.patient_login_attempts (ip, created_at);

ALTER TABLE public.patient_login_attempts ENABLE ROW LEVEL SECURITY;

-- Optionnel : purge périodique des anciennes tentatives (> 1 jour), à
-- exécuter manuellement de temps en temps, ou via pg_cron si disponible :
--
-- DELETE FROM public.patient_login_attempts
-- WHERE created_at < now() - interval '1 day';
