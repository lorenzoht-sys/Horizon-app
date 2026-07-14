-- ============================================================================
-- 20260714_mode_organisation_fk_set_null.sql
-- ============================================================================
--
-- Palier 2 du mode « organisation employeuse propriétaire » — voir
-- CONCEPTION_MODE_ORGANISATION.md §4.1 à la racine du dépôt.
--
-- Aujourd'hui, les 10 FK praticien_id → auth.users(id) ci-dessous sont en
-- ON DELETE CASCADE : supprimer un compte auth.users supprime en cascade
-- toutes les lignes qu'il "possède". En mode organisation, supprimer le
-- compte d'un ex-salarié détruirait alors les dossiers de l'organisation —
-- ce qui contredirait directement la décision de conception "les données
-- restent dans l'organisation". Ce palier corrige ça préventivement, avant
-- que le mode organisation ne soit utilisable.
--
-- Les 10 noms de contrainte ci-dessous ont été vérifiés en production
-- (rjgzeuywwknubpwigozq) par requête sur pg_constraint le 14/07/2026, pas
-- devinés. Les 3 dernières (retours_seance, tests_etalons_activations,
-- exercices_libres_activations) ont leur colonne praticien_id encore
-- NOT NULL : DROP NOT NULL avant DROP/ADD CONSTRAINT, sinon un futur
-- déclenchement du SET NULL échouerait à l'exécution sur la colonne restée
-- NOT NULL.
--
-- Volontairement INCHANGÉ (voir §4.2 du document) : les FK praticien_id de
-- praticiens, zones_geographiques, indisponibilites, rappel_preferences
-- restent en CASCADE — ce sont des données personnelles du praticien,
-- prévues pour mourir avec son compte.
--
-- ⚠️ Aucun changement de comportement observable aujourd'hui pour un
-- praticien libéral : aucun parcours de suppression de compte n'existe
-- actuellement dans l'app, donc aucune suppression réelle ne déclenche ces
-- FK en pratique. Ce correctif est préventif — la validation de ce palier
-- est structurelle (les 10 contraintes sont bien en SET NULL, les 3
-- colonnes bien nullable), pas un test de comportement utilisateur.
--
-- IDEMPOTENTE : rejouable sans effet si déjà appliquée.
-- NE PAS EXÉCUTER SUR PROD sans validation préalable.
-- ============================================================================


-- ============================================================================
-- 1. participants
-- ============================================================================
ALTER TABLE public.participants
  DROP CONSTRAINT IF EXISTS participants_praticien_id_fkey;

ALTER TABLE public.participants
  ADD CONSTRAINT participants_praticien_id_fkey
  FOREIGN KEY (praticien_id) REFERENCES auth.users(id) ON DELETE SET NULL;


-- ============================================================================
-- 2. bilans
-- ============================================================================
ALTER TABLE public.bilans
  DROP CONSTRAINT IF EXISTS bilans_praticien_id_fkey;

ALTER TABLE public.bilans
  ADD CONSTRAINT bilans_praticien_id_fkey
  FOREIGN KEY (praticien_id) REFERENCES auth.users(id) ON DELETE SET NULL;


-- ============================================================================
-- 3. contrats
-- ============================================================================
ALTER TABLE public.contrats
  DROP CONSTRAINT IF EXISTS contrats_praticien_id_fkey;

ALTER TABLE public.contrats
  ADD CONSTRAINT contrats_praticien_id_fkey
  FOREIGN KEY (praticien_id) REFERENCES auth.users(id) ON DELETE SET NULL;


-- ============================================================================
-- 4. seances
-- ============================================================================
ALTER TABLE public.seances
  DROP CONSTRAINT IF EXISTS seances_praticien_id_fkey;

ALTER TABLE public.seances
  ADD CONSTRAINT seances_praticien_id_fkey
  FOREIGN KEY (praticien_id) REFERENCES auth.users(id) ON DELETE SET NULL;


-- ============================================================================
-- 5. notes_seances
-- ============================================================================
ALTER TABLE public.notes_seances
  DROP CONSTRAINT IF EXISTS notes_seances_praticien_id_fkey;

ALTER TABLE public.notes_seances
  ADD CONSTRAINT notes_seances_praticien_id_fkey
  FOREIGN KEY (praticien_id) REFERENCES auth.users(id) ON DELETE SET NULL;


-- ============================================================================
-- 6. programmes
-- ============================================================================
ALTER TABLE public.programmes
  DROP CONSTRAINT IF EXISTS programmes_praticien_id_fkey;

ALTER TABLE public.programmes
  ADD CONSTRAINT programmes_praticien_id_fkey
  FOREIGN KEY (praticien_id) REFERENCES auth.users(id) ON DELETE SET NULL;


-- ============================================================================
-- 7. comptes_rendus_seances
-- ============================================================================
ALTER TABLE public.comptes_rendus_seances
  DROP CONSTRAINT IF EXISTS comptes_rendus_seances_praticien_id_fkey;

ALTER TABLE public.comptes_rendus_seances
  ADD CONSTRAINT comptes_rendus_seances_praticien_id_fkey
  FOREIGN KEY (praticien_id) REFERENCES auth.users(id) ON DELETE SET NULL;


-- ============================================================================
-- 8. retours_seance — colonne NOT NULL à lever avant le SET NULL
-- ============================================================================
ALTER TABLE public.retours_seance
  ALTER COLUMN praticien_id DROP NOT NULL;

ALTER TABLE public.retours_seance
  DROP CONSTRAINT IF EXISTS retours_seance_praticien_id_fkey;

ALTER TABLE public.retours_seance
  ADD CONSTRAINT retours_seance_praticien_id_fkey
  FOREIGN KEY (praticien_id) REFERENCES auth.users(id) ON DELETE SET NULL;


-- ============================================================================
-- 9. tests_etalons_activations — colonne NOT NULL à lever avant le SET NULL
-- ============================================================================
ALTER TABLE public.tests_etalons_activations
  ALTER COLUMN praticien_id DROP NOT NULL;

ALTER TABLE public.tests_etalons_activations
  DROP CONSTRAINT IF EXISTS tests_etalons_activations_praticien_id_fkey;

ALTER TABLE public.tests_etalons_activations
  ADD CONSTRAINT tests_etalons_activations_praticien_id_fkey
  FOREIGN KEY (praticien_id) REFERENCES auth.users(id) ON DELETE SET NULL;


-- ============================================================================
-- 10. exercices_libres_activations — colonne NOT NULL à lever avant le SET NULL
-- ============================================================================
ALTER TABLE public.exercices_libres_activations
  ALTER COLUMN praticien_id DROP NOT NULL;

ALTER TABLE public.exercices_libres_activations
  DROP CONSTRAINT IF EXISTS exercices_libres_activations_praticien_id_fkey;

ALTER TABLE public.exercices_libres_activations
  ADD CONSTRAINT exercices_libres_activations_praticien_id_fkey
  FOREIGN KEY (praticien_id) REFERENCES auth.users(id) ON DELETE SET NULL;


-- ============================================================================
-- 11. Rechargement du schéma PostgREST
-- ============================================================================
-- La nullabilité de praticien_id change sur 3 tables (8, 9, 10) : PostgREST
-- met en cache le schéma (OpenAPI, validation), d'où le rechargement.

NOTIFY pgrst, 'reload schema';
