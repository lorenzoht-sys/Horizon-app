-- Documents que le praticien choisit explicitement de partager
-- avec une structure (visibles ensuite dans le portail structure)
create table if not exists documents_partages (
  id uuid default gen_random_uuid() primary key,
  participant_id uuid references participants(id) on delete cascade,
  structure_id uuid references structures(id) on delete cascade,
  type_document text, -- 'compte_rendu_medecin', 'compte_rendu_famille', etc.
  contenu text,
  date_document date default current_date,
  partage_le timestamptz default now()
);

alter table documents_partages enable row level security;

-- Le praticien gère les partages de ses propres patients
drop policy if exists "praticien_gere_partages" on documents_partages;
create policy "praticien_gere_partages"
on documents_partages for all
using (
  participant_id in (
    select id from participants
    where praticien_id = auth.uid()
  )
)
with check (
  participant_id in (
    select id from participants
    where praticien_id = auth.uid()
  )
);

-- Pas de policy de lecture anonyme ici. Le portail structure lit ces
-- documents exclusivement via api/structure/data.ts, qui valide le token
-- (x-structure-token) côté serveur avec validateStructureToken() puis
-- utilise la clé service_role — donc contourne RLS entièrement. Aucun code
-- front-end n'interroge cette table avec la clé anon (voir
-- src/lib/structureApi.ts : tout passe par fetch('/api/structure/data')).
-- L'ancienne policy "structure_anon_read_documents_partages" ci-dessous
-- acceptait toute structure active sans vérifier le token — trop ouverte.
drop policy if exists "structure_anon_read_documents_partages" on documents_partages;

notify pgrst, 'reload schema';
