-- ============================================================================
-- 20260714_mode_organisation_invitations.sql
-- ============================================================================
--
-- Palier 5 (onboarding) du mode « organisation employeuse propriétaire » —
-- voir CONCEPTION_MODE_ORGANISATION.md et la conversation de conception du
-- parcours d'onboarding. Ce fichier ne pose QUE la table
-- organisation_invitations et ses policies — pas encore les routes ni les
-- endpoints (/api/organisation/demande, /api/organisation/rejoindre),
-- traités séparément.
--
-- Même mécanisme pour deux usages : inviter un intervenant (généré par un
-- admin depuis l'app, une fois celle-ci construite) ET faire entrer le
-- premier admin d'une organisation nouvellement validée (généré
-- manuellement par toi en SQL au moment de la validation, cree_par NULL car
-- personne n'est encore admin de cette organisation à ce moment-là).
--
-- RLS volontairement limitée à SELECT/INSERT pour les admins de
-- l'organisation : la CONSOMMATION d'un code (vérifier sa validité, créer
-- la ligne organisation_membres, marquer le code utilisé) passe
-- exclusivement par /api/organisation/rejoindre en service_role — la
-- personne qui rejoint n'est par définition pas encore membre, donc pas
-- couverte par une policy RLS scopée aux membres. Aucune policy
-- UPDATE/DELETE pour l'instant (pas demandé à ce stade).
--
-- IDEMPOTENTE : CREATE TABLE IF NOT EXISTS, DROP POLICY IF EXISTS avant
-- chaque CREATE POLICY.
-- NE PAS EXÉCUTER SUR PROD sans validation préalable.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.organisation_invitations (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID        NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  code            TEXT        NOT NULL UNIQUE,
  email_invite    TEXT,
  role            TEXT        NOT NULL CHECK (role IN ('intervenant', 'admin')),
  cree_par        UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  utilisee_le     TIMESTAMPTZ,
  utilisee_par    UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  expire_le       TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 days'),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_organisation_invitations_organisation
  ON public.organisation_invitations (organisation_id);

ALTER TABLE public.organisation_invitations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins_lecture_organisation_invitations" ON public.organisation_invitations;
CREATE POLICY "admins_lecture_organisation_invitations" ON public.organisation_invitations
  FOR SELECT TO authenticated
  USING (public.est_admin_organisation(organisation_id));

DROP POLICY IF EXISTS "admins_creation_organisation_invitations" ON public.organisation_invitations;
CREATE POLICY "admins_creation_organisation_invitations" ON public.organisation_invitations
  FOR INSERT TO authenticated
  WITH CHECK (public.est_admin_organisation(organisation_id));

NOTIFY pgrst, 'reload schema';
