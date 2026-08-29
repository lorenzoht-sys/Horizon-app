-- VERIFICATION user_roles — lecture seule, a lancer apres la migration.
-- Les 9 lignes doivent toutes afficher OK.
WITH acl AS (
  SELECT COALESCE(a.grantee::regrole::text,'PUBLIC') AS role,
         string_agg(a.privilege_type, ',' ORDER BY a.privilege_type) AS privs
    FROM pg_class c
    CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) a
   WHERE c.oid = to_regclass('public.user_roles')
   GROUP BY 1
)
SELECT n, controle, constate, attendu,
       CASE WHEN constate = attendu THEN 'OK' ELSE '### ECHEC ###' END AS verdict
  FROM ((
  SELECT 1 AS n, 'table user_roles existe' AS controle,
         COALESCE(to_regclass('public.user_roles')::text,'ABSENTE') AS constate, 'user_roles' AS attendu
  UNION ALL SELECT 2, 'RLS activee',
         COALESCE((SELECT relrowsecurity FROM pg_class WHERE oid=to_regclass('public.user_roles'))::text,'?'), 'true'
  UNION ALL SELECT 3, 'policies d''ecriture (doit etre 0)',
         (SELECT count(*)::text FROM pg_policies WHERE schemaname='public' AND tablename='user_roles' AND cmd<>'SELECT'), '0'
  UNION ALL SELECT 4, 'privileges de authenticated',
         COALESCE((SELECT privs FROM acl WHERE role='authenticated'),'aucun'), 'SELECT'
  UNION ALL SELECT 5, 'privileges de anon',
         COALESCE((SELECT privs FROM acl WHERE role='anon'),'aucun'), 'aucun'
  UNION ALL SELECT 6, 'privileges de PUBLIC',
         COALESCE((SELECT privs FROM acl WHERE role='PUBLIC'),'aucun'), 'aucun'
  UNION ALL SELECT 7, 'privileges de service_role',
         COALESCE((SELECT privs FROM acl WHERE role='service_role'),'aucun'), 'DELETE,INSERT,SELECT,UPDATE'
  UNION ALL SELECT 8, 'app_role_courant() executable par PUBLIC ou anon',
         (SELECT (count(*)>0)::text FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
            CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
           WHERE n.nspname='public' AND p.proname='app_role_courant'
             AND a.privilege_type='EXECUTE' AND a.grantee IN (0, 'anon'::regrole::oid)), 'false'
  UNION ALL SELECT 9, 'comptes auth.users sans role',
         (SELECT count(*)::text FROM auth.users u LEFT JOIN public.user_roles r ON r.user_id=u.id WHERE r.user_id IS NULL), '0'
)) t
ORDER BY n;
