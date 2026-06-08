-- Corrige assistant_logs : la colonne action_type est envoyée par AssistantPage.tsx
-- mais n'existe pas (insert -> erreur PGRST204 avalée silencieusement, log jamais écrit).
-- praticien_id n'est par ailleurs jamais fourni par le code : on réutilise le même
-- trigger que sur les autres tables (bilans, participants, ...) pour le déduire de auth.uid().

ALTER TABLE assistant_logs
ADD COLUMN IF NOT EXISTS action_type TEXT;

CREATE TRIGGER assistant_logs_set_praticien
  BEFORE INSERT ON assistant_logs
  FOR EACH ROW EXECUTE FUNCTION set_praticien_id_from_auth();
