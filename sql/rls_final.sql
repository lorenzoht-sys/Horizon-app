-- ============================================================================
-- sql/rls_final.sql — T1 : verrouillage RLS / privilèges du rôle "anon"
-- ============================================================================
--
-- ⚠️ NE PAS EXÉCUTER AUTOMATIQUEMENT. Ce script doit être relu puis exécuté
-- manuellement par Lorenzo dans le SQL Editor de Supabase, section par
-- section (dans l'ordre).
--
-- Contexte / décision d'architecture (voir RAPPORT_SECURISATION.md) :
-- le rôle "anon" Supabase ne doit plus avoir AUCUN accès direct aux tables.
-- Tous les accès "espace patient" (/patient) et "portail structure"
-- (/structure/[token]) passent désormais par des fonctions serverless
-- Vercel (/api/patient/*, /api/structure/*) qui utilisent la clé
-- service_role (bypass RLS) après avoir validé le code patient / le token
-- structure côté serveur. La clé service_role n'est jamais exposée au
-- client.
--
-- Le fichier `horizon_rls_policies.sql` référencé par la consigne initiale
-- est ABSENT du repo. Ce script est donc reconstruit directement depuis
-- schema.sql + les 19 migrations de supabase/migrations + le code TS.
-- Chaque hypothèse de schéma est documentée ci-dessous (H1 à H6).
--
-- ----------------------------------------------------------------------------
-- [H1] Code patient = calculerCode(prenom) = prénom normalisé + "2026"
--      (PAS un code aléatoire à 6 caractères). Conservé tel quel côté
--      serveur dans /api/patient/login (T3) + rate limiting. Faiblesse
--      (devinable si on connaît le prénom) signalée dans le rapport final.
--      → Aucun impact sur ce script SQL.
--
-- [H2] FAILLE CRITIQUE : la policy "Lecture publique par participant_id" sur
--      documents_patient (USING (true)) rend lisibles PAR N'IMPORTE QUI
--      (anon, sans filtre) tous les comptes-rendus de TOUS les patients.
--      → Corrigée en SECTION 1.
--
-- [H3] Le portail structure utilise déjà un pattern token fonctionnel
--      (structure_token_valide() + header x-structure-token, migration
--      20260608_fix_structure_anon_rls.sql). Avec le verrou anon décidé
--      pour Horizon, ce mécanisme devient obsolète pour le rôle anon : T5
--      fait valider le token côté service_role (Vercel). Les policies de
--      lecture anon basées sur structure_token_valide() sont retirées en
--      SECTION 3 ; la fonction elle-même est conservée (inoffensive,
--      réutilisable) mais son droit EXECUTE est retiré à anon.
--
-- [H4] Les tables seances_patient, exercices_realises, programme_seances,
--      programme_planning, programme_exercices sont utilisées par le code
--      (EspacePatient.tsx, useProgrammeV2.ts, Dashboard.tsx,
--      ParticipantProfile.tsx, AssistantPage.tsx) mais AUCUNE migration
--      "CREATE TABLE" n'est trackée dans supabase/migrations pour ces 5
--      tables : elles existent donc en base mais ont été créées hors-repo
--      (Supabase Studio). Colonnes déduites du code TS (cf. commentaires
--      SECTION 4).
--      ⚠️ POINT DE VIGILANCE MAJEUR : si RLS n'était PAS encore activé sur
--      ces 5 tables, elles étaient jusqu'ici intégralement lisibles ET
--      ÉCRIVABLES par n'importe qui via la clé anon (EspacePatient.tsx les
--      utilise en écriture sans session). C'est potentiellement la faille
--      la plus grave du lot. SECTION 4 active RLS + recrée des policies
--      praticien-only ; après T3, plus aucun accès anon n'est nécessaire
--      sur ces tables (le service_role bypass RLS).
--
-- [H5] La table "structures" a une policy "lecture_publique_token" FOR
--      SELECT USING (actif = true) : TOUTE structure active est lisible par
--      anon, MÊME SANS connaître le token. Retirée en SECTION 2.
--
-- [H6] Les policies "praticien_gere_*" (praticien_id = auth.uid(), ou
--      participant_id IN (SELECT id FROM participants WHERE praticien_id =
--      auth.uid())) restent INCHANGÉES : Pierre (rôle authenticated) garde
--      tous ses accès actuels. Seul le rôle anon est verrouillé par ce
--      script.
-- ----------------------------------------------------------------------------


-- ============================================================================
-- SECTION 1 — documents_patient : correction de la faille [H2]
-- ============================================================================
-- Avant : "Lecture publique par participant_id" USING (true) → lecture
-- publique totale. Aussi : INSERT/DELETE ouverts à TOUT utilisateur
-- authenticated (pas seulement le praticien propriétaire du patient).
--
-- Après : plus aucune policy anon. Pierre (authenticated) garde lecture/
-- écriture/suppression, mais uniquement sur les documents de SES patients.
-- L'espace patient lira ces documents via /api/patient/* (service_role).

DROP POLICY IF EXISTS "Lecture publique par participant_id" ON documents_patient;
DROP POLICY IF EXISTS "Ecriture authentifiee" ON documents_patient;
DROP POLICY IF EXISTS "Suppression authentifiee" ON documents_patient;

CREATE POLICY "praticien_gere_documents_patient" ON documents_patient
  FOR ALL USING (
    participant_id IN (SELECT id FROM participants WHERE praticien_id = auth.uid())
  )
  WITH CHECK (
    participant_id IN (SELECT id FROM participants WHERE praticien_id = auth.uid())
  );


-- ============================================================================
-- SECTION 2 — structures : retrait de la lecture publique par défaut [H5]
-- ============================================================================
-- "lecture_publique_token" rendait lisible TOUTE ligne où actif = true,
-- sans vérifier le token. Retirée : seul "praticien_gere_structures"
-- (authenticated, praticien_id = auth.uid()) subsiste. Le portail structure
-- (anon) passera par /api/structure/* (service_role) — T5.

DROP POLICY IF EXISTS "lecture_publique_token" ON structures;


-- ============================================================================
-- SECTION 3 — retrait des policies de lecture anon basées sur le token
--             structure (participants, bilans, seances, programmes,
--             factures_suivi, documents_partages) [H3]
-- ============================================================================
-- Ces policies (créées par 20260604_structures_anon_access.sql puis
-- réécrites par 20260608_fix_structure_anon_rls.sql) permettaient au rôle
-- anon de lire les données d'un patient de structure en présentant le bon
-- header x-structure-token. Avec le verrou anon, ce chemin est remplacé par
-- /api/structure/* (service_role) — T5.

DROP POLICY IF EXISTS "structure_anon_read_participants" ON participants;
DROP POLICY IF EXISTS "structure_anon_read_bilans" ON bilans;
DROP POLICY IF EXISTS "structure_anon_read_seances" ON seances;
DROP POLICY IF EXISTS "structure_anon_read_programmes" ON programmes;
DROP POLICY IF EXISTS "structure_anon_read_factures" ON factures_suivi;
DROP POLICY IF EXISTS "structure_anon_read_documents_partages" ON documents_partages;

-- La fonction structure_token_valide() est conservée (inoffensive : ne
-- renvoie qu'un booléen, SECURITY DEFINER) mais n'a plus besoin d'être
-- exécutable par anon. Idem pour get_praticien_structure() (RPC du portail,
-- ne renvoie que prénom/nom/titre/email/téléphone du praticien).
REVOKE EXECUTE ON FUNCTION structure_token_valide(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION get_praticien_structure(text) FROM anon;


-- ============================================================================
-- SECTION 4 — verrouillage des tables "programme V2" / historique de séances
--             patient [H4]
-- ============================================================================
-- Ces 5 tables n'ont pas de migration CREATE TABLE trackée. RLS est activé
-- (idempotent si déjà actif) puis des policies praticien-only sont créées
-- (DROP IF EXISTS au cas où des policies anon existeraient déjà côté
-- Supabase Studio). Colonnes utilisées d'après le code TS :
--
--   seances_patient     : id, participant_id, programme_id, seance_id,
--                         date_seance, statut, commentaire_patient,
--                         duree_minutes
--   exercices_realises  : id, seance_patient_id, exercice_id, realise,
--                         commentaire
--   programme_seances   : id, programme_id, nom, description, ordre
--   programme_planning  : id, programme_id, seance_id, jour
--   programme_exercices : id, seance_id, nom, categorie, description,
--                         conseil_securite, series, repetitions,
--                         duree_secondes, ordre
--
-- ⚠️ Vérifie dans Supabase Studio (Database → Tables → onglet RLS) que ces
-- noms de colonnes correspondent bien à la réalité avant d'exécuter cette
-- section. Si une colonne diffère, adapte la clause USING correspondante.

ALTER TABLE seances_patient     ENABLE ROW LEVEL SECURITY;
ALTER TABLE exercices_realises  ENABLE ROW LEVEL SECURITY;
ALTER TABLE programme_seances   ENABLE ROW LEVEL SECURITY;
ALTER TABLE programme_planning  ENABLE ROW LEVEL SECURITY;
ALTER TABLE programme_exercices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "praticien_gere_seances_patient" ON seances_patient;
CREATE POLICY "praticien_gere_seances_patient" ON seances_patient
  FOR ALL USING (
    participant_id IN (SELECT id FROM participants WHERE praticien_id = auth.uid())
  )
  WITH CHECK (
    participant_id IN (SELECT id FROM participants WHERE praticien_id = auth.uid())
  );

DROP POLICY IF EXISTS "praticien_gere_exercices_realises" ON exercices_realises;
CREATE POLICY "praticien_gere_exercices_realises" ON exercices_realises
  FOR ALL USING (
    seance_patient_id IN (
      SELECT sp.id FROM seances_patient sp
      JOIN participants p ON p.id = sp.participant_id
      WHERE p.praticien_id = auth.uid()
    )
  )
  WITH CHECK (
    seance_patient_id IN (
      SELECT sp.id FROM seances_patient sp
      JOIN participants p ON p.id = sp.participant_id
      WHERE p.praticien_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "praticien_gere_programme_seances" ON programme_seances;
CREATE POLICY "praticien_gere_programme_seances" ON programme_seances
  FOR ALL USING (
    programme_id IN (
      SELECT pr.id FROM programmes pr
      JOIN participants pa ON pa.id = pr.participant_id
      WHERE pa.praticien_id = auth.uid()
    )
  )
  WITH CHECK (
    programme_id IN (
      SELECT pr.id FROM programmes pr
      JOIN participants pa ON pa.id = pr.participant_id
      WHERE pa.praticien_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "praticien_gere_programme_planning" ON programme_planning;
CREATE POLICY "praticien_gere_programme_planning" ON programme_planning
  FOR ALL USING (
    programme_id IN (
      SELECT pr.id FROM programmes pr
      JOIN participants pa ON pa.id = pr.participant_id
      WHERE pa.praticien_id = auth.uid()
    )
  )
  WITH CHECK (
    programme_id IN (
      SELECT pr.id FROM programmes pr
      JOIN participants pa ON pa.id = pr.participant_id
      WHERE pa.praticien_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "praticien_gere_programme_exercices" ON programme_exercices;
CREATE POLICY "praticien_gere_programme_exercices" ON programme_exercices
  FOR ALL USING (
    seance_id IN (
      SELECT ps.id FROM programme_seances ps
      JOIN programmes pr ON pr.id = ps.programme_id
      JOIN participants pa ON pa.id = pr.participant_id
      WHERE pa.praticien_id = auth.uid()
    )
  )
  WITH CHECK (
    seance_id IN (
      SELECT ps.id FROM programme_seances ps
      JOIN programmes pr ON pr.id = ps.programme_id
      JOIN participants pa ON pa.id = pr.participant_id
      WHERE pa.praticien_id = auth.uid()
    )
  );


-- ============================================================================
-- SECTION 5 — REVOKE global : le rôle anon perd tout accès aux tables
-- ============================================================================
-- Filet de sécurité supplémentaire (défense en profondeur) : même si une
-- policy RLS anon avait été oubliée ci-dessus, anon n'a plus aucun
-- privilège GRANT sur les tables. authenticated (Pierre) n'est pas
-- concerné. service_role bypass RLS et n'est pas affecté par REVOKE.

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;

-- Empêche que de futures tables créées par Pierre/migrations héritent
-- automatiquement de droits anon (si des "default privileges" pour anon
-- avaient été configurés au niveau du projet Supabase).
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;


-- ============================================================================
-- SECTION 6 — VÉRIFICATION (à exécuter après les sections ci-dessus)
-- ============================================================================
-- Doit ne renvoyer AUCUNE ligne si le verrouillage est complet :

-- 1) Plus aucun privilège GRANT pour anon sur les tables :
SELECT table_name, privilege_type
FROM information_schema.role_table_grants
WHERE grantee = 'anon';

-- 2) Plus aucune policy RLS ciblant anon (ou "public", qui inclut anon) :
SELECT schemaname, tablename, policyname, roles
FROM pg_policies
WHERE 'anon' = ANY(roles) OR roles = '{public}';
