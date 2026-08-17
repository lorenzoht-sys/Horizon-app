-- ============================================================================
-- 20260817_securite_08_rate_limit_claude.sql
-- ============================================================================
--
-- Ferme : point Phase 2 du prompt d'audit sécurité — "api/claude.ts :
-- appelable sans authentification ? → n'importe qui consomme ton crédit
-- Anthropic. Vérifier auth + rate limit par praticien".
--
-- Preuve : `api/claude.ts` vérifie déjà l'authentification (JWT praticien
-- vérifié via `supabase.auth.getUser`) et a un plafond de taille de prompt
-- (voir lot précédent, docs/RAPPORT_SECURITE.md). Il n'existe en revanche
-- aucune limite sur le NOMBRE d'appels qu'un même praticien peut faire —
-- confirmé dans docs/CARTOGRAPHIE_SECURITE.md §4 : "Pas de rate limit par
-- praticien, pas de plafond de tokens visible".
--
-- Impact : un compte praticien compromis (mot de passe faible/réutilisé,
-- session volée) peut appeler /api/claude.ts en boucle et consommer tout le
-- crédit ANTHROPIC_API_KEY (partagé par tous les praticiens de l'app),
-- jusqu'à épuisement du quota ou facture imprévue — gravité Moyenne (abus de
-- coût), pas Critique (aucune donnée de santé exposée par ce vecteur précis).
--
-- Correctif : table de compteur par praticien (même pattern que
-- `patient_login_attempts`, 20260613_patient_login_rate_limit.sql),
-- consommée par api/_lib/rateLimit.ts (checkClaudeRateLimit /
-- recordClaudeRequest), branchée dans api/claude.ts. Seuil choisi : 30
-- requêtes / heure / praticien — voir api/_lib/rateLimit.ts pour la
-- justification (usage normal = quelques comptes-rendus par jour, pas un
-- chat conversationnel à haute fréquence).
--
-- ⚠️ NON TESTÉ AUTOMATIQUEMENT contre une vraie base dans cette session
-- (pas de credentials staging disponibles) — à valider manuellement sur
-- staging avant tout passage en production.
--
-- ── ROLLBACK ────────────────────────────────────────────────────────────
--   DROP TABLE IF EXISTS public.claude_rate_limit;
-- (Le code appelant (api/claude.ts) devrait aussi être reverté au commit
-- précédent ce lot, sinon les appels échoueront faute de table.)
--
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.claude_rate_limit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  praticien_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_claude_rate_limit_praticien_created
  ON public.claude_rate_limit (praticien_id, created_at);

ALTER TABLE public.claude_rate_limit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.claude_rate_limit FORCE ROW LEVEL SECURITY;

-- Aucune policy anon/authenticated : accès exclusivement via service_role
-- (qui contourne RLS), même pattern que patient_login_attempts.

-- Optionnel : purge périodique des anciennes tentatives (> 1 jour), à
-- exécuter manuellement de temps en temps, ou via pg_cron si disponible :
--
-- DELETE FROM public.claude_rate_limit
-- WHERE created_at < now() - interval '1 day';

NOTIFY pgrst, 'reload schema';
