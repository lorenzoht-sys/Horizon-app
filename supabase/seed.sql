-- ============================================================================
-- SEED LOCAL — données 100 % fictives et anonymisées (aucune donnée réelle)
-- ============================================================================
-- Chargé par `supabase db reset` (config.toml, [db.seed]). Jamais en production
-- ni en staging : le dossier supabase/seeds/ et seed-staging.sql couvrent les
-- autres besoins.
--
-- Contenu : 1 admin, 2 praticiens (dont 1 avec n° SAP), 3 bénéficiaires,
-- 3 contrats, des séances sur 2 mois glissants (mois précédent + mois en
-- cours), et un changement de tarif sur le contrat du bénéficiaire A.
--
-- Comptes de connexion (LOCAL uniquement, mot de passe factice commun) :
--   admin@seed.test   · pro-sap@seed.test   · pro-simple@seed.test
--   mot de passe : SeedLocal-2026!
--
-- Les dates sont calculées à partir de current_date : les séances couvrent
-- toujours le mois précédent et le mois en cours, quel que soit le jour du reset.
-- ============================================================================

-- ---------- Comptes auth (3 utilisateurs) ----------
-- Les colonnes *_token sont à '' (et non NULL) : GoTrue échoue au scan sinon.
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, reauthentication_token, phone_change, phone_change_token
)
SELECT
  '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email,
  extensions.crypt('SeedLocal-2026!', extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(),
  '', '', '', '', '', '', '', ''
FROM (VALUES
  ('00000000-0000-4000-8000-000000000001'::uuid, 'admin@seed.test'),
  ('00000000-0000-4000-8000-000000000002'::uuid, 'pro-sap@seed.test'),
  ('00000000-0000-4000-8000-000000000003'::uuid, 'pro-simple@seed.test')
) AS u(id, email)
ON CONFLICT (id) DO NOTHING;

INSERT INTO auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
SELECT gen_random_uuid(), u.id, u.id::text, 'email',
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
       now(), now(), now()
FROM auth.users u
WHERE u.email LIKE '%@seed.test'
  AND NOT EXISTS (SELECT 1 FROM auth.identities i WHERE i.user_id = u.id);

-- Le trigger trg_auth_users_role_par_defaut a donné le rôle « praticien » à tous.
-- Seul l'admin est promu, explicitement.
UPDATE public.user_roles SET app_role = 'admin'
WHERE user_id = '00000000-0000-4000-8000-000000000001';

-- ---------- Praticiens (1-1 avec auth.users) ----------
INSERT INTO public.praticiens (
  id, nom, prenom, email, telephone, siret, numero_sap, numero_tva, societe,
  titre, adresse_rue, adresse_code_postal, adresse_ville, ville_signature,
  tarif_horaire, frais_km_defaut
) VALUES
  ('00000000-0000-4000-8000-000000000001', 'Admin', 'Test', 'admin@seed.test', '0600000001',
   NULL, NULL, NULL, NULL, 'Administrateur', '1 rue de l''Exemple', '00000', 'Villetest', 'Villetest', '45', '0.50'),
  ('00000000-0000-4000-8000-000000000002', 'ProSap', 'Alex', 'pro-sap@seed.test', '0600000002',
   '00000000000018', 'SAP000000000', 'FR00000000000', 'Cabinet Exemple SAP',
   'Enseignant APA', '2 rue de l''Exemple', '00000', 'Villetest', 'Villetest', '50', '0.50'),
  ('00000000-0000-4000-8000-000000000003', 'ProSimple', 'Sam', 'pro-simple@seed.test', '0600000003',
   '00000000000026', NULL, NULL, NULL,
   'Enseignant APA', '3 rue de l''Exemple', '00000', 'Villetest', 'Villetest', '45', '0.50')
ON CONFLICT (id) DO NOTHING;

-- ---------- Bénéficiaires (3) ----------
-- rgpd.consentementObtenu = true : exigé par le trigger de création.
INSERT INTO public.participants (
  id, praticien_id, nom, prenom, date_naissance, email, telephone,
  adresse_rue, adresse_code_postal, adresse_ville, ville_naissance, code_postal_naissance,
  pathologie, profil, rgpd, code_acces
) VALUES
  ('00000000-0000-4000-9000-00000000000a', '00000000-0000-4000-8000-000000000002',
   'BenefTest', 'Alice', '1950-01-01', 'beneficiaire-a@seed.test', '0600000011',
   '10 rue de l''Exemple', '00000', 'Villetest', 'Villetest', '00000',
   'Fictive A', 'senior', '{"consentementObtenu": true}'::jsonb, 'SEED0001'),
  ('00000000-0000-4000-9000-00000000000b', '00000000-0000-4000-8000-000000000002',
   'BenefTest', 'Bruno', '1948-02-02', 'beneficiaire-b@seed.test', '0600000012',
   '11 rue de l''Exemple', '00000', 'Villetest', 'Villetest', '00000',
   'Fictive B', 'senior', '{"consentementObtenu": true}'::jsonb, 'SEED0002'),
  ('00000000-0000-4000-9000-00000000000c', '00000000-0000-4000-8000-000000000003',
   'BenefTest', 'Chloé', '1955-03-03', 'beneficiaire-c@seed.test', '0600000013',
   '12 rue de l''Exemple', '00000', 'Villetest', 'Villetest', '00000',
   'Fictive C', 'senior', '{"consentementObtenu": true}'::jsonb, 'SEED0003')
ON CONFLICT (id) DO NOTHING;

-- ---------- Contrats (3) ----------
-- A : durée indéterminée, 2 séances/semaine (lun, jeu), pro SAP.
-- B : à terme (mois précédent → +3 mois), 1 séance/semaine (mar), pro SAP.
-- C : durée indéterminée, 1 séance/semaine (mer), pro sans SAP.
INSERT INTO public.contrats (
  id, participant_id, praticien_id, date_debut, date_fin, duree_indeterminee, statut,
  jours_fixe, nb_seances_semaine, heure_debut, duree_minutes, durees_seances, periodicite
) VALUES
  ('00000000-0000-4000-a000-00000000000a', '00000000-0000-4000-9000-00000000000a', '00000000-0000-4000-8000-000000000002',
   (date_trunc('month', current_date) - interval '1 month')::date,
   (date_trunc('month', current_date) + interval '12 months')::date, true, 'actif',
   ARRAY['lun','jeu'], 2, '10:00', 45, ARRAY[45,45], 'semaine'),
  ('00000000-0000-4000-a000-00000000000b', '00000000-0000-4000-9000-00000000000b', '00000000-0000-4000-8000-000000000002',
   (date_trunc('month', current_date) - interval '1 month')::date,
   (date_trunc('month', current_date) + interval '3 months')::date, false, 'actif',
   ARRAY['mar'], 1, '14:00', 60, ARRAY[60], 'semaine'),
  ('00000000-0000-4000-a000-00000000000c', '00000000-0000-4000-9000-00000000000c', '00000000-0000-4000-8000-000000000003',
   (date_trunc('month', current_date) - interval '1 month')::date,
   (date_trunc('month', current_date) + interval '12 months')::date, true, 'actif',
   ARRAY['mer'], 1, '09:00', 45, ARRAY[45], 'semaine')
ON CONFLICT (id) DO NOTHING;

-- ---------- Tarifs versionnés ----------
-- A : changement de tarif au 1er du mois en cours (45 € → 50 €, + 5 € de déplacement).
-- Une seule version ouverte par contrat (index tarifs_contrats_une_version_active).
INSERT INTO public.tarifs_contrats (id, contrat_id, tarif_seance, frais_deplacement, date_debut_validite, date_fin_validite) VALUES
  ('00000000-0000-4000-b000-0000000000a1', '00000000-0000-4000-a000-00000000000a', 45, 0,
   (date_trunc('month', current_date) - interval '1 month')::date,
   (date_trunc('month', current_date) - interval '1 day')::date),
  ('00000000-0000-4000-b000-0000000000a2', '00000000-0000-4000-a000-00000000000a', 50, 5,
   date_trunc('month', current_date)::date, NULL),
  ('00000000-0000-4000-b000-0000000000b1', '00000000-0000-4000-a000-00000000000b', 60, 0,
   (date_trunc('month', current_date) - interval '1 month')::date, NULL),
  ('00000000-0000-4000-b000-0000000000c1', '00000000-0000-4000-a000-00000000000c', 40, 0,
   (date_trunc('month', current_date) - interval '1 month')::date, NULL)
ON CONFLICT (id) DO NOTHING;

-- ---------- Séances : mois précédent + mois en cours ----------
-- Passé → réalisée, avec une annulation (motif « maladie ») tous les 5 jours
-- de séance ; futur → planifiée. Une séance d'un contrat par jour fixe.
INSERT INTO public.seances (
  participant_id, praticien_id, contrat_id, date, heure_debut, heure_fin,
  duree_minutes, type, statut, motif_annulation
)
SELECT
  c.participant_id, c.praticien_id, c.id, d::date, c.heure_debut,
  to_char((c.heure_debut::time + make_interval(mins => c.duree_minutes)), 'HH24:MI'),
  c.duree_minutes, 'seance',
  CASE
    WHEN d::date >= current_date THEN 'planifiee'
    WHEN (extract(day FROM d)::int % 5) = 0 THEN 'annulee'
    ELSE 'realisee'
  END,
  CASE WHEN d::date < current_date AND (extract(day FROM d)::int % 5) = 0 THEN 'maladie' END
FROM public.contrats c
CROSS JOIN LATERAL generate_series(
  (date_trunc('month', current_date) - interval '1 month')::date,
  (date_trunc('month', current_date) + interval '1 month' - interval '1 day')::date,
  interval '1 day'
) AS d
WHERE c.id IN (
  '00000000-0000-4000-a000-00000000000a',
  '00000000-0000-4000-a000-00000000000b',
  '00000000-0000-4000-a000-00000000000c'
)
  AND (ARRAY['dim','lun','mar','mer','jeu','ven','sam'])[extract(dow FROM d)::int + 1] = ANY (c.jours_fixe);

-- ---------- Contrôle ----------
DO $controle$
DECLARE
  v_admins int; v_pros int; v_sap int; v_benef int; v_contrats int; v_tarifs int;
  v_seances int; v_mois int;
BEGIN
  SELECT count(*) INTO v_admins FROM public.user_roles WHERE app_role = 'admin';
  SELECT count(*) INTO v_pros   FROM public.praticiens WHERE email LIKE 'pro-%@seed.test';
  SELECT count(*) INTO v_sap    FROM public.praticiens WHERE email LIKE 'pro-%@seed.test' AND numero_sap IS NOT NULL;
  SELECT count(*) INTO v_benef  FROM public.participants WHERE email LIKE 'beneficiaire-%@seed.test';
  SELECT count(*) INTO v_contrats FROM public.contrats;
  SELECT count(*) INTO v_tarifs   FROM public.tarifs_contrats WHERE contrat_id = '00000000-0000-4000-a000-00000000000a';
  SELECT count(*) INTO v_seances  FROM public.seances;
  SELECT count(DISTINCT date_trunc('month', date)) INTO v_mois FROM public.seances;

  IF v_admins <> 1 OR v_pros <> 2 OR v_sap <> 1 OR v_benef <> 3 OR v_contrats <> 3
     OR v_tarifs <> 2 OR v_seances = 0 OR v_mois <> 2 THEN
    RAISE EXCEPTION 'Seed : état inattendu (admins=%/1, pros=%/2, sap=%/1, bénéficiaires=%/3, contrats=%/3, tarifs A=%/2, séances=%, mois=%/2)',
      v_admins, v_pros, v_sap, v_benef, v_contrats, v_tarifs, v_seances, v_mois;
  END IF;
END
$controle$;
