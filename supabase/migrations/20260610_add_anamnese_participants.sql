-- Étape 2 : nouvelle colonne JSONB "anamnese" sur participants
-- Sert à stocker les données d'anamnèse déplacées du bilan initial vers la fiche patient
-- (douleur/fatigue quotidiennes, etc. — futurs champs ajoutés dans cette même colonne)

ALTER TABLE participants
ADD COLUMN IF NOT EXISTS anamnese JSONB;

NOTIFY pgrst, 'reload schema';
