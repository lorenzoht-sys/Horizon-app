-- ============================================================================
-- 20260911_cron_renouveler_contrats.sql
-- ============================================================================
--
-- Programme un job pg_cron qui appelle, une fois par jour, l'endpoint
-- /api/cron/renouveler-contrats (voir api/cron/renouveler-contrats.ts) pour
-- prolonger automatiquement et silencieusement les contrats à durée
-- indéterminée dont l'échéance approche.
--
-- ⚠️ AVANT D'EXÉCUTER CE SCRIPT, REMPLACER :
--   - <VOTRE_URL_VERCEL>   par l'URL de votre déploiement (ex :
--                          https://horizon-app.vercel.app)
--   - <VOTRE_CRON_SECRET>  par la MÊME valeur que la variable d'environnement
--                          CRON_SECRET configurée sur Vercel (le même secret
--                          que celui utilisé par le job "rappels-patients-horaire",
--                          voir 20260616_cron_rappels_patients.sql).
--
-- Ce script est IDEMPOTENT : il peut être ré-exécuté après avoir changé
-- l'URL ou le secret (le job précédent du même nom est supprimé puis
-- recréé).

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ----------------------------------------------------------------------------
-- Supprime l'éventuel job précédent du même nom (permet de relancer ce
-- script après une modification de l'URL ou du secret).
-- ----------------------------------------------------------------------------

DO $$
DECLARE
  v_jobid BIGINT;
BEGIN
  SELECT jobid INTO v_jobid FROM cron.job WHERE jobname = 'renouveler-contrats-quotidien';
  IF v_jobid IS NOT NULL THEN
    PERFORM cron.unschedule(v_jobid);
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- Programme l'appel HTTP une fois par jour à 03h15 — en dehors des heures
-- d'utilisation de Pierre, et décalé du job de rappels (5 * * * *) pour ne
-- jamais les faire tourner à la même minute.
-- ----------------------------------------------------------------------------

SELECT cron.schedule(
  'renouveler-contrats-quotidien',
  '15 3 * * *',
  $cron$
  SELECT net.http_post(
    url     := '<VOTRE_URL_VERCEL>/api/cron/renouveler-contrats',
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
--   WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'renouveler-contrats-quotidien')
--   ORDER BY start_time DESC LIMIT 20;
-- ----------------------------------------------------------------------------
