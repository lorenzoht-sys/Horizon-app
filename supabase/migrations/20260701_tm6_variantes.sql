-- Table des variantes TM6 (test de marche adapté : stepper, pédalier, couloir, etc.)
CREATE TABLE IF NOT EXISTS tm6_variantes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nom TEXT NOT NULL,
  distance_ref NUMERIC,
  type_mesure TEXT NOT NULL DEFAULT 'distance',
  intervalles JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Lien bilan → variante (SET NULL si la variante est supprimée)
ALTER TABLE bilans
ADD COLUMN IF NOT EXISTS tm6_variante_id UUID REFERENCES tm6_variantes(id) ON DELETE SET NULL;
