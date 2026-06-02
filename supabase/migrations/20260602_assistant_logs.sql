-- ============================================================
-- TABLE : assistant_logs
-- Historique des échanges avec l'assistant clinique IA
-- ============================================================

CREATE TABLE IF NOT EXISTS assistant_logs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id   UUID NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  praticien_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  question     TEXT NOT NULL,
  reponse      TEXT NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE assistant_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "al_select" ON assistant_logs FOR SELECT USING (praticien_id = auth.uid());
CREATE POLICY "al_insert" ON assistant_logs FOR INSERT WITH CHECK (praticien_id = auth.uid());
CREATE POLICY "al_delete" ON assistant_logs FOR DELETE USING (praticien_id = auth.uid());

CREATE INDEX idx_assistant_logs_patient ON assistant_logs(patient_id);
CREATE INDEX idx_assistant_logs_praticien ON assistant_logs(praticien_id);
