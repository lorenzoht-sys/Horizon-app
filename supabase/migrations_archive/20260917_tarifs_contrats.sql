-- ============================================================================
-- 20260917_tarifs_contrats.sql
-- ============================================================================
--
-- Bug 07 (PLAN-BETA.md) : paramètres financiers individualisés par personne,
-- avec historique verrouillé. Le tarif d'un contrat n'est plus une valeur
-- unique (contrats.tarif_seance) mais une SUITE DE VERSIONS datées : chaque
-- changement de tarif ferme la version en cours (date_fin_validite) et en
-- ouvre une nouvelle, sans jamais réécrire une ligne existante. Le montant
-- facturé pour une séance passée reste donc correct même après un
-- changement de tarif ultérieur — voir trouverTarifApplicable()
-- (src/lib/tarifsContrats.ts), seule fonction du projet qui résout « quel
-- tarif s'applique à cette date ».
--
-- ── contrats.tarif_seance n'est PAS supprimée ici ─────────────────────────
-- Vérifié dans le code (2026-09-17) : cette colonne n'est lue ni écrite par
-- AUCUN écran de l'application (ni ContratNouveauPage.tsx, ni ContratsTab.tsx)
-- — seuls src/lib/mappers.ts (passage brut) et StatsPage.tsx (repli sur le
-- tarif par défaut du praticien) la touchent. Le backfill ci-dessous ne migre
-- donc, en pratique, qu'une minorité de contrats — ceux dont la valeur avait
-- été posée directement en base, hors interface. La colonne est laissée en
-- place (dépréciation informelle, voir le commentaire sur Contrat.tarifSeance
-- dans types/index.ts) : la retirer est une décision séparée, une fois
-- confirmé qu'aucun usage résiduel ne dépend d'elle.
--
-- IDEMPOTENTE : CREATE TABLE IF NOT EXISTS, DROP POLICY IF EXISTS, backfill
-- restreint aux contrats sans ligne existante (WHERE NOT EXISTS).
-- APPLIQUÉE ET VÉRIFIÉE EN PRODUCTION ET STAGING PAR L'UTILISATEUR, PAS PAR
-- CET AGENT — connexion Postgres directe indisponible depuis cette machine
-- (blocage réseau déjà documenté, voir docs/PLAN-BETA.md). Voir la requête de
-- vérification associée : supabase/verifications/20260917_tarifs_contrats.verif.sql
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Table.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tarifs_contrats (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contrat_id          uuid NOT NULL REFERENCES public.contrats(id) ON DELETE CASCADE,
  tarif_seance        numeric(10,2) NOT NULL,
  frais_deplacement   numeric(10,2) NOT NULL DEFAULT 0,
  date_debut_validite date NOT NULL,
  -- NULL = version actuelle (en cours). Une date = version close, remplacée
  -- par une version ultérieure du même contrat.
  date_fin_validite   date,
  created_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tarifs_contrats_periode_valide
    CHECK (date_fin_validite IS NULL OR date_fin_validite >= date_debut_validite)
);

CREATE INDEX IF NOT EXISTS tarifs_contrats_contrat_id_idx ON public.tarifs_contrats(contrat_id);

-- Un seul « version actuelle » (date_fin_validite NULL) par contrat, imposé
-- par la base et pas seulement par la logique applicative — voir
-- fermerEtCreerNouvelleVersion (src/hooks/useTarifsContrat.ts), qui ferme
-- toujours l'ancienne version avant d'en insérer une nouvelle.
CREATE UNIQUE INDEX IF NOT EXISTS tarifs_contrats_une_version_active
  ON public.tarifs_contrats(contrat_id) WHERE date_fin_validite IS NULL;

