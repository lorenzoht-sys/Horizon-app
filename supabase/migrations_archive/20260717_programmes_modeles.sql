-- ============================================================================
-- 20260717_programmes_modeles.sql
-- ============================================================================
--
-- Programmes "modèles" réutilisables : contenu personnel du praticien, sans
-- bénéficiaire rattaché. Un modèle se crée vierge (pas de duplication depuis
-- un programme existant). L'appliquer à un bénéficiaire crée une copie
-- totalement indépendante dans les tables réelles (programmes,
-- programme_seances, programme_planning, programme_exercices) — aucune
-- référence stockée vers le modèle source après coup : modifier l'un
-- n'affecte jamais l'autre, ni dans un sens ni dans l'autre.
--
-- Structure miroir de programmes/programme_seances/programme_planning/
-- programme_exercices, sans participant_id. RLS scopée au praticien
-- propriétaire, même pattern que templates_structure (praticien_id = auth.uid()).
--
-- La fonction dupliquer_programme_modele() fait toute la copie en profondeur
-- dans une seule transaction PL/pgSQL : un seul appel réseau côté client
-- (supabase.rpc), aucune orchestration de plusieurs INSERT séquentiels,
-- aucun risque d'écriture partielle en cas d'erreur en cours de route.
--
-- EXÉCUTÉE MANUELLEMENT SUR SUPABASE le 2026-07-17 (SQL Editor). Ce fichier
-- documente a posteriori l'état déjà appliqué en base, conformément au
-- pattern de versionnage suivi pour toutes les migrations de cette session.
-- ============================================================================

