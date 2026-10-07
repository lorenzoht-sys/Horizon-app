-- Facturation, étape 5 (PR A) : stockage privé des PDF et déclenchement de leur génération.
--
-- 1. Bucket privé `factures` : jamais public, PDF uniquement, 5 Mo maximum par fichier. Chemin :
--    {praticien_id}/{numero}.pdf (aucun nom de bénéficiaire dans le chemin : données de santé).
-- 2. RLS sur storage.objects, en LECTURE seule : le praticien lit les fichiers de son dossier
--    (premier segment du chemin = auth.uid()), l'admin lit tout (décision du 2026-10-08, même
--    principe que factures_admin_lecture : exigence voulue, pas une faille). Aucune policy
--    d'écriture : seul service_role (l'Edge Function facturation-pdf) crée un fichier, et personne
--    ne le modifie ni ne le supprime par l'API (conservation 10 ans, à confirmer avec le comptable).
-- 3. Trigger AFTER UPDATE sur factures : au passage brouillon -> validee, il appelle l'Edge Function
--    par pg_net. pg_net n'émet la requête qu'au COMMIT et en asynchrone : un échec de génération ne
--    bloque jamais la validation, la reprise relève de la fonction (idempotente, voir PR B).
--    L'URL et le secret viennent de Vault (`facturation_pdf_url`, `facturation_webhook_secret`),
--    posés à la main par environnement : aucun secret ni aucune URL de projet dans le dépôt. Tant
--    qu'ils manquent (base locale, tests, staging non configuré), le trigger ne fait rien.
--
-- Aucune nouvelle table, donc pas de REVOKE/GRANT de la règle du 2026-08-29 ; la fonction de
-- trigger est retirée à anon et authenticated.
-- Aucune colonne ajoutée à factures : pdf_path existe déjà et reste modifiable après validation.

-- ---------- 1. bucket ----------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('factures', 'factures', false, 5242880, ARRAY['application/pdf'])
ON CONFLICT (id) DO UPDATE
  SET public = false,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ---------- 2. lecture : praticien (son dossier) et admin ----------
DROP POLICY IF EXISTS "factures_pdf_praticien_lecture" ON storage.objects;
CREATE POLICY "factures_pdf_praticien_lecture" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'factures' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "factures_pdf_admin_lecture" ON storage.objects;
CREATE POLICY "factures_pdf_admin_lecture" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'factures' AND public.app_role_courant() = 'admin');

-- ---------- 3. déclenchement à la validation ----------
CREATE OR REPLACE FUNCTION public.declencher_pdf_facture()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_url    text;
  v_secret text;
BEGIN
  SELECT decrypted_secret INTO v_url    FROM vault.decrypted_secrets WHERE name = 'facturation_pdf_url';
  SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name = 'facturation_webhook_secret';
  IF v_url IS NULL OR v_secret IS NULL THEN
    RETURN NEW;  -- environnement non configuré : la validation reste valable, le PDF viendra à la reprise
  END IF;

  PERFORM net.http_post(
    url := v_url,
    headers := jsonb_build_object('content-type', 'application/json', 'x-facturation-secret', v_secret),
    body := jsonb_build_object('facture_id', NEW.id),
    timeout_milliseconds := 20000
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Jamais d'échec de validation à cause du PDF.
  RAISE WARNING 'declencher_pdf_facture(%) : %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.declencher_pdf_facture() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS factures_pdf_apres_validation ON public.factures;
CREATE TRIGGER factures_pdf_apres_validation
  AFTER UPDATE OF statut ON public.factures
  FOR EACH ROW
  WHEN (OLD.statut = 'brouillon' AND NEW.statut = 'validee')
  EXECUTE FUNCTION public.declencher_pdf_facture();

-- ---------- contrôle final ----------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'factures' AND public = false
                   AND allowed_mime_types = ARRAY['application/pdf'] AND file_size_limit = 5242880) THEN
    RAISE EXCEPTION 'Facturation 5A : bucket factures absent, public ou mal borné';
  END IF;
  IF (SELECT count(*) FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
        AND policyname IN ('factures_pdf_praticien_lecture', 'factures_pdf_admin_lecture')
        AND cmd = 'SELECT' AND roles = '{authenticated}') <> 2 THEN
    RAISE EXCEPTION 'Facturation 5A : policies de lecture des PDF absentes ou mal formées';
  END IF;
  -- Aucune policy d'écriture, ni aucune policy ouverte à anon/authenticated/public qui ne borne pas
  -- le bucket : elle exposerait ou modifierait les PDF.
  IF EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'storage' AND tablename = 'objects'
       AND policyname NOT IN ('factures_pdf_praticien_lecture', 'factures_pdf_admin_lecture')
       AND roles && ARRAY['anon', 'authenticated', 'public']::name[]
       AND (cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL') OR cmd = 'SELECT')
       AND (COALESCE(qual, '') || COALESCE(with_check, '')) !~ 'bucket_id'
  ) THEN
    RAISE EXCEPTION 'Facturation 5A : une policy de storage.objects ne borne pas le bucket et exposerait les PDF';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'storage' AND tablename = 'objects'
       AND (COALESCE(qual, '') || COALESCE(with_check, '')) ~ 'factures'
       AND cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL')
  ) THEN
    RAISE EXCEPTION 'Facturation 5A : une policy d''écriture vise le bucket factures';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'factures_pdf_apres_validation'
                   AND tgrelid = 'public.factures'::regclass AND NOT tgisinternal) THEN
    RAISE EXCEPTION 'Facturation 5A : trigger de génération du PDF absent';
  END IF;
  IF has_function_privilege('anon', 'public.declencher_pdf_facture()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.declencher_pdf_facture()', 'EXECUTE') THEN
    RAISE EXCEPTION 'Facturation 5A : declencher_pdf_facture() exécutable par anon ou authenticated';
  END IF;
END $$;
