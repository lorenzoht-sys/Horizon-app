-- Ajout des colonnes scores sédentarité/fatigue manquantes sur bilans
-- (envoyées par bilanToDb mais absentes de la table -> PGRST204 sur tout insert/update)

ALTER TABLE bilans
ADD COLUMN IF NOT EXISTS sedentarite_score INTEGER;

ALTER TABLE bilans
ADD COLUMN IF NOT EXISTS sedentarite_profil TEXT;

ALTER TABLE bilans
ADD COLUMN IF NOT EXISTS sedentarite_reponses JSONB;

ALTER TABLE bilans
ADD COLUMN IF NOT EXISTS fatigue_score INTEGER;

ALTER TABLE bilans
ADD COLUMN IF NOT EXISTS fatigue_profil TEXT;

ALTER TABLE bilans
ADD COLUMN IF NOT EXISTS fatigue_reponses JSONB;
