-- ============================================================================
-- 20260620_tests_etalons_exercices_libres.sql
-- ============================================================================
--
-- Activités hors programme, réalisées par le patient SEUL via l'espace
-- patient, en complément (non en remplacement) du programme structuré :
--
--   1. Tests étalons chronométrés — catalogue prédéfini en code
--      (src/data/testsEtalons.ts, pas de table catalogue : aucune création
--      libre par le praticien en V1). Le praticien active un test par
--      patient ; le patient le réalise (chrono + saisie du nombre de
--      répétitions) ; la progression est suivie dans le temps.
--   2. Exercices libres — le praticien assigne à un patient, en complément,
--      un ou plusieurs exercices de la bibliothèque EXISTANTE
--      (src/data/exercices.ts). Comme cette bibliothèque n'a pas de table
--      Supabase (catalogue de base en code + exercices "custom" du
--      praticien stockés en localStorage navigateur, jamais côté serveur),
--      les champs d'affichage (nom/description/consigne) sont DUPLIQUÉS au
--      moment de l'assignation — même principe que programme_exercices,
--      qui copie déjà les champs plutôt que de ne stocker qu'une référence.
--      Validation patient = simple case à cocher "fait aujourd'hui"
--      (togglable, pas un acte verrouillé comme la séance autonome).
--
-- Sécurité (non négociable) : rien n'est visible côté patient sans
-- activation explicite par le praticien pour CE patient (actif = true).
--
-- PRÉREQUIS : tables participants, auth.users.
-- IDEMPOTENTE : IF NOT EXISTS / DO $$ sur tous les objets.
-- NE PAS EXÉCUTER SUR PROD sans validation préalable.
-- ============================================================================

-- ── 1. Tests étalons chronométrés ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS tests_etalons_activations (
  id             UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  participant_id UUID        NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  test_id        TEXT        NOT NULL, -- id du catalogue (src/data/testsEtalons.ts)
  praticien_id   UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  actif          BOOLEAN     NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (participant_id, test_id)
);

CREATE TABLE IF NOT EXISTS tests_etalons_resultats (
  id             UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  participant_id UUID        NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  test_id        TEXT        NOT NULL,
  valeur         INTEGER     NOT NULL CHECK (valeur >= 0), -- répétitions / pas
  date_test      DATE        NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tests_etalons_resultats_participant
  ON tests_etalons_resultats (participant_id, test_id, date_test DESC);

ALTER TABLE tests_etalons_activations ENABLE ROW LEVEL SECURITY;
ALTER TABLE tests_etalons_resultats   ENABLE ROW LEVEL SECURITY;

-- Praticien : gère (active/désactive) les tests de ses propres patients.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'tests_etalons_activations'
      AND policyname = 'tests_etalons_activations_praticien_all'
  ) THEN
    CREATE POLICY tests_etalons_activations_praticien_all ON tests_etalons_activations
      FOR ALL USING (praticien_id = auth.uid())
      WITH CHECK (praticien_id = auth.uid());
  END IF;
END $$;

-- Praticien : lecture des résultats de ses propres patients (suivi de
-- progression). Aucune écriture authenticated : l'insertion passe par
-- /api/patient/test-etalon (service_role), après vérification que le test
-- est bien activé pour ce participant.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'tests_etalons_resultats'
      AND policyname = 'tests_etalons_resultats_praticien_select'
  ) THEN
    CREATE POLICY tests_etalons_resultats_praticien_select ON tests_etalons_resultats
      FOR SELECT USING (
        participant_id IN (SELECT id FROM participants WHERE praticien_id = auth.uid())
      );
  END IF;
END $$;

-- ── 2. Exercices libres hors programme ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS exercices_libres_activations (
  id                UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  participant_id    UUID        NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  praticien_id      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  exercice_id       TEXT        NOT NULL, -- id de la bibliothèque (src/data/exercices.ts)
  nom               TEXT        NOT NULL, -- champs dupliqués au moment de l'assignation
  description       TEXT,
  consigne_securite TEXT,
  categorie         TEXT,
  actif             BOOLEAN     NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (participant_id, exercice_id)
);

CREATE TABLE IF NOT EXISTS exercices_libres_validations (
  id             UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  participant_id UUID        NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  exercice_id    TEXT        NOT NULL,
  date           DATE        NOT NULL,
  fait           BOOLEAN     NOT NULL DEFAULT true,
  note           TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (participant_id, exercice_id, date)
);

ALTER TABLE exercices_libres_activations ENABLE ROW LEVEL SECURITY;
ALTER TABLE exercices_libres_validations ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'exercices_libres_activations'
      AND policyname = 'exercices_libres_activations_praticien_all'
  ) THEN
    CREATE POLICY exercices_libres_activations_praticien_all ON exercices_libres_activations
      FOR ALL USING (praticien_id = auth.uid())
      WITH CHECK (praticien_id = auth.uid());
  END IF;
END $$;

-- Praticien : lecture (quand un exercice libre a-t-il été marqué fait).
-- Écriture réservée à /api/patient/exercice-libre (service_role), en upsert
-- (case à cocher togglable, pas un acte verrouillé comme la séance autonome).
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'exercices_libres_validations'
      AND policyname = 'exercices_libres_validations_praticien_select'
  ) THEN
    CREATE POLICY exercices_libres_validations_praticien_select ON exercices_libres_validations
      FOR SELECT USING (
        participant_id IN (SELECT id FROM participants WHERE praticien_id = auth.uid())
      );
  END IF;
END $$;

-- ── GRANTs explicites ───────────────────────────────────────────────────────
-- Ce sont de vraies nouvelles tables (pas un ALTER sur une table existante) :
-- sans GRANT de base, toute requête échoue avec "permission denied" (42501)
-- AVANT même l'évaluation des policies RLS — y compris pour service_role,
-- qui contourne les policies mais pas l'absence de GRANT (cf. l'incident
-- vécu sur retours_seance, voir 20260618_retours_seance.sql).

GRANT SELECT, INSERT, UPDATE, DELETE ON tests_etalons_activations TO authenticated;
GRANT SELECT, INSERT              ON tests_etalons_activations TO service_role;

GRANT SELECT                       ON tests_etalons_resultats   TO authenticated;
GRANT SELECT, INSERT              ON tests_etalons_resultats   TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON exercices_libres_activations TO authenticated;
GRANT SELECT, INSERT              ON exercices_libres_activations TO service_role;

GRANT SELECT                       ON exercices_libres_validations TO authenticated;
GRANT SELECT, INSERT, UPDATE      ON exercices_libres_validations TO service_role;

-- anon : aucun privilège (cohérent avec 20260613_rls_anon_lockdown.sql) —
-- l'espace patient passe exclusivement par /api/patient/* (service_role).
