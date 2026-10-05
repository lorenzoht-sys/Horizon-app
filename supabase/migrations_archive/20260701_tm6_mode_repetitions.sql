-- TM6 : mode du test (standard / marche_sur_place) et répétitions (nombre de pas)
-- Champs capturés dans le formulaire mais absents de la DB jusqu'ici.

ALTER TABLE bilans
ADD COLUMN IF NOT EXISTS tm6_mode TEXT;

ALTER TABLE bilans
ADD COLUMN IF NOT EXISTS tm6_repetitions INTEGER;
