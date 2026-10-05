-- ============================================================================
-- 20260615_rappels_patients.sql
-- ============================================================================
--
-- Rappels automatiques patients (branche rappels-patients).
--
-- V1 : notifications push web (PWA), gratuites. Le canal d'envoi est isolé
-- (api/_lib/notifications.ts) pour pouvoir ajouter le SMS plus tard sans
-- toucher à la planification.
--
-- Trois nouvelles tables :
--
--   1. push_subscriptions : un abonnement "push" par appareil/navigateur
--      d'un patient (un patient peut avoir plusieurs appareils).
--
--   2. rappel_preferences : réglages de rappels. Une ligne avec
--      participant_id = NULL = réglages globaux du praticien (valeurs par
--      défaut pour tous ses patients). Une ligne avec participant_id rempli
--      = réglages spécifiques à ce patient (surcharge le global).
--
--   3. rappels_envoyes : journal des rappels déjà envoyés, pour ne jamais
--      envoyer deux fois le même rappel (cron exécuté toutes les heures).
--
-- Confidentialité (santé) : ces tables ne stockent AUCUNE donnée médicale.
-- Le contenu des notifications est généré côté serveur avec des messages
-- neutres fixes ("Vous avez une séance aujourd'hui.", "Pensez à vos
-- exercices !") — voir api/_lib/rappels.ts.
--
-- RLS : ces tables sont gérées côté serveur avec la clé service_role (qui
-- contourne RLS) pour la lecture/écriture par le cron et les endpoints
-- /api/patient/*. Le praticien authentifié (auth.uid()) a uniquement un
-- accès en lecture/écriture limité à ses propres patients, comme pour les
-- autres tables (voir 20260613_programme_v2_rls.sql).

-- ----------------------------------------------------------------------------
-- 1. push_subscriptions
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id UUID NOT NULL REFERENCES public.participants(id) ON DELETE CASCADE,
  endpoint       TEXT NOT NULL,
  p256dh         TEXT NOT NULL,
  auth_key       TEXT NOT NULL,
  user_agent     TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (participant_id, endpoint)
);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Le praticien peut voir les abonnements de ses patients (indicateur
-- "appareil abonné" sur la fiche patient), mais ne les modifie jamais
-- directement (c'est le patient, via /api/patient/push-subscribe, qui gère
-- ses propres abonnements avec la clé service_role).
DROP POLICY IF EXISTS "praticien_lit_push_subscriptions" ON public.push_subscriptions;
CREATE POLICY "praticien_lit_push_subscriptions" ON public.push_subscriptions
  FOR SELECT USING (
    participant_id IN (SELECT id FROM public.participants WHERE praticien_id = auth.uid())
  );

-- ----------------------------------------------------------------------------
-- 2. rappel_preferences
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.rappel_preferences (
  id                            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  praticien_id                  UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  participant_id                UUID REFERENCES public.participants(id) ON DELETE CASCADE,

  rappel_seance_actif           BOOLEAN NOT NULL DEFAULT TRUE,
  rappel_seance_delai_heures    INTEGER NOT NULL DEFAULT 2 CHECK (rappel_seance_delai_heures BETWEEN 1 AND 48),

  relance_exercices_actif       BOOLEAN NOT NULL DEFAULT TRUE,
  relance_exercices_seuil_jours INTEGER NOT NULL DEFAULT 3 CHECK (relance_exercices_seuil_jours BETWEEN 1 AND 30),

  created_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Une seule ligne "globale" (participant_id NULL) par praticien.
CREATE UNIQUE INDEX IF NOT EXISTS idx_rappel_preferences_global
  ON public.rappel_preferences (praticien_id)
  WHERE participant_id IS NULL;

-- Une seule ligne de surcharge par patient.
CREATE UNIQUE INDEX IF NOT EXISTS idx_rappel_preferences_participant
  ON public.rappel_preferences (participant_id)
  WHERE participant_id IS NOT NULL;

ALTER TABLE public.rappel_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "praticien_gere_rappel_preferences" ON public.rappel_preferences;
CREATE POLICY "praticien_gere_rappel_preferences" ON public.rappel_preferences
  FOR ALL USING (praticien_id = auth.uid())
  WITH CHECK (praticien_id = auth.uid());

DROP TRIGGER IF EXISTS rappel_preferences_updated_at ON public.rappel_preferences;
CREATE TRIGGER rappel_preferences_updated_at
  BEFORE UPDATE ON public.rappel_preferences
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS rappel_preferences_set_praticien ON public.rappel_preferences;
CREATE TRIGGER rappel_preferences_set_praticien
  BEFORE INSERT ON public.rappel_preferences
  FOR EACH ROW EXECUTE FUNCTION set_praticien_id_from_auth();

-- ----------------------------------------------------------------------------
-- 3. rappels_envoyes (journal anti-doublon)
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.rappels_envoyes (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id UUID NOT NULL REFERENCES public.participants(id) ON DELETE CASCADE,
  type           TEXT NOT NULL CHECK (type IN ('rappel_seance', 'relance_exercices')),
  -- Pour 'rappel_seance' : id de la séance concernée (seances.id).
  -- Pour 'relance_exercices' : NULL (le déduplicage se fait par fenêtre de
  -- temps, voir api/_lib/rappels.ts).
  reference_id   UUID,
  envoye_le      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rappels_envoyes_participant_type
  ON public.rappels_envoyes (participant_id, type, envoye_le DESC);

-- Un seul rappel de séance par séance.
CREATE UNIQUE INDEX IF NOT EXISTS idx_rappels_envoyes_seance_unique
  ON public.rappels_envoyes (participant_id, type, reference_id)
  WHERE type = 'rappel_seance';

ALTER TABLE public.rappels_envoyes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "praticien_lit_rappels_envoyes" ON public.rappels_envoyes;
CREATE POLICY "praticien_lit_rappels_envoyes" ON public.rappels_envoyes
  FOR SELECT USING (
    participant_id IN (SELECT id FROM public.participants WHERE praticien_id = auth.uid())
  );
