-- ============================================================================
-- 20260917_cours_collectifs.sql
-- ============================================================================
--
-- Cours collectifs : plusieurs bénéficiaires sur un même créneau (courant en
-- EHPAD/structures). Deux tables : cours_collectifs (le créneau) et
-- participations_cours_collectifs (qui y est inscrit, présent, et son
-- ressenti optionnel).
--
-- ── programme_commun_id / programme_individuel_id → programmes_modeles ────
-- PAS programmes(id) : programmes.participant_id est NOT NULL (un programme
-- y est toujours rattaché à UN bénéficiaire précis), incompatible avec un
-- programme commun à un groupe. programmes_modeles (migration
-- 20260717_programmes_modeles.sql) est fait pour ça : propriété du
-- praticien, sans participant_id. Usage nouveau pour cette table (conçue
-- pour être dupliquée-puis-détachée d'un bénéficiaire, pas référencée en
-- continu) mais rien ne s'y oppose techniquement. ON DELETE SET NULL, pas
-- CASCADE : supprimer un modèle ne doit pas effacer l'historique des cours
-- passés qui s'en sont servi.
--
-- ── Limitation v1 documentée et acceptée (Checkpoint A) ────────────────────
-- programmes_modeles n'a PAS de couche organisation (RLS = praticien_id =
-- auth.uid() uniquement, voir 20260717_programmes_modeles.sql). Un
-- collaborateur d'organisation qui voit un cours_collectifs via
-- acces_participant() (parce qu'il a accès à au moins un participant inscrit)
-- ne pourra PAS lire programmes_modeles si programme_commun_id/
-- programme_individuel_id appartient au praticien créateur — la requête
-- renvoie 0 ligne (filtrage RLS silencieux, pas une erreur). Accepté
-- explicitement comme limitation v1 : le nom du programme n'apparaît que
-- pour son propriétaire. Le composant d'affichage doit donc tolérer un
-- programme introuvable sans planter (voir ModalPresenceCoursCollectif.tsx).
--
-- ── ressenti_borg / ressenti_bienetre ───────────────────────────────────────
-- Même échelle que retours_seance (borg_rpe 1-10, bien_etre 1-5), mais PAS
-- une FK vers cette table : retours_seance est verrouillée à l'écriture
-- patient (seul /api/patient/retour-seance, service_role, peut y écrire —
-- aucune policy INSERT/UPDATE pour authenticated). Ici c'est le PRATICIEN
-- qui saisit le ressenti pendant la prise de présence : colonnes inline sur
-- la ligne de participation, mêmes bornes CHECK.
--
-- ── RLS à deux couches, adaptée à la forme de chaque table ─────────────────
-- participations_cours_collectifs : participant_id direct → même patron
-- exact que tarifs_contrats (contrat_id → acces_participant).
-- cours_collectifs : PAS de participant_id direct (un cours rassemble
-- plusieurs bénéficiaires via participations_cours_collectifs) — la couche
-- organisation descend vers l'enfant via EXISTS plutôt que remonter vers un
-- parent, adaptation du patron orga_acces_* déjà utilisé ailleurs (ex.
-- 20260714_04_mode_organisation_policies_lot_b.sql), pas une copie littérale
-- de tarifs_contrats.
--
-- ── Ordre des sections : les deux CREATE TABLE d'abord, RLS/policies/
--    privilèges ensuite ──────────────────────────────────────────────────
-- La policy orga_acces_cours_collectifs référence
-- participations_cours_collectifs dans son EXISTS. Une première version de
-- ce fichier créait cours_collectifs (table + RLS + policies + privilèges)
-- avant de créer participations_cours_collectifs plus bas : exécutée sur un
-- environnement propre, la policy tombait sur une erreur 42P01 (relation
-- "participations_cours_collectifs" does not exist), puisque CREATE POLICY
-- valide ses références au moment de l'exécution, pas seulement au moment
-- où la table qu'elle référence est utilisée. Corrigé en staging et
-- production par l'utilisateur au moment de l'application (2026-09-17) ;
-- ce fichier reproduit ici l'ordre corrigé pour qu'une future exécution sur
-- un environnement propre ne rencontre pas la même erreur.
--
-- Privilèges : REVOKE ALL puis GRANT explicite SELECT/INSERT/UPDATE à
-- authenticated (PAS DELETE — historique qu'on ne supprime pas depuis
-- l'app, un cours annulé passe par statut='annule'). Vérifié explicitement
-- dans le .verif.sql : le REVOKE seul ne suffit pas à garantir l'absence de
-- DELETE (c'est exactement ce qui avait échoué silencieusement sur
-- tarifs_contrats à cause de la règle de privilèges par défaut Supabase).
--
-- IDEMPOTENTE : CREATE TABLE IF NOT EXISTS, DROP POLICY IF EXISTS.
-- DÉJÀ APPLIQUÉE ET VÉRIFIÉE EN STAGING ET PRODUCTION PAR L'UTILISATEUR
-- (2026-09-17, connexion Postgres directe indisponible depuis cette
-- machine). Ce fichier documente a posteriori l'état réel appliqué, ordre
-- corrigé inclus. Voir supabase/verifications/20260917_cours_collectifs.verif.sql.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Tables (les deux, avant toute policy — voir note d'ordre ci-dessus).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cours_collectifs (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  praticien_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  structure_id        uuid REFERENCES public.structures(id) ON DELETE SET NULL,
  titre               text NOT NULL,
  date                date NOT NULL,
  heure_debut         text NOT NULL,
  duree_minutes       integer NOT NULL,
  programme_commun_id uuid REFERENCES public.programmes_modeles(id) ON DELETE SET NULL,
  mode_facturation    text NOT NULL CHECK (mode_facturation IN ('structure', 'individuel')),
  statut              text NOT NULL DEFAULT 'planifie' CHECK (statut IN ('planifie', 'realise', 'annule')),
  created_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cours_collectifs_structure_requise_si_facturation_structure
    CHECK (mode_facturation <> 'structure' OR structure_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS cours_collectifs_praticien_id_idx ON public.cours_collectifs(praticien_id);
CREATE INDEX IF NOT EXISTS cours_collectifs_structure_id_idx ON public.cours_collectifs(structure_id);
CREATE INDEX IF NOT EXISTS cours_collectifs_date_idx ON public.cours_collectifs(date);

CREATE TABLE IF NOT EXISTS public.participations_cours_collectifs (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cours_id                 uuid NOT NULL REFERENCES public.cours_collectifs(id) ON DELETE CASCADE,
  participant_id           uuid NOT NULL REFERENCES public.participants(id) ON DELETE CASCADE,
  statut_presence          text NOT NULL DEFAULT 'present' CHECK (statut_presence IN ('present', 'absent', 'excuse')),
  programme_individuel_id  uuid REFERENCES public.programmes_modeles(id) ON DELETE SET NULL,
  ressenti_borg            smallint CHECK (ressenti_borg BETWEEN 1 AND 10),
  ressenti_bienetre        smallint CHECK (ressenti_bienetre BETWEEN 1 AND 5),
  created_at               timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT participations_cours_collectifs_unique_participant UNIQUE (cours_id, participant_id)
);

CREATE INDEX IF NOT EXISTS participations_cours_collectifs_cours_id_idx ON public.participations_cours_collectifs(cours_id);
CREATE INDEX IF NOT EXISTS participations_cours_collectifs_participant_id_idx ON public.participations_cours_collectifs(participant_id);

-- ----------------------------------------------------------------------------
-- 2. RLS et policies (les deux tables existent maintenant : orga_acces_
--    cours_collectifs peut référencer participations_cours_collectifs).
-- ----------------------------------------------------------------------------
ALTER TABLE public.cours_collectifs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "praticien_gere_cours_collectifs" ON public.cours_collectifs;
CREATE POLICY "praticien_gere_cours_collectifs" ON public.cours_collectifs
  FOR ALL USING (praticien_id = auth.uid())
  WITH CHECK (praticien_id = auth.uid());

DROP POLICY IF EXISTS "orga_acces_cours_collectifs" ON public.cours_collectifs;
CREATE POLICY "orga_acces_cours_collectifs" ON public.cours_collectifs
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.participations_cours_collectifs pcc
      WHERE pcc.cours_id = cours_collectifs.id AND public.acces_participant(pcc.participant_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.participations_cours_collectifs pcc
      WHERE pcc.cours_id = cours_collectifs.id AND public.acces_participant(pcc.participant_id)
    )
  );

ALTER TABLE public.participations_cours_collectifs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "praticien_gere_participations_cours_collectifs" ON public.participations_cours_collectifs;
CREATE POLICY "praticien_gere_participations_cours_collectifs" ON public.participations_cours_collectifs
  FOR ALL USING (
    cours_id IN (SELECT c.id FROM public.cours_collectifs c WHERE c.praticien_id = auth.uid())
  )
  WITH CHECK (
    cours_id IN (SELECT c.id FROM public.cours_collectifs c WHERE c.praticien_id = auth.uid())
  );

DROP POLICY IF EXISTS "orga_acces_participations_cours_collectifs" ON public.participations_cours_collectifs;
CREATE POLICY "orga_acces_participations_cours_collectifs" ON public.participations_cours_collectifs
  FOR ALL TO authenticated
  USING (public.acces_participant(participant_id))
  WITH CHECK (public.acces_participant(participant_id));

-- ----------------------------------------------------------------------------
-- 3. Privilèges — REVOKE puis GRANT explicite pour les deux tables.
-- ----------------------------------------------------------------------------
REVOKE ALL ON TABLE public.cours_collectifs FROM PUBLIC;
REVOKE ALL ON TABLE public.cours_collectifs FROM anon;
REVOKE ALL ON TABLE public.cours_collectifs FROM authenticated;
REVOKE ALL ON TABLE public.cours_collectifs FROM service_role;

GRANT SELECT, INSERT, UPDATE ON TABLE public.cours_collectifs TO authenticated;
GRANT ALL ON TABLE public.cours_collectifs TO service_role;

REVOKE ALL ON TABLE public.participations_cours_collectifs FROM PUBLIC;
REVOKE ALL ON TABLE public.participations_cours_collectifs FROM anon;
REVOKE ALL ON TABLE public.participations_cours_collectifs FROM authenticated;
REVOKE ALL ON TABLE public.participations_cours_collectifs FROM service_role;

GRANT SELECT, INSERT, UPDATE ON TABLE public.participations_cours_collectifs TO authenticated;
GRANT ALL ON TABLE public.participations_cours_collectifs TO service_role;

-- ----------------------------------------------------------------------------
-- 4. Vérification immédiate — échoue bruyamment si la structure n'est pas
--    celle attendue (un « Success » du SQL Editor ne prouve rien à lui seul).
-- ----------------------------------------------------------------------------
DO $migration$
DECLARE
  nb_policies_cours   int;
  nb_policies_part    int;
  nb_delete_cours     int;
  nb_delete_part      int;
  index_unique_existe boolean;
BEGIN
  SELECT count(*) INTO nb_policies_cours
    FROM pg_policies WHERE schemaname = 'public' AND tablename = 'cours_collectifs';
  IF nb_policies_cours <> 2 THEN
    RAISE EXCEPTION 'Echec verification : % policy(ies) sur cours_collectifs, 2 attendues', nb_policies_cours;
  END IF;

  SELECT count(*) INTO nb_policies_part
    FROM pg_policies WHERE schemaname = 'public' AND tablename = 'participations_cours_collectifs';
  IF nb_policies_part <> 2 THEN
    RAISE EXCEPTION 'Echec verification : % policy(ies) sur participations_cours_collectifs, 2 attendues', nb_policies_part;
  END IF;

  SELECT count(*) INTO nb_delete_cours
    FROM information_schema.role_table_grants
    WHERE table_schema = 'public' AND table_name = 'cours_collectifs'
      AND grantee = 'authenticated' AND privilege_type = 'DELETE';
  IF nb_delete_cours <> 0 THEN
    RAISE EXCEPTION 'Echec verification : authenticated a DELETE sur cours_collectifs';
  END IF;

  SELECT count(*) INTO nb_delete_part
    FROM information_schema.role_table_grants
    WHERE table_schema = 'public' AND table_name = 'participations_cours_collectifs'
      AND grantee = 'authenticated' AND privilege_type = 'DELETE';
  IF nb_delete_part <> 0 THEN
    RAISE EXCEPTION 'Echec verification : authenticated a DELETE sur participations_cours_collectifs';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'participations_cours_collectifs'
      AND indexdef LIKE '%UNIQUE%'
  ) INTO index_unique_existe;
  IF NOT index_unique_existe THEN
    RAISE EXCEPTION 'Echec verification : contrainte unique (cours_id, participant_id) absente';
  END IF;
END
$migration$;

NOTIFY pgrst, 'reload schema';
