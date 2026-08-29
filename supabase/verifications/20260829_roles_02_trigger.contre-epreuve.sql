-- CONTRE-EPREUVE du trigger — sans risque par construction.
-- Se termine TOUJOURS par une exception : la transaction est annulee, le
-- compte de test n'est jamais conserve. Le rapport EST le message d'erreur.
DO $verif$
DECLARE
  id_test   uuid := gen_random_uuid();
  role_cree text;
  verdict   text;
BEGIN
  INSERT INTO auth.users (id, is_sso_user, is_anonymous) VALUES (id_test, false, false);
  SELECT app_role INTO role_cree FROM public.user_roles WHERE user_id = id_test;

  verdict := CASE WHEN role_cree = 'praticien' THEN '>>> CONFORME <<<'
                  ELSE '>>> NON CONFORME <<<' END;

  RAISE EXCEPTION 'CONTRE-EPREUVE (transaction annulee, aucun compte conserve) %  role attribue au nouveau compte = [%], attendu [praticien]',
    verdict, COALESCE(role_cree, 'AUCUN — le trigger ne s''est pas declenche');
END $verif$;
