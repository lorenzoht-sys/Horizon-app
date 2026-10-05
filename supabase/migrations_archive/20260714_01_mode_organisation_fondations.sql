-- ============================================================================
-- 20260714_mode_organisation_fondations.sql
-- ============================================================================
--
-- Palier 1 du mode « organisation employeuse propriétaire » (EHPAD, centres
-- qui possèdent les données de leurs bénéficiaires). Conception complète et
-- arbitrages validés le 14/07/2026 : voir CONCEPTION_MODE_ORGANISATION.md à
-- la racine du dépôt (§1 pour les tables, §3 pour les fonctions, §5 pour la
-- politique portail anonyme).
--
-- Ce fichier pose STRICTEMENT les fondations : deux nouvelles tables, une
-- colonne sur participants, un verrou CHECK, trois fonctions SECURITY
-- DEFINER, et les policies RLS des deux nouvelles tables elles-mêmes.
--
-- Il ne touche AUCUNE table existante autre que participants (ajout de
-- colonne + contrainte), et n'ajoute AUCUNE policy additive sur
-- bilans/seances/etc. (palier 3) ni aucun changement de FK CASCADE → SET NULL
-- (palier 2). Pour un praticien libéral (organisation_id NULL partout),
-- rien ne change : aucune policy existante n'est modifiée ou supprimée.
--
-- IDEMPOTENTE : rejouable sans effet si déjà appliquée.
-- NE PAS EXÉCUTER SUR PROD sans validation préalable.
-- ============================================================================


-- ============================================================================
-- 1. Table organisations
-- ============================================================================
-- Volontairement absent, et pour toujours : toute colonne token / token_acces,
-- et toute policy pour le rôle anon. C'est la traduction structurelle de la
-- décision « table séparée du portail structures » (§1.2 et §5 du document
-- de conception) : ce qui a rendu le portail structures risqué (lecture anon
-- par token) n'existe pas ici, par construction.

CREATE TABLE IF NOT EXISTS public.organisations (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  nom           TEXT        NOT NULL,
  siret         TEXT,
  email_contact TEXT,
  actif         BOOLEAN     NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ============================================================================
-- 2. Table organisation_membres
-- ============================================================================
-- Départ d'un salarié = actif = false + date_fin renseignée. Ligne conservée
-- (traçabilité : qui a eu accès, quand). Il perd l'accès immédiatement (la
-- fonction d'accès teste actif), les données ne bougent pas. ON DELETE
-- CASCADE sur user_id est ici sans danger : supprimer le compte d'un
-- ex-salarié supprime sa ligne d'appartenance, pas les données de
-- l'organisation.

CREATE TABLE IF NOT EXISTS public.organisation_membres (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID        NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  user_id         UUID        NOT NULL REFERENCES auth.users(id)           ON DELETE CASCADE,
  role            TEXT        NOT NULL CHECK (role IN ('intervenant', 'admin')),
  actif           BOOLEAN     NOT NULL DEFAULT true,
  date_debut      DATE        NOT NULL DEFAULT CURRENT_DATE,
  date_fin        DATE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organisation_id, user_id)
);

-- Sert acces_participant()/est_membre_organisation() (filtrent sur les trois
-- colonnes) ainsi que la policy "propre ligne" ci-dessous.
CREATE INDEX IF NOT EXISTS idx_organisation_membres_user_organisation_actif
  ON public.organisation_membres (user_id, organisation_id) WHERE actif;


-- ============================================================================
-- 3. Rattachement participants.organisation_id
-- ============================================================================
-- NULL (défaut, toutes les lignes existantes) = mode libéral inchangé.
-- ON DELETE RESTRICT : on ne supprime pas une organisation qui possède encore
-- des bénéficiaires (suppression = opération d'offboarding explicite, jamais
-- une cascade silencieuse).

