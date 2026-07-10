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

-- Auto-remplit praticien_id depuis l'utilisateur connecté si absent — même
-- fonction que comptes_rendus_seances, déjà en place (voir supabase/schema.sql,
-- utilisée par participants/comptes_rendus_seances/assistant_logs/rappels).
CREATE TRIGGER documents_patient_set_praticien
  BEFORE INSERT ON documents_patient
  FOR EACH ROW EXECUTE FUNCTION set_praticien_id_from_auth();

-- RLS : seul le praticien propriétaire du participant peut lire/écrire/supprimer.
-- Pas de policy de lecture publique/anonyme : la lecture côté bénéficiaire passe
-- exclusivement par api/patient/me.ts, qui utilise la clé service_role — donc
-- contourne RLS entièrement, après vérification du token patient côté serveur.
-- Une policy anon ici ne serait donc jamais empruntée par un chemin légitime,
-- seulement exploitable.
ALTER TABLE documents_patient ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Lecture publique par participant_id" ON documents_patient;
DROP POLICY IF EXISTS "Ecriture authentifiee" ON documents_patient;
DROP POLICY IF EXISTS "Suppression authentifiee" ON documents_patient;
DROP POLICY IF EXISTS "praticien_gere_documents_patient" ON documents_patient;

CREATE POLICY "praticien_gere_documents_patient" ON documents_patient
  FOR ALL USING (
    participant_id IN (SELECT id FROM participants WHERE praticien_id = auth.uid())
  ) WITH CHECK (
    participant_id IN (SELECT id FROM participants WHERE praticien_id = auth.uid())
  );

NOTIFY pgrst, 'reload schema';
