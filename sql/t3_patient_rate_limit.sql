-- T3 — Rate limiting pour /api/patient/login
-- ============================================
-- Ce script crée la table utilisée par api/_lib/patientAuth.ts
-- (checkRateLimit / recordLoginAttempt) pour limiter les tentatives de
-- connexion patient à 5 par IP toutes les 15 minutes.
--
-- ⚠️ NE PAS EXÉCUTER AUTOMATIQUEMENT — à exécuter manuellement par
-- l'utilisateur dans l'éditeur SQL Supabase (Dashboard > SQL Editor).
--
-- Cette table n'est accédée que via la clé service_role (côté serveur,
-- api/_lib/patientAuth.ts). RLS est activé par cohérence avec le reste du
-- schéma, mais aucune policy n'est ajoutée pour anon/authenticated : seul
-- service_role (qui contourne RLS) peut y accéder.

create table if not exists public.patient_login_attempts (
  id bigint generated always as identity primary key,
  ip text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_patient_login_attempts_ip_created
  on public.patient_login_attempts (ip, created_at);

alter table public.patient_login_attempts enable row level security;

-- Aucune policy pour anon/authenticated : table accessible uniquement via
-- service_role (qui contourne RLS), conformément au verrouillage anon de T1.

-- Optionnel : purge périodique des anciennes tentatives (> 1 jour).
-- À exécuter manuellement de temps en temps, ou via une tâche planifiée
-- Supabase (pg_cron) si disponible sur votre plan :
--
-- delete from public.patient_login_attempts
-- where created_at < now() - interval '1 day';
