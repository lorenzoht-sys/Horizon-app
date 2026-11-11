-- ============================================================================
-- Contrôles de la répétition à blanc (clevercloud/scripts/repetition.sh)
-- ============================================================================
-- Jeu ENTIÈREMENT FICTIF (deux praticiens, un bénéficiaire chacun), puis
-- vérification que la RLS se comporte sur un PostgreSQL standard comme sur
-- Supabase. Les jetons sont simulés comme le fait PostgREST : SET ROLE puis
-- request.jwt.claims. Chaque contrôle lève une exception s'il échoue.
--
-- À n'exécuter que sur la base jetable de la répétition : le script insère des
-- lignes. Il n'est pas une migration et ne vise jamais une base réelle.
-- ============================================================================
\set ON_ERROR_STOP on

INSERT INTO auth.users (id, email) VALUES
  ('aaaaaaaa-0000-4000-8000-000000000001', 'praticien-a@example.com'),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'praticien-b@example.com');

CREATE FUNCTION pg_temp.jeton(role text, sub text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', CASE WHEN sub IS NULL THEN '' ELSE json_build_object('sub', sub, 'role', role)::text END, true);
  EXECUTE format('SET LOCAL ROLE %I', role);
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.jeton(text, text) TO anon, authenticated, service_role;

-- 1. Le trigger de auth.users attribue le rôle « praticien » à chaque compte.
DO $$
BEGIN
  IF (SELECT count(*) FROM public.user_roles WHERE app_role = 'praticien') <> 2 THEN
    RAISE EXCEPTION 'Contrôle 1 : le rôle praticien n''a pas été attribué aux deux comptes.';
  END IF;
END $$;

-- 2. Chaque praticien crée son bénéficiaire ; praticien_id vient du jeton.
BEGIN;
SELECT pg_temp.jeton('authenticated', 'aaaaaaaa-0000-4000-8000-000000000001');
INSERT INTO public.participants (nom, prenom, rgpd) VALUES ('Fictif', 'Alix', '{"consentementObtenu": true}');
COMMIT;
BEGIN;
SELECT pg_temp.jeton('authenticated', 'bbbbbbbb-0000-4000-8000-000000000002');
INSERT INTO public.participants (nom, prenom, rgpd) VALUES ('Fictif', 'Benoît', '{"consentementObtenu": true}');
COMMIT;

-- 3. Cloisonnement : A ne voit que le sien, ne peut ni modifier ni supprimer celui de B.
BEGIN;
SELECT pg_temp.jeton('authenticated', 'aaaaaaaa-0000-4000-8000-000000000001');
DO $$
DECLARE n int;
BEGIN
  IF (SELECT array_agg(prenom) FROM public.participants) IS DISTINCT FROM ARRAY['Alix'] THEN
    RAISE EXCEPTION 'Contrôle 3 : le praticien A ne voit pas exactement son bénéficiaire.';
  END IF;
  UPDATE public.participants SET nom = 'Modifié' WHERE prenom = 'Benoît';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'Contrôle 3 : A a modifié le bénéficiaire de B.'; END IF;
  DELETE FROM public.participants WHERE prenom = 'Benoît';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'Contrôle 3 : A a supprimé le bénéficiaire de B.'; END IF;
END $$;
COMMIT;

-- 4. A ne peut pas créer un bénéficiaire au nom de B.
BEGIN;
SELECT pg_temp.jeton('authenticated', 'aaaaaaaa-0000-4000-8000-000000000001');
DO $$
BEGIN
  BEGIN
    INSERT INTO public.participants (nom, prenom, rgpd, praticien_id)
    VALUES ('Fictif', 'Usurpé', '{"consentementObtenu": true}', 'bbbbbbbb-0000-4000-8000-000000000002');
  EXCEPTION WHEN insufficient_privilege THEN
    RETURN;
  END;
  IF EXISTS (SELECT 1 FROM public.participants WHERE prenom = 'Usurpé' AND praticien_id = 'bbbbbbbb-0000-4000-8000-000000000002') THEN
    RAISE EXCEPTION 'Contrôle 4 : A a créé un bénéficiaire rattaché à B.';
  END IF;
END $$;
ROLLBACK;

-- 5. Garde-fou RGPD : pas de bénéficiaire sans consentement.
BEGIN;
SELECT pg_temp.jeton('authenticated', 'aaaaaaaa-0000-4000-8000-000000000001');
DO $$
BEGIN
  BEGIN
    INSERT INTO public.participants (nom, prenom) VALUES ('Fictif', 'Sans-consentement');
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'Consentement RGPD requis%' THEN RETURN; END IF;
    RAISE;
  END;
  RAISE EXCEPTION 'Contrôle 5 : un bénéficiaire a été créé sans consentement RGPD.';
END $$;
ROLLBACK;

-- 6. Sans jeton (rôle anon), aucune ligne n'est lisible et rien ne s'écrit.
BEGIN;
SELECT pg_temp.jeton('anon', NULL);
DO $$
DECLARE n int;
BEGIN
  BEGIN
    SELECT count(*) INTO n FROM public.participants;
  EXCEPTION WHEN insufficient_privilege THEN
    n := 0;
  END;
  IF n <> 0 THEN RAISE EXCEPTION 'Contrôle 6 : le rôle anon lit % bénéficiaire(s).', n; END IF;
  BEGIN
    INSERT INTO public.participants (nom, prenom, rgpd) VALUES ('Fictif', 'Anonyme', '{"consentementObtenu": true}');
  EXCEPTION WHEN OTHERS THEN
    RETURN;
  END;
  RAISE EXCEPTION 'Contrôle 6 : le rôle anon a créé un bénéficiaire.';
END $$;
ROLLBACK;

-- 7. Le rôle serveur (routes api/) voit tout : c'est le code des routes qui filtre.
BEGIN;
SELECT pg_temp.jeton('service_role', NULL);
DO $$
BEGIN
  IF (SELECT count(*) FROM public.participants) <> 2 THEN
    RAISE EXCEPTION 'Contrôle 7 : service_role ne voit pas les deux bénéficiaires.';
  END IF;
END $$;
COMMIT;

-- 8. Toutes les tables de public ont la RLS activée.
DO $$
DECLARE sans text;
BEGIN
  SELECT string_agg(tablename, ', ') INTO sans FROM pg_tables WHERE schemaname = 'public' AND NOT rowsecurity;
  IF sans IS NOT NULL THEN RAISE EXCEPTION 'Contrôle 8 : tables sans RLS : %', sans; END IF;
END $$;

\echo '    8 contrôles passés'
