-- Logo du praticien sur la facture PDF (plan facturation PR 5).
--
-- Source unique : le logo déjà géré dans Paramètres (praticiens.logo_praticien, image PNG ou JPEG en
-- data URL, 600 Ko maximum à l'envoi), qui figure déjà sur les PDF produits dans le navigateur. Le
-- profil de facturation le rappelle en lecture, sans second endroit qui écrive la colonne.
--
-- Contrainte : une facture validée est inaltérable et son PDF doit pouvoir être régénéré À L'IDENTIQUE
-- (composer.ts est déterministe). Le logo courant du praticien peut changer après coup ; on fige donc,
-- à la validation, l'image exacte utilisée :
-- 1. Table logos_factures, adressée par contenu (clé = sha256 des octets) : une image n'y est écrite
--    qu'une fois, jamais modifiée ni supprimée (trigger), et partagée par toutes les factures qui
--    l'ont. Lecture et écriture réservées à service_role (l'Edge Function facturation-pdf) et au
--    trigger ci-dessous ; aucune policy, aucun privilège pour anon ni authenticated.
-- 2. Trigger BEFORE UPDATE sur factures, au passage brouillon -> validee (le même UPDATE que
--    valider_facture(), qui pose snapshot_emetteur) : il décode le logo courant, l'enregistre dans
--    logos_factures et ajoute sa clé à snapshot_emetteur ('logo_sha256'). Il vit dans un trigger et non
--    dans valider_facture(), redéfinie en entier à chaque étape (même principe que
--    factures_validation_apres_le_mois, migration 20261011100000). Un logo absent, mal formé, d'un autre
--    format que PNG/JPEG ou de plus de 1 Mo est ignoré : la facture est validée sans logo, jamais
--    refusée pour cette raison.
--    Ordre des triggers BEFORE UPDATE (alphabétique) : factures_inalterables a déjà vérifié que la sortie
--    du brouillon vient de valider_facture() ; ce trigger ne fait que compléter le snapshot.
--
-- Factures déjà validées : inchangées (pas de clé de logo, PDF sans logo, comme avant).
-- Privilèges : règle du 2026-08-29, REVOKE explicite puis GRANT ciblé à service_role.

-- ---------- 1. images figées ----------
CREATE TABLE IF NOT EXISTS public.logos_factures (
  sha256     text PRIMARY KEY,
  type       text NOT NULL,
  octets     bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT logos_factures_sha256_format CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT logos_factures_type_valide   CHECK (type IN ('png', 'jpg')),
  CONSTRAINT logos_factures_taille        CHECK (octet_length(octets) BETWEEN 1 AND 1048576),
  CONSTRAINT logos_factures_empreinte     CHECK (sha256 = encode(sha256(octets), 'hex'))
);

ALTER TABLE public.logos_factures ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.logos_factures FROM PUBLIC;
REVOKE ALL ON TABLE public.logos_factures FROM anon;
REVOKE ALL ON TABLE public.logos_factures FROM authenticated;
REVOKE ALL ON TABLE public.logos_factures FROM service_role;
GRANT SELECT ON TABLE public.logos_factures TO service_role;

CREATE OR REPLACE FUNCTION public.logos_factures_inalterables()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'Logo figé par une facture : ni modification ni suppression';
END;
$$;

REVOKE ALL ON FUNCTION public.logos_factures_inalterables() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS logos_factures_inalterables ON public.logos_factures;
CREATE TRIGGER logos_factures_inalterables BEFORE UPDATE OR DELETE ON public.logos_factures
  FOR EACH ROW EXECUTE FUNCTION public.logos_factures_inalterables();

-- ---------- 2. figer le logo à la validation ----------
CREATE OR REPLACE FUNCTION public.factures_snapshot_logo()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_url    text;
  v_m      text[];
  v_octets bytea;
  v_type   text;
  v_sha    text;
