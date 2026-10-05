-- Index participants(structure_id), prévu par 20260604_structures.sql (archive)
-- et absent en production au 2026-10-05. Sert le portail structure et la
-- facturation par structure. Idempotent. Aucune nouvelle table.

CREATE INDEX IF NOT EXISTS idx_participants_structure ON public.participants (structure_id);

DO $controle$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_participants_structure') THEN
    RAISE EXCEPTION 'idx_participants_structure manquant';
  END IF;
END
$controle$;
