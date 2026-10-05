-- Ajout du nom de naissance (jeune fille) sur la fiche patient

ALTER TABLE participants
ADD COLUMN IF NOT EXISTS nom_naissance TEXT;

NOTIFY pgrst, 'reload schema';
