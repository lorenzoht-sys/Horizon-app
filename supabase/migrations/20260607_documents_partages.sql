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
create policy "praticien_gere_partages"
on documents_partages for all
using (
  participant_id in (
    select id from participants
    where praticien_id = auth.uid()
  )
);

-- Lecture anonyme depuis le portail structure (accès par token)
create policy "structure_anon_read_documents_partages"
on documents_partages for select
using (
  structure_id is not null
  and structure_id in (select id from structures where actif = true)
);

notify pgrst, 'reload schema';
