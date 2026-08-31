-- CONTRE-EPREUVE du backfill messagePierre -> messagePraticien.
-- Sans risque par construction : se termine TOUJOURS par une exception, donc
-- la transaction est annulee et les participants de test ne sont jamais
-- conserves. Le rapport EST le message d'erreur.
--
-- ── Ce qu'on exerce, et pourquoi ────────────────────────────────────────
-- La verification lit un etat ; elle ne dit pas si le backfill TRADUIT bien.
-- Le seul defaut qui compte ici est silencieux : une ligne portant
-- `messagePierre: false` — un praticien a masque son message — qui ressortirait
-- avec `messagePraticien: true`. Le message deviendrait visible pour le
-- beneficiaire, sans erreur, sans trace, et personne ne le saurait.
--
-- On rejoue donc les TROIS etats de depart possibles, en verifiant a chaque
-- fois que la valeur obtenue est celle que le code produit AUJOURD'HUI :
--   messagePierre = false  -> messagePraticien = false  (masque reste masque)
--   messagePierre = true   -> messagePraticien = true
--   cle absente            -> messagePraticien = true   (le code lit le
--                                                        defaut VISIBILITE_DEFAULT)
DO $verif$
DECLARE
  id_masque  uuid := gen_random_uuid();
  id_visible uuid := gen_random_uuid();
  id_absent  uuid := gen_random_uuid();
  v_masque   jsonb;
  v_visible  jsonb;
  v_absent   jsonb;
  verdict    text;
BEGIN
  INSERT INTO public.participants (id, nom, prenom, visibilite_beneficiaire) VALUES
    (id_masque,  'CONTRE-EPREUVE', 'masque',
     '{"progression": true, "bilans": true, "messagePierre": false}'::jsonb),
    (id_visible, 'CONTRE-EPREUVE', 'visible',
     '{"progression": true, "bilans": true, "messagePierre": true}'::jsonb),
    (id_absent,  'CONTRE-EPREUVE', 'absent',
     '{"progression": true, "bilans": true}'::jsonb);

  -- Exactement l'instruction de la migration.
  UPDATE public.participants
     SET visibilite_beneficiaire =
         visibilite_beneficiaire
         || jsonb_build_object(
              'messagePraticien',
              COALESCE(visibilite_beneficiaire -> 'messagePierre', 'true'::jsonb)
            )
   WHERE NOT (visibilite_beneficiaire ? 'messagePraticien');

  SELECT visibilite_beneficiaire -> 'messagePraticien' INTO v_masque
    FROM public.participants WHERE id = id_masque;
  SELECT visibilite_beneficiaire -> 'messagePraticien' INTO v_visible
    FROM public.participants WHERE id = id_visible;
  SELECT visibilite_beneficiaire -> 'messagePraticien' INTO v_absent
    FROM public.participants WHERE id = id_absent;

  verdict := CASE
    WHEN v_masque = 'false'::jsonb
     AND v_visible = 'true'::jsonb
     AND v_absent  = 'true'::jsonb
    THEN '>>> CONFORME <<<'
    ELSE '>>> NON CONFORME <<<'
  END;

  RAISE EXCEPTION
    'CONTRE-EPREUVE (transaction annulee, aucun participant conserve) %  messagePierre=false -> [%] attendu [false] | messagePierre=true -> [%] attendu [true] | cle absente -> [%] attendu [true]',
    verdict,
    COALESCE(v_masque::text,  'ABSENT'),
    COALESCE(v_visible::text, 'ABSENT'),
    COALESCE(v_absent::text,  'ABSENT');
END $verif$;
