-- Table pour les documents partagés explicitement par Pierre avec le patient
-- Source : action "Compte-rendu famille" dans Mon assistant → bouton "Partager avec le patient"
CREATE TABLE IF NOT EXISTS documents_patient (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id UUID REFERENCES participants(id) ON DELETE CASCADE NOT NULL,
  praticien_id UUID,
  titre TEXT NOT NULL,
  contenu TEXT NOT NULL,
  type TEXT DEFAULT 'compte_rendu_famille',
  date_creation TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index pour accélérer les requêtes par patient
CREATE INDEX IF NOT EXISTS idx_documents_patient_participant ON documents_patient(participant_id);
CREATE INDEX IF NOT EXISTS idx_documents_patient_created ON documents_patient(created_at DESC);

-- RLS : le patient peut lire ses propres documents, Pierre peut tout faire
ALTER TABLE documents_patient ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "Lecture publique par participant_id" ON documents_patient
  FOR SELECT USING (true);
CREATE POLICY IF NOT EXISTS "Ecriture authentifiee" ON documents_patient
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY IF NOT EXISTS "Suppression authentifiee" ON documents_patient
  FOR DELETE USING (auth.role() = 'authenticated');
