-- TM6 amélioré : mesures par minute pendant le test, repos 1 min,
-- comptage pas (stepper) et tours (pédalier)

ALTER TABLE bilans
ADD COLUMN IF NOT EXISTS tm6_mesures_par_minute JSONB;

ALTER TABLE bilans
ADD COLUMN IF NOT EXISTS tm6_fc_1min INTEGER;

ALTER TABLE bilans
ADD COLUMN IF NOT EXISTS tm6_spo2_1min INTEGER;

ALTER TABLE bilans
ADD COLUMN IF NOT EXISTS tm6_nb_pas INTEGER;

ALTER TABLE bilans
ADD COLUMN IF NOT EXISTS tm6_nb_tours INTEGER;
