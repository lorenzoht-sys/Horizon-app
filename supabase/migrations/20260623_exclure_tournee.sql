-- ============================================================================
-- 20260623_exclure_tournee.sql
-- ============================================================================
--
-- Ajoute un drapeau "exclure de la tournée" sur les contrats : un patient
-- avec ce contrat reste visible partout ailleurs dans l'app (fiche patient,
-- agenda, etc.), mais n'est jamais candidaté par le planificateur de tournée
-- (Mode A semaine ponctuelle, Mode B récurrent — src/lib/planificateur.ts).
-- Utile par exemple pour un patient suivi en libéral mais dont les séances
-- sont organisées hors de l'optimisation automatique de Pierre.
--
-- DEFAULT FALSE : aucun contrat existant n'est affecté tant que Pierre ne
-- l'active pas explicitement.
--
-- IDEMPOTENTE : ADD COLUMN IF NOT EXISTS ne fait rien si la colonne existe déjà.
-- NE PAS EXÉCUTER SUR PROD sans validation préalable.
-- ============================================================================

ALTER TABLE public.contrats
  ADD COLUMN IF NOT EXISTS exclure_tournee BOOLEAN NOT NULL DEFAULT FALSE;

-- GRANTs explicites (défensif, même précaution que les migrations précédentes
-- sur cette table — voir 20260622_refonte_contrats.sql et
-- 20260620_seances_autonomes.sql).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contrats TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contrats TO service_role;
