-- ============================================================================
-- Retrait de la clé `progression` de participants.visibilite_beneficiaire
--
-- POURQUOI
-- --------
-- Cette clé, activée par défaut et libellée « Graphiques de progression » côté
-- praticien, ne pilotait QUE l'affichage de l'onglet « Progrès » de l'espace
-- bénéficiaire (EspacePatient.tsx). Elle ne commandait aucune donnée : le
-- contenu de cet onglet dépend entièrement de bilans.visible_beneficiaire,
-- caché par défaut et coché résultat par résultat.
--
-- Le praticien lisait donc « partagé » sur le seul réglage qui ne partageait
-- rien. Constaté le 2026-09-14 : Pierre croyait ses bénéficiaires informés de
-- leurs progrès depuis le début, et 14 bilans sur 26 portaient bien au moins un
-- résultat partagé — mais l'onglet restait vide pour une autre raison, et ce
-- réglage entretenait la confusion.
--
-- L'onglet est désormais toujours proposé et explique lui-même son état.
-- La clé n'est plus lue par aucun code (api/patient/me.ts, src/types/index.ts,
-- src/lib/mappers.ts, ModalEspacePatient.tsx).
--
-- CE QUE CETTE MIGRATION NE FAIT PAS
-- ----------------------------------
-- Elle ne touche pas bilans.visible_beneficiaire : le défaut caché reste, c'est
-- le bon choix pour de la donnée de santé. Aucun partage n'est créé ni retiré.
--
-- IDEMPOTENTE : `-` sur un JSONB sans la clé ne fait rien, et rejouer le
-- SET DEFAULT écrit la même valeur.
-- NE PAS EXÉCUTER SUR PROD sans validation préalable sur staging.
-- ============================================================================

-- 1. Nouveau défaut, sans `progression`.
ALTER TABLE participants
  ALTER COLUMN visibilite_beneficiaire SET DEFAULT
    '{"bilans":true,"rdv":true,"programme":true,"messagePierre":true,"carteSante":true}'::jsonb;

-- 2. Retrait de la clé des lignes existantes. L'opérateur `-` renvoie le JSONB
--    sans la clé ; les autres réglages du praticien sont conservés tels quels.
UPDATE participants
SET visibilite_beneficiaire = visibilite_beneficiaire - 'progression'
WHERE visibilite_beneficiaire ? 'progression';

-- 3. Contre-épreuve — doit renvoyer 0.
--    SELECT count(*) FROM participants WHERE visibilite_beneficiaire ? 'progression';
