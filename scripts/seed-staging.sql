-- ============================================================================
-- scripts/seed-staging.sql
-- ============================================================================
--
-- Jeu de données 100% FICTIF pour un environnement de STAGING.
--
-- ⚠️ NE JAMAIS exécuter ce script sur la base de PRODUCTION : il PURGE puis
-- réinsère les données des comptes de démonstration ci-dessous. Le SQL pur
-- n'a aucun moyen fiable de vérifier une référence de projet (pas de
-- fonction Postgres équivalente à inspecter une connection string) — le
-- garde-fou anti-prod vit donc dans scripts/staging-reseed.ts (même patron
-- que scripts/staging-fix-acces-participant-pour.ts et
-- scripts/staging-apply-grant-parity.ts), pas dans ce fichier. Exécute ce
-- script UNIQUEMENT via ce runner, jamais en collant directement dans un
-- SQL Editor dont tu n'es pas certain à 100% qu'il s'agit du projet staging.
--
-- ── Ce que ce script NE touche PAS : tm6_variantes ──────────────────────
-- Ce catalogue n'est ni purgé ni réinséré ici. Un reseed laisse donc
-- intactes ses policies, sa colonne `praticien_id` et ses lignes — dont
-- celles créées par scripts/staging-restaurer-etat-prod-tm6.ts.
--
-- Seuls les rattachements `bilans.tm6_variante_id` disparaissent, puisque
-- les bilans sont repurgés. Ils ne servaient qu'à valider le backfill du
-- lot 8, une fois : il n'y a AUCUNE raison de rejouer ce script de fixture
-- après un reseed — il recrée volontairement l'état VULNÉRABLE de la
-- production (policies USING(true)), et il faudrait alors réappliquer
-- 20260817_securite_01_tm6_variantes_rls.sql derrière pour ne pas laisser
-- staging ouvert.
--
-- La protection contre un `[F-01]` vert sans rien vérifier ne repose pas
-- sur ces données : elle est structurelle, dans tests/security/rls.spec.ts
-- (« tm6_variantes a bien 4 policies, écritures scopées au propriétaire »),
-- qui échoue si les policies disparaissent — cas où le test [F-01] par
-- effet passerait au vert en refusant tout.
--
-- Aucun nom, code, adresse ou donnée de santé ci-dessous ne correspond à un
-- patient réel : tout est inventé pour les tests (harnais RLS
-- tests/security/rls.spec.ts, Playwright e2e/, QA manuelle).
--
-- ----------------------------------------------------------------------------
-- CHANGEMENT PAR RAPPORT À LA VERSION PRÉCÉDENTE — PURGE-ET-RECRÉE
-- ----------------------------------------------------------------------------
-- L'ancienne version s'arrêtait dès que "Camille Martin" existait déjà (garde
-- d'idempotence légère). Elle ne couvrait que 7 des 20 tables que
-- tests/security/rls.spec.ts teste génériquement (colonne praticien_id
-- directe) : sans les 13 autres, le harnais RLS "passe" sur ces tables
-- uniquement parce qu'elles sont vides pour praticien A — pas parce que la
-- RLS a été vérifiée. Idem pour les 4 tables testées par jointure
-- (programme_modele_*, dossier_exercice_membres), vides tant que
-- programmes_modeles/dossiers_exercices n'existent pas.
--
-- Plutôt que de complexifier l'idempotence pour combler ces trous sur un jeu
-- de données déjà modifié à la main pendant des semaines de tests, ce script
-- PURGE explicitement (DELETE, pas TRUNCATE — scope limité aux lignes
-- rattachées aux comptes de démo ci-dessous, dans l'ordre qui respecte les
-- FK) puis réinsère un jeu complet et propre. C'est plus simple à maintenir
-- et à vérifier qu'une extension incrémentale de l'ancienne garde
-- "IF EXISTS Camille THEN RETURN". Rejouable à volonté : chaque exécution
-- repart d'un état propre pour ces comptes précis.
--
-- ⚠️ AVANT DE LANCER CE SCRIPT SUR UN STAGING QUI A DÉJÀ DES DONNÉES : fais
-- un pg_dump complet (schéma + données) du staging actuel, hors du dépôt.
-- Les fiches existantes sont fictives mais représentent de la saisie
-- manuelle sur plusieurs semaines — la purge ci-dessous les supprime pour de
-- bon si elles sont rattachées aux comptes de démo listés ici.
--
-- ----------------------------------------------------------------------------
-- PRÉREQUIS — à faire une fois, AVANT d'exécuter ce script :
-- ----------------------------------------------------------------------------
-- Dans Supabase (projet de STAGING) > Authentication > Users > Add user,
-- pour CHACUN des 3 comptes suivants (coche "Auto Confirm User") :
--
--   1. staging.praticien@example.com
--        Praticien A — compte historique, probablement déjà créé (les
--        fiches actuelles de staging tournent dessus). Si le mot de passe
--        actuel n'est pas connu, réinitialise-le depuis le Dashboard plutôt
--        que d'en inventer un nouveau à l'aveugle — sinon E2E_PRATICIEN_PASSWORD
--        (secret GitHub) ne correspondra plus au compte réel.
--
--   2. praticien-demo-2@example.com
--        Praticien "Démo 2" — nouveau compte statique. Sert la QA manuelle
--        et les futurs tests du plan de rôles (isolation multi-praticien
--        visible dans l'app, pas seulement via un harnais automatisé) —
--        PAS le harnais tests/security/rls.spec.ts, qui crée et détruit son
--        propre "praticien B" éphémère (préfixe rls-spec-, jamais celui-ci).
--        Mot de passe suggéré : Staging-Demo2-2026!  (à ajuster si besoin,
--        aucun secret GitHub n'en dépend, rien ne l'utilise automatiquement).
--
--   3. admin.demo@example.com
--        Compte du futur admin — créé maintenant, SANS AUCUN RÔLE attribué :
--        la table user_roles n'existe pas encore (étape 3 du plan de rôles,
--        pas ici). Ce script ne lui crée aucune ligne dans praticiens ni
--        ailleurs — juste le compte Auth, prêt à être rattaché plus tard.
--        Mot de passe suggéré : Staging-Admin-2026!
--
-- Exécute ensuite ce fichier via scripts/staging-reseed.ts (garde-fou
-- anti-prod intégré) :
--   npx tsx scripts/staging-reseed.ts            (lecture seule, affiche l'état actuel)
--   npx tsx scripts/staging-reseed.ts --apply     (exécute la purge + le seed)
--
-- ----------------------------------------------------------------------------
-- CODES D'ACCÈS PATIENT — PRATICIEN A (fix-code-acces — Playwright T5/T6 +
-- tests/security/rls.spec.ts — NE PAS CHANGER, consommés par des tests) :
-- ----------------------------------------------------------------------------
--   Camille Martin   → code d'accès : CAME2E26
--   Julien Bernard    → code d'accès : JUNE2E27  (rattaché à la structure de test)
--
-- Codes patient — praticien Démo 2 (QA manuelle uniquement, non consommés
-- par un test automatisé — préfixe DEMO2 pour ne jamais les confondre avec
-- les codes ci-dessus ni avec le pattern RLSB... du praticien B éphémère) :
--   Nadia Girard   → DEMO2P01
--   Marc Fabre     → DEMO2P02
--
-- Portail structure de test — praticien A : /structure/staging-token-demo-0001
-- Portail structure de test — Démo 2      : /structure/staging-token-demo-0002
--
-- ⚠️ Nécessite que les migrations du dépôt (schéma complet, 46 tables) aient
-- déjà été rejouées sur ce projet de staging.
-- ============================================================================


-- ============================================================================
-- 0. PURGE — scope limité aux comptes de démo ci-dessus, ordre FK-safe
--    (enfants avant parents). No-op silencieux si le compte n'existe pas
--    encore (praticien_id = NULL ne matche jamais aucune ligne).
-- ============================================================================

DO $$
DECLARE
  v_praticien_a_id uuid;
  v_praticien_d2_id uuid;
BEGIN
  SELECT id INTO v_praticien_a_id FROM auth.users WHERE email = 'staging.praticien@example.com';
  SELECT id INTO v_praticien_d2_id FROM auth.users WHERE email = 'praticien-demo-2@example.com';

  -- Une seule requête par table, sur les deux praticiens à la fois (ANY(array)
  -- ignore silencieusement les id NULL manquants — aucune ligne ne matche).
  DELETE FROM programme_modele_exercices WHERE seance_id IN (
    SELECT pms.id FROM programme_modele_seances pms
    JOIN programmes_modeles pm ON pm.id = pms.modele_id
    WHERE pm.praticien_id = ANY(ARRAY[v_praticien_a_id, v_praticien_d2_id])
  );
  DELETE FROM programme_modele_planning WHERE modele_id IN (
    SELECT id FROM programmes_modeles WHERE praticien_id = ANY(ARRAY[v_praticien_a_id, v_praticien_d2_id])
  );
  DELETE FROM programme_modele_seances WHERE modele_id IN (
    SELECT id FROM programmes_modeles WHERE praticien_id = ANY(ARRAY[v_praticien_a_id, v_praticien_d2_id])
  );
  DELETE FROM programmes_modeles WHERE praticien_id = ANY(ARRAY[v_praticien_a_id, v_praticien_d2_id]);

  DELETE FROM dossier_exercice_membres WHERE praticien_id = ANY(ARRAY[v_praticien_a_id, v_praticien_d2_id]);
  DELETE FROM exercices_personnalises WHERE praticien_id = ANY(ARRAY[v_praticien_a_id, v_praticien_d2_id]);
  DELETE FROM dossiers_exercices WHERE praticien_id = ANY(ARRAY[v_praticien_a_id, v_praticien_d2_id]);

  DELETE FROM programme_exercices WHERE seance_id IN (
    SELECT ps.id FROM programme_seances ps
    JOIN programmes p ON p.id = ps.programme_id
    WHERE p.praticien_id = ANY(ARRAY[v_praticien_a_id, v_praticien_d2_id])
  );
  DELETE FROM programme_planning WHERE programme_id IN (
    SELECT id FROM programmes WHERE praticien_id = ANY(ARRAY[v_praticien_a_id, v_praticien_d2_id])
  );
  DELETE FROM programme_seances WHERE programme_id IN (
    SELECT id FROM programmes WHERE praticien_id = ANY(ARRAY[v_praticien_a_id, v_praticien_d2_id])
  );
  DELETE FROM programmes WHERE praticien_id = ANY(ARRAY[v_praticien_a_id, v_praticien_d2_id]);

  DELETE FROM seances_patient WHERE participant_id IN (
    SELECT id FROM participants WHERE praticien_id = ANY(ARRAY[v_praticien_a_id, v_praticien_d2_id])
  );
  DELETE FROM seances WHERE praticien_id = ANY(ARRAY[v_praticien_a_id, v_praticien_d2_id]);
  DELETE FROM notes_seances WHERE praticien_id = ANY(ARRAY[v_praticien_a_id, v_praticien_d2_id]);
  DELETE FROM comptes_rendus_seances WHERE praticien_id = ANY(ARRAY[v_praticien_a_id, v_praticien_d2_id]);
  DELETE FROM documents_patient WHERE praticien_id = ANY(ARRAY[v_praticien_a_id, v_praticien_d2_id]);
  DELETE FROM bilans_brouillons WHERE praticien_id = ANY(ARRAY[v_praticien_a_id, v_praticien_d2_id]);
  DELETE FROM bilans WHERE praticien_id = ANY(ARRAY[v_praticien_a_id, v_praticien_d2_id]);
  DELETE FROM contrats WHERE praticien_id = ANY(ARRAY[v_praticien_a_id, v_praticien_d2_id]);
  DELETE FROM factures_suivi WHERE praticien_id = ANY(ARRAY[v_praticien_a_id, v_praticien_d2_id]);
  DELETE FROM assistant_logs WHERE praticien_id = ANY(ARRAY[v_praticien_a_id, v_praticien_d2_id]);
  DELETE FROM templates_structure WHERE praticien_id = ANY(ARRAY[v_praticien_a_id, v_praticien_d2_id]);
  DELETE FROM evenements_agenda WHERE praticien_id = ANY(ARRAY[v_praticien_a_id, v_praticien_d2_id]);
  DELETE FROM indisponibilites WHERE praticien_id = ANY(ARRAY[v_praticien_a_id, v_praticien_d2_id]);
  DELETE FROM zones_geographiques WHERE praticien_id = ANY(ARRAY[v_praticien_a_id, v_praticien_d2_id]);

  DELETE FROM participants WHERE praticien_id = ANY(ARRAY[v_praticien_a_id, v_praticien_d2_id]);
  DELETE FROM structures WHERE praticien_id = ANY(ARRAY[v_praticien_a_id, v_praticien_d2_id]);
  DELETE FROM praticiens WHERE id = ANY(ARRAY[v_praticien_a_id, v_praticien_d2_id]);

  RAISE NOTICE 'Purge terminée pour les comptes de démo (praticien A + Démo 2).';
END $$;


-- ============================================================================
-- 1. Praticien A — staging.praticien@example.com
--    Couvre les 20 tables testedDirect + les 4 tables TABLE_OVERRIDES de
--    tests/security/rls.spec.ts (voir en-tête).
-- ============================================================================

DO $$
DECLARE
  v_praticien_id       uuid;
  v_camille_id         uuid := gen_random_uuid();
  v_julien_id          uuid := gen_random_uuid();
  v_structure_id       uuid := gen_random_uuid();
  v_contrat_id         uuid := gen_random_uuid();
  v_programme_id       uuid := gen_random_uuid();
  v_seance1_id         uuid := gen_random_uuid();
  v_seance2_id         uuid := gen_random_uuid();
  v_seance_agenda_realisee_id uuid;
  v_dossier_id         uuid := gen_random_uuid();
  v_modele_id          uuid := gen_random_uuid();
  v_modele_seance_id   uuid := gen_random_uuid();
BEGIN
  SELECT id INTO v_praticien_id FROM auth.users WHERE email = 'staging.praticien@example.com';
  IF v_praticien_id IS NULL THEN
    RAISE EXCEPTION
      'Aucun utilisateur trouvé avec l''email staging.praticien@example.com. '
      'Crée-le d''abord dans Authentication > Users (voir en-tête de ce fichier).';
  END IF;

  -- ── Profil praticien ───────────────────────────────────────────────────
  INSERT INTO praticiens (id, prenom, nom, titre, email, telephone, adresse_ville, tarif_horaire)
  VALUES (v_praticien_id, 'Praticien', 'Démo Staging', 'Enseignant APA', 'staging.praticien@example.com', '0600000000', 'Lyon', '45');

  -- ── Participants ────────────────────────────────────────────────────────
  INSERT INTO participants (
    id, praticien_id, nom, prenom, date_naissance, email, telephone,
    pathologie, profil, tags, tests_actifs,
    adresse_rue, adresse_code_postal, adresse_ville,
    taille, poids, droit_image, code_acces
  ) VALUES (
    v_camille_id, v_praticien_id, 'Martin', 'Camille', '1950-03-12',
    'camille.martin.staging@example.com', '0601020304',
    'Arthrose du genou', 'Autonome', ARRAY['senior'],
    ARRAY['equilibre','chair_stand_30','hand_grip','tug_3m','souplesse','tm6','memoire'],
    '1 rue de la Démo', '69001', 'Lyon',
    165, 68, false, 'CAME2E26'
  );

  INSERT INTO participants (
    id, praticien_id, nom, prenom, date_naissance, email, telephone,
    pathologie, profil, tags,
    adresse_rue, adresse_code_postal, adresse_ville, code_acces
  ) VALUES (
    v_julien_id, v_praticien_id, 'Bernard', 'Julien', '1945-07-22',
    'julien.bernard.staging@example.com', '0605060708',
    'Suites d''AVC', 'Aide partielle', ARRAY['chronique'],
    '2 avenue de la Démo', '69002', 'Lyon', 'JUNE2E27'
  );

  -- ── Structure de test + rattachement de Julien ────────────────────────
  INSERT INTO structures (
    id, praticien_id, nom, type, adresse, contact_nom, contact_email,
    contact_telephone, token_acces, tarif_seance, actif
  ) VALUES (
    v_structure_id, v_praticien_id, 'Résidence Démo Staging', 'ehpad',
    '3 rue de la Démo, 69003 Lyon', 'Contact Démo', 'contact.structure.staging@example.com',
    '0609090909', 'staging-token-demo-0001', 45, true
  );

  UPDATE participants SET structure_id = v_structure_id WHERE id = v_julien_id;

  -- ── Bilans de Camille (initial + trimestriel) ─────────────────────────
  INSERT INTO bilans (
    participant_id, praticien_id, date, type, trimestre,
    equilibre_droite, equilibre_gauche, chair_stand_30,
    hand_grip_droite, hand_grip_gauche, tug_3m,
    souplesse_methode, souplesse_valeur,
    tm6_distance_metres, tm6_fc_avant, tm6_fc_apres,
    memoire_score_immediat, memoire_score_differe,
    notes_professionnelles
  ) VALUES (
    v_camille_id, v_praticien_id, CURRENT_DATE - INTERVAL '3 months', 'initial', 0,
    8.2, 7.5, 11,
    22.0, 20.5, 9.8,
    'assis', 18,
    320, 78, 102,
    7, 5,
    'Bilan initial de démonstration (staging).'
  );

  INSERT INTO bilans (
    participant_id, praticien_id, date, type, trimestre,
    equilibre_droite, equilibre_gauche, chair_stand_30,
    hand_grip_droite, hand_grip_gauche, tug_3m,
    souplesse_methode, souplesse_valeur,
    tm6_distance_metres, tm6_fc_avant, tm6_fc_apres,
    memoire_score_immediat, memoire_score_differe,
    notes_professionnelles
  ) VALUES (
    v_camille_id, v_praticien_id, CURRENT_DATE, 'trimestriel', 1,
    9.1, 8.4, 13,
    23.5, 21.0, 8.9,
    'assis', 21,
    350, 76, 98,
    8, 6,
    'Bilan trimestriel de démonstration (staging) — amélioration générale.'
  );

  -- ── Bilan brouillon de Julien (couvre bilans_brouillons) ──────────────
  INSERT INTO bilans_brouillons (participant_id, praticien_id, etape_actuelle, donnees, completion_pct)
  VALUES (v_julien_id, v_praticien_id, 2, '{"equilibre_droite": 6.5, "notes": "brouillon en cours"}'::jsonb, 40);

  -- ── Contrat de Camille ──────────────────────────────────────────────────
  INSERT INTO contrats (
    id, participant_id, praticien_id, date_debut, date_fin,
    jours_fixe, heure_debut, duree_minutes, statut,
    nombre_seances_total, nombre_seances_realisees, tarif_seance
  ) VALUES (
    v_contrat_id, v_camille_id, v_praticien_id,
    CURRENT_DATE - INTERVAL '3 months', CURRENT_DATE + INTERVAL '9 months',
    ARRAY['lun','jeu'], '10:00', 45, 'actif',
    24, 6, 45
  );

  -- ── Programme (table programmes) ──────────────────────────────────────
  -- `type` N'EST PAS DÉCORATIF : api/patient/me.ts:151 ne considère un
  -- programme comme V2 que si `type IS NOT NULL`
  -- (`programmes.filter(p => p.type != null)`). Sans lui, les séances et le
  -- planning insérés juste en dessous ne remontent jamais à l'espace
  -- patient : `programmesV2` arrive vide, la section « Vos programmes »
  -- (EspacePatient.tsx:427, rendue sous `progsV2Actifs.length > 0`) n'existe
  -- pas, et il n'y a aucune séance du jour à démarrer.
  -- C'est ce qui faisait échouer les tests e2e 06 et 07 le 2026-08-27.
  INSERT INTO programmes (
    id, participant_id, praticien_id, date_debut, type, nom, titre, objectif,
    message_motivation, exercices, actif
  ) VALUES (
    v_programme_id, v_camille_id, v_praticien_id, CURRENT_DATE,
    'domicile', 'Programme de démonstration',
    'Programme de démonstration', 'Renforcement musculaire et équilibre',
    'Continuez, vous progressez bien !', '[]'::jsonb, true
  );

  -- ── Programme V2 (séances / planning / exercices) ─────────────────────
  INSERT INTO programme_seances (id, programme_id, nom, description, ordre) VALUES
    (v_seance1_id, v_programme_id, 'Séance 1 — Équilibre', 'Travail de l''équilibre et renforcement léger', 1),
    (v_seance2_id, v_programme_id, 'Séance 2 — Renforcement', 'Renforcement musculaire global', 2);

  INSERT INTO programme_planning (programme_id, seance_id, jour) VALUES
    (v_programme_id, v_seance1_id, 'dimanche'),
    (v_programme_id, v_seance1_id, 'lundi'),
    (v_programme_id, v_seance1_id, 'mardi'),
    (v_programme_id, v_seance1_id, 'mercredi'),
    (v_programme_id, v_seance1_id, 'jeudi'),
    (v_programme_id, v_seance1_id, 'vendredi'),
    (v_programme_id, v_seance1_id, 'samedi'),
    (v_programme_id, v_seance2_id, 'jeudi');

  INSERT INTO programme_exercices (seance_id, nom, categorie, description, conseil_securite, series, repetitions, duree_secondes, ordre) VALUES
    (v_seance1_id, 'Équilibre unipodal', 'equilibre', 'Tenir en équilibre sur une jambe', 'Se tenir près d''un support', 3, NULL, 30, 1),
    (v_seance1_id, 'Marche talon-pointe', 'equilibre', 'Marcher en posant le talon devant la pointe du pied opposé', 'Espace dégagé', 2, 10, NULL, 2),
    (v_seance2_id, 'Levers de chaise', 'renforcement', 'Se lever et se rasseoir sans les mains', 'Chaise stable, dossier contre un mur', 3, 10, NULL, 1),
    (v_seance2_id, 'Flexions de bras (haltères légers)', 'renforcement', 'Flexion/extension du coude avec charge légère', 'Charge adaptée, mouvement lent', 3, 12, NULL, 2);

  -- ── Séance "en cours" pour Camille (test check-off exercice) ──────────
  INSERT INTO seances_patient (id, participant_id, programme_id, seance_id, date_seance, statut, duree_minutes)
  VALUES (gen_random_uuid(), v_camille_id, v_programme_id, v_seance1_id, CURRENT_DATE, 'en_cours', NULL);

  -- ── Séances d'agenda (praticien) pour Camille ─────────────────────────
  INSERT INTO seances (id, participant_id, praticien_id, contrat_id, date, heure_debut, heure_fin, duree_minutes, type, statut)
  VALUES (gen_random_uuid(), v_camille_id, v_praticien_id, v_contrat_id, CURRENT_DATE, '10:00', '10:45', 45, 'seance', 'planifiee');

  INSERT INTO seances (id, participant_id, praticien_id, contrat_id, date, heure_debut, heure_fin, duree_minutes, type, statut)
  VALUES (gen_random_uuid(), v_camille_id, v_praticien_id, v_contrat_id, CURRENT_DATE - INTERVAL '7 days', '10:00', '10:45', 45, 'seance', 'realisee')
  RETURNING id INTO v_seance_agenda_realisee_id;

  -- ── notes_seances (rattachée à la séance réalisée) ─────────────────────
  INSERT INTO notes_seances (seance_id, participant_id, praticien_id, date, heure_debut, ressenti, note, douleur_eva, fc_fin)
  VALUES (v_seance_agenda_realisee_id, v_camille_id, v_praticien_id, CURRENT_DATE - INTERVAL '7 days', '10:00',
          'positif', 'Bonne séance, patiente motivée.', 2, 88);

  -- ── comptes_rendus_seances ───────────────────────────────────────────
  INSERT INTO comptes_rendus_seances (
    participant_id, praticien_id, date_seance, duree_minutes,
    transcription_brute, exercices_realises, observations,
    douleurs_signalees, humeur_patient, progression
  ) VALUES (
    v_camille_id, v_praticien_id, CURRENT_DATE - INTERVAL '7 days', 45,
    'Transcription brute de démonstration.',
    '["Équilibre unipodal", "Marche talon-pointe"]'::jsonb,
    'Progression régulière, bonne tolérance à l''effort.',
    'Légère douleur genou droit en fin de séance', 'bien', 'stable'
  );

  -- ── documents_patient ────────────────────────────────────────────────
  INSERT INTO documents_patient (participant_id, praticien_id, titre, contenu, type)
  VALUES (v_camille_id, v_praticien_id, 'Compte-rendu famille — démonstration',
          'Camille progresse bien sur les exercices d''équilibre. Séances bien tolérées.',
          'compte_rendu_famille');

  -- ── factures_suivi ───────────────────────────────────────────────────
  INSERT INTO factures_suivi (praticien_id, participant_id, structure_id, periode_mois, periode_annee, nb_seances, montant_total, statut)
  VALUES (v_praticien_id, v_camille_id, NULL, EXTRACT(MONTH FROM CURRENT_DATE)::int, EXTRACT(YEAR FROM CURRENT_DATE)::int, 6, 270.00, 'a_envoyer');

  -- ── assistant_logs ───────────────────────────────────────────────────
  INSERT INTO assistant_logs (patient_id, praticien_id, question, reponse, action_type)
  VALUES (v_camille_id, v_praticien_id, 'Quels exercices pour l''équilibre ?',
          'Réponse de démonstration de l''assistant.', 'chat');

  -- ── zones_geographiques ──────────────────────────────────────────────
  INSERT INTO zones_geographiques (praticien_id, nom, couleur, participant_ids, jours_assignes)
  VALUES (v_praticien_id, 'Zone Lyon Centre', '#1A5F9E', ARRAY[v_camille_id, v_julien_id], ARRAY['lundi','jeudi']);

  -- ── indisponibilites ─────────────────────────────────────────────────
  INSERT INTO indisponibilites (praticien_id, jour, heure_debut, heure_fin, recurrente, label)
  VALUES (v_praticien_id, 'lundi', '12:00', '14:00', true, 'Pause déjeuner');

  -- ── evenements_agenda ────────────────────────────────────────────────
  INSERT INTO evenements_agenda (praticien_id, type, titre, date, heure_debut, heure_fin, notes)
  VALUES (v_praticien_id, 'autre', 'Réunion d''équipe (démo)', CURRENT_DATE + INTERVAL '3 days', '09:00', '09:30', 'Événement de démonstration.');

  -- ── templates_structure ──────────────────────────────────────────────
  INSERT INTO templates_structure (praticien_id, structure_id, nom, contenu_texte, format_origine)
  VALUES (v_praticien_id, v_structure_id, 'Modèle compte-rendu EHPAD', 'Contenu de démonstration du template.', 'texte');

  -- ── dossiers_exercices + exercices_personnalises + dossier_exercice_membres ──
  INSERT INTO dossiers_exercices (id, praticien_id, nom, ordre)
  VALUES (v_dossier_id, v_praticien_id, 'Dossier Démo', 1);

  INSERT INTO exercices_personnalises (
    praticien_id, dossier_id, ordre, nom, categorie, description,
    consigne_securite, niveaux, duree_estimee_minutes
  ) VALUES (
    v_praticien_id, v_dossier_id, 1, 'Exercice personnalisé démo', 'renforcement',
    'Description de démonstration de l''exercice personnalisé.',
    'Consigne de sécurité de démonstration.', '{"niveau1": "facile"}'::jsonb, 10
  );

  -- type_exercice = 'base' : exercice_ref est un simple texte, pas de FK
  -- (voir 20260718_dossier_exercice_membres.sql) — on référence un exercice
  -- de la bibliothèque par son identifiant conventionnel, sans dépendre
  -- d'une table qui n'existe pas dans ce schéma.
  INSERT INTO dossier_exercice_membres (praticien_id, dossier_id, exercice_ref, type_exercice, ordre)
  VALUES (v_praticien_id, v_dossier_id, 'equilibre-unipodal', 'base', 1);

  -- ── programmes_modeles + programme_modele_seances/planning/exercices ──
  INSERT INTO programmes_modeles (id, praticien_id, nom, type, objectif, objectif_seances_autonomes, message_motivation)
  VALUES (v_modele_id, v_praticien_id, 'Modèle Démo — Équilibre', 'seance', 'Prévention des chutes', 8, 'Modèle de démonstration.');

  INSERT INTO programme_modele_seances (id, modele_id, nom, description, ordre)
  VALUES (v_modele_seance_id, v_modele_id, 'Séance modèle — Équilibre', 'Séance type du modèle de démonstration.', 1);

  INSERT INTO programme_modele_planning (modele_id, seance_id, jour)
  VALUES (v_modele_id, v_modele_seance_id, 'mardi');

  INSERT INTO programme_modele_exercices (seance_id, nom, categorie, description, conseil_securite, series, repetitions, duree_secondes, ordre)
  VALUES (v_modele_seance_id, 'Équilibre unipodal (modèle)', 'equilibre', 'Description de démonstration.', 'Se tenir près d''un support', 3, NULL, 30, 1);

  RAISE NOTICE 'Praticien A (staging.praticien@example.com) seedé avec succès — 20 tables testedDirect + 4 tables TABLE_OVERRIDES couvertes.';
END $$;


-- ============================================================================
-- 2. Praticien Démo 2 — praticien-demo-2@example.com
--    Jeu de données "core clinique" (patients, bilans, contrat, programme,
--    séances, notes, documents, compte-rendu) — QA manuelle et futurs tests
--    du plan de rôles. PAS destiné à tests/security/rls.spec.ts (qui crée
--    son propre praticien B éphémère, préfixe rls-spec-) : volontairement
--    plus léger que praticien A, pas besoin de couvrir les 20 tables ici.
-- ============================================================================

DO $$
DECLARE
  v_praticien_id       uuid;
  v_nadia_id           uuid := gen_random_uuid();
  v_marc_id            uuid := gen_random_uuid();
  v_structure_id       uuid := gen_random_uuid();
  v_contrat_id         uuid := gen_random_uuid();
  v_programme_id       uuid := gen_random_uuid();
  v_seance1_id         uuid := gen_random_uuid();
  v_seance_agenda_realisee_id uuid;
BEGIN
  SELECT id INTO v_praticien_id FROM auth.users WHERE email = 'praticien-demo-2@example.com';
  IF v_praticien_id IS NULL THEN
    RAISE EXCEPTION
      'Aucun utilisateur trouvé avec l''email praticien-demo-2@example.com. '
      'Crée-le d''abord dans Authentication > Users (voir en-tête de ce fichier).';
  END IF;

  INSERT INTO praticiens (id, prenom, nom, titre, email, telephone, adresse_ville, tarif_horaire)
  VALUES (v_praticien_id, 'Praticien', 'Démo Deux', 'Enseignant APA', 'praticien-demo-2@example.com', '0600000001', 'Lyon', '45');

  INSERT INTO participants (
    id, praticien_id, nom, prenom, date_naissance, email, telephone,
    pathologie, profil, tags, adresse_rue, adresse_code_postal, adresse_ville, code_acces
  ) VALUES (
    v_nadia_id, v_praticien_id, 'Girard', 'Nadia', '1952-11-04',
    'nadia.girard.staging@example.com', '0611121314',
    'Ostéoporose', 'Autonome', ARRAY['senior'],
    '4 rue Démo Deux', '69004', 'Lyon', 'DEMO2P01'
  );

  INSERT INTO participants (
    id, praticien_id, nom, prenom, date_naissance, email, telephone,
    pathologie, profil, tags, adresse_rue, adresse_code_postal, adresse_ville, code_acces
  ) VALUES (
    v_marc_id, v_praticien_id, 'Fabre', 'Marc', '1948-02-18',
    'marc.fabre.staging@example.com', '0615161718',
    'Suites de PTH', 'Aide partielle', ARRAY['chronique'],
    '5 avenue Démo Deux', '69005', 'Lyon', 'DEMO2P02'
  );

  INSERT INTO structures (
    id, praticien_id, nom, type, adresse, contact_nom, contact_email,
    contact_telephone, token_acces, tarif_seance, actif
  ) VALUES (
    v_structure_id, v_praticien_id, 'Résidence Démo Deux', 'ehpad',
    '6 rue Démo Deux, 69006 Lyon', 'Contact Démo Deux', 'contact.structure.demo2.staging@example.com',
    '0619191919', 'staging-token-demo-0002', 45, true
  );

  UPDATE participants SET structure_id = v_structure_id WHERE id = v_marc_id;

  INSERT INTO bilans (
    participant_id, praticien_id, date, type, trimestre,
    equilibre_droite, equilibre_gauche, chair_stand_30,
    hand_grip_droite, hand_grip_gauche, tug_3m,
    souplesse_methode, souplesse_valeur,
    tm6_distance_metres, tm6_fc_avant, tm6_fc_apres,
    memoire_score_immediat, memoire_score_differe,
    notes_professionnelles
  ) VALUES (
    v_nadia_id, v_praticien_id, CURRENT_DATE - INTERVAL '2 months', 'initial', 0,
    7.8, 7.2, 10,
    19.0, 18.0, 10.5,
    'assis', 15,
    290, 80, 105,
    6, 5,
    'Bilan initial de démonstration (staging, praticien Démo 2).'
  );

  INSERT INTO contrats (
    id, participant_id, praticien_id, date_debut, date_fin,
    jours_fixe, heure_debut, duree_minutes, statut,
    nombre_seances_total, nombre_seances_realisees, tarif_seance
  ) VALUES (
    v_contrat_id, v_nadia_id, v_praticien_id,
    CURRENT_DATE - INTERVAL '2 months', CURRENT_DATE + INTERVAL '10 months',
    ARRAY['mar','ven'], '11:00', 45, 'actif',
    20, 4, 45
  );

  -- `type` obligatoire pour que le programme soit vu comme V2 — voir le
  -- commentaire du programme de Camille plus haut.
  INSERT INTO programmes (
    id, participant_id, praticien_id, date_debut, type, nom, titre, objectif,
    message_motivation, exercices, actif
  ) VALUES (
    v_programme_id, v_nadia_id, v_praticien_id, CURRENT_DATE,
    'domicile', 'Programme de démonstration — Démo Deux',
    'Programme de démonstration — Démo Deux', 'Prévention des chutes',
    'Bon travail, continuez ainsi !', '[]'::jsonb, true
  );

  INSERT INTO programme_seances (id, programme_id, nom, description, ordre)
  VALUES (v_seance1_id, v_programme_id, 'Séance 1 — Équilibre', 'Travail de l''équilibre', 1);

  INSERT INTO programme_planning (programme_id, seance_id, jour) VALUES
    (v_programme_id, v_seance1_id, 'mardi'),
    (v_programme_id, v_seance1_id, 'vendredi');

  INSERT INTO programme_exercices (seance_id, nom, categorie, description, conseil_securite, series, repetitions, duree_secondes, ordre)
  VALUES (v_seance1_id, 'Équilibre unipodal', 'equilibre', 'Tenir en équilibre sur une jambe', 'Se tenir près d''un support', 3, NULL, 30, 1);

  INSERT INTO seances_patient (id, participant_id, programme_id, seance_id, date_seance, statut, duree_minutes)
  VALUES (gen_random_uuid(), v_nadia_id, v_programme_id, v_seance1_id, CURRENT_DATE, 'en_cours', NULL);

  INSERT INTO seances (id, participant_id, praticien_id, contrat_id, date, heure_debut, heure_fin, duree_minutes, type, statut)
  VALUES (gen_random_uuid(), v_nadia_id, v_praticien_id, v_contrat_id, CURRENT_DATE, '11:00', '11:45', 45, 'seance', 'planifiee');

  INSERT INTO seances (id, participant_id, praticien_id, contrat_id, date, heure_debut, heure_fin, duree_minutes, type, statut)
  VALUES (gen_random_uuid(), v_nadia_id, v_praticien_id, v_contrat_id, CURRENT_DATE - INTERVAL '4 days', '11:00', '11:45', 45, 'seance', 'realisee')
  RETURNING id INTO v_seance_agenda_realisee_id;

  INSERT INTO notes_seances (seance_id, participant_id, praticien_id, date, heure_debut, ressenti, note, douleur_eva, fc_fin)
  VALUES (v_seance_agenda_realisee_id, v_nadia_id, v_praticien_id, CURRENT_DATE - INTERVAL '4 days', '11:00',
          'positif', 'Bonne séance (démo praticien Démo 2).', 1, 90);

  INSERT INTO comptes_rendus_seances (
    participant_id, praticien_id, date_seance, duree_minutes,
    transcription_brute, exercices_realises, observations, humeur_patient, progression
  ) VALUES (
    v_nadia_id, v_praticien_id, CURRENT_DATE - INTERVAL '4 days', 45,
    'Transcription brute de démonstration (Démo Deux).',
    '["Équilibre unipodal"]'::jsonb,
    'Bonne tolérance à l''effort.', 'bien', 'stable'
  );

  INSERT INTO documents_patient (participant_id, praticien_id, titre, contenu, type)
  VALUES (v_nadia_id, v_praticien_id, 'Compte-rendu famille — démonstration (Démo Deux)',
          'Nadia progresse bien. Séances bien tolérées.', 'compte_rendu_famille');

  RAISE NOTICE 'Praticien Démo 2 (praticien-demo-2@example.com) seedé avec succès — jeu de données core.';
END $$;


-- ============================================================================
-- 3. Compte admin (futur) — RAPPEL, aucune action SQL ici
-- ============================================================================
-- admin.demo@example.com doit être créé via le Dashboard (voir PRÉREQUIS
-- ci-dessus) mais ce script ne lui crée AUCUNE ligne (ni praticiens, ni
-- ailleurs) : pas de rôle attribué à ce stade, la table user_roles n'existe
-- pas encore (étape 3 du plan de rôles). Le compte Auth existe et attend.
