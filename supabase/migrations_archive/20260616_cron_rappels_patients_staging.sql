-- ============================================================================
-- 20260616_cron_rappels_patients_staging.sql
-- ============================================================================
--
-- Variante de 20260616_cron_rappels_patients.sql pour le projet Supabase de
-- STAGING (voir GUIDE_STAGING.md). Seule différence : le job pg_cron est
-- nommé `rappels-patients-horaire-staging` (au lieu de
-- `rappels-patients-horaire`), pour qu'il ne puisse jamais entrer en conflit
-- avec le job de production, même si — par erreur — les deux scripts étaient
-- un jour exécutés sur le même projet.
--
-- ⚠️ Ce script est OPTIONNEL pour staging : le reste de l'application
-- fonctionne sans (les rappels automatiques ne sont simplement jamais
-- envoyés). Ne l'exécute que si tu veux tester spécifiquement la
-- fonctionnalité "rappels automatiques" (notifications push) sur staging.
--
-- ⚠️ AVANT D'EXÉCUTER CE SCRIPT, REMPLACER :
--   - <VOTRE_URL_VERCEL>   par l'URL de votre déploiement de PREVIEW (ex :
--                          https://mouvtrack-xxxxx.vercel.app)
--   - <VOTRE_CRON_SECRET>  par un secret DÉDIÉ au staging — DIFFÉRENT de la
--                          valeur CRON_SECRET configurée pour la production
--                          (configure-le sur Vercel, en Preview uniquement).
--
-- Voir RAPPORT_RAPPELS.md pour la procédure pas-à-pas complète (génération du
-- secret, configuration Vercel, exécution de ce script dans le SQL Editor de
-- Supabase).
--
-- Ce script est IDEMPOTENT : il peut être ré-exécuté après avoir changé
-- l'URL ou le secret (le job précédent du même nom est supprimé puis
-- recréé).

-- ----------------------------------------------------------------------------
-- 1. Extensions nécessaires (pg_cron pour la planification, pg_net pour les
--    appels HTTP). Sur Supabase, elles sont généralement déjà activées, mais
--    on s'en assure.
-- ----------------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ----------------------------------------------------------------------------
-- 2. Supprime l'éventuel job précédent du même nom (permet de relancer ce
--    script après une modification de l'URL ou du secret).
-- ----------------------------------------------------------------------------

DO $$
DECLARE
  v_jobid BIGINT;
BEGIN
  SELECT jobid INTO v_jobid FROM cron.job WHERE jobname = 'rappels-patients-horaire-staging';
  IF v_jobid IS NOT NULL THEN
    PERFORM cron.unschedule(v_jobid);
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 3. Programme l'appel HTTP toutes les heures, à la minute 5
--    (00h05, 01h05, 02h05, ...).
-- ----------------------------------------------------------------------------

SELECT cron.schedule(
  'rappels-patients-horaire-staging',
  '5 * * * *',
  $cron$
  SELECT net.http_post(
    url     := '<VOTRE_URL_VERCEL>/api/cron/rappels',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', '<VOTRE_CRON_SECRET>'
    ),
    body    := '{}'::jsonb
  );
  $cron$
);

-- ----------------------------------------------------------------------------
-- Vérifications utiles (à exécuter séparément, après mise en place) :
--
--   -- Le job est bien programmé :
--   SELECT jobid, jobname, schedule, active FROM cron.job;
--
--   -- Historique des dernières exécutions (succès/erreurs) :
--   SELECT * FROM cron.job_run_details
--   WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'rappels-patients-horaire-staging')
--   ORDER BY start_time DESC LIMIT 20;
-- ----------------------------------------------------------------------------
