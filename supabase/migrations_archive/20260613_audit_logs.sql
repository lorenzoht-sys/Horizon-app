-- ============================================================================
-- 20260613_audit_logs.sql
-- ============================================================================
--
-- Tâche 7 (consolidation) — Journal d'audit des accès à l'espace patient.
--
-- Trace chaque connexion patient (réussie ou échouée) et chaque accès/écriture
-- de données de santé via /api/patient/* (api/_lib/patientAuth.ts), à des
-- fins de conformité (traçabilité des accès aux données de santé).
--
-- Cette table ne contient JAMAIS de données de santé : uniquement le type
-- d'événement, l'identifiant du participant concerné (si connu), l'adresse
-- IP, le succès/échec et la date. Valeurs possibles pour event_type :
--   - 'patient_login'        : tentative de connexion (POST /api/patient/login)
--   - 'patient_data_access'  : consultation de l'espace patient (GET /api/patient/me)
--   - 'patient_seance_submit': enregistrement d'une séance (POST /api/patient/seance)
--
-- Cette table n'est écrite que via la clé service_role (côté serveur). RLS
-- est activé ; une policy de lecture est ajoutée pour le praticien
-- propriétaire du participant concerné.

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_type text NOT NULL,
  participant_id uuid REFERENCES public.participants(id) ON DELETE SET NULL,
  ip text NOT NULL,
  success boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_participant_date
  ON public.audit_logs (participant_id, created_at);

CREATE INDEX IF NOT EXISTS idx_audit_logs_event_date
  ON public.audit_logs (event_type, created_at);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Le praticien propriétaire du participant peut consulter les événements qui
-- le concernent (jointure via participants.praticien_id = auth.uid()). Les
-- événements sans participant identifié (ex : connexion échouée avec un code
-- ne correspondant à personne) ne sont visibles par aucun praticien via RLS.
DROP POLICY IF EXISTS audit_logs_praticien_lecture ON public.audit_logs;
CREATE POLICY audit_logs_praticien_lecture
  ON public.audit_logs
  FOR SELECT
  TO authenticated
  USING (
    participant_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.participants p
      WHERE p.id = audit_logs.participant_id
        AND p.praticien_id = auth.uid()
    )
  );

-- Aucune policy d'écriture : seul service_role (qui contourne RLS) peut
-- insérer des lignes (cf. api/_lib/patientAuth.ts).

-- Optionnel : purge périodique des anciens événements (> 1 an), à exécuter
-- manuellement de temps en temps, ou via pg_cron si disponible :
--
-- DELETE FROM public.audit_logs
-- WHERE created_at < now() - interval '1 year';
