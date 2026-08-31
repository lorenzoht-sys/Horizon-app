-- VERIFICATION du renommage messagePierre -> messagePraticien (phase 1).
-- Les 5 lignes doivent toutes afficher OK.
--
-- UNE SEULE requete par fichier : staging-query.ts fait `const { rows } =
-- await client.query(sql)`, et pg renvoie un TABLEAU de resultats des qu'il y
-- a plusieurs instructions — `rows` vaut alors undefined et le script affiche
-- `undefined`, sans erreur.
--
-- Le controle 2 peut surprendre : il exige que l'ANCIENNE cle soit TOUJOURS
-- la. C'est le coeur de la phase 1 — la supprimer maintenant ferait
-- reapparaitre, pendant la fenetre de deploiement, des messages que des
-- praticiens avaient masques. La phase 2 aura sa propre verification, qui
-- exigera l'inverse.
SELECT n, controle, constate, attendu,
       CASE WHEN constate = attendu THEN 'OK' ELSE '### ECHEC ###' END AS verdict
  FROM ((
  SELECT 1 AS n, 'le DEFAULT porte messagePraticien' AS controle,
         (SELECT (position('messagePraticien' in COALESCE(column_default,'')) > 0)::text
            FROM information_schema.columns
           WHERE table_schema='public' AND table_name='participants'
             AND column_name='visibilite_beneficiaire') AS constate,
         'true' AS attendu
  UNION ALL SELECT 2, 'le DEFAULT porte ENCORE messagePierre (phase 1)',
         (SELECT (position('messagePierre' in COALESCE(column_default,'')) > 0)::text
            FROM information_schema.columns
           WHERE table_schema='public' AND table_name='participants'
             AND column_name='visibilite_beneficiaire'), 'true'
  UNION ALL SELECT 3, 'lignes sans messagePraticien',
         (SELECT count(*)::text FROM public.participants
           WHERE NOT (visibilite_beneficiaire ? 'messagePraticien')), '0'
  -- Le controle qui compte vraiment : le backfill ne doit avoir CHANGE aucun
  -- comportement, seulement duplique une valeur sous un autre nom.
  UNION ALL SELECT 4, 'lignes ou les deux cles divergent',
         (SELECT count(*)::text FROM public.participants
           WHERE visibilite_beneficiaire ? 'messagePierre'
             AND (visibilite_beneficiaire -> 'messagePierre')
                 IS DISTINCT FROM (visibilite_beneficiaire -> 'messagePraticien')), '0'
  -- Une ligne sans aucune des deux cles serait lue « visible » par les deux
  -- versions du code : coherent, mais ca signalerait un backfill incomplet.
  UNION ALL SELECT 5, 'lignes sans aucune des deux cles',
         (SELECT count(*)::text FROM public.participants
           WHERE NOT (visibilite_beneficiaire ? 'messagePraticien')
             AND NOT (visibilite_beneficiaire ? 'messagePierre')), '0'
)) t
ORDER BY n;