-- ----------------------------------------------------------------------------
-- 2. RLS — même schéma à deux couches que les autres tables enfants d'un
--    contrat/participant (voir 20260613_programme_v2_rls.sql pour
--    programme_seances, et 20260714_03_mode_organisation_policies_lot_a.sql
--    pour la couche organisation additive sur contrats lui-même).
-- ----------------------------------------------------------------------------
ALTER TABLE public.tarifs_contrats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "praticien_gere_tarifs_contrats" ON public.tarifs_contrats;
CREATE POLICY "praticien_gere_tarifs_contrats" ON public.tarifs_contrats
  FOR ALL USING (
    contrat_id IN (
      SELECT c.id FROM public.contrats c
      JOIN public.participants p ON p.id = c.participant_id
      WHERE p.praticien_id = auth.uid()
    )
  )
  WITH CHECK (
    contrat_id IN (
      SELECT c.id FROM public.contrats c
      JOIN public.participants p ON p.id = c.participant_id
      WHERE p.praticien_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "orga_acces_tarifs_contrats" ON public.tarifs_contrats;
CREATE POLICY "orga_acces_tarifs_contrats" ON public.tarifs_contrats
  FOR ALL TO authenticated
  USING (
    contrat_id IN (SELECT c.id FROM public.contrats c WHERE public.acces_participant(c.participant_id))
  )
  WITH CHECK (
    contrat_id IN (SELECT c.id FROM public.contrats c WHERE public.acces_participant(c.participant_id))
  );

-- ----------------------------------------------------------------------------
-- 3. Privilèges — REVOKE puis GRANT explicite (règle du projet pour toute
--    nouvelle table dans public depuis le 2026-08-29, voir docs/PLAN-BETA.md
--    « CHANTIER PLANIFIÉ — retirer la règle de privilèges par défaut »).
--    Pas de DELETE pour authenticated : un historique verrouillé ne se
--    supprime pas depuis l'application.
-- ----------------------------------------------------------------------------
REVOKE ALL ON TABLE public.tarifs_contrats FROM PUBLIC;
REVOKE ALL ON TABLE public.tarifs_contrats FROM anon;
REVOKE ALL ON TABLE public.tarifs_contrats FROM authenticated;
REVOKE ALL ON TABLE public.tarifs_contrats FROM service_role;

GRANT SELECT, INSERT, UPDATE ON TABLE public.tarifs_contrats TO authenticated;
GRANT ALL ON TABLE public.tarifs_contrats TO service_role;

-- ----------------------------------------------------------------------------
-- 4. Backfill : un contrat qui porte déjà un tarif_seance non nul reçoit sa
--    version actuelle. Un contrat sans tarif_seance (l'immense majorité,
--    voir le commentaire en tête de fichier) n'en reçoit AUCUNE — pas de
--    ligne fictive à un montant inventé. trouverTarifApplicable() renverra
--    null pour ses séances, et l'appelant retombe sur le tarif par défaut du
--    praticien, exactement le comportement actuel.
-- ----------------------------------------------------------------------------
INSERT INTO public.tarifs_contrats (contrat_id, tarif_seance, frais_deplacement, date_debut_validite, date_fin_validite)
SELECT
  c.id,
  c.tarif_seance,
  0,
  COALESCE(c.date_debut, c.date_creation::date),
  NULL
FROM public.contrats c
WHERE c.tarif_seance IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.tarifs_contrats t WHERE t.contrat_id = c.id);

-- ----------------------------------------------------------------------------
-- 5. Vérification immédiate. Un « Success » du SQL Editor ne prouve rien
--    (voir docs/PLAN-BETA.md) : on échoue bruyamment si la structure n'est
--    pas celle attendue.
-- ----------------------------------------------------------------------------
DO $migration$
DECLARE
  nb_contrats_avec_tarif   int;
  nb_versions_backfillees  int;
  nb_policies              int;
  index_unique_existe      boolean;
BEGIN
  SELECT count(*) INTO nb_contrats_avec_tarif FROM public.contrats WHERE tarif_seance IS NOT NULL;
  SELECT count(*) INTO nb_versions_backfillees FROM public.tarifs_contrats;

  IF nb_versions_backfillees < nb_contrats_avec_tarif THEN
    RAISE EXCEPTION
      'Echec verification : % contrat(s) avec tarif_seance non nul, seulement % ligne(s) dans tarifs_contrats',
      nb_contrats_avec_tarif, nb_versions_backfillees;
  END IF;

  SELECT count(*) INTO nb_policies
    FROM pg_policies WHERE schemaname = 'public' AND tablename = 'tarifs_contrats';
  IF nb_policies <> 2 THEN
    RAISE EXCEPTION 'Echec verification : % policy(ies) sur tarifs_contrats, 2 attendues', nb_policies;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'tarifs_contrats'
      AND indexname = 'tarifs_contrats_une_version_active'
  ) INTO index_unique_existe;
  IF NOT index_unique_existe THEN
    RAISE EXCEPTION 'Echec verification : index unique tarifs_contrats_une_version_active absent';
  END IF;
END
$migration$;

NOTIFY pgrst, 'reload schema';
