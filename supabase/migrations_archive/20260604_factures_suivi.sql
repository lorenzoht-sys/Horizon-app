-- Tarif par séance sur le contrat (optionnel, fallback sur tarif_horaire du praticien)
ALTER TABLE contrats ADD COLUMN IF NOT EXISTS tarif_seance DECIMAL(10,2);

-- Table de suivi des factures mensuelles
CREATE TABLE IF NOT EXISTS factures_suivi (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  praticien_id UUID,
  participant_id UUID REFERENCES participants(id) ON DELETE CASCADE NOT NULL,
  periode_mois INT NOT NULL CHECK (periode_mois BETWEEN 1 AND 12),
  periode_annee INT NOT NULL,
  nb_seances INT NOT NULL DEFAULT 0,
  montant_total DECIMAL(10,2) NOT NULL DEFAULT 0,
  statut TEXT NOT NULL DEFAULT 'a_envoyer'
    CHECK (statut IN ('a_envoyer', 'en_retard', 'envoyee')),
  date_echeance DATE,
  date_envoi DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_factures_participant ON factures_suivi(participant_id);
CREATE INDEX IF NOT EXISTS idx_factures_periode ON factures_suivi(periode_annee, periode_mois);
CREATE INDEX IF NOT EXISTS idx_factures_praticien ON factures_suivi(praticien_id);
CREATE INDEX IF NOT EXISTS idx_factures_statut ON factures_suivi(statut);

-- Unicité : une seule facture par patient par mois
CREATE UNIQUE INDEX IF NOT EXISTS idx_factures_unique
  ON factures_suivi(participant_id, periode_annee, periode_mois);

ALTER TABLE factures_suivi ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "praticien_gere_factures" ON factures_suivi;
CREATE POLICY "praticien_gere_factures" ON factures_suivi
  FOR ALL USING (praticien_id = auth.uid());
