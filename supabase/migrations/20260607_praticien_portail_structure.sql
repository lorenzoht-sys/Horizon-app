-- Expose au portail structure (accès anonyme par token) uniquement les infos
-- de contact du praticien (nom/titre/email/téléphone), sans exposer les
-- données sensibles de la table praticiens (SIRET, adresse, tarifs, etc.)
create or replace function get_praticien_structure(p_token text)
returns table (
  prenom text,
  nom text,
  titre text,
  email text,
  telephone text
)
language sql
security definer
set search_path = public
as $$
  select p.prenom, p.nom, p.titre, p.email, p.telephone
  from praticiens p
  join structures s on s.praticien_id = p.id
  where s.token_acces = p_token and s.actif = true
  limit 1;
$$;

grant execute on function get_praticien_structure(text) to anon;

notify pgrst, 'reload schema';
