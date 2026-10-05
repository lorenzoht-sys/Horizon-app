-- Index de assistant_logs absents en production (relevé du 2026-10-05), prévus
-- par 20260602_assistant_logs.sql (archive). Accès par patient et par praticien.
--
-- Pas de policy ajoutée : la production a déjà « praticien voit ses logs »
-- (FOR ALL, praticien_id = auth.uid()), qui couvre lecture, insertion et
-- suppression par le praticien propriétaire. Les trois policies al_* de la
-- migration d'origine feraient doublon. Cette policy vise le rôle `public` et
-- autorise aussi UPDATE : un resserrement (rôle authenticated, sans UPDATE)
-- reste possible, mais change un comportement existant et n'est pas fait ici.
--
-- Idempotent. Aucune nouvelle table : pas de REVOKE/GRANT à poser.

CREATE INDEX IF NOT EXISTS idx_assistant_logs_patient   ON public.assistant_logs (patient_id);
CREATE INDEX IF NOT EXISTS idx_assistant_logs_praticien ON public.assistant_logs (praticien_id);

DO $controle$
BEGIN
  IF (SELECT count(*) FROM pg_indexes WHERE schemaname = 'public'
      AND indexname IN ('idx_assistant_logs_patient','idx_assistant_logs_praticien')) <> 2 THEN
    RAISE EXCEPTION 'assistant_logs : index manquants';
  END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.assistant_logs'::regclass) THEN
    RAISE EXCEPTION 'assistant_logs : RLS désactivée';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'assistant_logs') THEN
    RAISE EXCEPTION 'assistant_logs : aucune policy (la production en a une)';
  END IF;
END
$controle$;
