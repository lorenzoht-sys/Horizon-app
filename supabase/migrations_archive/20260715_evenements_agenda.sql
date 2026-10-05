-- ============================================================================
-- 20260715_evenements_agenda.sql
-- ============================================================================
--
-- Nouveau concept : "événement d'agenda", distinct d'une séance patient et
-- distinct de indisponibilites (créneaux récurrents hebdomadaires sans date,
-- affichés en fond hachuré — voir useIndispos.ts). Un événement d'agenda est
-- ponctuel (une vraie date), titré, et doit apparaître comme un bloc sur le
-- calendrier de /agenda-v2 — structurellement plus proche d'une séance que
-- d'une indisponibilité récurrente.
--
-- Table dédiée plutôt qu'extension de indisponibilites : indisponibilites n'a
-- pas de colonne date (incompatible avec un événement ponctuel) et sert un
-- affichage différent (fond de grille, pas un bloc cliquable). Une table à
-- part évite tout risque de régression sur les indisponibilités récurrentes
-- de Pierre déjà en prod.
--
-- 'indisponibilite' ici = blocage ponctuel à une date précise (ex: rendez-vous
-- médical le 20/07), différent de indisponibilites (récurrent, sans date).
--
-- IDEMPOTENTE : rejouable sans effet si déjà appliquée.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.evenements_agenda (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  praticien_id UUID        REFERENCES auth.users(id) ON DELETE CASCADE,

  type         TEXT        NOT NULL CHECK (type IN ('indisponibilite', 'reunion_professionnelle', 'premier_contact_prospect')),
  titre        TEXT        NOT NULL,
  date         DATE        NOT NULL,
  heure_debut  TEXT        NOT NULL,
  heure_fin    TEXT        NOT NULL,
  notes        TEXT,

  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_evenements_agenda_praticien_date
  ON public.evenements_agenda (praticien_id, date);

ALTER TABLE public.evenements_agenda ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "evenements_agenda_select" ON public.evenements_agenda;
CREATE POLICY "evenements_agenda_select" ON public.evenements_agenda
  FOR SELECT USING (praticien_id = auth.uid());

DROP POLICY IF EXISTS "evenements_agenda_insert" ON public.evenements_agenda;
CREATE POLICY "evenements_agenda_insert" ON public.evenements_agenda
  FOR INSERT WITH CHECK (praticien_id = auth.uid());

DROP POLICY IF EXISTS "evenements_agenda_update" ON public.evenements_agenda;
CREATE POLICY "evenements_agenda_update" ON public.evenements_agenda
  FOR UPDATE USING (praticien_id = auth.uid());

DROP POLICY IF EXISTS "evenements_agenda_delete" ON public.evenements_agenda;
CREATE POLICY "evenements_agenda_delete" ON public.evenements_agenda
  FOR DELETE USING (praticien_id = auth.uid());

DROP TRIGGER IF EXISTS evenements_agenda_updated_at ON public.evenements_agenda;
CREATE TRIGGER evenements_agenda_updated_at
  BEFORE UPDATE ON public.evenements_agenda
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS evenements_agenda_set_praticien ON public.evenements_agenda;
CREATE TRIGGER evenements_agenda_set_praticien
  BEFORE INSERT ON public.evenements_agenda
  FOR EACH ROW EXECUTE FUNCTION set_praticien_id_from_auth();

NOTIFY pgrst, 'reload schema';
