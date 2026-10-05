-- ============================================================================
-- 20260810_evenements_agenda_champs_generiques.sql
-- ============================================================================
--
-- Étend evenements_agenda (créée par 20260715_evenements_agenda.sql) pour
-- couvrir les événements génériques demandés par Pierre : identité de contact
-- (nom/prenom/adresse/telephone, tous optionnels) et couleur choisie
-- librement (jusqu'ici fixe/grisée côté UI, voir eventPropGetter dans
-- AgendaV2Page.tsx).
--
-- Catégories : les 3 valeurs historiques (indisponibilite,
-- reunion_professionnelle, premier_contact_prospect) restent acceptées en
-- base pour ne pas invalider les lignes déjà créées depuis le bouton
-- "+ Ajouter un événement" existant de /agenda-v2 — aucune donnée existante
-- n'est renommée. Les 5 nouvelles catégories de Pierre s'ajoutent à la
-- liste ; le formulaire de création ne proposera plus que celles-ci (choix
-- fait ct côté produit, pas une contrainte technique).
--
-- Couleur : '#6B7280' par défaut (le gris déjà utilisé aujourd'hui pour tous
-- les événements) — les lignes existantes et toute création sans choix
-- explicite gardent donc le même rendu visuel qu'avant cette migration.
--
-- IDEMPOTENTE : rejouable sans effet si déjà appliquée.
-- ============================================================================

ALTER TABLE public.evenements_agenda
  ADD COLUMN IF NOT EXISTS nom       TEXT,
  ADD COLUMN IF NOT EXISTS prenom    TEXT,
  ADD COLUMN IF NOT EXISTS adresse   TEXT,
  ADD COLUMN IF NOT EXISTS telephone TEXT,
  ADD COLUMN IF NOT EXISTS couleur   TEXT NOT NULL DEFAULT '#6B7280';

ALTER TABLE public.evenements_agenda DROP CONSTRAINT IF EXISTS evenements_agenda_couleur_hex;
ALTER TABLE public.evenements_agenda ADD CONSTRAINT evenements_agenda_couleur_hex
  CHECK (couleur ~ '^#[0-9A-Fa-f]{6}$');

ALTER TABLE public.evenements_agenda DROP CONSTRAINT IF EXISTS evenements_agenda_type_check;
ALTER TABLE public.evenements_agenda ADD CONSTRAINT evenements_agenda_type_check
  CHECK (type IN (
    'indisponibilite', 'reunion_professionnelle', 'premier_contact_prospect',  -- historiques, conservées (lignes déjà en base)
    'bilan', 'reunion', 'prospect', 'lieu_particulier', 'autre'                -- nouvelles catégories Pierre, seules proposées désormais dans le formulaire
  ));

NOTIFY pgrst, 'reload schema';
