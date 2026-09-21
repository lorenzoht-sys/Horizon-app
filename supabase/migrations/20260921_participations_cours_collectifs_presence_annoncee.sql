-- ============================================================================
-- 20260921_participations_cours_collectifs_presence_annoncee.sql
-- ============================================================================
--
-- Présence ANNONCÉE par le bénéficiaire avant un cours collectif (« Je viens » /
-- « Je ne viens pas »), pour que le praticien puisse anticiper (matériel, salle,
-- relance des indécis).
--
-- ── Distincte de statut_presence ────────────────────────────────────────────
-- statut_presence est la présence CONSTATÉE par le praticien le jour du cours.
-- Quelqu'un peut annoncer « je viens » et ne pas venir, ou l'inverse : les deux
-- champs ne se remplacent pas, et l'annonce reste consultable après le cours.
--
-- ── Trois états ─────────────────────────────────────────────────────────────
--   'vient'        le bénéficiaire a répondu qu'il vient
--   'ne_vient_pas' le bénéficiaire a répondu qu'il ne vient pas
--   NULL           PAS DE RÉPONSE — c'est ce qui permet de repérer les indécis
-- Le retour à NULL n'est pas offert au bénéficiaire (décidé) : il peut changer
-- d'avis, pas effacer sa réponse.
--
-- presence_annoncee_le : quand il a répondu (dernière réponse). Nul si et
-- seulement si presence_annoncee est nulle (contrainte ci-dessous) : un
-- horodatage sans réponse, ou l'inverse, serait une ligne incohérente.
--
-- ── Qui écrit ───────────────────────────────────────────────────────────────
-- Uniquement la route serveur /api/patient/activite (type « cours-presence »), en
-- service_role, après vérification du jeton patient, de l'appartenance de la
-- participation et du délai « jusqu'au début du cours ». Le bénéficiaire n'a aucun
-- accès direct à la table. Aucune policy RLS à modifier : elles s'appliquent à la
-- ligne entière.
--
-- ── ⚠️ ORDRE DE DÉPLOIEMENT : cette migration AVANT le code ─────────────────
-- Le code de l'espace bénéficiaire lit presence_annoncee. Si le code arrive avant la
-- migration, PostgREST refuse la lecture (colonne inexistante). Le code de
-- api/patient/me.ts est écrit pour ne PAS perdre les cours dans ce cas (il retente
-- sans la colonne et signale l'incident à Sentry), mais la fonctionnalité ne
-- marcherait pas : appliquer cette migration en staging PUIS en production AVANT de
-- fusionner la PR correspondante.
--
-- Idempotente. Le SQL Editor affiche « Success » même quand le résultat n'est pas
-- celui attendu : le bloc final échoue bruyamment.
--
-- ── ROLLBACK ────────────────────────────────────────────────────────────────
--   ALTER TABLE public.participations_cours_collectifs
--     DROP CONSTRAINT IF EXISTS participations_cours_presence_annoncee_valeurs,
--     DROP CONSTRAINT IF EXISTS participations_cours_presence_annoncee_coherente,
--     DROP COLUMN IF EXISTS presence_annoncee,
--     DROP COLUMN IF EXISTS presence_annoncee_le;
--   (perd les annonces saisies depuis l'application de cette migration)
-- ============================================================================

ALTER TABLE public.participations_cours_collectifs
  ADD COLUMN IF NOT EXISTS presence_annoncee    text,
  ADD COLUMN IF NOT EXISTS presence_annoncee_le timestamptz;

-- ADD CONSTRAINT IF NOT EXISTS n'existe pas : DROP puis ADD, ce qui rend le
-- rejeu sans effet. Les lignes existantes (NULL, NULL) satisfont les deux.
ALTER TABLE public.participations_cours_collectifs
  DROP CONSTRAINT IF EXISTS participations_cours_presence_annoncee_valeurs,
  DROP CONSTRAINT IF EXISTS participations_cours_presence_annoncee_coherente;

ALTER TABLE public.participations_cours_collectifs
  ADD CONSTRAINT participations_cours_presence_annoncee_valeurs
    CHECK (presence_annoncee IN ('vient', 'ne_vient_pas')),
  ADD CONSTRAINT participations_cours_presence_annoncee_coherente
    CHECK ((presence_annoncee IS NULL) = (presence_annoncee_le IS NULL));

DO $migration$
DECLARE
  def_valeurs   text;
  def_coherente text;
BEGIN
  IF (SELECT count(*) FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'participations_cours_collectifs'
          AND ((column_name = 'presence_annoncee'    AND data_type = 'text')
            OR (column_name = 'presence_annoncee_le' AND data_type = 'timestamp with time zone'))
          AND is_nullable = 'YES' AND column_default IS NULL) <> 2 THEN
    RAISE EXCEPTION 'Echec verification : presence_annoncee (text) et presence_annoncee_le (timestamptz) doivent exister, nullables, sans défaut';
  END IF;

  SELECT pg_get_constraintdef(oid) INTO def_valeurs
    FROM pg_constraint
    WHERE conrelid = 'public.participations_cours_collectifs'::regclass
      AND conname = 'participations_cours_presence_annoncee_valeurs';
  IF def_valeurs IS NULL OR def_valeurs NOT LIKE '%vient%' OR def_valeurs NOT LIKE '%ne_vient_pas%' THEN
    RAISE EXCEPTION 'Echec verification : contrainte des valeurs absente ou inattendue (%)', def_valeurs;
  END IF;

  SELECT pg_get_constraintdef(oid) INTO def_coherente
    FROM pg_constraint
    WHERE conrelid = 'public.participations_cours_collectifs'::regclass
      AND conname = 'participations_cours_presence_annoncee_coherente';
  IF def_coherente IS NULL OR def_coherente NOT LIKE '%presence_annoncee_le%' THEN
    RAISE EXCEPTION 'Echec verification : contrainte de cohérence absente ou inattendue (%)', def_coherente;
  END IF;

  -- Rien de perdu ni de doublé côté policies.
  IF (SELECT count(*) FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'participations_cours_collectifs') <> 2 THEN
    RAISE EXCEPTION 'Echec verification : 2 policies attendues sur participations_cours_collectifs';
  END IF;

  -- Aucune ligne existante ne viole les contraintes (elles sont validées à l'ajout,
  -- mais on le dit explicitement).
  IF EXISTS (SELECT 1 FROM public.participations_cours_collectifs
              WHERE (presence_annoncee IS NULL) <> (presence_annoncee_le IS NULL)) THEN
    RAISE EXCEPTION 'Echec verification : des lignes ont une annonce sans horodatage (ou l''inverse)';
  END IF;
END
$migration$;

NOTIFY pgrst, 'reload schema';
