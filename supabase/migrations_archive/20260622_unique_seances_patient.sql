-- ============================================================================
-- 20260622_unique_seances_patient.sql
-- ============================================================================
--
-- Garde-fou anti-doublon côté base pour la table `seances` (séances
-- encadrées, liées à un contrat) : un patient ne peut pas avoir deux séances
-- pour le même contrat le même jour.
--
-- CONTEXTE : l'audit du planificateur de tournée (AUDIT_OPTIMISATION.md) a
-- identifié que l'anti-doublon actuel (ModalPlanificateur.tsx, fonction
-- existeDeja) ne vit qu'en mémoire JS, sur un snapshot de `seances`
-- potentiellement désynchronisé (onglet ouvert longtemps, 2 appareils,
-- re-soumission). Cette migration ajoute un filet de sécurité au niveau base,
-- même chemin que `seances_patient_no_double_validation_idx`
-- (20260620_seances_autonomes.sql) pour la table `seances_patient`.
--
-- PÉRIMÈTRE DE LA CONTRAINTE : (participant_id, date, contrat_id).
--   - contrat_id est inclus (et pas seulement participant_id + date) : un
--     patient peut légitimement avoir 2 contrats actifs en parallèle (ex:
--     kinésithérapie + suivi général) avec une séance de chacun le même jour.
--     Le doublon anormal, c'est deux séances du MÊME contrat le même jour.
--   - contrat_id est nullable (séances "autonomes" sans contrat) : en SQL,
--     deux valeurs NULL ne sont jamais égales pour une contrainte UNIQUE —
--     les séances sans contrat ne sont donc pas couvertes par cet index.
--     Limite acceptée : le planificateur (src/lib/planificateur.ts) assigne
--     toujours un contratId, ce cas ne concerne pas son périmètre.
--   - DÉVIATION DOCUMENTÉE : l'index est partiel (WHERE statut <> 'annulee'),
--     pour rester cohérent avec la logique applicative actuelle
--     (ModalPlanificateur.tsx: `s.statut !== 'annulee'`) et ne pas bloquer un
--     cas légitime : annuler une séance puis en replanifier une autre le même
--     jour, pour le même contrat (ex: patient annule le matin, créneau
--     reproposé l'après-midi).
--
-- Comme pour seances_patient_no_double_validation_idx, on nettoie d'abord les
-- doublons déjà existants avant de poser l'index unique (sinon sa création
-- échoue si des doublons sont déjà présents en base). Pour chaque groupe en
-- doublon (participant_id, date, contrat_id, hors séances annulées), seule la
-- séance la plus ancienne (created_at, puis id en cas d'égalité) est
-- conservée ; les autres sont supprimées.
--
-- IDEMPOTENTE : la suppression ne retrouve plus rien à supprimer si elle a
-- déjà tourné ; CREATE UNIQUE INDEX IF NOT EXISTS ne fait rien si l'index
-- existe déjà.
-- NE PAS EXÉCUTER SUR PROD sans validation préalable (vérifier le nombre de
-- lignes concernées par le SELECT de contrôle ci-dessous avant le DELETE).
-- ============================================================================

-- 0. Contrôle préalable (à exécuter manuellement avant la migration en prod,
--    pour savoir combien de séances seraient supprimées) :
--
-- SELECT s.id, s.participant_id, s.date, s.contrat_id, s.statut, s.created_at
-- FROM public.seances s
-- WHERE s.contrat_id IS NOT NULL
--   AND s.statut <> 'annulee'
--   AND EXISTS (
--     SELECT 1 FROM public.seances s2
--     WHERE s2.contrat_id = s.contrat_id
--       AND s2.participant_id = s.participant_id
--       AND s2.date = s.date
--       AND s2.statut <> 'annulee'
--       AND s2.id <> s.id
--   )
-- ORDER BY s.participant_id, s.date;

-- 1. Nettoyage des doublons existants — ne conserve que la séance la plus
--    ancienne de chaque groupe (participant_id, date, contrat_id), parmi les
--    séances non annulées.
DELETE FROM public.seances s
WHERE s.contrat_id IS NOT NULL
  AND s.statut <> 'annulee'
  AND EXISTS (
    SELECT 1 FROM public.seances s2
    WHERE s2.contrat_id = s.contrat_id
      AND s2.participant_id = s.participant_id
      AND s2.date = s.date
      AND s2.statut <> 'annulee'
      AND (s2.created_at < s.created_at
           OR (s2.created_at = s.created_at AND s2.id < s.id))
  );

-- 2. Contrainte d'unicité : un patient ne peut pas avoir deux séances
--    (non annulées) pour le même contrat le même jour.
CREATE UNIQUE INDEX IF NOT EXISTS seances_no_double_contrat_idx
  ON public.seances (participant_id, date, contrat_id)
  WHERE statut <> 'annulee';