ALTER TABLE public.participants
  ADD COLUMN IF NOT EXISTS organisation_id UUID REFERENCES public.organisations(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_participants_organisation ON public.participants(organisation_id);


-- ============================================================================
-- 4. Verrou structurel portail/organisation
-- ============================================================================
-- Un bénéficiaire possédé par une organisation ne peut pas être rattaché à
-- une structures (portail client par token). Conséquence directe : les
-- policies structure_anon_read_* existantes ne peuvent mathématiquement
-- jamais matcher un bénéficiaire d'organisation.

ALTER TABLE public.participants
  DROP CONSTRAINT IF EXISTS participants_orga_ou_portail;

ALTER TABLE public.participants
  ADD CONSTRAINT participants_orga_ou_portail
  CHECK (organisation_id IS NULL OR structure_id IS NULL);


-- ============================================================================
-- 5. Fonctions SQL centrales
-- ============================================================================
-- SECURITY DEFINER : lisent organisation_membres en ignorant la RLS de cette
-- table (sinon : récursion infinie quand la policy de organisation_membres
-- appelle ces fonctions, erreur Postgres 42P17). STABLE : résultat mis en
-- cache par instruction. search_path épinglé : obligatoire sur toute fonction
-- SECURITY DEFINER (sinon un objet homonyme dans un autre schéma peut
-- détourner la requête).

CREATE OR REPLACE FUNCTION public.est_membre_organisation(p_organisation_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM organisation_membres m
    WHERE m.organisation_id = p_organisation_id
      AND m.user_id = auth.uid()
      AND m.actif
  );
$$;

CREATE OR REPLACE FUNCTION public.est_admin_organisation(p_organisation_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM organisation_membres m
    WHERE m.organisation_id = p_organisation_id
      AND m.user_id = auth.uid()
      AND m.role = 'admin'
      AND m.actif
  );
$$;

-- LA fonction que les policies additives du palier 3 appelleront.
-- Mode libéral : se réduit exactement au test actuel (praticien_id = auth.uid()).
-- Mode organisation : membre actif de l'organisation propriétaire.
-- auth.uid() est NULL pour anon → EXISTS retourne false → aucun accès anon.

CREATE OR REPLACE FUNCTION public.acces_participant(p_participant_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM participants p
    WHERE p.id = p_participant_id
      AND (
        p.praticien_id = auth.uid()
        OR (
          p.organisation_id IS NOT NULL
          AND public.est_membre_organisation(p.organisation_id)
        )
      )
  );
$$;

-- Hygiène des droits d'exécution : REVOKE ALL ON ALL TABLES (migration
-- 20260613_rls_anon_lockdown.sql) ne couvre pas les fonctions — verrou
-- explicite ici, séparément.
REVOKE ALL ON FUNCTION public.acces_participant(uuid)        FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.est_membre_organisation(uuid)  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.est_admin_organisation(uuid)   FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.acces_participant(uuid)       TO authenticated;
GRANT EXECUTE ON FUNCTION public.est_membre_organisation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.est_admin_organisation(uuid)  TO authenticated;


-- ============================================================================
-- 6. RLS — organisations et organisation_membres elles-mêmes
-- ============================================================================
-- Aucune policy INSERT/DELETE publique sur ces deux tables : la création
-- d'une organisation et l'ajout de son premier admin (palier 5, onboarding)
-- passent par un parcours dédié hors RLS (service_role). Sans cela, personne
-- ne pourrait jamais devenir le premier membre d'une organisation qu'il vient
-- de créer.

ALTER TABLE public.organisations       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organisation_membres ENABLE ROW LEVEL SECURITY;

-- organisations : lecture par les membres actifs, mise à jour par les admins.
DROP POLICY IF EXISTS "membres_lecture_organisations" ON public.organisations;
CREATE POLICY "membres_lecture_organisations" ON public.organisations
  FOR SELECT TO authenticated
  USING (public.est_membre_organisation(id));

DROP POLICY IF EXISTS "admins_maj_organisations" ON public.organisations;
CREATE POLICY "admins_maj_organisations" ON public.organisations
  FOR UPDATE TO authenticated
  USING (public.est_admin_organisation(id))
  WITH CHECK (public.est_admin_organisation(id));

-- organisation_membres : chacun voit sa propre ligne d'appartenance ; les
-- admins voient/gèrent toutes les lignes de leur organisation. Ces policies
-- passent par est_membre_organisation()/est_admin_organisation()
-- (SECURITY DEFINER) et non par une lecture directe de organisation_membres
-- dans le USING, ce qui évite la récursion RLS (42P17) sur la policy admin.
DROP POLICY IF EXISTS "propre_ligne_organisation_membres" ON public.organisation_membres;
CREATE POLICY "propre_ligne_organisation_membres" ON public.organisation_membres
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "admins_lecture_organisation_membres" ON public.organisation_membres;
CREATE POLICY "admins_lecture_organisation_membres" ON public.organisation_membres
  FOR SELECT TO authenticated
  USING (public.est_admin_organisation(organisation_id));

DROP POLICY IF EXISTS "admins_ajout_organisation_membres" ON public.organisation_membres;
CREATE POLICY "admins_ajout_organisation_membres" ON public.organisation_membres
  FOR INSERT TO authenticated
  WITH CHECK (public.est_admin_organisation(organisation_id));

DROP POLICY IF EXISTS "admins_maj_organisation_membres" ON public.organisation_membres;
CREATE POLICY "admins_maj_organisation_membres" ON public.organisation_membres
  FOR UPDATE TO authenticated
  USING (public.est_admin_organisation(organisation_id))
  WITH CHECK (public.est_admin_organisation(organisation_id));


-- ============================================================================
-- 7. Rechargement du schéma PostgREST
-- ============================================================================

NOTIFY pgrst, 'reload schema';
