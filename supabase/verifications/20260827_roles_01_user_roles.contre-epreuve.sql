-- CONTRE-EPREUVE user_roles — sans risque par construction.
-- Se termine TOUJOURS par une exception : la transaction est annulee, aucune
-- ecriture ne peut persister, y compris un TRUNCATE qui reussirait.
-- Le rapport EST le message d'erreur. Lire la ligne « CONTRE-EPREUVE ».
DO $verif$
DECLARE
  sel text; ins text; upd text; del text; tru text; verdict text;
BEGIN
  SET LOCAL ROLE authenticated;

  BEGIN PERFORM 1 FROM public.user_roles LIMIT 1; sel := 'AUTORISE';
  EXCEPTION WHEN insufficient_privilege THEN sel := 'BLOQUE'; END;

  BEGIN INSERT INTO public.user_roles (user_id, app_role) VALUES (gen_random_uuid(),'admin'); ins := 'AUTORISE';
  EXCEPTION WHEN insufficient_privilege THEN ins := 'BLOQUE';
            WHEN others THEN ins := 'AUTORISE/'||SQLSTATE; END;

  BEGIN UPDATE public.user_roles SET app_role='admin'; upd := 'AUTORISE';
  EXCEPTION WHEN insufficient_privilege THEN upd := 'BLOQUE';
            WHEN others THEN upd := 'AUTORISE/'||SQLSTATE; END;

  BEGIN DELETE FROM public.user_roles; del := 'AUTORISE';
  EXCEPTION WHEN insufficient_privilege THEN del := 'BLOQUE';
            WHEN others THEN del := 'AUTORISE/'||SQLSTATE; END;

  BEGIN TRUNCATE public.user_roles; tru := 'AUTORISE';
  EXCEPTION WHEN insufficient_privilege THEN tru := 'BLOQUE';
            WHEN others THEN tru := 'AUTORISE/'||SQLSTATE; END;

  RESET ROLE;

  verdict := CASE WHEN sel='AUTORISE' AND ins='BLOQUE' AND upd='BLOQUE'
                       AND del='BLOQUE' AND tru='BLOQUE'
                  THEN '>>> CONFORME <<<' ELSE '>>> NON CONFORME <<<' END;

  RAISE EXCEPTION 'CONTRE-EPREUVE (transaction annulee, rien ecrit) %  SELECT=% (attendu AUTORISE) | INSERT=% (attendu BLOQUE) | UPDATE=% (attendu BLOQUE) | DELETE=% (attendu BLOQUE) | TRUNCATE=% (attendu BLOQUE)',
    verdict, sel, ins, upd, del, tru;
END $verif$;
