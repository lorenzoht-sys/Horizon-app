-- Ajout des champs lieu de naissance pour les attestations fiscales SAP

ALTER TABLE participants
ADD COLUMN IF NOT EXISTS ville_naissance TEXT;

ALTER TABLE participants
ADD COLUMN IF NOT EXISTS cp_naissance TEXT;
