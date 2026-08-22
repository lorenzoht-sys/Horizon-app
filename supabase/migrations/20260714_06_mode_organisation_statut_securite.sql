-- ============================================================================
-- 20260714_mode_organisation_statut_securite.sql
-- ============================================================================
--
-- Palier 5 (onboarding) du mode « organisation employeuse propriétaire » —
-- traité EN PREMIER et isolément, avant tout le reste du parcours
-- (organisation_invitations, routes, endpoints), parce que c'est un
-- correctif de sécurité sur des fonctions déjà en production.
--
-- Constat : organisations.actif existe depuis le palier 1 (DEFAULT true)
-- mais n'est vérifié NULLE PART — ni est_membre_organisation(), ni
-- est_admin_organisation(), ni acces_participant_pour() ne le consultent.
-- Aujourd'hui, si une organisation existait avec un statut "non validé",
-- ses membres auraient quand même un accès complet via RLS : rien ne teste
-- ce champ. Ce fichier ferme ce trou AVANT que le formulaire de demande
-- (prochain fichier) ne puisse créer des organisations non validées.
--
-- Ajoute organisations.statut ('en_attente' par défaut — voir décision
-- actée dans la conversation de conception : colonne dédiée plutôt que
-- réutilisation de actif, pour ne pas conflater "jamais validée" et
-- "désactivée après avoir été active") et met à jour les TROIS fonctions
-- qui testent l'appartenance à une organisation pour exiger
-- statut = 'active' en plus du test existant (membre actif / rôle admin).
--
-- acces_participant() (palier 1) n'a PAS besoin d'être modifiée : elle
-- délègue déjà à est_membre_organisation(), corrigée ici — la correction
-- se propage automatiquement.
--
-- ⚠️ ADD COLUMN ... NOT NULL DEFAULT 'en_attente' rétro-remplit aussi les
-- lignes déjà existantes dans organisations. Vérifier avant exécution
-- qu'aucune organisation "légitimement active" n'existe déjà en prod
-- (SELECT count(*), array_agg(nom) FROM organisations;) — à ce stade du
-- projet, seule une organisation de test jetable a existé (créée et
-- supprimée pendant la validation du palier 4), donc la table devrait être
-- vide, mais la commande est fournie pour confirmer plutôt que supposer.
--
-- IDEMPOTENTE : ADD COLUMN IF NOT EXISTS, CREATE OR REPLACE FUNCTION.
-- NE PAS EXÉCUTER SUR PROD sans validation préalable.
-- ============================================================================


-- ============================================================================
-- 1. organisations.statut
-- ============================================================================

ALTER TABLE public.organisations
  ADD COLUMN IF NOT EXISTS statut TEXT NOT NULL DEFAULT 'en_attente'
    CHECK (statut IN ('en_attente', 'active', 'refusee'));


-- ============================================================================
-- 2. est_membre_organisation() — ajoute la condition statut = 'active'
-- ============================================================================

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
    JOIN organisations o ON o.id = m.organisation_id
    WHERE m.organisation_id = p_organisation_id
      AND m.user_id = auth.uid()
      AND m.actif
      AND o.statut = 'active'
  );
$$;


-- ============================================================================
-- 3. est_admin_organisation() — ajoute la condition statut = 'active'
-- ============================================================================

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
    JOIN organisations o ON o.id = m.organisation_id
    WHERE m.organisation_id = p_organisation_id
      AND m.user_id = auth.uid()
      AND m.role = 'admin'
      AND m.actif
      AND o.statut = 'active'
  );
$$;


-- ============================================================================
-- 4. acces_participant_pour() — même correction (palier 4, service_role)
-- ============================================================================
-- Ne délègue pas à est_membre_organisation() (contexte service_role, pas de
-- auth.uid() exploitable — voir 20260714_mode_organisation_acces_participant_pour.sql),
-- donc la condition statut = 'active' doit être dupliquée ici aussi.

CREATE OR REPLACE FUNCTION public.acces_participant_pour(p_participant_id uuid, p_user_id uuid)
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
        p.praticien_id = p_user_id
        OR (
          p.organisation_id IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM organisation_membres m
            JOIN organisations o ON o.id = m.organisation_id
            WHERE m.organisation_id = p.organisation_id
              AND m.user_id = p_user_id
              AND m.actif
              AND o.statut = 'active'
          )
        )
      )
  );
$$;


-- ============================================================================
-- 5. Rechargement du schéma PostgREST
-- ============================================================================
-- Nouvelle colonne organisations.statut, visible via l'API.

NOTIFY pgrst, 'reload schema';
