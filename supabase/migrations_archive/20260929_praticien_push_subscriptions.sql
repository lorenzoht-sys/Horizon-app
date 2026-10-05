-- ============================================================================
-- 20260929_praticien_push_subscriptions.sql
-- ============================================================================
--
-- Chantier « push praticien », lot 1 (fondations) : table des abonnements
-- push du PRATICIEN (distincte de push_subscriptions, qui appartient au
-- bénéficiaire — voir 20260615_rappels_patients.sql). Aucun envoi réel dans
-- ce lot : uniquement la mécanique d'abonnement/désabonnement.
--
-- ── Pourquoi une table séparée, pas une colonne discriminante sur
--    push_subscriptions ─────────────────────────────────────────────────────
-- push_subscriptions.participant_id est NOT NULL et sa RLS bloque TOUTE
-- écriture authentifiée directe (le bénéficiaire n'a pas de session Supabase
-- — jeton JWT maison — donc /api/patient/push-subscribe passe par
-- service_role). Le praticien, lui, a une vraie session Supabase
-- (auth.uid()), déjà utilisée pour écrire directement d'autres tables (ex.
-- useAgenda.ts sur `seances`, RLS faisant foi). Une table séparée avec sa
-- propre RLS directe est donc plus simple et plus sûre qu'une colonne
-- nullable + CHECK sur la table existante, qui aurait fallu réconcilier avec
-- la RLS actuelle du bénéficiaire (accès service_role uniquement).
--
-- ── Écriture directe, pas de route serverless ───────────────────────────────
-- Contrairement au bénéficiaire, l'abonnement/désabonnement du praticien se
-- fait par écriture directe depuis le client (RLS ci-dessous), pas via une
-- nouvelle fonction serverless — api/ est déjà à son plafond de 12 fonctions
-- (plan Vercel Hobby, voir supabase/migrations/README.md et
-- api/patient/activite.ts).
--
-- ── Privilèges service_role : anticipés pour le lot 2 (envoi) ──────────────
-- Ce lot n'envoie encore aucune notification, mais la table est conçue pour
-- son usage complet dès sa création (éviter une seconde migration sur la
-- même table) : service_role aura besoin de SELECT (lire les abonnements à
-- notifier) et DELETE (nettoyer un abonnement expiré/invalide sur 404/410,
-- même pattern qu'envoyerPush dans api/_lib/notifications.ts) une fois le
-- lot d'envoi implémenté.
--
-- ── Privilèges — REVOKE puis GRANT explicite ────────────────────────────────
-- Règle du projet pour toute nouvelle table dans public depuis le 2026-08-29
-- (voir docs/PLAN-BETA.md) : plus de GRANT par défaut. Sans le GRANT
-- explicite ci-dessous, ni authenticated ni service_role n'auraient le
-- moindre privilège sur cette table (déjà rencontré : "permission denied for
-- table patient_activite_rate_limit", PR #103, 2026-09-28).
--
-- ── ROLLBACK ────────────────────────────────────────────────────────────────
--   DROP TABLE IF EXISTS public.praticien_push_subscriptions;
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.praticien_push_subscriptions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  praticien_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint     TEXT NOT NULL,
  p256dh       TEXT NOT NULL,
  auth_key     TEXT NOT NULL,
  user_agent   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (praticien_id, endpoint)
);

ALTER TABLE public.praticien_push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Le praticien gère directement ses propres abonnements (un par appareil) :
-- même patron que seances_select/insert/update/delete (supabase/schema.sql).
-- UPDATE est nécessaire pour l'upsert onConflict(praticien_id, endpoint)
-- (réabonnement du même appareil), même mécanisme que
-- api/patient/push-subscribe.ts côté bénéficiaire.
DROP POLICY IF EXISTS "praticien_push_subscriptions_select" ON public.praticien_push_subscriptions;
CREATE POLICY "praticien_push_subscriptions_select" ON public.praticien_push_subscriptions
  FOR SELECT USING (praticien_id = auth.uid());

DROP POLICY IF EXISTS "praticien_push_subscriptions_insert" ON public.praticien_push_subscriptions;
CREATE POLICY "praticien_push_subscriptions_insert" ON public.praticien_push_subscriptions
  FOR INSERT WITH CHECK (praticien_id = auth.uid());

DROP POLICY IF EXISTS "praticien_push_subscriptions_update" ON public.praticien_push_subscriptions;
CREATE POLICY "praticien_push_subscriptions_update" ON public.praticien_push_subscriptions
  FOR UPDATE USING (praticien_id = auth.uid()) WITH CHECK (praticien_id = auth.uid());

DROP POLICY IF EXISTS "praticien_push_subscriptions_delete" ON public.praticien_push_subscriptions;
CREATE POLICY "praticien_push_subscriptions_delete" ON public.praticien_push_subscriptions
  FOR DELETE USING (praticien_id = auth.uid());

REVOKE ALL ON TABLE public.praticien_push_subscriptions FROM PUBLIC;
REVOKE ALL ON TABLE public.praticien_push_subscriptions FROM anon;
REVOKE ALL ON TABLE public.praticien_push_subscriptions FROM authenticated;
REVOKE ALL ON TABLE public.praticien_push_subscriptions FROM service_role;

-- authenticated : la RLS ci-dessus restreint chaque praticien à ses propres
-- lignes (praticien_id = auth.uid()) — le GRANT seul n'ouvre rien de plus.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.praticien_push_subscriptions TO authenticated;

-- service_role : SELECT + DELETE anticipés pour le lot d'envoi (voir
-- en-tête). Pas de GRANT ALL ici, contrairement à patient_activite_rate_limit
-- (accès service_role exclusif) : authenticated a aussi ses privilèges.
GRANT SELECT, DELETE ON TABLE public.praticien_push_subscriptions TO service_role;

