-- Templates de compte rendu réutilisables par structure.
-- On stocke le texte déjà extrait du template (PDF/Word), pas le fichier
-- binaire d'origine — cohérent avec documents_patient/documents_partages
-- qui stockent déjà du texte en base plutôt que des fichiers.
create table if not exists templates_structure (
  id uuid default gen_random_uuid() primary key,
  praticien_id uuid not null,
  structure_id uuid references structures(id) on delete cascade,
  nom text not null,
  contenu_texte text not null,
  format_origine text, -- 'pdf' | 'docx'
  created_at timestamptz default now()
);

create index if not exists idx_templates_structure_structure on templates_structure(structure_id);

alter table templates_structure enable row level security;

drop policy if exists "praticien_gere_templates_structure" on templates_structure;
create policy "praticien_gere_templates_structure"
on templates_structure for all
using (praticien_id = auth.uid())
with check (praticien_id = auth.uid());

notify pgrst, 'reload schema';