-- ── 1. programmes_modeles ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS programmes_modeles (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  praticien_id                UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  nom                         TEXT NOT NULL,
  type                        TEXT CHECK (type IN ('seance', 'domicile', 'quotidien', 'recuperation')),
  objectif                    TEXT DEFAULT '',
  objectif_seances_autonomes  INTEGER CHECK (objectif_seances_autonomes IS NULL OR objectif_seances_autonomes > 0),
  message_motivation          TEXT DEFAULT '',

  created_at                  TIMESTAMPTZ DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE programmes_modeles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "praticien_gere_programmes_modeles" ON programmes_modeles;
CREATE POLICY "praticien_gere_programmes_modeles" ON programmes_modeles
  FOR ALL USING (praticien_id = auth.uid()) WITH CHECK (praticien_id = auth.uid());

DROP TRIGGER IF EXISTS programmes_modeles_updated_at ON programmes_modeles;
CREATE TRIGGER programmes_modeles_updated_at
  BEFORE UPDATE ON programmes_modeles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS programmes_modeles_set_praticien ON programmes_modeles;
CREATE TRIGGER programmes_modeles_set_praticien
  BEFORE INSERT ON programmes_modeles
  FOR EACH ROW EXECUTE FUNCTION set_praticien_id_from_auth();

GRANT SELECT, INSERT, UPDATE, DELETE ON programmes_modeles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON programmes_modeles TO service_role;

-- ── 2. programme_modele_seances ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS programme_modele_seances (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  modele_id    UUID NOT NULL REFERENCES programmes_modeles(id) ON DELETE CASCADE,
  nom          TEXT NOT NULL,
  description  TEXT,
  ordre        INTEGER DEFAULT 1,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE programme_modele_seances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "praticien_gere_modele_seances" ON programme_modele_seances;
CREATE POLICY "praticien_gere_modele_seances" ON programme_modele_seances
  FOR ALL USING (EXISTS (
    SELECT 1 FROM programmes_modeles m
    WHERE m.id = programme_modele_seances.modele_id AND m.praticien_id = auth.uid()
  )) WITH CHECK (EXISTS (
    SELECT 1 FROM programmes_modeles m
    WHERE m.id = programme_modele_seances.modele_id AND m.praticien_id = auth.uid()
  ));

GRANT SELECT, INSERT, UPDATE, DELETE ON programme_modele_seances TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON programme_modele_seances TO service_role;

-- ── 3. programme_modele_planning ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS programme_modele_planning (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  modele_id  UUID NOT NULL REFERENCES programmes_modeles(id) ON DELETE CASCADE,
  seance_id  UUID NOT NULL REFERENCES programme_modele_seances(id) ON DELETE CASCADE,
  jour       TEXT NOT NULL CHECK (jour IN ('lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE programme_modele_planning ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "praticien_gere_modele_planning" ON programme_modele_planning;
CREATE POLICY "praticien_gere_modele_planning" ON programme_modele_planning
  FOR ALL USING (EXISTS (
    SELECT 1 FROM programmes_modeles m
    WHERE m.id = programme_modele_planning.modele_id AND m.praticien_id = auth.uid()
  )) WITH CHECK (EXISTS (
    SELECT 1 FROM programmes_modeles m
    WHERE m.id = programme_modele_planning.modele_id AND m.praticien_id = auth.uid()
  ));

GRANT SELECT, INSERT, UPDATE, DELETE ON programme_modele_planning TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON programme_modele_planning TO service_role;

-- ── 4. programme_modele_exercices ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS programme_modele_exercices (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seance_id         UUID NOT NULL REFERENCES programme_modele_seances(id) ON DELETE CASCADE,
  nom               TEXT NOT NULL,
  categorie         TEXT,
  description       TEXT,
  conseil_securite  TEXT,
  series            INTEGER,
  repetitions       INTEGER,
  duree_secondes    INTEGER,
  ordre             INTEGER DEFAULT 1,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE programme_modele_exercices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "praticien_gere_modele_exercices" ON programme_modele_exercices;
CREATE POLICY "praticien_gere_modele_exercices" ON programme_modele_exercices
  FOR ALL USING (EXISTS (
    SELECT 1 FROM programme_modele_seances s
    JOIN programmes_modeles m ON m.id = s.modele_id
    WHERE s.id = programme_modele_exercices.seance_id AND m.praticien_id = auth.uid()
  )) WITH CHECK (EXISTS (
    SELECT 1 FROM programme_modele_seances s
    JOIN programmes_modeles m ON m.id = s.modele_id
    WHERE s.id = programme_modele_exercices.seance_id AND m.praticien_id = auth.uid()
  ));

GRANT SELECT, INSERT, UPDATE, DELETE ON programme_modele_exercices TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON programme_modele_exercices TO service_role;

-- ── 5. dupliquer_programme_modele() ─────────────────────────────────────────
-- Copie en profondeur un modèle vers un nouveau programme rattaché à un
-- bénéficiaire. Transaction unique : échec = rollback total, rien n'est écrit.

CREATE OR REPLACE FUNCTION public.dupliquer_programme_modele(
  p_modele_id      UUID,
  p_participant_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_modele            programmes_modeles%ROWTYPE;
  v_new_programme_id  UUID;
  v_seance            programme_modele_seances%ROWTYPE;
  v_new_seance_id     UUID;
  v_exercice          programme_modele_exercices%ROWTYPE;
  v_planning          programme_modele_planning%ROWTYPE;
  v_mapped_seance_id  UUID;
  v_seance_id_map     JSONB := '{}'::jsonb;
BEGIN
  -- (a) Le modèle doit exister ET appartenir au praticien appelant.
  SELECT * INTO v_modele
  FROM programmes_modeles
  WHERE id = p_modele_id AND praticien_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Modèle introuvable ou accès refusé';
  END IF;

  -- (b) Le bénéficiaire cible doit être accessible à l'appelant — réutilise
  -- acces_participant() (palier 1 mode organisation), pas de check ad hoc :
  -- couvre praticien propriétaire ET membre actif de l'organisation du participant.
  IF NOT public.acces_participant(p_participant_id) THEN
    RAISE EXCEPTION 'Bénéficiaire introuvable ou accès refusé';
  END IF;

  -- 1. Créer le programme réel (praticien_id auto-rempli par le trigger existant)
  INSERT INTO programmes (
    participant_id, nom, titre, objectif, objectif_seances_autonomes,
    message_motivation, type, actif, date_creation, date_debut, exercices, suivi_semaines
  ) VALUES (
    p_participant_id, v_modele.nom, v_modele.nom, v_modele.objectif, v_modele.objectif_seances_autonomes,
    v_modele.message_motivation, v_modele.type, true, CURRENT_DATE, CURRENT_DATE, '[]'::jsonb, '[]'::jsonb
  )
  RETURNING id INTO v_new_programme_id;

  -- 2. Copier chaque séance, puis (dans la même itération) ses exercices —
  --    v_new_seance_id vient tout juste d'être produit par RETURNING, aucune
  --    ambiguïté possible avec l'ancien id de la séance modèle.
  FOR v_seance IN
    SELECT * FROM programme_modele_seances WHERE modele_id = p_modele_id ORDER BY ordre
  LOOP
    INSERT INTO programme_seances (programme_id, nom, description, ordre)
    VALUES (v_new_programme_id, v_seance.nom, v_seance.description, v_seance.ordre)
    RETURNING id INTO v_new_seance_id;

    -- Mémorisé pour le planning, traité plus loin dans une boucle séparée.
    v_seance_id_map := v_seance_id_map || jsonb_build_object(v_seance.id::text, v_new_seance_id::text);

    FOR v_exercice IN
      SELECT * FROM programme_modele_exercices WHERE seance_id = v_seance.id ORDER BY ordre
    LOOP
      INSERT INTO programme_exercices (
        seance_id, nom, categorie, description, conseil_securite,
        series, repetitions, duree_secondes, ordre
      ) VALUES (
        v_new_seance_id, v_exercice.nom, v_exercice.categorie, v_exercice.description,
        v_exercice.conseil_securite, v_exercice.series, v_exercice.repetitions,
        v_exercice.duree_secondes, v_exercice.ordre
      );
    END LOOP;
  END LOOP;

  -- 3. Copier le planning en recâblant seance_id via la correspondance construite ci-dessus.
  FOR v_planning IN
    SELECT * FROM programme_modele_planning WHERE modele_id = p_modele_id
  LOOP
    v_mapped_seance_id := (v_seance_id_map ->> v_planning.seance_id::text)::uuid;

    IF v_mapped_seance_id IS NULL THEN
      RAISE EXCEPTION 'Incohérence de données : séance modèle % introuvable dans la correspondance', v_planning.seance_id;
    END IF;

    INSERT INTO programme_planning (programme_id, seance_id, jour)
    VALUES (v_new_programme_id, v_mapped_seance_id, v_planning.jour);
  END LOOP;

  RETURN v_new_programme_id;
END;
$$;

REVOKE ALL ON FUNCTION public.dupliquer_programme_modele(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dupliquer_programme_modele(UUID, UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
