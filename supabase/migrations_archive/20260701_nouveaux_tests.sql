-- Berg Balance Scale (14 items cotés 0-4, score /56)
ALTER TABLE bilans ADD COLUMN IF NOT EXISTS berg_data JSONB;

-- MoCA — Montreal Cognitive Assessment (score /30)
ALTER TABLE bilans ADD COLUMN IF NOT EXISTS moca_score INTEGER;

-- Test de marche 10 mètres (vitesse habituelle + maximale en secondes)
ALTER TABLE bilans ADD COLUMN IF NOT EXISTS marche10m_habituel NUMERIC;
ALTER TABLE bilans ADD COLUMN IF NOT EXISTS marche10m_max NUMERIC;

-- ADL — Activities of Daily Living / Katz (6 activités de base)
ALTER TABLE bilans ADD COLUMN IF NOT EXISTS adl_data JSONB;

-- IADL — Instrumental Activities of Daily Living / Lawton (8 activités instrumentales)
ALTER TABLE bilans ADD COLUMN IF NOT EXISTS iadl_data JSONB;
