-- ============================================================================
-- 20260616_cron_rappels_patients.sql
-- ============================================================================
--
-- Programme un job pg_cron qui appelle, toutes les heures, l'endpoint
-- /api/cron/rappels (voir api/cron/rappels.ts) pour envoyer les rappels de
-- séance et les relances d'exercices aux patients.
--
-- ⚠️ AVANT D'EXÉCUTER CE SCRIPT, REMPLACER :
--   - <VOTRE_URL_VERCEL>   par l'URL de votre déploiement (ex :
--                          https://horizon-app.vercel.app)
--   - <VOTRE_CRON_SECRET>  par la MÊME valeur que la variable d'environnement
--                          CRON_SECRET configurée sur Vercel.
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
  SELECT jobid INTO v_jobid FROM cron.job WHERE jobname = 'rappels-patients-horaire';
  IF v_jobid IS NOT NULL THEN
    PERFORM cron.unschedule(v_jobid);
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 3. Programme l'appel HTTP toutes les heures, à la minute 5
--    (00h05, 01h05, 02h05, ...).
-- ----------------------------------------------------------------------------

SELECT cron.schedule(
  'rappels-patients-horaire',
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
--   WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'rappels-patients-horaire')
--   ORDER BY start_time DESC LIMIT 20;
-- ----------------------------------------------------------------------------
