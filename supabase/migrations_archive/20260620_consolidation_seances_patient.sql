-- ============================================================================
-- 20260620_consolidation_seances_patient.sql
-- ============================================================================
--
-- CONTEXTE : 5 tables "programme V2" existent en production/staging mais
-- n'ont JAMAIS eu de fichier CREATE TABLE versionné dans supabase/migrations/
-- ni dans supabase/schema.sql — créées à la main via Supabase Studio à une
-- date non documentée :
--   seances_patient, exercices_realises,
--   programme_seances, programme_planning, programme_exercices.
-- (20260613_programme_v2_rls.sql avait déjà signalé ce trou pour la partie
-- RLS, sans jamais documenter le CREATE TABLE lui-même.)
--
-- Cette migration DOCUMENTE l'état réel observé (dump
-- supabase/_staging_schema_dump.sql du 2026-06-15, généré par
-- scripts/dump-schema.ts) — colonnes, types EXACTS, contraintes, FK, RLS,
-- policies, GRANT — afin de servir de référence fiable. Idempotente :
-- CREATE TABLE IF NOT EXISTS ne fait RIEN si la table existe déjà avec la
-- même structure ; sur une base où elle existe déjà (prod/staging actuels),
-- exécuter ce fichier ne change AUCUN comportement.
--
-- SEULE EXCEPTION (décision explicite, voir Checkpoint A) : les policies
-- "patient_gere_ses_seances" et "patient_gere_ses_exercices" observées en
-- production sont `FOR ALL TO public USING (true) WITH CHECK (true)` — un
-- reliquat d'une architecture antérieure au passage aux routes
-- /api/patient/* (service_role). Combinées au GRANT complet sur le rôle
-- `authenticated`, elles permettent à N'IMPORTE QUEL praticien authentifié
-- de lire/écrire les séances et exercices de N'IMPORTE QUEL AUTRE praticien
-- (faille d'accès croisé entre comptes). Cette migration les remplace par
-- la version scopée au praticien propriétaire (même logique que les
-- policies "praticien_gere_*" déjà correctes sur ces tables) — c'est la
-- SEULE déviation à la règle "documenter sans modifier" de cette session,
-- nécessaire pour ne pas rejouer une faille connue.
--
-- Les policies "anon_read_*" sur programme_seances/programme_planning/
-- programme_exercices (TO anon, USING true) sont reproduites TELLES QUELLES
-- (pas de risque actif tant que REVOKE ALL ... FROM anon de
-- 20260613_rls_anon_lockdown.sql tient — à vérifier puis nettoyer sur une
-- session dédiée, voir rapport Checkpoint B).
--
-- type_seance_id NOT NULL : reproduit fidèlement l'absence de NOT NULL sur
-- participant_id/programme_id/seance_id de seances_patient (et sur
-- seance_patient_id/exercice_id de exercices_realises) observée en
-- production — ce n'est pas idéal, mais ce n'est pas le rôle de cette
-- migration de le changer.
--
-- PRÉREQUIS : table programmes (versionnée dans supabase/schema.sql),
-- participants (idem).
-- NE PAS EXÉCUTER SUR PROD SANS VALIDATION PRÉALABLE (relire ce fichier,
-- et idéalement relancer scripts/dump-schema.ts pour confirmer qu'aucune
-- des deux tables n'a changé depuis le 2026-06-15).
-- ============================================================================

-- ── 1. programme_seances ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.programme_seances (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  programme_id uuid NOT NULL REFERENCES public.programmes(id) ON DELETE CASCADE,
  nom          text NOT NULL,
  description  text,
  ordre        integer DEFAULT 1,
  created_at   timestamptz DEFAULT now()
);

ALTER TABLE public.programme_seances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_read_seances" ON public.programme_seances;
CREATE POLICY "anon_read_seances" ON public.programme_seances
  FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "praticien_crud_seances" ON public.programme_seances;
CREATE POLICY "praticien_crud_seances" ON public.programme_seances
  FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.programmes p
    WHERE p.id = programme_seances.programme_id AND p.praticien_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.programmes p
    WHERE p.id = programme_seances.programme_id AND p.praticien_id = auth.uid()
  ));

DROP POLICY IF EXISTS "praticien_gere_programme_seances" ON public.programme_seances;
CREATE POLICY "praticien_gere_programme_seances" ON public.programme_seances
  FOR ALL
  USING (programme_id IN (
    SELECT pr.id FROM public.programmes pr
    JOIN public.participants pa ON pa.id = pr.participant_id
    WHERE pa.praticien_id = auth.uid()
  ))
  WITH CHECK (programme_id IN (
    SELECT pr.id FROM public.programmes pr
    JOIN public.participants pa ON pa.id = pr.participant_id
    WHERE pa.praticien_id = auth.uid()
  ));

GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.programme_seances TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.programme_seances TO service_role;

-- ── 2. programme_planning ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.programme_planning (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  programme_id uuid NOT NULL REFERENCES public.programmes(id) ON DELETE CASCADE,
  seance_id    uuid NOT NULL REFERENCES public.programme_seances(id) ON DELETE CASCADE,
  jour         text NOT NULL CHECK (jour IN ('lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche')),
  created_at   timestamptz DEFAULT now()
);

ALTER TABLE public.programme_planning ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_read_planning" ON public.programme_planning;
CREATE POLICY "anon_read_planning" ON public.programme_planning
  FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "praticien_crud_planning" ON public.programme_planning;
CREATE POLICY "praticien_crud_planning" ON public.programme_planning
  FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.programmes p
    WHERE p.id = programme_planning.programme_id AND p.praticien_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.programmes p
    WHERE p.id = programme_planning.programme_id AND p.praticien_id = auth.uid()
  ));

DROP POLICY IF EXISTS "praticien_gere_programme_planning" ON public.programme_planning;
CREATE POLICY "praticien_gere_programme_planning" ON public.programme_planning
  FOR ALL
  USING (programme_id IN (
    SELECT pr.id FROM public.programmes pr
    JOIN public.participants pa ON pa.id = pr.participant_id
    WHERE pa.praticien_id = auth.uid()
  ))
  WITH CHECK (programme_id IN (
    SELECT pr.id FROM public.programmes pr
    JOIN public.participants pa ON pa.id = pr.participant_id
    WHERE pa.praticien_id = auth.uid()
  ));

GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.programme_planning TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.programme_planning TO service_role;

-- ── 3. programme_exercices ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.programme_exercices (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seance_id         uuid NOT NULL REFERENCES public.programme_seances(id) ON DELETE CASCADE,
  nom               text NOT NULL,
  categorie         text,
  description       text,
  conseil_securite  text,
  series            integer,
  repetitions       integer,
  duree_secondes    integer,
  ordre             integer DEFAULT 1,
  created_at        timestamptz DEFAULT now()
);

ALTER TABLE public.programme_exercices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_read_exercices" ON public.programme_exercices;
CREATE POLICY "anon_read_exercices" ON public.programme_exercices
  FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "praticien_crud_exercices" ON public.programme_exercices;
CREATE POLICY "praticien_crud_exercices" ON public.programme_exercices
  FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.programme_seances s
    JOIN public.programmes p ON p.id = s.programme_id
    WHERE s.id = programme_exercices.seance_id AND p.praticien_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.programme_seances s
    JOIN public.programmes p ON p.id = s.programme_id
    WHERE s.id = programme_exercices.seance_id AND p.praticien_id = auth.uid()
  ));

DROP POLICY IF EXISTS "praticien_gere_programme_exercices" ON public.programme_exercices;
CREATE POLICY "praticien_gere_programme_exercices" ON public.programme_exercices
  FOR ALL
  USING (seance_id IN (
    SELECT ps.id FROM public.programme_seances ps
    JOIN public.programmes pr ON pr.id = ps.programme_id
    JOIN public.participants pa ON pa.id = pr.participant_id
    WHERE pa.praticien_id = auth.uid()
  ))
  WITH CHECK (seance_id IN (
    SELECT ps.id FROM public.programme_seances ps
    JOIN public.programmes pr ON pr.id = ps.programme_id
    JOIN public.participants pa ON pa.id = pr.participant_id
    WHERE pa.praticien_id = auth.uid()
  ));

GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.programme_exercices TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.programme_exercices TO service_role;

-- ── 4. seances_patient ───────────────────────────────────────────────────────
-- date_seance est de type DATE (confirmé sur le dump du 2026-06-15) — pas
-- TIMESTAMP/TIMESTAMPTZ. La cause exacte du bug de comparaison de dates
-- rencontré précédemment (ParticipantProfile.tsx) reste donc non confirmée ;
-- hors périmètre de cette migration de consolidation.

CREATE TABLE IF NOT EXISTS public.seances_patient (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id       uuid REFERENCES public.participants(id) ON DELETE CASCADE,
  programme_id         uuid REFERENCES public.programmes(id) ON DELETE CASCADE,
  seance_id            uuid REFERENCES public.programme_seances(id) ON DELETE CASCADE,
  date_seance          date DEFAULT CURRENT_DATE,
  statut               text DEFAULT 'en_cours' CHECK (statut IN ('en_cours', 'terminee', 'partielle')),
  commentaire_patient  text,
  duree_minutes        integer,
  created_at           timestamptz DEFAULT now()
);

ALTER TABLE public.seances_patient ENABLE ROW LEVEL SECURITY;

-- Policies correctement scopées, déjà observées telles quelles en
-- production — reproduites sans changement.
DROP POLICY IF EXISTS "praticien_gere_seances_patient" ON public.seances_patient;
CREATE POLICY "praticien_gere_seances_patient" ON public.seances_patient
  FOR ALL
  USING (participant_id IN (
    SELECT id FROM public.participants WHERE praticien_id = auth.uid()
  ))
  WITH CHECK (participant_id IN (
    SELECT id FROM public.participants WHERE praticien_id = auth.uid()
  ));

DROP POLICY IF EXISTS "praticien_voit_seances_patient" ON public.seances_patient;
CREATE POLICY "praticien_voit_seances_patient" ON public.seances_patient
  FOR ALL
  USING (participant_id IN (
    SELECT id FROM public.participants WHERE praticien_id = auth.uid()
  ));

-- ⚠️ DÉVIATION VOLONTAIRE (seule exception à "documenter sans modifier" de
-- cette session) : en production cette policy est actuellement
-- `FOR ALL TO public USING (true) WITH CHECK (true)` — accès croisé entre
-- TOUS les praticiens authentifiés. Remplacée ici par la même portée que
-- "praticien_gere_seances_patient" ci-dessus (le nom de la policy est
-- conservé pour traçabilité, sa logique est corrigée).
DROP POLICY IF EXISTS "patient_gere_ses_seances" ON public.seances_patient;
CREATE POLICY "patient_gere_ses_seances" ON public.seances_patient
  FOR ALL
  USING (participant_id IN (
    SELECT id FROM public.participants WHERE praticien_id = auth.uid()
  ))
  WITH CHECK (participant_id IN (
    SELECT id FROM public.participants WHERE praticien_id = auth.uid()
  ));

GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.seances_patient TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.seances_patient TO service_role;

-- ── 5. exercices_realises ───────────────────────────────────────────────────
-- exercice_id référence programme_exercices.id (l'exercice DUPLIQUÉ dans une
-- séance de programme), PAS un id de la bibliothèque statique d'exercices.

CREATE TABLE IF NOT EXISTS public.exercices_realises (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seance_patient_id  uuid REFERENCES public.seances_patient(id) ON DELETE CASCADE,
  exercice_id        uuid REFERENCES public.programme_exercices(id),
  realise            boolean DEFAULT false,
  commentaire        text,
  created_at         timestamptz DEFAULT now()
);

ALTER TABLE public.exercices_realises ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "praticien_gere_exercices_realises" ON public.exercices_realises;
CREATE POLICY "praticien_gere_exercices_realises" ON public.exercices_realises
  FOR ALL
  USING (seance_patient_id IN (
    SELECT sp.id FROM public.seances_patient sp
    JOIN public.participants p ON p.id = sp.participant_id
    WHERE p.praticien_id = auth.uid()
  ))
  WITH CHECK (seance_patient_id IN (
    SELECT sp.id FROM public.seances_patient sp
    JOIN public.participants p ON p.id = sp.participant_id
    WHERE p.praticien_id = auth.uid()
  ));

DROP POLICY IF EXISTS "praticien_voit_exercices_realises" ON public.exercices_realises;
CREATE POLICY "praticien_voit_exercices_realises" ON public.exercices_realises
  FOR ALL
  USING (seance_patient_id IN (
    SELECT sp.id FROM public.seances_patient sp
    JOIN public.participants p ON sp.participant_id = p.id
    WHERE p.praticien_id = auth.uid()
  ));

-- ⚠️ DÉVIATION VOLONTAIRE (même cas que ci-dessus) : remplace
-- `FOR ALL TO public USING (true) WITH CHECK (true)` par la portée
-- praticien-propriétaire.
DROP POLICY IF EXISTS "patient_gere_ses_exercices" ON public.exercices_realises;
CREATE POLICY "patient_gere_ses_exercices" ON public.exercices_realises
  FOR ALL
  USING (seance_patient_id IN (
    SELECT sp.id FROM public.seances_patient sp
    JOIN public.participants p ON p.id = sp.participant_id
    WHERE p.praticien_id = auth.uid()
  ))
  WITH CHECK (seance_patient_id IN (
    SELECT sp.id FROM public.seances_patient sp
    JOIN public.participants p ON p.id = sp.participant_id
    WHERE p.praticien_id = auth.uid()
  ));

GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.exercices_realises TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.exercices_realises TO service_role;
