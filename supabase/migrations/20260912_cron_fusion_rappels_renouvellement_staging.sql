-- ============================================================================
-- 20260912_cron_fusion_rappels_renouvellement_staging.sql
-- ============================================================================
--
-- Variante de 20260912_cron_fusion_rappels_renouvellement.sql pour le projet
-- Supabase de STAGING (voir GUIDE_STAGING.md). Seule différence : le job
-- pg_cron est nommé `rappels-patients-horaire-staging`, comme dans
-- 20260616_cron_rappels_patients_staging.sql, pour qu'il ne puisse jamais
-- entrer en conflit avec celui de production.
--
-- ⚠️ Ce script est OPTIONNEL pour staging, exactement comme celui dont il
-- dérive : sans lui, ni les rappels ni le renouvellement ne tournent
-- automatiquement sur staging, et le reste de l'application fonctionne
-- normalement. Ne l'exécute que si le job de staging a été mis en place.
--
-- Note : il n'a jamais existé de job de renouvellement dédié au staging
-- (20260911_cron_renouveler_contrats.sql n'a pas de variante _staging). Le
-- bloc de suppression ci-dessous est donc là par sécurité — il ne trouvera
-- probablement rien, et c'est sans conséquence.
--
-- ⚠️ AVANT D'EXÉCUTER CE SCRIPT, REMPLACER :
--   - <VOTRE_URL_VERCEL>   par l'URL de votre déploiement de PREVIEW (ex :
--                          https://mouvtrack-xxxxx.vercel.app)
--   - <VOTRE_CRON_SECRET>  par le secret DÉDIÉ au staging — DIFFÉRENT de la
--                          valeur CRON_SECRET de production.
--
-- Ce script est IDEMPOTENT : il peut être ré-exécuté sans risque.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ----------------------------------------------------------------------------
-- 1. Supprime un éventuel job de renouvellement de staging (par sécurité).
-- ----------------------------------------------------------------------------

DO $$
DECLARE
  v_jobid BIGINT;
BEGIN
  SELECT jobid INTO v_jobid FROM cron.job WHERE jobname = 'renouveler-contrats-quotidien-staging';
  IF v_jobid IS NOT NULL THEN
    PERFORM cron.unschedule(v_jobid);
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 2. Reprogramme le job horaire unique à la minute 15 (voir le script de
--    production pour le pourquoi du 05 → 15).
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

SELECT cron.schedule(
  'rappels-patients-horaire-staging',
  '15 * * * *',
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
--   SELECT jobid, jobname, schedule, active FROM cron.job;
--   -- Attendu : 'rappels-patients-horaire-staging' | '15 * * * *' | t
--
--   SELECT * FROM cron.job_run_details
--   WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'rappels-patients-horaire-staging')
--   ORDER BY start_time DESC LIMIT 20;
-- ----------------------------------------------------------------------------
