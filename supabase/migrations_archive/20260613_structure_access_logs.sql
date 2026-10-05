-- ============================================================================
-- 20260613_structure_access_logs.sql
-- ============================================================================
--
-- Version migration de sql/t5_structure_access.sql (branche securisation).
-- Enregistre chaque accès à /api/structure/data (un appel = une ligne), pour
-- repérer une fuite de token (accès anormalement fréquents ou depuis des IP
-- inattendues).
--
-- Cette table n'est écrite que via la clé service_role (côté serveur,
-- api/_lib/structureAuth.ts). RLS est activé ; une policy de lecture est
-- ajoutée pour le praticien propriétaire de la structure (consultation de
-- ses propres journaux d'accès).

CREATE TABLE IF NOT EXISTS public.structure_access_logs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  structure_id uuid NOT NULL REFERENCES public.structures(id) ON DELETE CASCADE,
  ip text NOT NULL,
  accessed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_structure_access_logs_structure_date
  ON public.structure_access_logs (structure_id, accessed_at);

ALTER TABLE public.structure_access_logs ENABLE ROW LEVEL SECURITY;

-- Le praticien propriétaire de la structure peut consulter ses propres
-- journaux d'accès (jointure via structures.praticien_id = auth.uid()).
DROP POLICY IF EXISTS structure_access_logs_praticien_lecture ON public.structure_access_logs;
CREATE POLICY structure_access_logs_praticien_lecture
  ON public.structure_access_logs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.structures s
      WHERE s.id = structure_access_logs.structure_id
        AND s.praticien_id = auth.uid()
    )
  );

-- Aucune policy d'écriture : seul service_role (qui contourne RLS) peut
-- insérer des lignes (cf. api/_lib/structureAuth.ts).

-- Optionnel : purge périodique des anciens accès (> 90 jours), à exécuter
-- manuellement de temps en temps, ou via pg_cron si disponible :
--
-- DELETE FROM public.structure_access_logs
-- WHERE accessed_at < now() - interval '90 days';
