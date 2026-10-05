-- Contrainte contrats_jours_fixe_non_vide : jours_fixe est soit NULL, soit
-- un tableau non vide. Reprise de 20260911_02_jours_fixe_contrats.sql
-- (archive), jamais appliquée en production, marquée « ne pas exécuter sans
-- validation ».
--
-- Correction de l'ancienne version : elle testait array_length(jours_fixe, 1) > 0.
-- Or array_length('{}', 1) vaut NULL, et un CHECK qui vaut NULL est accepté :
-- le tableau vide, précisément l'état à interdire, passait. cardinality('{}')
-- vaut 0 et le refuse. Côté application, seul l'insert d'un nouveau contrat
-- (useContrats.ts, via contratToDb) écrit jours_fixe, et ContratNouveauPage.tsx
-- impose déjà au moins un jour : aucun flux existant n'envoie de tableau vide.
--
-- Sûr sur les données : relevé du 2026-10-05, aucun contrat de production n'a
-- jours_fixe = '{}' (0 ligne en violation). La contrainte est validée
-- immédiatement : si une ligne la violait au moment de l'application, la
-- migration échouerait, sans rien modifier, plutôt que de laisser une
-- contrainte non validée.
--
-- Idempotent. Aucune nouvelle table.

ALTER TABLE public.contrats DROP CONSTRAINT IF EXISTS contrats_jours_fixe_non_vide;
ALTER TABLE public.contrats
  ADD CONSTRAINT contrats_jours_fixe_non_vide
  CHECK (jours_fixe IS NULL OR cardinality(jours_fixe) > 0);

DO $controle$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conrelid = 'public.contrats'::regclass
                   AND conname = 'contrats_jours_fixe_non_vide' AND convalidated) THEN
    RAISE EXCEPTION 'contrats_jours_fixe_non_vide absente ou non validée';
  END IF;
  -- La contrainte doit réellement refuser un tableau vide (piège array_length / NULL).
  IF EXISTS (SELECT 1 FROM pg_constraint
             WHERE conrelid = 'public.contrats'::regclass AND conname = 'contrats_jours_fixe_non_vide'
               AND pg_get_constraintdef(oid) NOT LIKE '%cardinality%') THEN
    RAISE EXCEPTION 'contrats_jours_fixe_non_vide : définition inefficace sur un tableau vide';
  END IF;
END
$controle$;
