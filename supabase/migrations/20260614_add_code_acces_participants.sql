-- ============================================================================
-- 20260614_add_code_acces_participants.sql
-- ============================================================================
--
-- Fix durable "code d'accès patient unique" (branche fix-code-acces).
--
-- Avant cette migration, le code de connexion patient (/patient) était
-- RECALCULÉ depuis le prénom à chaque login (calculerCode(prenom) = prénom
-- normalisé + "2026"), à la fois côté client et côté serveur. Problèmes :
--   - deux patients avec le même prénom obtenaient le même code (collision) ;
--   - le login faisait un .find() sur le prénom et pouvait choisir le
--     mauvais participant en cas de doublon (bug "Alain" du 13/06) ;
--   - le code était devinable par quiconque connaît le prénom du patient.
--
-- Cette migration ajoute une colonne `code_acces` : un code unique, aléatoire,
-- stocké en base, indépendant du prénom.
--
-- Format du code (généré par src/utils/codeAcces.ts) : 8 caractères
-- alphanumériques MAJUSCULES, sans caractères ambigus à l'oral/écrit
-- (0/O, 1/I/L exclus). Exemple : K7P9X2M4.
--
-- ⚠️ Décision actée : nouveaux codes uniquement. Les anciens codes
-- "prénom+2026" cessent d'être valides après cette migration + le
-- déploiement du nouveau /api/patient/login.
--
-- Étapes après application de cette migration (voir RAPPORT_CODE_ACCES.md) :
--   1. Les nouveaux participants reçoivent automatiquement un code_acces à
--      la création (src/hooks/useParticipants.ts).
--   2. Pour les participants EXISTANTS (code_acces NULL), exécuter
--      scripts/backfill-code-acces.ts (one-shot, clé service_role).
--
-- Tant que code_acces est NULL pour un participant, le login patient ne peut
-- pas matcher (NULL = '<code saisi>' est toujours faux en SQL) : aucun risque
-- de connexion non désirée pendant la période de transition.

ALTER TABLE public.participants
  ADD COLUMN IF NOT EXISTS code_acces text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_participants_code_acces
  ON public.participants (code_acces);
