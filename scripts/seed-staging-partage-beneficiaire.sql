-- ============================================================================
-- scripts/seed-staging-partage-beneficiaire.sql
-- ============================================================================
--
-- Jeu de données 100% FICTIF pour tester le contrôle de partage bénéficiaire
-- et la reformulation bienveillante (voir supabase/migrations/20260713_visibilite_beneficiaire.sql
-- et src/lib/formulationBienveillante.ts).
--
-- ⚠️ NE JAMAIS exécuter ce script sur la base de PRODUCTION — projet de
-- STAGING uniquement (même précaution que scripts/seed-staging.sql).
-- Nécessite que 20260713_visibilite_beneficiaire.sql ait déjà été appliquée.
--
-- Trois patients, trois scénarios distincts :
--
--   1. Nadia Petit   (code PETI2E01) — bilan enregistré, RIEN de coché comme
--      partagé (visible_beneficiaire = '{}'). Doit afficher "Aucun résultat
--      partagé" dans la Fiche bilan bénéficiaire, et aucune donnée de test
--      physique dans la réponse JSON de /api/patient/me (à vérifier dans
--      l'onglet réseau, pas seulement à l'écran).
--
--   2. Marc Rousseau (code ROUS2E02) — équilibre + endurance partagés,
--      force/mobilité/main restent cachés. Vérifie le partage PARTIEL : les
--      résultats cochés apparaissent, les autres non — dans l'espace
--      bénéficiaire ET dans la Fiche bilan bénéficiaire.
--
--   3. Sophie Lemoine (code LEMO2E03) — reproduit précisément l'incident
--      initial : force très basse (chair_stand_30 = 6 → note 2/5) ET niveau
--      d'activité "inactif" (sédentarité), tous deux marqués partagés. Sert à
--      vérifier que "Faible" n'apparaît plus nulle part côté bénéficiaire —
--      "Force à développer" / "Marge de progression" à la place — alors que
--      la vue praticien (Step2_Physical, TestsAutonomie, ParticipantProfile)
--      continue d'afficher le vocabulaire clinique brut inchangé.
--
-- Idempotent : s'arrête si Nadia Petit existe déjà.
-- ============================================================================

DO $$
DECLARE
  v_praticien_id uuid;
  v_nadia_id     uuid := gen_random_uuid();
  v_marc_id      uuid := gen_random_uuid();
  v_sophie_id    uuid := gen_random_uuid();
BEGIN
  SELECT id INTO v_praticien_id
  FROM auth.users
  WHERE email = 'staging.praticien@example.com';

  IF v_praticien_id IS NULL THEN
    RAISE EXCEPTION
      'Aucun utilisateur trouvé avec l''email staging.praticien@example.com. '
      'Voir scripts/seed-staging.sql (section PRÉREQUIS) pour le créer d''abord.';
  END IF;

  IF EXISTS (SELECT 1 FROM participants WHERE praticien_id = v_praticien_id AND prenom = 'Nadia' AND nom = 'Petit') THEN
    RAISE NOTICE 'Jeu de données "partage bénéficiaire" déjà présent (Nadia Petit existe) — rien à faire.';
    RETURN;
  END IF;

  -- ── 1. Nadia Petit — rien de partagé ──────────────────────────────────────
  INSERT INTO participants (
    id, praticien_id, nom, prenom, date_naissance, email, telephone,
    pathologie, profil, tags, code_acces
  ) VALUES (
    v_nadia_id, v_praticien_id, 'Petit', 'Nadia', '1952-01-15',
    'nadia.petit.staging@example.com', '0611121314',
    'Lombalgie chronique', 'Autonome', ARRAY['chronique'], 'PETI2E01'
  );

  INSERT INTO bilans (
    participant_id, praticien_id, date, type, trimestre,
    equilibre_droite, equilibre_gauche, chair_stand_30,
    hand_grip_droite, hand_grip_gauche, tug_3m,
    tm6_distance_metres, tm6_borg_rpe,
    message_client, notes_professionnelles,
    visible_beneficiaire
  ) VALUES (
    v_nadia_id, v_praticien_id, CURRENT_DATE, 'initial', 0,
    9.0, 8.5, 10,
    21.0, 19.5, 9.2,
    300, 12,
    'Bonjour Nadia, ravi de démarrer ce suivi avec vous !',
    'Bilan de démonstration (staging) — aucun résultat partagé, pour tester le cas "rien ne fuite".',
    '{}'::jsonb
  );

  -- ── 2. Marc Rousseau — partage partiel (équilibre + endurance) ───────────
  INSERT INTO participants (
    id, praticien_id, nom, prenom, date_naissance, email, telephone,
    pathologie, profil, tags, code_acces
  ) VALUES (
    v_marc_id, v_praticien_id, 'Rousseau', 'Marc', '1948-09-03',
    'marc.rousseau.staging@example.com', '0615161718',
    'Prothèse de hanche', 'Aide partielle', ARRAY['post_op'], 'ROUS2E02'
  );

  INSERT INTO bilans (
    participant_id, praticien_id, date, type, trimestre,
    equilibre_droite, equilibre_gauche, chair_stand_30,
    hand_grip_droite, hand_grip_gauche, tug_3m,
    tm6_distance_metres, tm6_borg_rpe,
    message_client, notes_professionnelles,
    visible_beneficiaire
  ) VALUES (
    v_marc_id, v_praticien_id, CURRENT_DATE, 'initial', 0,
    15.0, 14.2, 9,
    24.0, 22.0, 11.5,
    280, 13,
    'Bonjour Marc, bon début de suivi, on continue comme ça !',
    'Bilan de démonstration (staging) — équilibre et endurance partagés, force/mobilité/préhension cachés.',
    '{"equilibre": true, "endurance": true}'::jsonb
  );

  -- ── 3. Sophie Lemoine — reproduit l'incident (force basse + inactif, partagés) ──
  INSERT INTO participants (
    id, praticien_id, nom, prenom, date_naissance, email, telephone,
    pathologie, profil, tags, code_acces, anamnese
  ) VALUES (
    v_sophie_id, v_praticien_id, 'Lemoine', 'Sophie', '1955-11-28',
    'sophie.lemoine.staging@example.com', '0619202122',
    'Fauteuil roulant', 'Aide totale', ARRAY['chronique'], 'LEMO2E03',
    jsonb_build_object(
      'sedentariteScore', 14,
      'sedentariteProfil', 'inactif',
      'sedentariteVisibleBeneficiaire', true,
      'fatigueVisibleBeneficiaire', false
    )
  );

  INSERT INTO bilans (
    participant_id, praticien_id, date, type, trimestre,
    equilibre_droite, equilibre_gauche, chair_stand_30,
    hand_grip_droite, hand_grip_gauche, tug_3m,
    tm6_distance_metres, tm6_borg_rpe,
    message_client, notes_professionnelles,
    visible_beneficiaire
  ) VALUES (
    v_sophie_id, v_praticien_id, CURRENT_DATE, 'initial', 0,
    5.0, 4.5, 6,
    12.0, 11.0, 18.0,
    150, 15,
    'Bonjour Sophie, on démarre le suivi ensemble, chaque étape compte !',
    'Bilan de démonstration (staging) — force basse (note 2/5) et niveau d''activité "inactif" tous deux partagés : vérifie que "Faible" n''apparaît nulle part côté bénéficiaire.',
    '{"force": true}'::jsonb
  );

  RAISE NOTICE 'Jeu de données "partage bénéficiaire" inséré avec succès — codes PETI2E01 / ROUS2E02 / LEMO2E03.';
END $$;
