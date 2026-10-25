-- Bibliothèque collective (« Collectif », 2026-10-25) : exercices et modèles de programme partagés
-- VOLONTAIREMENT entre enseignants APA.
--
-- Principes :
--   - Rien n'est partagé automatiquement : une ligne n'existe ici que si son auteur a cliqué
--     « Partager dans Collectif ». Le contenu est une COPIE (instantané jsonb des seuls champs
--     professionnels) : modifier ou supprimer l'original personnel ne touche pas la version partagée,
--     et récupérer un contenu collectif crée une copie personnelle indépendante (côté application).
--   - Lecture réservée aux comptes enseignants (app_role praticien ou admin). Les bénéficiaires n'ont
--     pas de compte Supabase et n'y accèdent jamais.
--   - Aucune modification en place (pas de policy UPDATE) : personne, pas même l'auteur, ne réécrit
--     une version partagée que d'autres ont déjà pu récupérer. L'auteur la retire (DELETE) et en
--     republie une autre ; un admin peut retirer n'importe quel contenu (modération).
--   - Nom d'auteur calculé par la base (« Prénom N. ») à partir de praticiens : non falsifiable.
--   - Garde-fou données de santé : insertion REFUSÉE si le texte contient le prénom ET le nom d'un
--     bénéficiaire de l'auteur côte à côte. Le contrôle complet (prénom seul, nom seul) et la
--     confirmation explicite se font avant l'envoi, côté application ; ce trigger ne garde que les cas
--     sans ambiguïté, pour ne jamais bloquer un contenu légitime (« Pont fessier » face à un nom
--     « Pont »).
--   - Colonnes prévues pour plus tard (popularité, favoris, versions…) : nb_utilisations, et des
--     tables séparées pourront s'y rattacher par identifiant sans refonte.
--
-- Privilèges : règle du 2026-08-29. REVOKE explicite, puis GRANT ciblé : SELECT/INSERT/DELETE à
-- authenticated (bornés par la RLS), ALL à service_role.

-- ---------- tables ----------
CREATE TABLE IF NOT EXISTS public.exercices_collectifs (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  praticien_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  auteur_nom          text NOT NULL DEFAULT '',
  source_exercice_id  uuid,
  nom                 text NOT NULL,
  categorie           text NOT NULL,
  familles            text[] NOT NULL DEFAULT '{}',
  materiels           text[] NOT NULL DEFAULT '{}',
  position            text,
  contenu             jsonb NOT NULL,
  nb_utilisations     integer NOT NULL DEFAULT 0,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT exercices_collectifs_nom CHECK (length(btrim(nom)) BETWEEN 1 AND 120),
  CONSTRAINT exercices_collectifs_categorie CHECK (categorie IN ('equilibre','force','mobilite','souplesse','endurance','memoire')),
  CONSTRAINT exercices_collectifs_contenu_objet CHECK (jsonb_typeof(contenu) = 'object'),
  CONSTRAINT exercices_collectifs_contenu_taille CHECK (octet_length(contenu::text) <= 20000)
);

CREATE TABLE IF NOT EXISTS public.modeles_collectifs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  praticien_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  auteur_nom        text NOT NULL DEFAULT '',
  source_modele_id  uuid,
  nom               text NOT NULL,
  objectif          text,
  famille           text,
  position          text,
  niveau            text,
  materiels         text[] NOT NULL DEFAULT '{}',
  nb_exercices      integer NOT NULL DEFAULT 0,
  duree_minutes     integer,
  contenu           jsonb NOT NULL,
  nb_utilisations   integer NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT modeles_collectifs_nom CHECK (length(btrim(nom)) BETWEEN 1 AND 120),
  CONSTRAINT modeles_collectifs_contenu_objet CHECK (jsonb_typeof(contenu) = 'object'),
  CONSTRAINT modeles_collectifs_contenu_taille CHECK (octet_length(contenu::text) <= 100000)
);

CREATE INDEX IF NOT EXISTS idx_exercices_collectifs_created ON public.exercices_collectifs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_exercices_collectifs_praticien ON public.exercices_collectifs (praticien_id);
CREATE INDEX IF NOT EXISTS idx_modeles_collectifs_created ON public.modeles_collectifs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_modeles_collectifs_praticien ON public.modeles_collectifs (praticien_id);

-- ---------- auteur et garde-fou (avant insertion) ----------
CREATE OR REPLACE FUNCTION public.collectif_avant_insertion() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_texte text;
  v_prenom text;
  v_nom text;
