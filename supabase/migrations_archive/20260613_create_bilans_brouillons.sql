-- ============================================================================
-- 20260613_create_bilans_brouillons.sql
-- ============================================================================
--
-- Corrige le bug "404 bilans_brouillons" (voir AUDIT.md §7) : le code de
-- src/hooks/useBrouillonBilan.ts utilise déjà cette table pour synchroniser
-- les brouillons de bilan entre appareils (cloud backup), mais la table n'a
-- jamais été créée. Le hook échoue silencieusement (fail-safe), d'où le 404
-- visible dans la console sans impact fonctionnel direct (fallback
-- localStorage) — mais la synchro multi-appareil ne fonctionne pas.
--
-- Reprend exactement la définition documentée en commentaire dans
-- src/hooks/useBrouillonBilan.ts (lignes 7-19), avec RLS activé.

CREATE TABLE IF NOT EXISTS public.bilans_brouillons (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  participant_id  uuid REFERENCES public.participants(id) ON DELETE CASCADE NOT NULL,
  praticien_id    uuid NOT NULL,
  etape_actuelle  integer NOT NULL DEFAULT 0,
  donnees         jsonb NOT NULL DEFAULT '{}',
  completion_pct  integer NOT NULL DEFAULT 0,
  created_at      timestamptz DEFAULT now() NOT NULL,
  updated_at      timestamptz DEFAULT now() NOT NULL,
  UNIQUE (participant_id, praticien_id)
);

ALTER TABLE public.bilans_brouillons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own" ON public.bilans_brouillons;
CREATE POLICY "own" ON public.bilans_brouillons
  FOR ALL
  USING (auth.uid() = praticien_id)
  WITH CHECK (auth.uid() = praticien_id);
