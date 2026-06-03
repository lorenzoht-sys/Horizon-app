-- Correction 3 : traitements structurés (nom/dose/effet secondaire)
ALTER TABLE participants
ADD COLUMN IF NOT EXISTS traitements JSONB DEFAULT '[]'::jsonb;

-- Correction 4 : antécédents médicaux structurés (type/date/douleur)
ALTER TABLE participants
ADD COLUMN IF NOT EXISTS antecedents_structures JSONB DEFAULT '[]'::jsonb;
