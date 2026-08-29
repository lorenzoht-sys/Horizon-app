-- VERIFICATION du trigger de role par defaut — lecture seule.
-- Les 6 lignes doivent toutes afficher OK.
SELECT n, controle, constate, attendu,
       CASE WHEN constate = attendu THEN 'OK' ELSE '### ECHEC ###' END AS verdict
  FROM ((
  SELECT 1 AS n, 'trigger present sur auth.users' AS controle,
         (SELECT count(*)::text FROM pg_trigger
           WHERE tgrelid='auth.users'::regclass
             AND tgname='trg_auth_users_role_par_defaut' AND NOT tgisinternal) AS constate,
         '1' AS attendu
  UNION ALL SELECT 2, 'fonction en SECURITY DEFINER',
         (SELECT p.prosecdef::text FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
           WHERE n.nspname='public' AND p.proname='attribuer_role_par_defaut'), 'true'
  UNION ALL SELECT 3, 'search_path fige sur la fonction',
         (SELECT (p.proconfig @> ARRAY['search_path=public'])::text
            FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
           WHERE n.nspname='public' AND p.proname='attribuer_role_par_defaut'), 'true'
  UNION ALL SELECT 4, 'qui peut EXECUTER la fonction (hors proprietaire)',
         COALESCE((SELECT string_agg(CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE a.grantee::regrole::text END, ', ' ORDER BY 1)
            FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
            CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
           WHERE n.nspname='public' AND p.proname='attribuer_role_par_defaut'
             AND a.privilege_type='EXECUTE' AND a.grantee <> p.proowner), 'personne'), 'personne'
  UNION ALL SELECT 5, 'comptes auth.users sans role',
         (SELECT count(*)::text FROM auth.users u
            LEFT JOIN public.user_roles r ON r.user_id=u.id WHERE r.user_id IS NULL), '0'
  UNION ALL SELECT 6, 'comptes admin existants (aucun a ce stade)',
         (SELECT count(*)::text FROM public.user_roles WHERE app_role='admin'), '0'
)) t
ORDER BY n;