DO $migration$
BEGIN
  IF (SELECT count(*) FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'praticien_push_subscriptions') <> 1 THEN
    RAISE EXCEPTION 'Echec verification : table praticien_push_subscriptions absente';
  END IF;

  IF NOT (SELECT relrowsecurity FROM pg_class WHERE relname = 'praticien_push_subscriptions' AND relnamespace = 'public'::regnamespace) THEN
    RAISE EXCEPTION 'Echec verification : RLS non activee sur praticien_push_subscriptions';
  END IF;

  -- Les 4 policies attendues, par nom (pas un simple compte).
  IF (SELECT count(*) FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'praticien_push_subscriptions'
          AND policyname IN (
            'praticien_push_subscriptions_select', 'praticien_push_subscriptions_insert',
            'praticien_push_subscriptions_update', 'praticien_push_subscriptions_delete'
          )) <> 4 THEN
    RAISE EXCEPTION 'Echec verification : les 4 policies attendues sur praticien_push_subscriptions doivent toutes exister';
  END IF;

  -- authenticated : CRUD complet (borné par RLS), rien de plus.
  IF NOT has_table_privilege('authenticated', 'public.praticien_push_subscriptions', 'SELECT')
     OR NOT has_table_privilege('authenticated', 'public.praticien_push_subscriptions', 'INSERT')
     OR NOT has_table_privilege('authenticated', 'public.praticien_push_subscriptions', 'UPDATE')
     OR NOT has_table_privilege('authenticated', 'public.praticien_push_subscriptions', 'DELETE') THEN
    RAISE EXCEPTION 'Echec verification : authenticated doit avoir SELECT/INSERT/UPDATE/DELETE sur praticien_push_subscriptions';
  END IF;

  -- service_role : SELECT + DELETE seulement (anticipé pour le lot d'envoi).
  IF NOT has_table_privilege('service_role', 'public.praticien_push_subscriptions', 'SELECT')
     OR NOT has_table_privilege('service_role', 'public.praticien_push_subscriptions', 'DELETE') THEN
    RAISE EXCEPTION 'Echec verification : service_role doit avoir SELECT et DELETE sur praticien_push_subscriptions';
  END IF;
  IF has_table_privilege('service_role', 'public.praticien_push_subscriptions', 'INSERT') THEN
    RAISE EXCEPTION 'Echec verification : service_role ne doit pas avoir INSERT sur praticien_push_subscriptions (pas de route serverless d''abonnement dans ce lot)';
  END IF;

  -- anon : aucun privilège.
  IF has_table_privilege('anon', 'public.praticien_push_subscriptions', 'SELECT') THEN
    RAISE EXCEPTION 'Echec verification : anon ne doit avoir aucun privilege sur praticien_push_subscriptions';
  END IF;
END
$migration$;

NOTIFY pgrst, 'reload schema';
