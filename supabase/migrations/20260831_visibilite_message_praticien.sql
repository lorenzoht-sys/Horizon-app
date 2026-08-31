-- Renomme la cle `messagePierre` de participants.visibilite_beneficiaire en
-- `messagePraticien`. Etape 6 : retrait de l'identite du premier utilisateur.
--
-- ── Ce que cette cle commande ───────────────────────────────────────────
-- Elle decide si le message laisse par le praticien est transmis au
-- beneficiaire. Cote serveur, api/patient/me.ts met `message_beneficiaire` a
-- NULL quand elle est fausse — le champ n'atteint jamais le navigateur. Se
-- tromper ici ne casse rien de visible : ca fait DISPARAITRE un message chez
-- tous les patients, ou APPARAITRE un message qui avait ete masque. Les deux
-- sont silencieux.
--
-- ── Pourquoi les DEUX cles coexistent apres cette migration ─────────────
-- La regle du projet est d'appliquer la migration en production AVANT le
-- merge. Entre cet instant et le deploiement du nouveau code, c'est donc
-- l'ANCIEN code qui tourne sur les NOUVELLES donnees. S'il ne trouvait plus
-- `messagePierre`, `{ ...VISIBILITE_DEFAULT, ...ligne }` lui rendrait le
-- defaut `true` : tout message masque redeviendrait visible, pendant toute la
-- fenetre de deploiement, sans la moindre erreur.
--
-- Cette migration AJOUTE donc `messagePraticien` et CONSERVE `messagePierre`.
-- Aucune des deux versions du code ne lit une cle absente, quel que soit
-- l'ordre. La suppression de l'ancienne cle fait l'objet d'une migration
-- SEPAREE, a appliquer une fois le nouveau code deploye et verifie.
--
-- ── La valeur de repli est `true`, et ce n'est pas arbitraire ───────────
-- Le code lit `{ ...VISIBILITE_DEFAULT, ...ligne }`, et VISIBILITE_DEFAULT
-- porte `messagePierre: true`. Une ligne SANS la cle vaut donc « visible »
-- aujourd'hui. Backfiller ces lignes a `true` preserve le comportement exact ;
-- les backfiller a `false` masquerait des messages actuellement affiches.

-- ----------------------------------------------------------------------------
-- 1. Le DEFAULT de la colonne porte desormais les deux cles.
-- ----------------------------------------------------------------------------
ALTER TABLE public.participants
  ALTER COLUMN visibilite_beneficiaire
  SET DEFAULT '{"progression": true, "bilans": true, "rdv": true, "programme": true, "carteSante": true, "messagePierre": true, "messagePraticien": true}'::jsonb;

-- ----------------------------------------------------------------------------
-- 2. Backfill : toute ligne recoit `messagePraticien`, avec la valeur que le
--    code lui attribue AUJOURD'HUI.
-- ----------------------------------------------------------------------------
UPDATE public.participants
   SET visibilite_beneficiaire =
       visibilite_beneficiaire
       || jsonb_build_object(
            'messagePraticien',
            COALESCE(visibilite_beneficiaire -> 'messagePierre', 'true'::jsonb)
          )
 WHERE NOT (visibilite_beneficiaire ? 'messagePraticien');

-- ----------------------------------------------------------------------------
-- 3. Verification immediate. Un « Success » du SQL Editor ne prouve rien :
--    on echoue bruyamment plutot que de laisser passer une migration inerte.
-- ----------------------------------------------------------------------------
DO $migration$
DECLARE
  defaut_col      text;
  sans_nouvelle   int;
  divergentes     int;
BEGIN
  SELECT column_default INTO defaut_col
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name   = 'participants'
     AND column_name  = 'visibilite_beneficiaire';

  IF defaut_col IS NULL OR position('messagePraticien' in defaut_col) = 0 THEN
    RAISE EXCEPTION 'Echec verification : le DEFAULT ne porte pas messagePraticien (valeur = %)', defaut_col;
  END IF;

  IF position('messagePierre' in defaut_col) = 0 THEN
    RAISE EXCEPTION 'Echec verification : le DEFAULT a perdu messagePierre, que la phase 1 doit CONSERVER (valeur = %)', defaut_col;
  END IF;

  SELECT count(*) INTO sans_nouvelle
    FROM public.participants
   WHERE NOT (visibilite_beneficiaire ? 'messagePraticien');
  IF sans_nouvelle > 0 THEN
    RAISE EXCEPTION 'Echec verification : % ligne(s) sans messagePraticien apres backfill', sans_nouvelle;
  END IF;

  -- Une divergence signifierait que le backfill a change un comportement.
  SELECT count(*) INTO divergentes
    FROM public.participants
   WHERE visibilite_beneficiaire ? 'messagePierre'
     AND (visibilite_beneficiaire -> 'messagePierre')
         IS DISTINCT FROM (visibilite_beneficiaire -> 'messagePraticien');
  IF divergentes > 0 THEN
    RAISE EXCEPTION 'Echec verification : % ligne(s) ou les deux cles divergent', divergentes;
  END IF;
END $migration$;

NOTIFY pgrst, 'reload schema';
