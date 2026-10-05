-- ── Table structures ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS structures (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  praticien_id UUID NOT NULL,
  nom TEXT NOT NULL,
  type TEXT CHECK (type IN ('ehpad', 'centre', 'association', 'entreprise', 'autre')),
  adresse TEXT,
  contact_nom TEXT,
  contact_email TEXT NOT NULL,
  contact_telephone TEXT,
  token_acces TEXT UNIQUE,          -- généré côté client (pas de dépendance pgcrypto)
  tarif_seance DECIMAL(10,2) DEFAULT 45,
  frequence_facturation TEXT DEFAULT 'mensuelle'
    CHECK (frequence_facturation IN ('mensuelle', 'bimensuelle', 'a_la_seance')),
  actif BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_structures_praticien ON structures(praticien_id);
CREATE INDEX IF NOT EXISTS idx_structures_token ON structures(token_acces);

ALTER TABLE structures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "praticien_gere_structures" ON structures;
CREATE POLICY "praticien_gere_structures" ON structures
  FOR ALL
  USING (praticien_id = auth.uid())
  WITH CHECK (praticien_id = auth.uid());

DROP POLICY IF EXISTS "lecture_publique_token" ON structures;
CREATE POLICY "lecture_publique_token" ON structures
  FOR SELECT USING (actif = true);

-- ── Rattachement participants → structures ────────────────────────────────────
ALTER TABLE participants
  ADD COLUMN IF NOT EXISTS structure_id UUID REFERENCES structures(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_participants_structure ON participants(structure_id);

-- ── Factures structure dans factures_suivi ────────────────────────────────────
ALTER TABLE factures_suivi ALTER COLUMN participant_id DROP NOT NULL;

ALTER TABLE factures_suivi
  ADD COLUMN IF NOT EXISTS structure_id UUID REFERENCES structures(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_factures_structure ON factures_suivi(structure_id);
