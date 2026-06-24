-- ============================================================================
-- 20260623_periodicite_contrat.sql
-- ============================================================================
--
-- Ajoute la périodicité du contrat : jusqu'ici nb_seances_semaine supposait
-- toujours un cycle d'une semaine. Cette colonne permet d'espacer les séances
-- sur 2 ou 3 semaines (1 séance toutes les 2/3 semaines), sans changer le
-- sens de nb_seances_semaine pour les contrats hebdomadaires existants.
--
-- DEFAULT 'semaine' : tous les contrats existants conservent leur
-- comportement actuel (nb_seances_semaine séances chaque semaine) sans aucune
-- action de migration de données.
--
-- Pour 'deux_semaines'/'trois_semaines', nb_seances_semaine vaut toujours 1
-- — convention appliquée côté application (ContratNouveauPage.tsx,
-- ParticipantForm.tsx), pas une contrainte SQL, pour rester simple.
--
-- IDEMPOTENTE : ADD COLUMN IF NOT EXISTS ne fait rien si la colonne existe déjà.
-- NE PAS EXÉCUTER SUR PROD sans validation préalable.
-- ============================================================================

ALTER TABLE public.contrats
  ADD COLUMN IF NOT EXISTS periodicite TEXT NOT NULL DEFAULT 'semaine';

ALTER TABLE public.contrats
  DROP CONSTRAINT IF EXISTS contrats_periodicite_check;

ALTER TABLE public.contrats
  ADD CONSTRAINT contrats_periodicite_check
  CHECK (periodicite IN ('semaine', 'deux_semaines', 'trois_semaines'));

-- GRANTs explicites (défensif, même précaution que les migrations précédentes
-- sur cette table).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contrats TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contrats TO service_role;
