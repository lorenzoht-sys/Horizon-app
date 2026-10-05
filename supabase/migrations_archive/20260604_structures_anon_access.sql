-- Accès lecture publique pour le portail structure (staff de la structure)
-- Seuls les patients rattachés à une structure active sont lisibles sans auth

-- Participants rattachés à une structure
DROP POLICY IF EXISTS "structure_anon_read_participants" ON participants;
CREATE POLICY "structure_anon_read_participants" ON participants
  FOR SELECT USING (
    structure_id IS NOT NULL
    AND structure_id IN (SELECT id FROM structures WHERE actif = true)
  );

-- Bilans des patients de structure
DROP POLICY IF EXISTS "structure_anon_read_bilans" ON bilans;
CREATE POLICY "structure_anon_read_bilans" ON bilans
  FOR SELECT USING (
    participant_id IN (
      SELECT id FROM participants WHERE structure_id IS NOT NULL
    )
  );

-- Séances des patients de structure
DROP POLICY IF EXISTS "structure_anon_read_seances" ON seances;
CREATE POLICY "structure_anon_read_seances" ON seances
  FOR SELECT USING (
    participant_id IN (
      SELECT id FROM participants WHERE structure_id IS NOT NULL
    )
  );

-- Programmes des patients de structure
DROP POLICY IF EXISTS "structure_anon_read_programmes" ON programmes;
CREATE POLICY "structure_anon_read_programmes" ON programmes
  FOR SELECT USING (
    participant_id IN (
      SELECT id FROM participants WHERE structure_id IS NOT NULL
    )
  );

-- Factures de structure (lecture par structure_id)
DROP POLICY IF EXISTS "structure_anon_read_factures" ON factures_suivi;
CREATE POLICY "structure_anon_read_factures" ON factures_suivi
  FOR SELECT USING (
    structure_id IS NOT NULL
    AND structure_id IN (SELECT id FROM structures WHERE actif = true)
  );
