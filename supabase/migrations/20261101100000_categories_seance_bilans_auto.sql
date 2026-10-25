-- Agenda mobile complet (chantier 15) : catégories de séance personnalisées, objectif de séance,
-- bilans automatiques.
--
-- 1. categories_seance : catégories PROPRES à chaque praticien (nom + couleur), jamais imposées par
--    Horizon. `est_bilan` marque celle que les bilans automatiques utilisent (la « catégorie Bilan »
--    du praticien) ; au plus une par praticien.
-- 2. seances.categorie_id : catégorie choisie à la création (ON DELETE SET NULL : supprimer une
--    catégorie ne supprime jamais une séance, elle retombe sur la couleur par défaut).
--    seances.objectif : objectif de la séance (les notes libres existent déjà : seances.notes).
--    seances.bilan_auto : séance posée par la programmation automatique — c'est ce qui permet de la
--    retirer proprement quand le praticien désactive l'option, sans jamais toucher à une séance
--    créée à la main.
-- 3. bilans_auto : réglage par bénéficiaire (actif, tous les N mois). Un bénéficiaire sans ligne =
--    option désactivée : rien n'est imposé.
--
-- Privilèges : règle du 2026-08-29. REVOKE explicite de tout, puis GRANT ciblé (SELECT/INSERT/UPDATE/
-- DELETE à authenticated, que la RLS borne ; ALL à service_role). En production, les privilèges par
-- défaut de `postgres` donnent ALL à authenticated et service_role sur toute nouvelle table.

-- ---------- 1. categories_seance ----------
CREATE TABLE IF NOT EXISTS public.categories_seance (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  praticien_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nom          text NOT NULL,
  couleur      text NOT NULL DEFAULT '#6B7280',
  est_bilan    boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT categories_seance_couleur_hex CHECK (couleur ~ '^#[0-9A-Fa-f]{6}$'),
  CONSTRAINT categories_seance_nom_non_vide CHECK (length(btrim(nom)) BETWEEN 1 AND 60)
);

CREATE INDEX IF NOT EXISTS idx_categories_seance_praticien ON public.categories_seance (praticien_id);
-- Une seule catégorie « Bilan » par praticien.
CREATE UNIQUE INDEX IF NOT EXISTS categories_seance_une_bilan_par_praticien
  ON public.categories_seance (praticien_id) WHERE est_bilan;

DROP TRIGGER IF EXISTS categories_seance_set_praticien ON public.categories_seance;
CREATE TRIGGER categories_seance_set_praticien BEFORE INSERT ON public.categories_seance
  FOR EACH ROW EXECUTE FUNCTION public.set_praticien_id_from_auth();
DROP TRIGGER IF EXISTS categories_seance_updated_at ON public.categories_seance;
CREATE TRIGGER categories_seance_updated_at BEFORE UPDATE ON public.categories_seance
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.categories_seance ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "categories_seance_praticien" ON public.categories_seance;
CREATE POLICY "categories_seance_praticien" ON public.categories_seance
  FOR ALL TO authenticated
  USING (praticien_id = auth.uid())
  WITH CHECK (praticien_id = auth.uid());

-- ---------- 2. colonnes de seances ----------
ALTER TABLE public.seances ADD COLUMN IF NOT EXISTS categorie_id uuid
  REFERENCES public.categories_seance(id) ON DELETE SET NULL;
ALTER TABLE public.seances ADD COLUMN IF NOT EXISTS objectif text;
ALTER TABLE public.seances ADD COLUMN IF NOT EXISTS bilan_auto boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_seances_categorie ON public.seances (categorie_id) WHERE categorie_id IS NOT NULL;

-- Une séance ne peut référencer que la catégorie de SON praticien (la FK seule ne le garantit pas).
CREATE OR REPLACE FUNCTION public.seances_categorie_du_praticien() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.categorie_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.categories_seance c
     WHERE c.id = NEW.categorie_id AND c.praticien_id = NEW.praticien_id
  ) THEN
    RAISE EXCEPTION 'Catégorie de séance inconnue pour ce praticien';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.seances_categorie_du_praticien() FROM PUBLIC, anon, authenticated;

