-- Test de Tinetti (POMA) — équilibre & marche
-- Test optionnel, structure complexe (17 items + sous-scores) : stocké en
-- JSONB plutôt qu'en colonnes dédiées, comme memoire_dubois/profil_enrichi.

ALTER TABLE bilans
ADD COLUMN IF NOT EXISTS tinetti_data JSONB;
