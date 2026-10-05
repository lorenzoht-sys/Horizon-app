-- ============================================================================
-- 20260913_rgpd_consentement_creation.sql
-- ============================================================================
--
-- Refuse, EN BASE, la création d'un bénéficiaire sans consentement RGPD.
--
-- ── Pourquoi ─────────────────────────────────────────────────────────────
-- Constaté le 2026-09-13 : 7 fiches de production sans consentement, toutes
-- avec un objet `rgpd` complet à false, `methodeConsentement: "oral_note"` et
-- `consentementDate` égale au jour de création — l'état initial du formulaire
-- complet, enregistré sans que rien ne soit coché. Le formulaire affichait un
-- avertissement mais ne bloquait rien. Le formulaire mobile et l'import Excel
-- écrivaient `rgpd = null`.
--
-- Les trois chemins sont désormais bloquants côté application
-- (src/lib/consentementRgpd.ts). Ce trigger garantit la règle quel que soit
-- le chemin : navigateur, Studio, script, service_role.
--
-- ── ORDRE D'APPLICATION : APRÈS le déploiement du code, jamais avant ─────
-- C'est l'INVERSE de la règle habituelle (« migration en production AVANT le
-- merge », docs/PLAN-BETA.md), et c'est voulu : ici, ce n'est pas le code qui
-- dépend de la migration, c'est la migration qui dépend du code. Appliquée
-- avant le déploiement, elle rejetterait TOUTES les créations du formulaire
-- mobile et de l'import Excel en production (ils écrivent `rgpd = null`)
-- jusqu'au merge. Le nouveau code, lui, fonctionne avec ou sans ce trigger.
--   1. Merger le code, attendre la fin du déploiement Vercel de production.
--   2. Appliquer en production, puis vérification et contre-épreuve SÉPARÉES
--      (requêtes dans docs/PLAN-BETA.md, section RGPD).
--   3. Appliquer sur staging, puis relancer le harnais.
--
-- ── Pourquoi un trigger BEFORE INSERT et PAS une contrainte CHECK NOT VALID
-- `NOT VALID` ne dispense que de la vérification initiale des lignes
-- existantes : la contrainte est ensuite contrôlée à CHAQUE INSERT ET UPDATE.
-- Toute modification d'une fiche sans consentement (les 7, et toutes celles à
-- `rgpd = null`) serait refusée — y compris le géocodage automatique
-- (`update({ coordonnees_lat })`) et l'archivage. Or la décision est :
-- bloquant à la création, modification possible. Seul un trigger limité à
-- INSERT l'exprime.
--
-- ── Le cas de l'upsert ───────────────────────────────────────────────────
-- `INSERT … ON CONFLICT DO UPDATE` déclenche les triggers BEFORE INSERT même
-- quand la ligne existe. La restauration JSON (SettingsPage.tsx) fait un
-- upsert : sans l'exception ci-dessous, restaurer une fiche EXISTANTE sans
-- consentement serait refusé alors que c'est une modification. Une ligne dont
-- l'id existe déjà n'est donc pas une création. Recréer une fiche supprimée
-- reste une création, et exige le consentement.
--
-- SECURITY INVOKER (défaut) : l'EXISTS voit ce que l'appelant voit (RLS). Une
-- ligne d'un autre praticien, invisible, est traitée comme une création — et
-- l'upsert serait de toute façon refusé par la RLS.
--
-- ── Délimiteurs nommés ($fn$, $verif$) : jamais de $$ nu ─────────────────
-- Voir docs/PLAN-BETA.md : le SQL Editor injecte parfois du texte dans le
-- script collé, ce qui casse un `$$` nu en silence.
--
-- ── ROLLBACK ────────────────────────────────────────────────────────────
--   DROP TRIGGER IF EXISTS trg_participants_consentement_rgpd_creation ON public.participants;
--   DROP FUNCTION IF EXISTS public.exiger_consentement_rgpd_creation();
--
-- ============================================================================

CREATE OR REPLACE FUNCTION public.exiger_consentement_rgpd_creation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $fn$
BEGIN
  -- Seul le booléen JSON true vaut consentement.
  IF NEW.rgpd IS NOT NULL AND jsonb_typeof(NEW.rgpd -> 'consentementObtenu') = 'boolean'
     AND (NEW.rgpd ->> 'consentementObtenu')::boolean THEN
    RETURN NEW;
  END IF;

  -- Upsert d'une fiche existante : modification, pas création.
  IF EXISTS (SELECT 1 FROM public.participants p WHERE p.id = NEW.id) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Consentement RGPD requis pour créer un bénéficiaire (rgpd.consentementObtenu doit valoir true)'
    USING ERRCODE = 'check_violation';
END;
$fn$;

