-- Crée une structure de test (EHPAD) + un patient rattaché,
-- pour visualiser/tester le portail structure en local.
-- À exécuter une fois dans le SQL Editor Supabase, puis supprimable.

with prat as (
  select id from praticiens limit 1
),
struct as (
  insert into structures (praticien_id, nom, type, contact_nom, contact_email, token_acces, tarif_seance, frequence_facturation, actif)
  select id, 'EHPAD Les Tilleuls', 'ehpad', 'Marie Dupont', 'contact@tilleuls-test.fr',
         md5(random()::text || clock_timestamp()::text), 45, 'mensuelle', true
  from prat
  returning id, token_acces, praticien_id
),
patient as (
  insert into participants (praticien_id, structure_id, nom, prenom, date_naissance, date_creation, token)
  select praticien_id, id, 'Lefèvre', 'Jeanne', '1947-05-18', current_date,
         md5(random()::text || clock_timestamp()::text)
  from struct
  returning structure_id, token
)
select struct.token_acces as token_structure, patient.token as token_patient
from struct join patient on patient.structure_id = struct.id;

notify pgrst, 'reload schema';
