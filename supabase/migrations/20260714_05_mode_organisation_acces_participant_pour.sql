-- ============================================================================
-- 20260714_mode_organisation_acces_participant_pour.sql
-- ============================================================================
--
-- Palier 4 du mode « organisation employeuse propriétaire » — voir
-- CONCEPTION_MODE_ORGANISATION.md §6 (point 2) à la racine du dépôt.
--
-- Variante paramétrée de acces_participant() (créée au palier 1), pour les
-- contextes où le code serveur utilise le client service_role (qui
-- contourne la RLS par construction) et n'a donc pas de session Postgres
-- avec un auth.uid() exploitable. acces_participant() ne peut pas être
-- réutilisée telle quelle dans ce cas : appelée depuis une connexion
-- service_role, auth.uid() y vaut NULL, et la fonction répondrait toujours
-- false, y compris pour un accès légitime.
--
-- Utilisée par api/_lib/patientSession.ts (accesViaPraticien) : l'identité
-- (p_user_id) y est TOUJOURS dérivée d'un JWT vérifié côté serveur via
-- supabase.auth.getUser(praticienToken) — jamais lue depuis un paramètre de
-- requête, un header non vérifié, ou le corps de la requête. Voir le tracé
-- complet dans la conversation d'implémentation de ce palier.
--
-- GRANT réservé à service_role UNIQUEMENT (jamais authenticated) : cette
-- fonction prend un user_id arbitraire en paramètre, contrairement à
-- acces_participant() qui ne peut tester que l'utilisateur courant
-- (auth.uid()). Ouverte à authenticated, elle deviendrait un oracle
-- permettant à n'importe quel compte de sonder "est-ce que tel autre compte
-- a accès à tel participant" — une fuite d'information organisationnelle
-- mineure mais évitable. Seul du code serveur de confiance (qui a déjà
-- vérifié l'identité passée en paramètre avant l'appel) doit pouvoir
-- l'appeler.
--
-- IDEMPOTENTE : CREATE OR REPLACE FUNCTION, REVOKE/GRANT rejouables sans
-- effet si déjà appliqués.
-- NE PAS EXÉCUTER SUR PROD sans validation préalable.
-- ============================================================================

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
            SELECT 1 FROM organisation_membres m
            WHERE m.organisation_id = p.organisation_id
              AND m.user_id = p_user_id
              AND m.actif
          )
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION public.acces_participant_pour(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.acces_participant_pour(uuid, uuid) TO service_role;
