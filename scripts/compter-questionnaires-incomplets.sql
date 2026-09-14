-- Partage entre questionnaires complets et incomplets (Ricci & Gagnon, FSS).
--
-- Sert à décider du sort des scores déjà en base, calculés avant le
-- 2026-09-14 avec une logique qui comptait les réponses manquantes comme des
-- zéros (Ricci & Gagnon) ou les ignorait (FSS). Voir src/lib/scoresAutonomie.ts.
--
-- Lecture seule. Usage :
--   npx tsx scripts/staging-query.ts --file scripts/compter-questionnaires-incomplets.sql
--
-- --file et non un argument en ligne de commande : sous Windows les sauts de
-- ligne sont aplatis, et ce fichier commençant par `--`, la requête entière
-- se retrouverait commentée et renverrait [] sans erreur (piège documenté en
-- en-tête de staging-query.ts).

SELECT
  -- 1 & 2. Volume total de scores stockés, par instrument.
  count(*) FILTER (WHERE sedentarite_score IS NOT NULL)              AS sed_total,
  count(*) FILTER (WHERE fatigue_score IS NOT NULL)                  AS fss_total,

  -- 3 & 4. Ceux dont les réponses brutes sont présentes, donc recalculables
  -- sans rien redemander au bénéficiaire.
  count(*) FILTER (WHERE sedentarite_score IS NOT NULL
                     AND sedentarite_reponses IS NOT NULL)           AS sed_recalculables,
  count(*) FILTER (WHERE fatigue_score IS NOT NULL
                     AND fatigue_reponses IS NOT NULL)               AS fss_recalculables,

  -- Parmi eux, ceux réellement faux : questionnaire entamé mais incomplet.
  -- b_freq / b_duree / b_effort ne sont exigés que des pratiquants, l'interface
  -- les masquant aux autres — mêmes items requis que itemsSedRequis().
  count(*) FILTER (
    WHERE sedentarite_reponses IS NOT NULL
      AND (sedentarite_reponses->>'a_sedentarite' IS NULL
        OR sedentarite_reponses->>'b_pratique'    IS NULL
        OR sedentarite_reponses->>'c_intensite'   IS NULL
        OR sedentarite_reponses->>'c_travaux'     IS NULL
        OR sedentarite_reponses->>'c_marche'      IS NULL
        OR sedentarite_reponses->>'c_etages'      IS NULL
        OR (sedentarite_reponses->>'b_pratique' = 'oui'
            AND (sedentarite_reponses->>'b_freq'   IS NULL
              OR sedentarite_reponses->>'b_duree'  IS NULL
              OR sedentarite_reponses->>'b_effort' IS NULL)))
  )                                                                  AS sed_incomplets,

  count(*) FILTER (
    WHERE fatigue_reponses IS NOT NULL
      AND (SELECT count(*) FROM jsonb_array_elements(fatigue_reponses) e
           WHERE e::text <> 'null') < 9
  )                                                                  AS fss_incomplets,

  -- Scores stockés SANS réponses brutes : ni vérifiables, ni recalculables.
  count(*) FILTER (WHERE sedentarite_score IS NOT NULL
                     AND sedentarite_reponses IS NULL)               AS sed_sans_reponses,
  count(*) FILTER (WHERE fatigue_score IS NOT NULL
                     AND fatigue_reponses IS NULL)                   AS fss_sans_reponses
FROM bilans;
