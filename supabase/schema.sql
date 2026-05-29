-- ============================================================
-- SCHÉMA COMPLET MOUV'APA
-- Généré depuis les interfaces TypeScript du projet
-- À exécuter dans Supabase SQL Editor (tout d'un coup)
-- ============================================================

-- ── Fonctions utilitaires ──────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Auto-remplit praticien_id depuis l'utilisateur connecté si absent
CREATE OR REPLACE FUNCTION set_praticien_id_from_auth()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.praticien_id IS NULL THEN
    NEW.praticien_id = auth.uid();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- TABLE : praticiens  (profil du praticien connecté)
-- ============================================================
CREATE TABLE IF NOT EXISTS praticiens (
  id                   UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  prenom               TEXT,
  nom                  TEXT,
  titre                TEXT,
  email                TEXT,
  telephone            TEXT,
  adresse_rue          TEXT,
  adresse_code_postal  TEXT,
  adresse_ville        TEXT,
  siret                TEXT,
  numero_sap           TEXT,
  numero_tva           TEXT,
  ville_signature      TEXT,
  societe              TEXT,
  logo_praticien       TEXT,
  tarif_horaire        TEXT DEFAULT '45',
  frais_km_defaut      TEXT DEFAULT '0.50',
  couleur_theme        TEXT DEFAULT '#3B6D11',
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE praticiens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "praticiens_select" ON praticiens FOR SELECT USING (id = auth.uid());
CREATE POLICY "praticiens_insert" ON praticiens FOR INSERT WITH CHECK (id = auth.uid());
CREATE POLICY "praticiens_update" ON praticiens FOR UPDATE USING (id = auth.uid());
CREATE POLICY "praticiens_delete" ON praticiens FOR DELETE USING (id = auth.uid());

CREATE TRIGGER praticiens_updated_at
  BEFORE UPDATE ON praticiens
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- TABLE : participants
-- ============================================================
CREATE TABLE IF NOT EXISTS participants (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  praticien_id             UUID REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Identité
  nom                      TEXT NOT NULL,
  prenom                   TEXT NOT NULL,
  date_naissance           DATE,
  date_creation            DATE DEFAULT CURRENT_DATE,

  -- Contact
  email                    TEXT,
  telephone                TEXT,

  -- Profil clinique
  pathologie               TEXT,
  profil                   TEXT,
  tags                     TEXT[],
  tests_actifs             TEXT[],
  contexte_clinic          TEXT,
  profil_handicap          TEXT,

  -- Morphologie
  taille                   NUMERIC(5,1),
  poids                    NUMERIC(5,1),

  -- Naissance (attestations SAP)
  ville_naissance          TEXT,
  code_postal_naissance    TEXT,
  cp_naissance             TEXT,

  -- Médecin
  medecin_traitant         TEXT,

  -- Adresse domicile
  adresse_rue              TEXT,
  adresse_code_postal      TEXT,
  adresse_ville            TEXT,

  -- Géolocalisation
  coordonnees_lat          NUMERIC(10,7),
  coordonnees_lng          NUMERIC(10,7),

  -- Déplacement
  mode_deplacement         TEXT,
  mode_deplacement_detail  TEXT,

  -- Antécédents & santé
  antecedents_medicaux     TEXT,
  antecedents_chirurgicaux TEXT,
  allergies                TEXT,
  activites_souhaitees     TEXT[],
  objectifs_patient        JSONB,

  -- SAP
  iban                     TEXT,
  bic                      TEXT,
  droit_image              BOOLEAN DEFAULT FALSE,

  -- RGPD
  rgpd                     JSONB,

  created_at               TIMESTAMPTZ DEFAULT NOW(),
  updated_at               TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE participants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "participants_select" ON participants FOR SELECT USING (praticien_id = auth.uid());
CREATE POLICY "participants_insert" ON participants FOR INSERT WITH CHECK (praticien_id = auth.uid());
CREATE POLICY "participants_update" ON participants FOR UPDATE USING (praticien_id = auth.uid());
CREATE POLICY "participants_delete" ON participants FOR DELETE USING (praticien_id = auth.uid());

CREATE TRIGGER participants_updated_at
  BEFORE UPDATE ON participants
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER participants_set_praticien
  BEFORE INSERT ON participants
  FOR EACH ROW EXECUTE FUNCTION set_praticien_id_from_auth();

-- ============================================================
-- TABLE : bilans
-- ============================================================
CREATE TABLE IF NOT EXISTS bilans (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id          UUID NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  praticien_id            UUID REFERENCES auth.users(id) ON DELETE CASCADE,

  date                    DATE NOT NULL,
  type                    TEXT NOT NULL CHECK (type IN ('initial', 'trimestriel')),
  trimestre               INTEGER DEFAULT 0,

  -- Équilibre unipodal (secondes)
  equilibre_droite        NUMERIC,
  equilibre_gauche        NUMERIC,

  -- Chair Stand 30s (répétitions)
  chair_stand_30          INTEGER,

  -- Hand Grip (kg)
  hand_grip_droite        NUMERIC,
  hand_grip_gauche        NUMERIC,

  -- TUG 3m (secondes)
  tug_3m                  NUMERIC,

  -- Souplesse
  souplesse_methode       TEXT CHECK (souplesse_methode IN ('debout', 'assis')),
  souplesse_valeur        NUMERIC,

  -- TM6 (test marche 6 minutes)
  tm6_distance_metres     NUMERIC,
  tm6_fc_avant            INTEGER,
  tm6_fc_apres            INTEGER,
  tm6_fc_2min             INTEGER,
  tm6_spo2_avant          NUMERIC,
  tm6_spo2_apres          NUMERIC,
  tm6_spo2_2min           NUMERIC,
  tm6_borg_rpe            NUMERIC,

  -- Mémoire
  memoire_score_immediat  NUMERIC,
  memoire_score_differe   NUMERIC,
  memoire_dubois          JSONB,

  -- Notes
  notes_professionnelles  TEXT DEFAULT '',
  objectifs_suivants      TEXT DEFAULT '',
  points_vigilance        TEXT DEFAULT '',
  message_client          TEXT DEFAULT '',

  -- Données enrichies
  profil_enrichi          JSONB,
  bilan_initial_data      JSONB,
  notes_bilan             JSONB,
  interpretation_ia       JSONB,

  created_at              TIMESTAMPTZ DEFAULT NOW(),
  updated_at              TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE bilans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bilans_select" ON bilans FOR SELECT USING (praticien_id = auth.uid());
CREATE POLICY "bilans_insert" ON bilans FOR INSERT WITH CHECK (praticien_id = auth.uid());
CREATE POLICY "bilans_update" ON bilans FOR UPDATE USING (praticien_id = auth.uid());
CREATE POLICY "bilans_delete" ON bilans FOR DELETE USING (praticien_id = auth.uid());

CREATE TRIGGER bilans_updated_at
  BEFORE UPDATE ON bilans
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER bilans_set_praticien
  BEFORE INSERT ON bilans
  FOR EACH ROW EXECUTE FUNCTION set_praticien_id_from_auth();

-- ============================================================
-- TABLE : contrats
-- ============================================================
CREATE TABLE IF NOT EXISTS contrats (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id            UUID NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  praticien_id              UUID REFERENCES auth.users(id) ON DELETE CASCADE,

  date_debut                DATE NOT NULL,
  date_fin                  DATE NOT NULL,
  jours_fixe                TEXT[],
  heure_debut               TEXT,
  duree_minutes             INTEGER,
  statut                    TEXT DEFAULT 'actif'
                              CHECK (statut IN ('actif', 'termine', 'suspendu', 'a_venir')),
  notes                     TEXT,
  date_creation             DATE DEFAULT CURRENT_DATE,
  nombre_seances_total      INTEGER DEFAULT 0,
  nombre_seances_realisees  INTEGER DEFAULT 0,

  created_at                TIMESTAMPTZ DEFAULT NOW(),
  updated_at                TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE contrats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "contrats_select" ON contrats FOR SELECT USING (praticien_id = auth.uid());
CREATE POLICY "contrats_insert" ON contrats FOR INSERT WITH CHECK (praticien_id = auth.uid());
CREATE POLICY "contrats_update" ON contrats FOR UPDATE USING (praticien_id = auth.uid());
CREATE POLICY "contrats_delete" ON contrats FOR DELETE USING (praticien_id = auth.uid());

CREATE TRIGGER contrats_updated_at
  BEFORE UPDATE ON contrats
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER contrats_set_praticien
  BEFORE INSERT ON contrats
  FOR EACH ROW EXECUTE FUNCTION set_praticien_id_from_auth();

-- ============================================================
-- TABLE : seances
-- ============================================================
CREATE TABLE IF NOT EXISTS seances (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id UUID NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  praticien_id   UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  contrat_id     UUID REFERENCES contrats(id) ON DELETE SET NULL,

  date           DATE NOT NULL,
  heure_debut    TEXT NOT NULL,
  heure_fin      TEXT NOT NULL,
  duree_minutes  INTEGER,
  type           TEXT NOT NULL CHECK (type IN ('seance', 'bilan', 'bilan_initial')),
  statut         TEXT NOT NULL CHECK (statut IN ('planifiee', 'realisee', 'annulee', 'reportee')),
  notes          TEXT,
  adresse        TEXT DEFAULT '',
  coordonnees    JSONB,

  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE seances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "seances_select" ON seances FOR SELECT USING (praticien_id = auth.uid());
CREATE POLICY "seances_insert" ON seances FOR INSERT WITH CHECK (praticien_id = auth.uid());
CREATE POLICY "seances_update" ON seances FOR UPDATE USING (praticien_id = auth.uid());
CREATE POLICY "seances_delete" ON seances FOR DELETE USING (praticien_id = auth.uid());

CREATE TRIGGER seances_updated_at
  BEFORE UPDATE ON seances
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER seances_set_praticien
  BEFORE INSERT ON seances
  FOR EACH ROW EXECUTE FUNCTION set_praticien_id_from_auth();

-- ============================================================
-- TABLE : notes_seances  (journal de séance)
-- ============================================================
CREATE TABLE IF NOT EXISTS notes_seances (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seance_id      UUID REFERENCES seances(id) ON DELETE CASCADE,
  participant_id UUID NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  praticien_id   UUID REFERENCES auth.users(id) ON DELETE CASCADE,

  date           DATE NOT NULL,
  heure_debut    TEXT,
  ressenti       TEXT,
  note           TEXT DEFAULT '',
  alertes        JSONB,
  douleur_eva    NUMERIC,
  fc_fin         INTEGER,

  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE notes_seances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notes_seances_select" ON notes_seances FOR SELECT USING (praticien_id = auth.uid());
CREATE POLICY "notes_seances_insert" ON notes_seances FOR INSERT WITH CHECK (praticien_id = auth.uid());
CREATE POLICY "notes_seances_update" ON notes_seances FOR UPDATE USING (praticien_id = auth.uid());
CREATE POLICY "notes_seances_delete" ON notes_seances FOR DELETE USING (praticien_id = auth.uid());

CREATE TRIGGER notes_seances_updated_at
  BEFORE UPDATE ON notes_seances
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER notes_seances_set_praticien
  BEFORE INSERT ON notes_seances
  FOR EACH ROW EXECUTE FUNCTION set_praticien_id_from_auth();

-- ============================================================
-- TABLE : programmes
-- ============================================================
CREATE TABLE IF NOT EXISTS programmes (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id     UUID NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  praticien_id       UUID REFERENCES auth.users(id) ON DELETE CASCADE,

  date_creation      DATE DEFAULT CURRENT_DATE,
  date_debut         DATE NOT NULL,
  date_fin           DATE,
  titre              TEXT NOT NULL,
  objectif           TEXT DEFAULT '',
  message_motivation TEXT DEFAULT '',
  exercices          JSONB DEFAULT '[]',
  actif              BOOLEAN DEFAULT TRUE,
  suivi_semaines     JSONB DEFAULT '[]',

  created_at         TIMESTAMPTZ DEFAULT NOW(),
  updated_at         TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE programmes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "programmes_select" ON programmes FOR SELECT USING (praticien_id = auth.uid());
CREATE POLICY "programmes_insert" ON programmes FOR INSERT WITH CHECK (praticien_id = auth.uid());
CREATE POLICY "programmes_update" ON programmes FOR UPDATE USING (praticien_id = auth.uid());
CREATE POLICY "programmes_delete" ON programmes FOR DELETE USING (praticien_id = auth.uid());

CREATE TRIGGER programmes_updated_at
  BEFORE UPDATE ON programmes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER programmes_set_praticien
  BEFORE INSERT ON programmes
  FOR EACH ROW EXECUTE FUNCTION set_praticien_id_from_auth();

-- ============================================================
-- TABLE : zones_geographiques
-- ============================================================
CREATE TABLE IF NOT EXISTS zones_geographiques (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  praticien_id    UUID REFERENCES auth.users(id) ON DELETE CASCADE,

  nom             TEXT NOT NULL,
  couleur         TEXT DEFAULT '#1A5F9E',
  participant_ids UUID[] DEFAULT '{}',
  centroide_lat   NUMERIC(10,7),
  centroide_lng   NUMERIC(10,7),
  jours_assignes  TEXT[] DEFAULT '{}',

  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE zones_geographiques ENABLE ROW LEVEL SECURITY;
CREATE POLICY "zones_select" ON zones_geographiques FOR SELECT USING (praticien_id = auth.uid());
CREATE POLICY "zones_insert" ON zones_geographiques FOR INSERT WITH CHECK (praticien_id = auth.uid());
CREATE POLICY "zones_update" ON zones_geographiques FOR UPDATE USING (praticien_id = auth.uid());
CREATE POLICY "zones_delete" ON zones_geographiques FOR DELETE USING (praticien_id = auth.uid());

CREATE TRIGGER zones_updated_at
  BEFORE UPDATE ON zones_geographiques
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER zones_set_praticien
  BEFORE INSERT ON zones_geographiques
  FOR EACH ROW EXECUTE FUNCTION set_praticien_id_from_auth();

-- ============================================================
-- TABLE : indisponibilites  (créneaux bloqués du praticien)
-- ============================================================
CREATE TABLE IF NOT EXISTS indisponibilites (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  praticien_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,

  jour         TEXT NOT NULL,
  heure_debut  TEXT NOT NULL,
  heure_fin    TEXT NOT NULL,
  recurrente   BOOLEAN DEFAULT TRUE,
  label        TEXT
);

ALTER TABLE indisponibilites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "indispos_select" ON indisponibilites FOR SELECT USING (praticien_id = auth.uid());
CREATE POLICY "indispos_insert" ON indisponibilites FOR INSERT WITH CHECK (praticien_id = auth.uid());
CREATE POLICY "indispos_update" ON indisponibilites FOR UPDATE USING (praticien_id = auth.uid());
CREATE POLICY "indispos_delete" ON indisponibilites FOR DELETE USING (praticien_id = auth.uid());

CREATE TRIGGER indispos_set_praticien
  BEFORE INSERT ON indisponibilites
  FOR EACH ROW EXECUTE FUNCTION set_praticien_id_from_auth();
