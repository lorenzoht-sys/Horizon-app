-- ============================================================================
-- 20260718_dossier_exercice_membres.sql
-- ============================================================================
--
-- Refonte de l'organisation en dossiers de la bibliothèque d'exercices : les
-- dossiers (dossiers_exercices, 20260716_bibliotheque_exercices.sql)
-- pouvaient jusqu'ici seulement contenir des exercices personnalisés, via la
-- colonne exercices_personnalises.dossier_id. Le catalogue de base
-- (EXERCICES_BASE, 64 exercices codés en dur dans src/data/exercices.ts,
-- PAS une table) ne pouvait pas y être rangé — il n'existe aucune ligne en
-- base à laquelle accrocher un dossier_id.
--
-- Cette table de rattachement générique associe n'importe quel exercice
-- (base OU personnalisé) à un dossier, par praticien, sans jamais toucher au
-- catalogue de base lui-même (référentiel commun et partagé, intact).
--
-- exercice_ref est un simple TEXT sans contrainte FK : pour type_exercice =
-- 'base', il stocke l'id string stable d'EXERCICES_BASE ('eq-unipodal', …) —
-- pas de table à référencer. Pour type_exercice = 'personnalise', il stocke
-- l'uuid (en text) de exercices_personnalises.id — pas de FK non plus ici,
-- volontairement : Postgres ne permet pas de FK conditionnelle selon la
-- valeur d'une autre colonne sans trigger, et aucune fonction de suppression
-- d'exercice personnalisé n'existe aujourd'hui (vérifié : aucun appel
-- .delete() dans data/exercices.ts) — rien à nettoyer pour l'instant.
-- Intégrité déléguée à l'application. À revisiter si une suppression
-- d'exercice personnalisé est ajoutée un jour (prévoir alors soit un trigger
-- de nettoyage, soit un DELETE explicite côté appli sur cette table en
-- même temps que sur exercices_personnalises).
--
-- Multi-dossier assumé (décision explicite) : un même exercice peut
-- apparaître dans plusieurs dossiers à la fois — glisser-déposer un exercice
-- sur un dossier l'AJOUTE à ce dossier, sans le retirer des autres. D'où la
-- contrainte UNIQUE sur (praticien_id, dossier_id, type_exercice,
-- exercice_ref) : empêche un doublon dans le MÊME dossier, permet plusieurs
-- dossiers différents.
--
-- exercices_personnalises.dossier_id / .ordre restent en base intacts après
-- le backfill ci-dessous (pas de DROP COLUMN) — mais ne sont plus lus ni
-- écrits par le code applicatif une fois cette table en service. Colonnes
-- vestigiales, nettoyage éventuel dans une migration séparée plus tard.
--
-- RLS : même pattern que dossiers_exercices / exercices_personnalises
-- (praticien_id = auth.uid()), avec cette fois la FK praticien_id →
-- auth.users(id) ON DELETE CASCADE correctement posée (absente sur les deux
-- tables sœurs, écart documenté dans 20260716 comme non corrigé sur celles-ci
-- — pas de raison de reproduire l'écart sur une table neuve).
-- ============================================================================

CREATE TABLE dossier_exercice_membres (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  praticien_id  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  dossier_id    uuid NOT NULL REFERENCES dossiers_exercices(id) ON DELETE CASCADE,
  exercice_ref  text NOT NULL,
  type_exercice text NOT NULL CHECK (type_exercice IN ('base', 'personnalise')),
  ordre         integer NOT NULL DEFAULT 0,
  created_at    timestamptz DEFAULT now(),

  UNIQUE (praticien_id, dossier_id, type_exercice, exercice_ref)
);

CREATE INDEX idx_dossier_exercice_membres_praticien ON dossier_exercice_membres(praticien_id);
CREATE INDEX idx_dossier_exercice_membres_dossier   ON dossier_exercice_membres(dossier_id);
CREATE INDEX idx_dossier_exercice_membres_ref        ON dossier_exercice_membres(type_exercice, exercice_ref);

ALTER TABLE dossier_exercice_membres ENABLE ROW LEVEL SECURITY;

CREATE POLICY "praticien_gere_dossier_exercice_membres" ON dossier_exercice_membres
  FOR ALL
  USING (praticien_id = auth.uid())
  WITH CHECK (praticien_id = auth.uid());

-- ── Backfill ─────────────────────────────────────────────────────────────
-- Reprend les rattachements existants d'exercices_personnalises.dossier_id
-- (un exercice personnalisé déjà rangé dans un dossier avant cette migration
-- s'y retrouve automatiquement dans la nouvelle table). N'écrit rien sur
-- exercices_personnalises.

INSERT INTO dossier_exercice_membres (praticien_id, dossier_id, exercice_ref, type_exercice, ordre)
SELECT praticien_id, dossier_id, id::text, 'personnalise', ordre
FROM exercices_personnalises
WHERE dossier_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