COMMENT ON FUNCTION public.exiger_consentement_rgpd_creation() IS
  'Refuse la création d''un bénéficiaire sans rgpd.consentementObtenu = true. '
  'INSERT seulement : une fiche existante sans consentement reste modifiable. '
  'Voir 20260913_rgpd_consentement_creation.sql.';

-- Même règle que 20260829_roles_02 : la production accorde EXECUTE à `anon`
-- nommément sur toute nouvelle fonction de `public`. Un trigger se déclenche
-- sans que l'appelant détienne EXECUTE : on le retire à tout le monde.
REVOKE EXECUTE ON FUNCTION public.exiger_consentement_rgpd_creation() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.exiger_consentement_rgpd_creation() FROM anon;
REVOKE EXECUTE ON FUNCTION public.exiger_consentement_rgpd_creation() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.exiger_consentement_rgpd_creation() FROM service_role;

DROP TRIGGER IF EXISTS trg_participants_consentement_rgpd_creation ON public.participants;
CREATE TRIGGER trg_participants_consentement_rgpd_creation
  BEFORE INSERT ON public.participants
  FOR EACH ROW EXECUTE FUNCTION public.exiger_consentement_rgpd_creation();

-- ── Auto-vérification ───────────────────────────────────────────────────
-- Elle ne remplace PAS la vérification et la contre-épreuve séparées : si ce
-- script n'a pas été exécuté, ce bloc non plus.
--
-- Les écritures d'essai sont annulées : les refus ne créent rien, et le bloc
-- des cas autorisés se termine par une exception volontaire (SQLSTATE ZX001)
-- rattrapée localement, qui annule tout ce qu'il a écrit.
DO $verif$
DECLARE
  v_type_trigger    int;
  execute_fonction  text;
  v_id              uuid;
BEGIN
  SELECT t.tgtype INTO v_type_trigger
    FROM pg_trigger t
   WHERE t.tgrelid = 'public.participants'::regclass
     AND t.tgname = 'trg_participants_consentement_rgpd_creation'
     AND NOT t.tgisinternal;
  IF v_type_trigger IS NULL THEN
    RAISE EXCEPTION 'Echec verification : trigger trg_participants_consentement_rgpd_creation absent';
  END IF;
  -- tgtype = ROW (1) + BEFORE (2) + INSERT (4) = 7 : ni UPDATE, ni DELETE.
  IF v_type_trigger <> 7 THEN
    RAISE EXCEPTION 'Echec verification : tgtype = %, attendu 7 (BEFORE INSERT FOR EACH ROW)', v_type_trigger;
  END IF;

  SELECT string_agg(g, ', ' ORDER BY g) INTO execute_fonction
    FROM (
      SELECT CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE a.grantee::regrole::text END AS g
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
       WHERE n.nspname = 'public'
         AND p.proname = 'exiger_consentement_rgpd_creation'
         AND a.privilege_type = 'EXECUTE'
         AND a.grantee <> p.proowner
    ) x;
  IF execute_fonction IS NOT NULL THEN
    RAISE EXCEPTION 'Echec verification : exiger_consentement_rgpd_creation() executable par [%], attendu par personne',
      execute_fonction;
  END IF;

  -- Refus attendus.
  BEGIN
    INSERT INTO public.participants (nom, prenom) VALUES ('__verif_rgpd__', 'sans_rgpd');
    RAISE EXCEPTION 'Echec verification : une creation avec rgpd = null a ete acceptee';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO public.participants (nom, prenom, rgpd)
    VALUES ('__verif_rgpd__', 'consentement_false', '{"consentementObtenu": false}'::jsonb);
    RAISE EXCEPTION 'Echec verification : une creation avec consentementObtenu = false a ete acceptee';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- Cas autorisés, puis annulation.
  BEGIN
    INSERT INTO public.participants (nom, prenom, rgpd)
    VALUES ('__verif_rgpd__', 'consentement_true', '{"consentementObtenu": true}'::jsonb)
    RETURNING id INTO v_id;
    -- Fiche existante devenue sans consentement : UPDATE et upsert autorisés.
    UPDATE public.participants SET rgpd = NULL WHERE id = v_id;
    UPDATE public.participants SET telephone = '0000000000' WHERE id = v_id;
    INSERT INTO public.participants (id, nom, prenom, rgpd)
    VALUES (v_id, '__verif_rgpd__', 'upsert_existant', NULL)
    ON CONFLICT (id) DO UPDATE SET prenom = EXCLUDED.prenom;
    RAISE EXCEPTION USING ERRCODE = 'ZX001', MESSAGE = 'annulation volontaire des ecritures de verification';
  EXCEPTION
    WHEN SQLSTATE 'ZX001' THEN NULL;
    WHEN check_violation THEN
      RAISE EXCEPTION 'Echec verification : un cas autorise a ete refuse (%)', SQLERRM;
  END;
END
$verif$;
