-- ============================================================
-- TABLE : comptes_rendus_seances
-- Comptes-rendus de séance générés par dictée vocale + IA
-- ============================================================

CREATE TABLE IF NOT EXISTS comptes_rendus_seances (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id        UUID NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  praticien_id          UUID REFERENCES auth.users(id) ON DELETE CASCADE,

  date_seance           DATE NOT NULL,
  duree_minutes         INTEGER,
  transcription_brute   TEXT,
  exercices_realises    JSONB DEFAULT '[]',
  observations          TEXT DEFAULT '',
  douleurs_signalees    TEXT,
  humeur_patient        TEXT CHECK (humeur_patient IN ('très bien', 'bien', 'moyen', 'fatigué')),
  progression           TEXT CHECK (progression IN ('en progrès', 'stable', 'régression')),
  points_attention      TEXT,
  prochaine_seance_notes TEXT,

  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE comptes_rendus_seances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "crs_select" ON comptes_rendus_seances FOR SELECT USING (praticien_id = auth.uid());
CREATE POLICY "crs_insert" ON comptes_rendus_seances FOR INSERT WITH CHECK (praticien_id = auth.uid());
CREATE POLICY "crs_update" ON comptes_rendus_seances FOR UPDATE USING (praticien_id = auth.uid());
CREATE POLICY "crs_delete" ON comptes_rendus_seances FOR DELETE USING (praticien_id = auth.uid());

CREATE TRIGGER crs_updated_at
  BEFORE UPDATE ON comptes_rendus_seances
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER crs_set_praticien
  BEFORE INSERT ON comptes_rendus_seances
  FOR EACH ROW EXECUTE FUNCTION set_praticien_id_from_auth();
