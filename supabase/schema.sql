-- ============================================================
-- SCHÉMA SUPABASE — Horizon / MouvTrack
-- Coller dans : Supabase Dashboard > SQL Editor > New query
-- ============================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── PRATICIEN ─────────────────────────────────────────────────
-- Un seul praticien pour l'instant (Pierre Clavier).
-- La table est prête pour un modèle multi-praticiens futur.

CREATE TABLE IF NOT EXISTS settings_praticien (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prenom              TEXT,
  nom                 TEXT,
  email               TEXT,
  telephone           TEXT,
  structure           TEXT,
  numero_siret        TEXT,
  adresse             TEXT,
  logo_url            TEXT,
  couleur_principale  TEXT NOT NULL DEFAULT '#2BBFBF',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── PARTICIPANTS ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS participants (
  id                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nom                             TEXT NOT NULL,
  prenom                          TEXT NOT NULL,
  date_naissance                  DATE,
  date_creation                   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  email                           TEXT,
  telephone                       TEXT,
  pathologie                      TEXT,
  -- Tags / profil
  profil                          TEXT,            -- legacy ProfilPatient
  tags                            TEXT[],          -- TagPatient[]
  tests_actifs                    TEXT[],          -- TestKey[]
  contexte_clinic                 TEXT,
  profil_handicap                 TEXT,            -- ProfilHandicap
  -- Informations complémentaires
  taille                          NUMERIC(5,1),
  poids                           NUMERIC(5,1),
  ville_naissance                 TEXT,
  code_postal_naissance           TEXT,
  medecin_traitant                TEXT,
  -- Adresse domicile
  adresse_rue                     TEXT,
  adresse_code_postal             TEXT,
  adresse_ville                   TEXT,
  -- Géolocalisation calculée
  coordonnees_lat                 NUMERIC(10,7),
  coordonnees_lng                 NUMERIC(10,7),
  coordonnees_geocodee_at         TIMESTAMPTZ,
  coordonnees_adresse_normalisee  TEXT,
  geocode_failed                  BOOLEAN NOT NULL DEFAULT FALSE,
  -- Disponibilités (structure complexe → JSONB)
  disponibilites                  JSONB,
  -- Token d'accès vue client
  token                           TEXT NOT NULL,
  -- Profil de vie
  mode_deplacement_habituel       TEXT
    CHECK (mode_deplacement_habituel IN ('voiture','velo','transports','marche','fauteuil','autre')),
  mode_deplacement_detail         TEXT,
  antecedents_medicaux            TEXT,
  antecedents_chirurgicaux        TEXT,
  allergies                       TEXT,
  activites_souhaitees            TEXT[],
  objectifs_patient               JSONB,           -- string | string[]
  -- Coordonnées bancaires SAP
  iban                            TEXT,
  bic                             TEXT,
  droit_image                     BOOLEAN,
  -- RGPD (structure complète → JSONB)
  rgpd                            JSONB,
  created_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── BILANS ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS bilans (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id            UUID NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  date                      DATE NOT NULL,
  type                      TEXT NOT NULL CHECK (type IN ('initial','trimestriel')),
  trimestre                 INTEGER,
  -- Tests fonctionnels
  equilibre_droite          NUMERIC(6,2),
  equilibre_gauche          NUMERIC(6,2),
  chair_stand_30            INTEGER,
  hand_grip_droite          NUMERIC(5,1),
  hand_grip_gauche          NUMERIC(5,1),
  tug_3m                    NUMERIC(6,2),
  souplesse_methode         TEXT CHECK (souplesse_methode IN ('debout','assis')),
  souplesse_valeur          NUMERIC(5,1),
  -- Test marche 6 minutes
  tm6_distance_metres       NUMERIC(6,1),
  tm6_fc_avant              INTEGER,
  tm6_fc_apres              INTEGER,
  tm6_fc_2min               INTEGER,
  tm6_spo2_avant            NUMERIC(4,1),
  tm6_spo2_apres            NUMERIC(4,1),
  tm6_spo2_2min             NUMERIC(4,1),
  tm6_borg_rpe              INTEGER,
  -- Mémoire
  memoire_score_immediat    NUMERIC(5,1),
  memoire_score_differe     NUMERIC(5,1),
  memoire_dubois            JSONB,                -- sous-scores Dubois
  -- Notes texte
  notes_professionnelles    TEXT,
  objectifs_suivants        TEXT,
  points_vigilance          TEXT,
  message_client            TEXT,
  -- Données structurées complexes → JSONB
  profil_enrichi            JSONB,
  bilan_initial_data        JSONB,
  notes_bilan               JSONB,               -- scores 1-5 par domaine
  interpretation_ia         JSONB,               -- InterpretationIA
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS bilans_participant_id_idx ON bilans(participant_id);
CREATE INDEX IF NOT EXISTS bilans_date_idx ON bilans(date);

-- ── PROGRAMMES ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS programmes (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id      UUID NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  date_creation       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  date_debut          DATE NOT NULL,
  date_fin            DATE,
  titre               TEXT NOT NULL,
  objectif            TEXT,
  message_motivation  TEXT,
  exercices           JSONB NOT NULL DEFAULT '[]', -- ExerciceProgramme[]
  actif               BOOLEAN NOT NULL DEFAULT TRUE,
  suivi_semaines      JSONB NOT NULL DEFAULT '[]'  -- SuiviSemaine[]
);

CREATE INDEX IF NOT EXISTS programmes_participant_id_idx ON programmes(participant_id);

-- ── CONTRATS ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS contrats (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id            UUID NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  date_debut                DATE NOT NULL,
  date_fin                  DATE NOT NULL,
  jours_fixe                TEXT[] NOT NULL,
  heure_debut               TIME NOT NULL,
  duree_minutes             INTEGER NOT NULL,
  statut                    TEXT NOT NULL
    CHECK (statut IN ('actif','termine','suspendu','a_venir')),
  notes                     TEXT,
  date_creation             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  nombre_seances_total      INTEGER NOT NULL DEFAULT 0,
  nombre_seances_realisees  INTEGER NOT NULL DEFAULT 0
);

-- ── SÉANCES ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS seances (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id  UUID NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  contrat_id      UUID REFERENCES contrats(id) ON DELETE SET NULL,
  date            DATE NOT NULL,
  heure_debut     TIME NOT NULL,
  heure_fin       TIME NOT NULL,
  duree_minutes   INTEGER NOT NULL,
  type            TEXT NOT NULL
    CHECK (type IN ('seance','bilan','bilan_initial')),
  statut          TEXT NOT NULL
    CHECK (statut IN ('planifiee','realisee','annulee','reportee')),
  notes           TEXT,
  adresse         TEXT,
  coordonnees     JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS seances_participant_id_idx ON seances(participant_id);
CREATE INDEX IF NOT EXISTS seances_date_idx ON seances(date);

-- ── JOURNAL DE SÉANCE ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS notes_seances (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seance_id       UUID NOT NULL REFERENCES seances(id) ON DELETE CASCADE,
  participant_id  UUID NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  date            DATE NOT NULL,
  heure_debut     TIME,
  ressenti        TEXT
    CHECK (ressenti IN ('excellent','bien','moyen','difficile','arret')),
  note            TEXT,
  alertes         JSONB,
  douleur_eva     NUMERIC(4,1),
  fc_fin          INTEGER,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── ZONES GÉOGRAPHIQUES ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS zones_geographiques (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nom              TEXT NOT NULL,
  couleur          TEXT NOT NULL,
  participant_ids  UUID[] NOT NULL DEFAULT '{}',
  centroide_lat    NUMERIC(10,7),
  centroide_lng    NUMERIC(10,7),
  jours_assignes   TEXT[] NOT NULL DEFAULT '{}',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── INDISPONIBILITÉS PRATICIEN ────────────────────────────────

CREATE TABLE IF NOT EXISTS indisponibilites (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  jour         TEXT NOT NULL
    CHECK (jour IN ('lun','mar','mer','jeu','ven','sam','dim')),
  heure_debut  TIME NOT NULL,
  heure_fin    TIME NOT NULL,
  recurrente   BOOLEAN NOT NULL DEFAULT TRUE,
  label        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── ESPACE PATIENT ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS acces_patients (
  participant_id        UUID PRIMARY KEY REFERENCES participants(id) ON DELETE CASCADE,
  visibilite            JSONB NOT NULL DEFAULT '{
    "progression": true,
    "bilans": true,
    "rdv": true,
    "programme": true,
    "messagePierre": true
  }',
  message_pierre_texte  TEXT,
  dernier_acces         TIMESTAMPTZ
);

-- ── MISE À JOUR AUTOMATIQUE updated_at ───────────────────────

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER participants_updated_at
  BEFORE UPDATE ON participants
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER settings_praticien_updated_at
  BEFORE UPDATE ON settings_praticien
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── ROW LEVEL SECURITY (RLS) ──────────────────────────────────
-- À activer après avoir configuré l'authentification Supabase.
-- Pour l'instant, tout est désactivé (accès libre via anon key).

-- ALTER TABLE participants ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE bilans ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE programmes ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE seances ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE contrats ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE notes_seances ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE zones_geographiques ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE indisponibilites ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE acces_patients ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE settings_praticien ENABLE ROW LEVEL SECURITY;
