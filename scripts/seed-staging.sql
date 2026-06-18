-- ============================================================================
-- scripts/seed-staging.sql
-- ============================================================================
--
-- Jeu de données 100% FICTIF pour un environnement de STAGING.
--
-- ⚠️ NE JAMAIS exécuter ce script sur la base de PRODUCTION : il insère des
-- patients/bilans/programmes de démonstration. À utiliser uniquement sur le
-- projet Supabase de staging créé pour la Tâche 4 (voir
-- supabase/migrations/SETUP_STAGING.md).
--
-- Aucun nom, code, adresse ou donnée de santé ci-dessous ne correspond à un
-- patient réel : tout est inventé pour les tests (Playwright T5, tests
-- manuels).
--
-- ----------------------------------------------------------------------------
-- PRÉREQUIS — à faire une fois, AVANT d'exécuter ce script :
-- ----------------------------------------------------------------------------
-- 1. Dans Supabase (projet de STAGING) > Authentication > Users > Add user :
--      email    : staging.praticien@example.com
--      password : (au choix — c'est le compte de test du praticien)
--    Coche "Auto Confirm User".
--
-- 2. Exécute ensuite ce fichier dans staging (SQL Editor > New query > coller
--    > Run).
--
-- ----------------------------------------------------------------------------
-- CODES D'ACCÈS PATIENT (fix-code-acces — pour les tests Playwright — T5/T6) :
-- ----------------------------------------------------------------------------
--   Camille Martin   → code d'accès : CAME2E26
--                       (bilans + programme déjà remplis — sert au test
--                       "connexion patient affiche programme + bilans")
--   Julien Bernard   → code d'accès : JUNE2E27
--                       (rattaché à la structure de test ci-dessous)
--
-- ⚠️ Nécessite que la migration
-- supabase/migrations/20260614_add_code_acces_participants.sql ait été
-- appliquée sur le projet de staging (colonne participants.code_acces).
--
-- Ce script est idempotent (il s'arrête si Camille Martin existe déjà) :
-- si tu dois ajouter `code_acces` à un jeu de données de staging déjà
-- présent, lance plutôt scripts/backfill-code-acces.ts (ou recrée le
-- staging et relance ce script).
--
-- Portail structure de test :
--   URL : /structure/staging-token-demo-0001
-- ============================================================================

DO $$
DECLARE
  v_praticien_id   uuid;
  v_camille_id     uuid := gen_random_uuid();
  v_julien_id      uuid := gen_random_uuid();
  v_programme_id   uuid := gen_random_uuid();
  v_seance1_id     uuid := gen_random_uuid();
  v_seance2_id     uuid := gen_random_uuid();
  v_structure_id   uuid := gen_random_uuid();
  v_contrat_id     uuid := gen_random_uuid();
BEGIN
  -- ── 0. Récupération du compte praticien de test ──────────────────────────
  SELECT id INTO v_praticien_id
  FROM auth.users
  WHERE email = 'staging.praticien@example.com';

  IF v_praticien_id IS NULL THEN
    RAISE EXCEPTION
      'Aucun utilisateur trouvé avec l''email staging.praticien@example.com. '
      'Crée-le d''abord dans Authentication > Users (voir en-tête de ce fichier).';
  END IF;

  IF EXISTS (SELECT 1 FROM participants WHERE praticien_id = v_praticien_id AND prenom = 'Camille' AND nom = 'Martin') THEN
    RAISE NOTICE 'Jeu de données de staging déjà présent (Camille Martin existe) — rien à faire.';
    RETURN;
  END IF;

  -- ── 1. Profil praticien ───────────────────────────────────────────────────
  INSERT INTO praticiens (id, prenom, nom, titre, email, telephone, adresse_ville, tarif_horaire)
  VALUES (v_praticien_id, 'Praticien', 'Démo Staging', 'Enseignant APA', 'staging.praticien@example.com', '0600000000', 'Lyon', '45')
  ON CONFLICT (id) DO NOTHING;

  -- ── 2. Participants ────────────────────────────────────────────────────────
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
  -- v_structure_id n'existe pas encore à ce stade : la structure est créée
  -- juste après, donc le rattachement de Julien se fait via l'UPDATE ci-dessous.

  -- ── 3. Structure de test + rattachement de Julien ────────────────────────
  INSERT INTO structures (
    id, praticien_id, nom, type, adresse, contact_nom, contact_email,
    contact_telephone, token_acces, tarif_seance, actif
  ) VALUES (
    v_structure_id, v_praticien_id, 'Résidence Démo Staging', 'ehpad',
    '3 rue de la Démo, 69003 Lyon', 'Contact Démo', 'contact.structure.staging@example.com',
    '0609090909', 'staging-token-demo-0001', 45, true
  );

  UPDATE participants SET structure_id = v_structure_id WHERE id = v_julien_id;

  -- ── 4. Bilans de Camille (initial + trimestriel) ─────────────────────────
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

  -- ── 5. Contrat de Camille ──────────────────────────────────────────────────
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

  -- ── 6. Programme V1 (table programmes — utilisée par useProgramme) ───────
  INSERT INTO programmes (
    id, participant_id, praticien_id, date_debut, titre, objectif,
    message_motivation, exercices, actif
  ) VALUES (
    v_programme_id, v_camille_id, v_praticien_id, CURRENT_DATE,
    'Programme de démonstration', 'Renforcement musculaire et équilibre',
    'Continuez, vous progressez bien !', '[]'::jsonb, true
  );

  -- ── 7. Programme V2 (séances / planning / exercices) ─────────────────────
  INSERT INTO programme_seances (id, programme_id, nom, description, ordre) VALUES
    (v_seance1_id, v_programme_id, 'Séance 1 — Équilibre', 'Travail de l''équilibre et renforcement léger', 1),
    (v_seance2_id, v_programme_id, 'Séance 2 — Renforcement', 'Renforcement musculaire global', 2);

  -- Séance 1 planifiée tous les jours : le test Playwright "séance du jour"
  -- (Tâche 5) doit pouvoir cocher un exercice quel que soit le jour
  -- d'exécution de la suite. La séance 2 reste sur le jeudi uniquement.
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

  -- ── 8. Séance "en cours" pour Camille (test check-off exercice) ──────────
  INSERT INTO seances_patient (id, participant_id, programme_id, seance_id, date_seance, statut, duree_minutes)
  VALUES (gen_random_uuid(), v_camille_id, v_programme_id, v_seance1_id, CURRENT_DATE, 'en_cours', NULL);

  -- ── 9. Séances d'agenda (praticien) pour Camille ─────────────────────────
  INSERT INTO seances (participant_id, praticien_id, contrat_id, date, heure_debut, heure_fin, duree_minutes, type, statut)
  VALUES
    (v_camille_id, v_praticien_id, v_contrat_id, CURRENT_DATE, '10:00', '10:45', 45, 'seance', 'planifiee'),
    (v_camille_id, v_praticien_id, v_contrat_id, CURRENT_DATE - INTERVAL '7 days', '10:00', '10:45', 45, 'seance', 'realisee');

  RAISE NOTICE 'Jeu de données de staging inséré avec succès.';
END $$;
