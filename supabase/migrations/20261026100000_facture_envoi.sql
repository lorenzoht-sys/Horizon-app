-- Envoi des factures par e-mail (plan facturation PR 8) : journal des envois.
--
-- L'envoi lui-même est fait par l'Edge Function facturation-envoi (API Resend, PDF en pièce jointe,
-- « Répondre à » vers l'e-mail du praticien), appelée par le praticien avec son jeton. Elle écrit ici
-- une ligne par tentative, réussie ou non, avec service_role.
--
-- envois_factures : facture, praticien, adresse de destination effectivement utilisée (celle du
-- destinataire figée à la validation, ou celle saisie au moment de l'envoi, décision du 2026-10-22),
-- résultat, identifiant Resend, erreur tronquée. Aucune donnée de santé : ni libellé, ni montant.
-- Le journal est inaltérable (ni modification ni suppression, trigger) : c'est la preuve d'envoi.
--
-- Privilèges : règle du 2026-08-29, REVOKE explicite puis GRANT ciblé. Le praticien LIT ses envois (RLS,
-- praticien_id = auth.uid()) ; seul service_role écrit. Aucune lecture admin (rien ne la demande).
-- Le passage au statut « envoyee » est écrit par la fonction (une facture « validee » seulement) ;
-- factures_inalterables autorise ce changement de statut.

CREATE TABLE IF NOT EXISTS public.envois_factures (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  facture_id   uuid NOT NULL REFERENCES public.factures(id) ON DELETE RESTRICT,
  praticien_id uuid NOT NULL REFERENCES public.praticiens(id) ON DELETE RESTRICT,
  destinataire text NOT NULL,
  resultat     text NOT NULL,
  message_id   text,
  erreur       text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT envois_factures_resultat_valide CHECK (resultat IN ('envoye', 'echec')),
  CONSTRAINT envois_factures_destinataire_format CHECK (destinataire ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' AND char_length(destinataire) <= 254),
  CONSTRAINT envois_factures_coherent CHECK ((resultat = 'envoye' AND message_id IS NOT NULL) OR (resultat = 'echec' AND erreur IS NOT NULL)),
  CONSTRAINT envois_factures_erreur_courte CHECK (erreur IS NULL OR char_length(erreur) <= 500)
);

CREATE INDEX IF NOT EXISTS envois_factures_facture_idx ON public.envois_factures (facture_id, created_at);

ALTER TABLE public.envois_factures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "envois_factures_praticien_lecture" ON public.envois_factures;
CREATE POLICY "envois_factures_praticien_lecture" ON public.envois_factures
  FOR SELECT TO authenticated USING (praticien_id = auth.uid());

REVOKE ALL ON TABLE public.envois_factures FROM PUBLIC;
REVOKE ALL ON TABLE public.envois_factures FROM anon;
REVOKE ALL ON TABLE public.envois_factures FROM authenticated;
REVOKE ALL ON TABLE public.envois_factures FROM service_role;
GRANT SELECT ON TABLE public.envois_factures TO authenticated;
GRANT SELECT, INSERT ON TABLE public.envois_factures TO service_role;

CREATE OR REPLACE FUNCTION public.envois_factures_inalterables()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'Journal des envois inaltérable : ni modification ni suppression';
END;
$$;

REVOKE ALL ON FUNCTION public.envois_factures_inalterables() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS envois_factures_inalterables ON public.envois_factures;
CREATE TRIGGER envois_factures_inalterables BEFORE UPDATE OR DELETE ON public.envois_factures
  FOR EACH ROW EXECUTE FUNCTION public.envois_factures_inalterables();

-- ---------- contrôle final ----------
DO $controle$
BEGIN
  IF to_regclass('public.envois_factures') IS NULL
     OR NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.envois_factures'::regclass) THEN
    RAISE EXCEPTION 'Envoi des factures : table envois_factures absente ou sans RLS';
  END IF;
  IF (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'envois_factures') <> 1
     OR NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'envois_factures'
                      AND policyname = 'envois_factures_praticien_lecture' AND cmd = 'SELECT' AND roles = '{authenticated}') THEN
    RAISE EXCEPTION 'Envoi des factures : policies inattendues (une seule, en lecture, pour authenticated)';
  END IF;
  IF has_table_privilege('anon', 'public.envois_factures', 'SELECT')
     OR has_table_privilege('authenticated', 'public.envois_factures', 'INSERT')
     OR has_table_privilege('authenticated', 'public.envois_factures', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.envois_factures', 'DELETE')
     OR NOT has_table_privilege('authenticated', 'public.envois_factures', 'SELECT')
     OR NOT has_table_privilege('service_role', 'public.envois_factures', 'INSERT')
     OR has_table_privilege('service_role', 'public.envois_factures', 'UPDATE')
     OR has_table_privilege('service_role', 'public.envois_factures', 'DELETE') THEN
    RAISE EXCEPTION 'Envoi des factures : privilèges de envois_factures incorrects';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'envois_factures_inalterables'
                   AND tgrelid = 'public.envois_factures'::regclass AND NOT tgisinternal AND tgenabled = 'O') THEN
    RAISE EXCEPTION 'Envoi des factures : trigger envois_factures_inalterables absent ou désactivé';
  END IF;
END
$controle$;
