-- Token d'abonnement au flux iCalendar (webcal) du planning du praticien.
-- Généré côté client (crypto.getRandomValues), même pattern que
-- structures.token_acces (voir src/hooks/useStructures.ts, genToken()).
-- Nullable : la fonctionnalité n'est pas activée tant que le praticien n'a
-- pas généré son lien depuis Paramètres.
--
-- Contrairement à structures.token_acces, aucune policy RLS "lecture
-- publique par token" n'est ajoutée ici : l'endpoint public
-- api/planning/ics.ts utilise exclusivement le client service_role
-- (contourne RLS), jamais le client anon.

ALTER TABLE praticiens
  ADD COLUMN IF NOT EXISTS token_planning_ics TEXT UNIQUE;

CREATE INDEX IF NOT EXISTS idx_praticiens_token_planning_ics
  ON praticiens(token_planning_ics);