BEGIN
  -- L'auteur est toujours l'appelant (le client ne peut pas publier au nom d'un autre).
  IF auth.uid() IS NOT NULL THEN
    NEW.praticien_id := auth.uid();
  END IF;

  SELECT btrim(coalesce(p.prenom, '')), btrim(coalesce(p.nom, ''))
    INTO v_prenom, v_nom
    FROM public.praticiens p WHERE p.id = NEW.praticien_id;
  NEW.auteur_nom := btrim(coalesce(v_prenom, '') || CASE WHEN coalesce(v_nom, '') <> '' THEN ' ' || upper(left(v_nom, 1)) || '.' ELSE '' END);

  v_texte := lower(NEW.nom || ' ' || NEW.contenu::text);
  IF EXISTS (
    SELECT 1 FROM public.participants pa
     WHERE pa.praticien_id = NEW.praticien_id
       AND length(btrim(coalesce(pa.prenom, ''))) >= 2
       AND length(btrim(coalesce(pa.nom, ''))) >= 2
       AND (position(lower(btrim(pa.prenom) || ' ' || btrim(pa.nom)) IN v_texte) > 0
            OR position(lower(btrim(pa.nom) || ' ' || btrim(pa.prenom)) IN v_texte) > 0)
  ) THEN
    RAISE EXCEPTION 'Contenu refusé : il contient le nom d''un bénéficiaire' USING ERRCODE = 'check_violation';
  END IF;

  NEW.nb_utilisations := 0;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.collectif_avant_insertion() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS exercices_collectifs_avant_insertion ON public.exercices_collectifs;
CREATE TRIGGER exercices_collectifs_avant_insertion BEFORE INSERT ON public.exercices_collectifs
  FOR EACH ROW EXECUTE FUNCTION public.collectif_avant_insertion();
DROP TRIGGER IF EXISTS modeles_collectifs_avant_insertion ON public.modeles_collectifs;
CREATE TRIGGER modeles_collectifs_avant_insertion BEFORE INSERT ON public.modeles_collectifs
  FOR EACH ROW EXECUTE FUNCTION public.collectif_avant_insertion();

-- ---------- RLS ----------
ALTER TABLE public.exercices_collectifs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.modeles_collectifs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "exercices_collectifs_lecture" ON public.exercices_collectifs;
CREATE POLICY "exercices_collectifs_lecture" ON public.exercices_collectifs
  FOR SELECT TO authenticated
  USING (public.app_role_courant() IN ('praticien', 'admin'));
DROP POLICY IF EXISTS "exercices_collectifs_publication" ON public.exercices_collectifs;
CREATE POLICY "exercices_collectifs_publication" ON public.exercices_collectifs
  FOR INSERT TO authenticated
  WITH CHECK (praticien_id = auth.uid() AND public.app_role_courant() IN ('praticien', 'admin'));
DROP POLICY IF EXISTS "exercices_collectifs_retrait" ON public.exercices_collectifs;
CREATE POLICY "exercices_collectifs_retrait" ON public.exercices_collectifs
  FOR DELETE TO authenticated
  USING (praticien_id = auth.uid() OR public.app_role_courant() = 'admin');

DROP POLICY IF EXISTS "modeles_collectifs_lecture" ON public.modeles_collectifs;
CREATE POLICY "modeles_collectifs_lecture" ON public.modeles_collectifs
  FOR SELECT TO authenticated
  USING (public.app_role_courant() IN ('praticien', 'admin'));
DROP POLICY IF EXISTS "modeles_collectifs_publication" ON public.modeles_collectifs;
CREATE POLICY "modeles_collectifs_publication" ON public.modeles_collectifs
  FOR INSERT TO authenticated
  WITH CHECK (praticien_id = auth.uid() AND public.app_role_courant() IN ('praticien', 'admin'));
DROP POLICY IF EXISTS "modeles_collectifs_retrait" ON public.modeles_collectifs;
CREATE POLICY "modeles_collectifs_retrait" ON public.modeles_collectifs
  FOR DELETE TO authenticated
  USING (praticien_id = auth.uid() OR public.app_role_courant() = 'admin');

-- ---------- privilèges ----------
REVOKE ALL ON TABLE public.exercices_collectifs, public.modeles_collectifs FROM PUBLIC;
REVOKE ALL ON TABLE public.exercices_collectifs, public.modeles_collectifs FROM anon;
REVOKE ALL ON TABLE public.exercices_collectifs, public.modeles_collectifs FROM authenticated;
REVOKE ALL ON TABLE public.exercices_collectifs, public.modeles_collectifs FROM service_role;
GRANT SELECT, INSERT, DELETE ON TABLE public.exercices_collectifs, public.modeles_collectifs TO authenticated;
GRANT ALL ON TABLE public.exercices_collectifs, public.modeles_collectifs TO service_role;

-- ---------- contrôle final ----------
DO $controle$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['exercices_collectifs','modeles_collectifs'] LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE EXCEPTION 'Collectif : table % absente', t;
    END IF;
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = ('public.' || t)::regclass) THEN
      RAISE EXCEPTION 'Collectif : RLS désactivée sur %', t;
    END IF;
    IF has_table_privilege('anon', 'public.' || t, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') THEN
      RAISE EXCEPTION 'Collectif : anon a des privilèges sur %', t;
    END IF;
    IF has_table_privilege('authenticated', 'public.' || t, 'UPDATE')
       OR has_table_privilege('authenticated', 'public.' || t, 'TRUNCATE')
       OR has_table_privilege('authenticated', 'public.' || t, 'REFERENCES')
       OR has_table_privilege('authenticated', 'public.' || t, 'TRIGGER') THEN
      RAISE EXCEPTION 'Collectif : authenticated a des privilèges superflus sur % (UPDATE interdit)', t;
    END IF;
    IF NOT has_table_privilege('authenticated', 'public.' || t, 'SELECT,INSERT,DELETE') THEN
      RAISE EXCEPTION 'Collectif : authenticated privé de lecture/publication/retrait sur %', t;
    END IF;
    IF NOT has_table_privilege('service_role', 'public.' || t, 'SELECT,INSERT,UPDATE,DELETE') THEN
      RAISE EXCEPTION 'Collectif : service_role privé de droits sur %', t;
    END IF;
  END LOOP;

  IF (SELECT count(*) FROM pg_policies WHERE schemaname = 'public'
      AND tablename IN ('exercices_collectifs','modeles_collectifs')) <> 6 THEN
    RAISE EXCEPTION 'Collectif : 6 policies attendues';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public'
             AND tablename IN ('exercices_collectifs','modeles_collectifs') AND cmd = 'UPDATE') THEN
    RAISE EXCEPTION 'Collectif : aucune policy UPDATE ne doit exister';
  END IF;
  IF (SELECT count(*) FROM pg_trigger WHERE tgname IN ('exercices_collectifs_avant_insertion','modeles_collectifs_avant_insertion')) <> 2 THEN
    RAISE EXCEPTION 'Collectif : triggers avant insertion absents';
  END IF;
END
$controle$;
