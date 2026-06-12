-- T5 — Journal d'accès au portail structure
-- ============================================
-- Cette table enregistre chaque accès à /api/structure/data (un appel =
-- une ligne), pour pouvoir repérer une fuite de token (accès anormalement
-- fréquents ou depuis des IP inattendues).
--
-- ⚠️ NE PAS EXÉCUTER AUTOMATIQUEMENT — à exécuter manuellement par
-- l'utilisateur dans l'éditeur SQL Supabase (Dashboard > SQL Editor).
--
-- Cette table n'est écrite que via la clé service_role (côté serveur,
-- api/_lib/structureAuth.ts). RLS est activé par cohérence avec le reste du
-- schéma ; une policy de lecture est ajoutée pour le praticien propriétaire
-- de la structure (consultation de ses propres journaux d'accès).

create table if not exists public.structure_access_logs (
  id bigint generated always as identity primary key,
  structure_id uuid not null references public.structures(id) on delete cascade,
  ip text not null,
  accessed_at timestamptz not null default now()
);

create index if not exists idx_structure_access_logs_structure_date
  on public.structure_access_logs (structure_id, accessed_at);

alter table public.structure_access_logs enable row level security;

-- Le praticien propriétaire de la structure peut consulter ses propres
-- journaux d'accès (jointure via structures.praticien_id = auth.uid()).
drop policy if exists structure_access_logs_praticien_lecture on public.structure_access_logs;
create policy structure_access_logs_praticien_lecture
  on public.structure_access_logs
  for select
  to authenticated
  using (
    exists (
      select 1 from public.structures s
      where s.id = structure_access_logs.structure_id
        and s.praticien_id = auth.uid()
    )
  );

-- Aucune policy d'écriture : seul service_role (qui contourne RLS) peut
-- insérer des lignes (cf. api/_lib/structureAuth.ts).

-- Optionnel : purge périodique des anciens accès (> 90 jours), à exécuter
-- manuellement de temps en temps, ou via pg_cron si disponible :
--
-- delete from public.structure_access_logs
-- where accessed_at < now() - interval '90 days';
