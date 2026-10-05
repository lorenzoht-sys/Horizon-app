-- TM6 : durée variable du test + pauses pendant le test
-- (champs optionnels, rétrocompatibles avec les bilans existants)

ALTER TABLE bilans
ADD COLUMN IF NOT EXISTS tm6_duree_mode TEXT;

ALTER TABLE bilans
ADD COLUMN IF NOT EXISTS tm6_duree_cible_secondes INTEGER;

ALTER TABLE bilans
ADD COLUMN IF NOT EXISTS tm6_duree_reelle_secondes INTEGER;

ALTER TABLE bilans
ADD COLUMN IF NOT EXISTS tm6_nb_pauses INTEGER;

ALTER TABLE bilans
ADD COLUMN IF NOT EXISTS tm6_duree_pauses_secondes INTEGER;

ALTER TABLE bilans
ADD COLUMN IF NOT EXISTS tm6_notes_pauses TEXT;

ALTER TABLE bilans
ADD COLUMN IF NOT EXISTS tm6_pauses_detail JSONB;
