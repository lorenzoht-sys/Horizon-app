-- ============================================================================
-- 20260928_absence_signalee_seances.sql
-- ============================================================================
--
-- Signalement d'ABSENCE par le bénéficiaire, pour sa prochaine séance
-- planifiée — pour que le praticien en soit informé sans attendre de la
-- constater lui-même le jour J.
--
-- ── Distincte de statut ──────────────────────────────────────────────────────
-- La colonne n'annule pas la séance et ne touche aucun statut existant
-- ('planifiee', 'realisee', 'annulee', 'reportee') : le bénéficiaire signale
-- une intention, c'est au praticien de décider de la suite (annuler, reporter,
-- ou laisser tel quel) via les écrans déjà existants. Zéro colonne lue par la
-- tournée, les contrats, les séances restantes ou la facturation n'est
-- modifiée par cette migration — vérifié : ces calculs ne lisent que `date`
-- et `statut` (voir src/utils/horaires.ts, src/hooks/useAgenda.ts).
--
-- ── Un seul état utile ──────────────────────────────────────────────────────
--   NULL       rien signalé (état par défaut, toute ligne existante)
--   timestamp  le bénéficiaire a signalé son absence à cet instant
-- Contrairement à presence_annoncee (cours collectifs), pas de valeur
-- textuelle à contraindre : un horodatage suffit, et le retour à NULL EST
-- permis (le bénéficiaire peut se rétracter tant que la séance n'a pas
-- commencé — voir api/_lib/absenceSignalee.ts).
--
-- ── Qui écrit ────────────────────────────────────────────────────────────────
-- Uniquement /api/patient/activite (type « seance-absence »), en service_role,
-- après vérification du jeton patient et de la fenêtre « jusqu'au début de la
-- séance, aucune tolérance ». Le bénéficiaire n'a aucun accès direct à la
-- table. Aucune policy RLS à modifier : `seances` en porte CINQ aujourd'hui,
-- pas quatre — les 4 historiques (praticien_id = auth.uid(), une par
-- opération) ET orga_acces_seances (mode organisation, FOR ALL, via la
-- fonction acces_participant() — toutes deux créées par
-- 20260714_03_mode_organisation_policies_lot_a.sql et
-- 20260714_01_mode_organisation_fondations.sql). Les cinq couvrent déjà la
-- ligne entière, donc la colonne aussi.
--
-- ── ⚠️ ORDRE DE DÉPLOIEMENT : cette migration AVANT le code ─────────────────
-- api/_lib/colonnesSeancesExposees.ts ajoute cette colonne à la liste exposée
-- au bénéficiaire : si le code arrive avant la migration, le select PostgREST
-- échoue (colonne inexistante) et /api/patient/me casse pour TOUT le monde,
-- pas seulement cette fonctionnalité. Appliquer en staging PUIS en production
-- AVANT de fusionner la PR.
--
-- Idempotente. Le SQL Editor affiche « Success » même quand le résultat n'est
-- pas celui attendu : le bloc final échoue bruyamment.
--
-- ── ROLLBACK ────────────────────────────────────────────────────────────────
--   ALTER TABLE public.seances DROP COLUMN IF EXISTS absence_signalee_par_patient_le;
--   (perd les signalements saisis depuis l'application de cette migration)
-- ============================================================================

ALTER TABLE public.seances
  ADD COLUMN IF NOT EXISTS absence_signalee_par_patient_le timestamptz;

DO $migration$
BEGIN
  IF (SELECT count(*) FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'seances'
          AND column_name = 'absence_signalee_par_patient_le'
          AND data_type = 'timestamp with time zone'
          AND is_nullable = 'YES' AND column_default IS NULL) <> 1 THEN
    RAISE EXCEPTION 'Echec verification : absence_signalee_par_patient_le (timestamptz) doit exister, nullable, sans défaut';
  END IF;

  -- Rien de perdu côté policies : les 5 attendues existent TOUTES, par nom
  -- (pas un simple compte — un compte à 5 passerait aussi si l'une des 5
  -- manquait mais qu'une autre, inattendue, la remplaçait).
  IF (SELECT count(*) FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'seances'
          AND policyname IN ('seances_select', 'seances_insert', 'seances_update', 'seances_delete', 'orga_acces_seances')) <> 5 THEN
    RAISE EXCEPTION 'Echec verification : les 5 policies attendues sur seances (seances_select/insert/update/delete + orga_acces_seances) doivent toutes exister, inchangees';
  END IF;

  -- Aucune ligne existante n'est déjà renseignée : la colonne est neuve.
  IF EXISTS (SELECT 1 FROM public.seances WHERE absence_signalee_par_patient_le IS NOT NULL) THEN
    RAISE EXCEPTION 'Echec verification : une ligne porte déjà une valeur — colonne pas si neuve que ça, à investiguer avant de continuer';
  END IF;
END
$migration$;

NOTIFY pgrst, 'reload schema';