-- Nommé « seances_z_… » pour s'exécuter APRÈS seances_set_praticien (ordre alphabétique des
-- triggers BEFORE), qui renseigne praticien_id quand le client ne l'envoie pas.
DROP TRIGGER IF EXISTS seances_z_categorie_du_praticien ON public.seances;
CREATE TRIGGER seances_z_categorie_du_praticien BEFORE INSERT OR UPDATE OF categorie_id ON public.seances
  FOR EACH ROW EXECUTE FUNCTION public.seances_categorie_du_praticien();

-- ---------- 3. bilans_auto ----------
CREATE TABLE IF NOT EXISTS public.bilans_auto (
  participant_id uuid PRIMARY KEY REFERENCES public.participants(id) ON DELETE CASCADE,
  praticien_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  actif          boolean NOT NULL DEFAULT false,
  frequence_mois integer NOT NULL DEFAULT 3,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bilans_auto_frequence CHECK (frequence_mois BETWEEN 1 AND 24)
);

DROP TRIGGER IF EXISTS bilans_auto_set_praticien ON public.bilans_auto;
CREATE TRIGGER bilans_auto_set_praticien BEFORE INSERT ON public.bilans_auto
  FOR EACH ROW EXECUTE FUNCTION public.set_praticien_id_from_auth();
DROP TRIGGER IF EXISTS bilans_auto_updated_at ON public.bilans_auto;
CREATE TRIGGER bilans_auto_updated_at BEFORE UPDATE ON public.bilans_auto
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.bilans_auto ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "bilans_auto_praticien" ON public.bilans_auto;
CREATE POLICY "bilans_auto_praticien" ON public.bilans_auto
  FOR ALL TO authenticated
  USING (praticien_id = auth.uid())
  WITH CHECK (
    praticien_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.participants p WHERE p.id = participant_id AND p.praticien_id = auth.uid())
  );

-- ---------- privilèges ----------
REVOKE ALL ON TABLE public.categories_seance, public.bilans_auto FROM PUBLIC;
REVOKE ALL ON TABLE public.categories_seance, public.bilans_auto FROM anon;
REVOKE ALL ON TABLE public.categories_seance, public.bilans_auto FROM authenticated;
REVOKE ALL ON TABLE public.categories_seance, public.bilans_auto FROM service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.categories_seance, public.bilans_auto TO authenticated;
GRANT ALL ON TABLE public.categories_seance, public.bilans_auto TO service_role;

-- ---------- contrôle final ----------
DO $controle$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['categories_seance','bilans_auto'] LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE EXCEPTION 'Agenda mobile : table % absente', t;
    END IF;
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = ('public.' || t)::regclass) THEN
      RAISE EXCEPTION 'Agenda mobile : RLS désactivée sur %', t;
    END IF;
    IF has_table_privilege('anon', 'public.' || t, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') THEN
      RAISE EXCEPTION 'Agenda mobile : anon a des privilèges sur %', t;
    END IF;
    IF has_table_privilege('authenticated', 'public.' || t, 'TRUNCATE')
       OR has_table_privilege('authenticated', 'public.' || t, 'REFERENCES')
       OR has_table_privilege('authenticated', 'public.' || t, 'TRIGGER') THEN
      RAISE EXCEPTION 'Agenda mobile : authenticated a des privilèges superflus sur %', t;
    END IF;
    IF NOT has_table_privilege('service_role', 'public.' || t, 'SELECT,INSERT,UPDATE,DELETE') THEN
      RAISE EXCEPTION 'Agenda mobile : service_role privé de droits sur %', t;
    END IF;
  END LOOP;

  IF (SELECT count(*) FROM pg_policies WHERE schemaname = 'public'
      AND tablename IN ('categories_seance','bilans_auto')) <> 2 THEN
    RAISE EXCEPTION 'Agenda mobile : 2 policies attendues sur categories_seance/bilans_auto';
  END IF;
  IF (SELECT count(*) FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'seances'
         AND column_name IN ('categorie_id','objectif','bilan_auto')) <> 3 THEN
    RAISE EXCEPTION 'Agenda mobile : colonnes categorie_id/objectif/bilan_auto de seances absentes';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public'
                 AND indexname = 'categories_seance_une_bilan_par_praticien' AND indexdef LIKE 'CREATE UNIQUE%') THEN
    RAISE EXCEPTION 'Agenda mobile : index d''unicité de la catégorie Bilan absent';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.seances'::regclass
                 AND tgname = 'seances_z_categorie_du_praticien') THEN
    RAISE EXCEPTION 'Agenda mobile : trigger de cohérence catégorie/praticien absent';
  END IF;
END
$controle$;
