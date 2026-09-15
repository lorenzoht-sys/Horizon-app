-- ============================================================================
-- 20260912_cron_fusion_rappels_renouvellement.sql
-- ============================================================================
--
-- FUSION DES DEUX JOBS CRON EN UN SEUL.
--
-- Pourquoi : le plan Vercel Hobby plafonne à 12 fonctions serverless.
-- L'ajout de api/cron/renouveler-contrats.ts portait le projet à 13 et
-- faisait échouer le build de staging. Les deux endpoints partageaient déjà
-- le même secret (CRON_SECRET) et le même déclencheur pg_cron : leurs deux
-- traitements sont désormais portés par le seul /api/cron/rappels.
--
-- Ce que fait ce script :
--   1. Supprime le job `renouveler-contrats-quotidien` — l'endpoint
--      /api/cron/renouveler-contrats n'existe plus (il répondrait 404).
--   2. Reprogramme `rappels-patients-horaire` de `5 * * * *` à
--      `15 * * * *`, toujours sur /api/cron/rappels.
--
-- Pourquoi la minute change (05 → 15) : le renouvellement doit continuer à
-- tomber à 03h15 UTC, exactement comme avant la fusion. Comme c'est
-- maintenant le code qui décide de l'heure du renouvellement
-- (HEURE_RENOUVELLEMENT_UTC dans api/_lib/cronTaches.ts, qui ne le déclenche
-- qu'à l'exécution de 3h UTC), c'est le job horaire qui doit passer à la
-- minute 15 pour que cette exécution-là tombe pile à 03h15.
--
-- Les rappels, eux, gardent leur cadence HORAIRE — seule la minute bouge.
-- Aucune logique de rappel n'en dépend (les fenêtres sont à l'échelle de
-- l'heure : rappel_seance_delai_heures, rappel_jour_seance_heure).
--
-- ⚠️ AVANT D'EXÉCUTER CE SCRIPT, REMPLACER :
--   - <VOTRE_URL_VERCEL>   par l'URL de votre déploiement (ex :
--                          https://horizon-app.vercel.app)
--   - <VOTRE_CRON_SECRET>  par la MÊME valeur que la variable
--                          d'environnement CRON_SECRET configurée sur Vercel
--                          (inchangée par la fusion).
--
-- ⚠️ À EXÉCUTER EN MÊME TEMPS QUE LE DÉPLOIEMENT DU CODE FUSIONNÉ. Entre le
-- déploiement et l'exécution de ce script, le job de renouvellement appelle
-- une URL qui n'existe plus : les contrats ne sont pas renouvelés pendant
-- cette fenêtre (les rappels, eux, continuent normalement). Rien n'est perdu
-- définitivement — MARGE_RENOUVELLEMENT_JOURS vaut 5 jours, ce qui laisse
-- de la marge pour rattraper.
--
-- Ce script est IDEMPOTENT : il peut être ré-exécuté sans risque.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ----------------------------------------------------------------------------
-- 1. Supprime le job de renouvellement : son endpoint n'existe plus.
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
-- 2. Reprogramme le job horaire unique à la minute 15.
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

SELECT cron.schedule(
  'rappels-patients-horaire',
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
--   -- Un seul job doit rester, à la minute 15 :
--   SELECT jobid, jobname, schedule, active FROM cron.job;
--   -- Attendu : 'rappels-patients-horaire' | '15 * * * *' | t
--   --           et AUCUNE ligne 'renouveler-contrats-quotidien'.
--
--   -- Historique des dernières exécutions (succès/erreurs) :
--   SELECT * FROM cron.job_run_details
--   WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'rappels-patients-horaire')
--   ORDER BY start_time DESC LIMIT 20;
--
--   -- Le renouvellement n'a plus de job à lui : pour vérifier qu'il tourne
--   -- bien, regarder la réponse de l'exécution de 03h15 UTC — elle contient
--   -- une clé "renouvellement" avec statut 'ok' (les 23 autres exécutions
--   -- de la journée la renvoient avec statut 'ignoree').
-- ----------------------------------------------------------------------------