BEGIN
  SELECT logo_praticien INTO v_url FROM public.praticiens WHERE id = NEW.praticien_id;
  IF v_url IS NULL OR btrim(v_url) = '' THEN
    RETURN NEW;
  END IF;

  BEGIN
    v_m := regexp_match(v_url, '^data:image/(png|jpe?g);base64,(.+)$', 's');
    IF v_m IS NULL THEN
      RAISE EXCEPTION 'format non reconnu';
    END IF;
    v_octets := decode(regexp_replace(v_m[2], '\s', '', 'g'), 'base64');
    -- Le type vient des octets, pas de l'en-tête déclaré.
    IF substring(v_octets FROM 1 FOR 8) = '\x89504e470d0a1a0a'::bytea THEN
      v_type := 'png';
    ELSIF substring(v_octets FROM 1 FOR 3) = '\xffd8ff'::bytea THEN
      v_type := 'jpg';
    ELSE
      RAISE EXCEPTION 'ni PNG ni JPEG';
    END IF;
    IF octet_length(v_octets) > 1048576 THEN
      RAISE EXCEPTION 'plus de 1 Mo';
    END IF;
    v_sha := encode(sha256(v_octets), 'hex');
    INSERT INTO public.logos_factures (sha256, type, octets) VALUES (v_sha, v_type, v_octets)
    ON CONFLICT (sha256) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    -- Jamais de validation refusée à cause du logo : la facture part sans logo.
    RAISE WARNING 'factures_snapshot_logo(facture %) : logo ignoré (%)', NEW.id, SQLERRM;
    RETURN NEW;
  END;

  NEW.snapshot_emetteur := coalesce(NEW.snapshot_emetteur, '{}'::jsonb) || jsonb_build_object('logo_sha256', v_sha);
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.factures_snapshot_logo() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS factures_snapshot_logo ON public.factures;
CREATE TRIGGER factures_snapshot_logo
  BEFORE UPDATE OF statut ON public.factures
  FOR EACH ROW
  WHEN (OLD.statut = 'brouillon' AND NEW.statut = 'validee')
  EXECUTE FUNCTION public.factures_snapshot_logo();

-- ---------- contrôle final ----------
DO $controle$
BEGIN
  IF to_regclass('public.logos_factures') IS NULL
     OR NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.logos_factures'::regclass) THEN
    RAISE EXCEPTION 'Logo facture : table logos_factures absente ou sans RLS';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'logos_factures') THEN
    RAISE EXCEPTION 'Logo facture : logos_factures ne doit avoir aucune policy';
  END IF;
  IF has_table_privilege('anon', 'public.logos_factures', 'SELECT') OR has_table_privilege('authenticated', 'public.logos_factures', 'SELECT')
     OR has_table_privilege('anon', 'public.logos_factures', 'INSERT') OR has_table_privilege('authenticated', 'public.logos_factures', 'INSERT')
     OR NOT has_table_privilege('service_role', 'public.logos_factures', 'SELECT')
     OR has_table_privilege('service_role', 'public.logos_factures', 'INSERT')
     OR has_table_privilege('service_role', 'public.logos_factures', 'UPDATE')
     OR has_table_privilege('service_role', 'public.logos_factures', 'DELETE') THEN
    RAISE EXCEPTION 'Logo facture : privilèges de logos_factures incorrects (SELECT à service_role seulement)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'logos_factures_inalterables'
                   AND tgrelid = 'public.logos_factures'::regclass AND NOT tgisinternal AND tgenabled = 'O') THEN
    RAISE EXCEPTION 'Logo facture : trigger logos_factures_inalterables absent ou désactivé';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'factures_snapshot_logo'
                   AND tgrelid = 'public.factures'::regclass AND NOT tgisinternal AND tgenabled = 'O') THEN
    RAISE EXCEPTION 'Logo facture : trigger factures_snapshot_logo absent ou désactivé';
  END IF;
  IF has_function_privilege('anon', 'public.factures_snapshot_logo()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.factures_snapshot_logo()', 'EXECUTE') THEN
    RAISE EXCEPTION 'Logo facture : fonction du trigger exécutable par anon ou authenticated';
  END IF;
END
$controle$;
