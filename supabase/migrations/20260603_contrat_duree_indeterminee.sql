-- Correction 9 : date de fin optionnelle dans le contrat
ALTER TABLE contrats
ADD COLUMN IF NOT EXISTS duree_indeterminee BOOLEAN DEFAULT FALSE;
