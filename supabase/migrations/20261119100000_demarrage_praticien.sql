-- Guide de prise en main du praticien (2026-11-19).
--
-- praticiens.demarrage : préférences du guide affiché sur le tableau de bord
-- (src/lib/demarrage.ts) : { masque, reaffiche, applicationInstallee }, trois
-- booléens. Les étapes elles-mêmes ne sont PAS stockées : elles se calculent à
-- partir des vraies données du compte.
--
-- Pourquoi une colonne et pas les métadonnées Supabase Auth : la connexion des
-- praticiens doit quitter Supabase Auth pour la migration HDS (src/lib/session.ts).
--
-- Écrite par le praticien lui-même, sous la RLS existante de praticiens
-- (praticiens_update : id = auth.uid()). Aucune donnée de santé. Le contenu est
-- relu de façon défensive côté écran (lireEtatDemarrage) ; la base borne
-- seulement la forme (un objet) et la taille.
--
-- Privilèges : aucune table créée ; la colonne suit les droits de praticiens.
-- Idempotente. Tant qu'elle n'est pas appliquée, l'écran garde l'état du guide
-- dans le navigateur (src/hooks/useDemarrage.ts) : l'ordre de mise en ligne
-- code / migration est donc libre.

ALTER TABLE public.praticiens
  ADD COLUMN IF NOT EXISTS demarrage jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.praticiens DROP CONSTRAINT IF EXISTS praticiens_demarrage_forme;
ALTER TABLE public.praticiens ADD CONSTRAINT praticiens_demarrage_forme
  CHECK (jsonb_typeof(demarrage) = 'object' AND pg_column_size(demarrage) <= 1024);

COMMENT ON COLUMN public.praticiens.demarrage IS
  'Préférences du guide de prise en main (masque, reaffiche, applicationInstallee). Aucune donnée de santé.';

-- ---------- contrôle final ----------
DO $controle$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'praticiens' AND column_name = 'demarrage'
                   AND is_nullable = 'NO' AND data_type = 'jsonb') THEN
    RAISE EXCEPTION 'Démarrage : praticiens.demarrage absente ou mal définie';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conrelid = 'public.praticiens'::regclass AND conname = 'praticiens_demarrage_forme') THEN
    RAISE EXCEPTION 'Démarrage : contrainte praticiens_demarrage_forme absente';
  END IF;
  IF EXISTS (SELECT 1 FROM public.praticiens WHERE jsonb_typeof(demarrage) <> 'object') THEN
    RAISE EXCEPTION 'Démarrage : une ligne de praticiens a un demarrage qui n''est pas un objet';
  END IF;
END
$controle$;
