-- ============================================================================
-- 20260921_participations_cours_collectifs_notes.sql
-- ============================================================================
--
-- Note libre du praticien, PAR PARTICIPANT, sur un cours collectif : ce qu'il a
-- observé chez cette personne pendant la séance (douleur signalée, exercice
-- adapté, raison d'une absence…). Même rôle que la note de NoteSeanceModal
-- (notes_seances.note) pour une séance individuelle.
--
-- ── INTERNE au praticien, pour toujours ─────────────────────────────────────
-- Cette colonne ne doit JAMAIS être renvoyée au bénéficiaire ni au portail
-- structure. C'est exactement le défaut découvert sur seances.notes (17 notes
-- libres exposées en production, corrigé par la PR #68). Conséquence pour la
-- suite du chantier : toute route qui lit participations_cours_collectifs pour
-- un tiers liste ses colonnes EXPLICITEMENT (jamais select('*')), sans `notes`.
-- Aucune policy RLS à modifier : les policies existantes s'appliquent à la
-- ligne entière, et le bénéficiaire n'a aucun accès direct à la table (il
-- passe par des routes serveur en service_role).
--
-- ── Colonne nullable, sans défaut ───────────────────────────────────────────
-- NULL = rien de noté. Pas de valeur par défaut, pas de contrainte : aucune
-- ligne existante à reprendre, et le code applicatif n'écrit la colonne que
-- lorsque le praticien saisit une note (il continue donc de fonctionner tant
-- que cette migration n'est pas appliquée, sauf pour enregistrer une note).
--
-- Idempotente (IF NOT EXISTS). Le SQL Editor affiche « Success » même quand le
-- résultat n'est pas celui attendu : le bloc final échoue bruyamment.
--
-- ── ROLLBACK ────────────────────────────────────────────────────────────────
--   ALTER TABLE public.participations_cours_collectifs DROP COLUMN IF EXISTS notes;
--   (perd les notes saisies depuis l'application de cette migration)
-- ============================================================================

ALTER TABLE public.participations_cours_collectifs
  ADD COLUMN IF NOT EXISTS notes text;

DO $migration$
DECLARE
  type_colonne text;
  nullable     text;
  a_defaut     boolean;
BEGIN
  SELECT data_type, is_nullable, column_default IS NOT NULL
    INTO type_colonne, nullable, a_defaut
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'participations_cours_collectifs'
      AND column_name = 'notes';

  IF type_colonne IS NULL THEN
    RAISE EXCEPTION 'Echec verification : colonne notes absente de participations_cours_collectifs';
  END IF;
  IF type_colonne <> 'text' OR nullable <> 'YES' OR a_defaut THEN
    RAISE EXCEPTION 'Echec verification : notes doit être text, nullable, sans défaut (type=%, nullable=%, défaut=%)', type_colonne, nullable, a_defaut;
  END IF;

  -- Les 2 policies de la table sont toujours là (rien de perdu, rien de doublé).
  IF (SELECT count(*) FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'participations_cours_collectifs') <> 2 THEN
    RAISE EXCEPTION 'Echec verification : 2 policies attendues sur participations_cours_collectifs';
  END IF;
END
$migration$;

NOTIFY pgrst, 'reload schema';
