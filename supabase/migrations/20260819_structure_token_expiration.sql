-- ============================================================================
-- 20260819_structure_token_expiration.sql
-- ============================================================================
--
-- Ferme : [F-04] du rapport docs/RAPPORT_SECURITE.md — "Token structure sans
-- expiration ni rotation". La rotation manuelle existait déjà
-- (src/hooks/useStructures.ts:regenererToken, bouton dans
-- StructureDetail.tsx) ; il manquait une expiration.
--
-- Preuve : supabase/migrations/20260604_structures.sql — colonne
-- structures.token_acces, aucune colonne expires_at.
--
-- Impact : un lien de structure qui fuit une fois reste valide
-- indéfiniment tant que le praticien ne le régénère pas manuellement.
--
-- Correctif : ajoute expires_at (nullable). Comportement :
--   - Tokens EXISTANTS (créés avant cette migration) : expires_at reste
--     NULL = pas d'expiration rétroactive. On ne casse pas silencieusement
--     un accès déjà distribué à une structure partenaire — cohérent avec
--     l'approche F-02 (pas de rotation forcée d'un secret déjà distribué).
--   - Tokens NOUVEAUX (création ou régénération, à partir du déploiement
--     de src/hooks/useStructures.ts mis à jour) : expires_at = maintenant +
--     1 an, fixé côté client au moment de l'écriture.
--   - api/_lib/structureAuth.ts:validateStructureToken vérifie désormais
--     (expires_at IS NULL OR expires_at > now()) en plus de `actif`.
--
-- ⚠️ NON TESTÉ AUTOMATIQUEMENT — non appliqué nulle part (staging ne
-- reproduit pas l'état de prod actuellement, voir docs/ETAT_AUDIT.md).
--
-- ── ROLLBACK ────────────────────────────────────────────────────────────
--   ALTER TABLE public.structures DROP COLUMN IF EXISTS expires_at;
--
-- ============================================================================

ALTER TABLE public.structures
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

NOTIFY pgrst, 'reload schema';
