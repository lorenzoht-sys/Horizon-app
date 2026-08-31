-- VERIFICATION du trigger de role par defaut — lecture seule.
-- Les 6 lignes doivent toutes afficher OK.
--
-- UNE SEULE requete par fichier : staging-query.ts fait `const { rows } =
-- await client.query(sql)`, et `pg` renvoie un TABLEAU de resultats des
-- qu'il y a plusieurs instructions — `rows` vaut alors undefined et le
-- script affiche `undefined` sans erreur. La lecture de la population admin
-- vit donc dans roles_admins.lecture.sql.
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
  -- Le controle 6 comptait les admins et attendait '0' (« aucun a ce stade »).
  -- C'etait un INSTANTANE, pas un invariant : il est devenu faux le 2026-08-31,
  -- a la creation du premier admin de production, et serait sorti en ECHEC pour
  -- une bonne raison. Remplace par ce qui doit rester vrai a jamais : le trigger
  -- n'attribue que 'praticien', donc aucun role inconnu ne doit apparaitre. Un
  -- admin se nomme a la main, et se relit dans la requete informative en bas.
  UNION ALL SELECT 6, 'roles inattendus (ni admin ni praticien)',
         (SELECT count(*)::text FROM public.user_roles
           WHERE app_role NOT IN ('admin','praticien')), '0'
)) t
ORDER BY n;
