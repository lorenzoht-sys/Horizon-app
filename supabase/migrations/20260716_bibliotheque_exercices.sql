-- ============================================================================
-- 20260716_bibliotheque_exercices.sql
-- ============================================================================
--
-- CONTEXTE : les tables exercices_personnalises et dossiers_exercices existent
-- déjà en base — créées à la main via Supabase Studio, sans jamais avoir de
-- fichier CREATE TABLE versionné dans supabase/migrations/ (même situation
-- historique que programme_seances / programme_planning / programme_exercices
-- avant leur consolidation du 20260620, voir
-- 20260620_consolidation_seances_patient.sql).
--
-- Cette migration DOCUMENTE l'état réel observé — colonnes, types, index,
-- contraintes, RLS, policies — via requêtes brutes (information_schema.columns,
-- pg_indexes, pg_policies, pg_constraint) exécutées et vérifiées le
-- 2026-07-17. Idempotente : CREATE TABLE IF NOT EXISTS ne fait RIEN si la
-- table existe déjà avec la même structure ; sur une base où elle existe déjà
-- (l'état actuel), exécuter ce fichier ne change AUCUN comportement.
--
-- CONFIRMÉ VIA pg_constraint : praticien_id N'A PAS de contrainte FK vers
-- auth.users(id) sur ces deux tables (contrairement à toutes les autres
-- tables du projet) — colonne uuid NOT NULL nue. Reproduit fidèlement tel
-- quel, ce n'est pas le rôle de cette migration de corriger cet écart.
-- Seule dossier_id → dossiers_exercices(id) ON DELETE SET NULL est une FK
-- réelle, confirmée.
--
-- GRANT non inclus : leur existence n'a pas été vérifiée (les requêtes
-- fournies couvraient columns/indexes/policies/constraints, pas
-- information_schema.role_table_grants). Ne pas supposer leur présence —
-- à vérifier séparément si l'accès applicatif se comporte anormalement.
--
-- Structure de dossiers en liste plate (pas d'imbrication) — décision
-- explicite, pas de colonne parent_id sur dossiers_exercices.
--
-- Aucun trigger updated_at détecté (pg_trigger non interrogé) — colonne
-- présente mais rien ne garantit qu'elle se met à jour automatiquement.
-- ============================================================================

-- ── 1. dossiers_exercices ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS dossiers_exercices (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  praticien_id uuid NOT NULL,
  nom          text NOT NULL,
  ordre        integer NOT NULL DEFAULT 0,
  created_at   timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dossiers_exercices_praticien
  ON dossiers_exercices(praticien_id);

ALTER TABLE dossiers_exercices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "praticien_gere_dossiers_exercices" ON dossiers_exercices;
CREATE POLICY "praticien_gere_dossiers_exercices" ON dossiers_exercices
  FOR ALL
  USING (praticien_id = auth.uid())
  WITH CHECK (praticien_id = auth.uid());

-- ── 2. exercices_personnalises ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS exercices_personnalises (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  praticien_id           uuid NOT NULL,
  dossier_id             uuid REFERENCES dossiers_exercices(id) ON DELETE SET NULL,
  ordre                  integer NOT NULL DEFAULT 0,

  nom                    text NOT NULL,
  categorie              text NOT NULL,
  description            text NOT NULL,
  consigne_securite      text,
  photo_url              text,
  video_youtube_id       text,
  niveaux                jsonb NOT NULL,
  materiel_necessaire    text,
  duree_estimee_minutes  integer NOT NULL,
  profils_compatibles    jsonb,
  adaptations            jsonb,
  position_requise       text,
  niveau_mobilite        text,
  reference              text,
  niveau_config          jsonb,

  created_at             timestamptz DEFAULT now(),
  updated_at             timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_exercices_personnalises_praticien
  ON exercices_personnalises(praticien_id);
CREATE INDEX IF NOT EXISTS idx_exercices_personnalises_dossier
  ON exercices_personnalises(dossier_id);

ALTER TABLE exercices_personnalises ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "praticien_gere_exercices_personnalises" ON exercices_personnalises;
CREATE POLICY "praticien_gere_exercices_personnalises" ON exercices_personnalises
  FOR ALL
  USING (praticien_id = auth.uid())
  WITH CHECK (praticien_id = auth.uid());

NOTIFY pgrst, 'reload schema';
