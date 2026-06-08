-- ============================================================
-- CORRECTIF SÉCURITÉ : portail structure (accès anonyme par token)
-- ============================================================
-- Les policies créées dans 20260604_structures_anon_access.sql et
-- 20260607_documents_partages.sql vérifiaient seulement que le patient
-- était rattaché à une structure ACTIVE — jamais que l'appelant possédait
-- le bon token d'accès. Comme la clé "anon" Supabase est publique (elle
-- est embarquée dans le bundle front-end), n'importe qui pouvait lire les
-- données médicales de TOUTES les structures (participants, bilans,
-- séances, programmes, factures, documents partagés), sans aucun token.
--
-- Correctif : le token est désormais transmis par le portail dans l'en-tête
-- HTTP "x-structure-token" (voir client Supabase dédié dans
-- PortailStructure.tsx) et vérifié côté base via la fonction ci-dessous,
-- qui le compare au token_acces de la structure ciblée par chaque ligne.

CREATE OR REPLACE FUNCTION structure_token_valide(p_structure_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM structures s
    WHERE s.id = p_structure_id
      AND s.actif = true
      AND s.token_acces = (current_setting('request.headers', true)::json ->> 'x-structure-token')
  );
$$;

GRANT EXECUTE ON FUNCTION structure_token_valide(uuid) TO anon;

-- Participants rattachés à une structure
DROP POLICY IF EXISTS "structure_anon_read_participants" ON participants;
CREATE POLICY "structure_anon_read_participants" ON participants
  FOR SELECT USING (
    structure_id IS NOT NULL AND structure_token_valide(structure_id)
  );

-- Bilans des patients de structure
DROP POLICY IF EXISTS "structure_anon_read_bilans" ON bilans;
CREATE POLICY "structure_anon_read_bilans" ON bilans
  FOR SELECT USING (
    participant_id IN (
      SELECT id FROM participants
      WHERE structure_id IS NOT NULL AND structure_token_valide(structure_id)
    )
  );

-- Séances des patients de structure
DROP POLICY IF EXISTS "structure_anon_read_seances" ON seances;
CREATE POLICY "structure_anon_read_seances" ON seances
  FOR SELECT USING (
    participant_id IN (
      SELECT id FROM participants
      WHERE structure_id IS NOT NULL AND structure_token_valide(structure_id)
    )
  );

-- Programmes des patients de structure
DROP POLICY IF EXISTS "structure_anon_read_programmes" ON programmes;
CREATE POLICY "structure_anon_read_programmes" ON programmes
  FOR SELECT USING (
    participant_id IN (
      SELECT id FROM participants
      WHERE structure_id IS NOT NULL AND structure_token_valide(structure_id)
    )
  );

-- Factures de structure
DROP POLICY IF EXISTS "structure_anon_read_factures" ON factures_suivi;
CREATE POLICY "structure_anon_read_factures" ON factures_suivi
  FOR SELECT USING (
    structure_id IS NOT NULL AND structure_token_valide(structure_id)
  );

-- Documents partagés avec la structure
DROP POLICY IF EXISTS "structure_anon_read_documents_partages" ON documents_partages;
CREATE POLICY "structure_anon_read_documents_partages" ON documents_partages
  FOR SELECT USING (
    structure_id IS NOT NULL AND structure_token_valide(structure_id)
  );

NOTIFY pgrst, 'reload schema';
