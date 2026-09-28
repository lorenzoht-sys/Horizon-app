-- ============================================================================
-- supabase/seeds/demo_compte_vitrine.sql
-- ============================================================================
--
-- Jeu de données 100% FICTIF pour le compte démo vitrine du tunnel bêta
-- public (demo@horizon-suivi.fr). Objectif : 10 bénéficiaires complets et
-- variés pour qu'un prospect teste l'outil en interactif sans jamais voir
-- de vraie donnée de santé.
--
-- Ce n'est PAS une migration de schéma (aucun CREATE TABLE/ALTER, seulement
-- des DELETE/INSERT sur le schéma existant) : volontairement hors de
-- supabase/migrations/, dans supabase/seeds/, pour ne jamais se retrouver
-- rejoué automatiquement par un futur outil qui parcourrait ce dossier.
--
-- Aucun nom, adresse, téléphone ou email ci-dessous ne correspond à une
-- personne réelle. Emails en @example.com (domaine réservé RFC 2606,
-- garanti de ne jamais délivrer de vrai courrier), téléphones en
-- 06 00 00 00 0X — même convention que scripts/seed-staging.sql, qui sert
-- de référence de style pour ce fichier.
--
-- ── Compte démo : création directe, pas via /register ──────────────────────
-- demo@horizon-suivi.fr a été créé directement dans Authentication > Users
-- du dashboard Supabase, PAS via le parcours normal (RegisterPage.tsx). Or
-- la ligne `praticiens` n'est JAMAIS créée par un trigger Postgres — c'est
-- un INSERT explicite fait par le navigateur juste après signUp()
-- (RegisterPage.tsx:76-86). Un compte créé directement dans Authentication
-- n'a donc PAS de ligne `praticiens`, et sans elle (ou avec titre NULL),
-- App.tsx:154-168 (needsOnboarding) redirige tout visiteur vers
-- /onboarding au lieu de l'app. Section 2 ci-dessous crée cette ligne.
--
-- ── Vérification organisation — CRITIQUE, faite par l'utilisateur ──────────
-- acces_participant() (20260714_01_mode_organisation_fondations.sql:152-170)
-- donne accès à un participant soit par praticien_id = auth.uid(), soit par
-- appartenance à l'organisation propriétaire du participant. Un compte démo
-- membre d'une organisation réelle verrait ses vrais bénéficiaires. Vérifié
-- manuellement par l'utilisateur en staging ET production (0 ligne dans
-- organisation_membres pour demo@horizon-suivi.fr, confirmé les deux côtés
-- avant l'écriture de ce script). La section 0 ci-dessous refait le même
-- contrôle par sécurité : le script s'arrête avant toute écriture s'il
-- trouve une ligne, sans dépendre uniquement de la vérification manuelle.
--
-- ── Cascades FK vérifiées avant d'écrire ce script (pas supposées) ─────────
-- Toutes CASCADE, confirmé colonne par colonne dans supabase/schema.sql et
-- les migrations : bilans.participant_id, contrats.participant_id,
-- seances.participant_id, programmes.participant_id,
-- retours_seance.participant_id (20260618_retours_seance.sql:23),
-- participations_cours_collectifs.participant_id
-- (20260917_cours_collectifs.sql:105), tarifs_contrats.contrat_id
-- (20260917_tarifs_contrats.sql:39), programme_seances.programme_id /
-- programme_planning.programme_id+seance_id / programme_exercices.seance_id
-- (20260620_consolidation_seances_patient.sql:58,104-105,149).
-- participants.structure_id → structures(id) ON DELETE SET NULL
-- (20260604_structures.sql:36) : sans incidence ici puisque ce script
-- supprime les participants AVANT les structures — au moment où les
-- structures sont supprimées, plus aucun participant ne les référence.
-- seances.contrat_id → contrats(id) ON DELETE SET NULL (schema.sql:290) :
-- sans incidence non plus, seances et contrats étant chacun supprimés
-- indépendamment via leur propre participant_id/praticien_id, jamais l'un
-- après l'autre en dépendant du SET NULL.
--
-- Le nettoyage ci-dessous reste néanmoins EXPLICITE table par table (pas
-- une simple purge de participants en comptant sur les CASCADE) — même
-- parti pris que scripts/seed-staging.sql : plus lisible, plus facile à
-- auditer, et ne casse rien si une contrainte venait à changer plus tard.
--
-- Rejouable à volonté : DELETE strictement scopé sur l'UUID du praticien
-- démo (résolu par email, jamais codé en dur — peut différer entre staging
-- et production), jamais une plage.
--
-- NE PAS EXÉCUTER PAR L'AGENT — connexion Postgres directe indisponible
-- depuis cette machine. À appliquer manuellement (SQL Editor) en staging
-- puis en production, comme les migrations tarifs_contrats/cours_collectifs.
--
-- ── MISE À JOUR 2026-09-22 ──────────────────────────────────────────────────
-- Version précédente de ce fichier déjà rejouée en staging ET en production
-- (10 participants, 10 bilans à une seule date, confirmé par lecture directe
-- des deux environnements) : AUCUN tm6_mode, AUCUN apley_data/tinetti_data/
-- moca_score. Cette mise à jour ajoute, en complétant les bilans EXISTANTS
-- (pas de nouveau bilan créé, les compteurs de vérification en section 12
-- changent ailleurs) :
--   - TM6 Stepper (Colette) et Marche sur place (Marie-Thérèse), en plus du
--     Marche déjà présent (André, Bernard, Paul) — les 3 modalités couvertes.
--   - Apley Scratch Test sur les 3 bilans de Robert (post-AVC, hémiparésie
--     gauche — l'asymétrie D/G qui se résorbe illustre l'évolution).
--   - Tinetti (POMA) sur les 3 bilans de Simone (chutes/équilibre — le test
--     fait pour ce profil), en plus de ses mesures déjà en progression.
--   - MoCA sur le bilan de Marie-Thérèse (dépistage cognitif EHPAD).
--   - Henri passe en bénéficiaire ARCHIVÉ (son contrat était déjà 'termine',
--     "objectifs atteints" — cohérent avec la fin de suivi déjà racontée).
--   - Une note du praticien sur l'absence de Jacqueline au cours collectif.
--   - Un second cours collectif, PLANIFIÉ (à venir), avec des réponses de
--     présence ANNONCÉE (vient / ne vient pas / indécis) — distinct du cours
--     déjà RÉALISÉ, qui continue d'illustrer présence constatée + ressenti.
-- Toujours rejouable à volonté (DELETE puis réinsertion complète scopée sur
-- le praticien démo) : réexécuter ce fichier remplace intégralement l'ancien
-- état par celui-ci, sans étape intermédiaire.
--
-- ── MISE À JOUR 2026-09-22 (bis) — région nantaise ──────────────────────────
-- Tous les participants, le praticien et la structure EHPAD déménagés de la
-- région lyonnaise vers la région nantaise (Nantes, Rezé, Orvault, Vertou,
-- Carquefou, Saint-Sébastien-sur-Loire, Couëron, Saint-Herblain — codes
-- postaux réels 44xxx). Noms de rue génériques conservés à l'identique
-- ("rue des Lilas", "avenue des Frênes"...) : ils n'étaient pas spécifiques à
-- Lyon, seuls le code postal et la ville changent. Aucun impact sur le
-- schéma ni sur les compteurs de vérification de la section 12.
--
-- ── MISE À JOUR 2026-09-22 (ter) — agenda plus fourni, cours collectifs variés
-- Séances individuelles : 24 → 33 (une séance planifiée de plus, quelques
-- jours plus loin, pour les 7 bénéficiaires suivis avec un contrat actif ;
-- 2 séances réalisées de plus pour Simone et Colette). Cours collectifs :
-- 2 → 7 — 2 occurrences passées de plus de "Gym d'équilibre en groupe"
-- (dont une absence de Colette, notée), un nouveau thème "Atelier mémoire
-- collectif" (Simone y participe, contrairement à la gym), et 2 occurrences
-- à venir supplémentaires (dont "Renforcement musculaire collectif", avec
-- une autre combinaison de bénéficiaires) SANS réponse de présence
-- annoncée — réaliste pour des cours encore loin dans le temps, pas un
-- oubli (vérifié explicitement en section 12).
--
-- MISE A JOUR 2026-09-23 — couverture lun-ven stable quelle que soit la date
-- d'execution
-- Constat apres deploiement : certains jours ouvres de la semaine en cours
-- n'avaient aucune activite sur l'agenda vitrine. Cause racine : les dates
-- des sections 9 et 11 etaient calculees en CURRENT_DATE +/- INTERVAL 'N
-- days', donc le jour de semaine obtenu dependait du jour d'execution du
-- script — rejouer le script a une autre date deplacait le "trou" ailleurs
-- au lieu de le supprimer.
-- Correctif structurel (pas un simple ajustement de dates) : nouvelle ancre
-- v_lundi = date_trunc('week', CURRENT_DATE)::date (le lundi de la semaine
-- en cours, toujours ISO 8601 en PostgreSQL, quel que soit le jour
-- d'execution). Toutes les dates de seances/cours collectifs proches se
-- calculent desormais en v_lundi + (semaines*7 + jour_de_semaine_nomme),
-- jamais en +/- N jours arbitraires :
--   - Semaines passees (N<0) et futures (N>0) : statut/notes en dur
--     ('realisee'/'planifiee'), provablement corrects quel que soit le jour
--     d'execution (v_lundi <= CURRENT_DATE toujours, donc v_lundi - 7*N pour
--     N>=1 est toujours < CURRENT_DATE, et v_lundi + 7*N pour N>=1 toujours
--     > CURRENT_DATE).
--   - Semaine en cours (N=0), seule zone reellement ambigue selon le jour
--     d'execution : CASE WHEN date < CURRENT_DATE THEN 'realisee' ELSE
--     'planifiee' END (idem pour la note associee).
-- Resultat : chaque contrat actif retrouve exactement ses jours_fixe (section
-- 5) sur la semaine en cours — lundi a vendredi ont chacun au moins une
-- seance, verifie explicitement en section 12 (boucle jour par jour, pas
-- seulement par deduction). Rien le week-end : aucun contrat n'a sam/dim
-- dans ses jours_fixe, en inventer un serait incoherent avec les habitudes
-- deja posees. Seances individuelles : 33 → 37 (Simone, Robert, Jacqueline,
-- Marie-Therese, Andre, Colette et Bernard ont chacun une seance de plus sur
-- la semaine en cours par rapport a la version precedente). Cours collectifs
-- (section 11) : dates re-ancrees sur v_lundi egalement, mais deliberement
-- tenues hors de la semaine en cours (les seances individuelles la couvrent
-- deja) pour ne pas ajouter de CASE sur les lignes qui portent une presence
-- annoncee — nombre de cours inchange (7).
-- ============================================================================

BEGIN;

DO $seed$
DECLARE
  v_demo_id       uuid;
  v_structure_id  uuid := gen_random_uuid();

  -- Participants
  v_p1  uuid := gen_random_uuid();  -- Simone MARTIN — équilibre / prévention chutes
  v_p2  uuid := gen_random_uuid();  -- Robert DUBOIS — post-AVC
  v_p3  uuid := gen_random_uuid();  -- Henri MOREAU — prothèse de hanche
  v_p4  uuid := gen_random_uuid();  -- Jacqueline PETIT — arthrose
  v_p5  uuid := gen_random_uuid();  -- Marie-Thérèse LAMBERT — EHPAD, ostéoporose
  v_p6  uuid := gen_random_uuid();  -- André ROUX — diabète
  v_p7  uuid := gen_random_uuid();  -- Colette FONTAINE — Parkinson
  v_p8  uuid := gen_random_uuid();  -- Bernard GARCIA — BPCO
  v_p9  uuid := gen_random_uuid();  -- Yvonne BERNARD — post-fracture, contrat suspendu
  v_p10 uuid := gen_random_uuid();  -- Paul LEFEBVRE — obésité, contrat à venir

  -- Contrats (1 par participant)
  v_c1 uuid := gen_random_uuid();
  v_c2 uuid := gen_random_uuid();
  v_c3 uuid := gen_random_uuid();
  v_c4 uuid := gen_random_uuid();
  v_c5 uuid := gen_random_uuid();
  v_c6 uuid := gen_random_uuid();
  v_c7 uuid := gen_random_uuid();
  v_c8 uuid := gen_random_uuid();
  v_c9 uuid := gen_random_uuid();
  v_c10 uuid := gen_random_uuid();

  -- Programmes V2 (1 par participant) + leur séance unique
  v_prog1 uuid := gen_random_uuid();  v_progs1 uuid := gen_random_uuid();
  v_prog2 uuid := gen_random_uuid();  v_progs2 uuid := gen_random_uuid();
  v_prog3 uuid := gen_random_uuid();  v_progs3 uuid := gen_random_uuid();
  v_prog4 uuid := gen_random_uuid();  v_progs4 uuid := gen_random_uuid();
  v_prog5 uuid := gen_random_uuid();  v_progs5 uuid := gen_random_uuid();
  v_prog6 uuid := gen_random_uuid();  v_progs6 uuid := gen_random_uuid();
  v_prog7 uuid := gen_random_uuid();  v_progs7 uuid := gen_random_uuid();
  v_prog8 uuid := gen_random_uuid();  v_progs8 uuid := gen_random_uuid();
  v_prog9 uuid := gen_random_uuid();  v_progs9 uuid := gen_random_uuid();
  v_prog10 uuid := gen_random_uuid(); v_progs10 uuid := gen_random_uuid();

  -- Séances individuelles dont on a besoin de l'id (rattachement retours_seance)
  v_p1_seance_recente  uuid := gen_random_uuid();
  v_p2_seance_recente  uuid := gen_random_uuid();
  v_p3_seance_recente  uuid := gen_random_uuid();
  v_p6_seance_recente  uuid := gen_random_uuid();
  v_p8_seance_recente  uuid := gen_random_uuid();

  -- Cours collectifs — 7 occurrences : 4 réalisées (historique, dont 2 avec
  -- absence notée), 3 planifiées (dont 1 avec présence annoncée, 2 sans
  -- réponse encore — c'est aussi ça, un agenda réel). v_cours_id/v_cours_id2
  -- sont les 2 déjà présentes avant cet ajout, inchangées.
  v_cours_id  uuid := gen_random_uuid();  -- Gym équilibre, réalisé -5j
  v_cours_id2 uuid := gen_random_uuid();  -- Gym équilibre, planifié +2j
  v_cours_id3 uuid := gen_random_uuid();  -- Gym équilibre, réalisé -19j
  v_cours_id4 uuid := gen_random_uuid();  -- Gym équilibre, réalisé -12j
  v_cours_id5 uuid := gen_random_uuid();  -- Atelier mémoire collectif, réalisé -3j
  v_cours_id6 uuid := gen_random_uuid();  -- Gym équilibre, planifié +9j
  v_cours_id7 uuid := gen_random_uuid();  -- Renforcement musculaire collectif, planifié +5j

  -- Ancre de dates STABLE quel que soit le jour d'exécution : lundi de la
  -- semaine en cours. date_trunc('week', ...) en PostgreSQL est toujours
  -- ISO 8601 (semaine = lundi à dimanche), jamais dimanche-first — vérifié
  -- (voir commentaire section 9). Toutes les dates de séances/cours
  -- collectifs "proches" (± quelques semaines) se calculent depuis ce point
  -- en semaines + jour de semaine nommé (0=lundi..4=vendredi), jamais en
  -- ± N jours arbitraires : un ± N jours retombe sur un jour de semaine
  -- DIFFÉRENT à chaque réexécution du script à une date différente — c'est
  -- exactement ce qui créait des trous variables dans l'agenda vitrine.
  v_lundi date := date_trunc('week', CURRENT_DATE)::date;

  -- Compteurs pour la vérification finale
  n int;
  v_jour_offset int;  -- boucle de vérification section 12 (couverture des jours ouvrés)
BEGIN

  -- ==========================================================================
  -- 0. Résolution du compte + garde-fou organisation (bloquant)
  -- ==========================================================================
  SELECT id INTO v_demo_id FROM auth.users WHERE email = 'demo@horizon-suivi.fr';
  IF v_demo_id IS NULL THEN
    RAISE EXCEPTION 'ARRET : aucun compte auth.users avec l''email demo@horizon-suivi.fr sur cet environnement.';
  END IF;

  IF EXISTS (SELECT 1 FROM organisation_membres WHERE user_id = v_demo_id) THEN
    RAISE EXCEPTION 'ARRET : le compte demo (%) appartient a une organisation (organisation_membres) — risque de fuite de vraies donnees de sante. Verifie et corrige avant de relancer ce script.', v_demo_id;
  END IF;

  -- ==========================================================================
  -- 1. Nettoyage — strictement scopé sur v_demo_id, jamais une plage
  -- ==========================================================================
  DELETE FROM tarifs_contrats WHERE contrat_id IN (SELECT id FROM contrats WHERE praticien_id = v_demo_id);
  DELETE FROM programme_exercices WHERE seance_id IN (
    SELECT ps.id FROM programme_seances ps JOIN programmes pr ON pr.id = ps.programme_id WHERE pr.praticien_id = v_demo_id
  );
  DELETE FROM programme_planning WHERE programme_id IN (SELECT id FROM programmes WHERE praticien_id = v_demo_id);
  DELETE FROM programme_seances WHERE programme_id IN (SELECT id FROM programmes WHERE praticien_id = v_demo_id);
  DELETE FROM programmes WHERE praticien_id = v_demo_id;
  DELETE FROM participations_cours_collectifs WHERE cours_id IN (SELECT id FROM cours_collectifs WHERE praticien_id = v_demo_id);
  DELETE FROM cours_collectifs WHERE praticien_id = v_demo_id;
  DELETE FROM retours_seance WHERE praticien_id = v_demo_id;
  DELETE FROM notes_seances WHERE praticien_id = v_demo_id;
  DELETE FROM seances WHERE praticien_id = v_demo_id;
  DELETE FROM bilans WHERE praticien_id = v_demo_id;
  DELETE FROM contrats WHERE praticien_id = v_demo_id;
  DELETE FROM participants WHERE praticien_id = v_demo_id;
  DELETE FROM structures WHERE praticien_id = v_demo_id;

  -- ==========================================================================
  -- 2. Profil praticien — UPSERT (jamais delete+recreate, id = auth.users.id fixe)
  --    titre non NULL obligatoire : sinon App.tsx redirige vers /onboarding.
  -- ==========================================================================
  INSERT INTO praticiens (
    id, prenom, nom, titre, email, telephone,
    adresse_rue, adresse_code_postal, adresse_ville,
    societe, ville_signature, tarif_horaire, frais_km_defaut
  ) VALUES (
    v_demo_id, 'Compte', 'Démo Vitrine', 'Enseignant APA', 'demo@horizon-suivi.fr', '0600000000',
    '10 rue de la Démonstration', '44000', 'Nantes',
    'Horizon APA (démo)', 'Nantes', '45', '0.50'
  )
  ON CONFLICT (id) DO UPDATE SET
    prenom = EXCLUDED.prenom, nom = EXCLUDED.nom, titre = EXCLUDED.titre,
    email = EXCLUDED.email, telephone = EXCLUDED.telephone,
    adresse_rue = EXCLUDED.adresse_rue, adresse_code_postal = EXCLUDED.adresse_code_postal,
    adresse_ville = EXCLUDED.adresse_ville, societe = EXCLUDED.societe,
    ville_signature = EXCLUDED.ville_signature, tarif_horaire = EXCLUDED.tarif_horaire,
    frais_km_defaut = EXCLUDED.frais_km_defaut;

  -- ==========================================================================
  -- 3. Structure démo (EHPAD fictif) — pour montrer le portail structure
  -- ==========================================================================
  INSERT INTO structures (
    id, praticien_id, nom, type, adresse, contact_nom, contact_email, contact_telephone,
    token_acces, tarif_seance, frequence_facturation, actif
  ) VALUES (
    v_structure_id, v_demo_id, 'EHPAD Les Tilleuls (démo)', 'ehpad',
    '25 avenue des Tilleuls, 44000 Nantes', 'Direction (démo)', 'contact.tilleuls.demo@example.com', '0600000099',
    'demo-vitrine-ehpad-token-0001', 50, 'mensuelle', true
  );

  -- ==========================================================================
  -- 4. Participants (10)
  -- ==========================================================================
  INSERT INTO participants (
    id, praticien_id, nom, prenom, date_naissance, email, telephone,
    pathologie, profil, profil_handicap, tests_actifs, contexte_clinic,
    taille, poids, medecin_traitant,
    adresse_rue, adresse_code_postal, adresse_ville,
    antecedents_medicaux, antecedents_chirurgicaux,
    droit_image, rgpd, code_acces, structure_id, archive
  ) VALUES
  (v_p1, v_demo_id, 'Martin', 'Simone', '1948-03-12', 'simone.martin.demo@example.com', '0600000001',
    'Prévention des chutes, équilibre précaire', 'Equilibre', NULL, '{equilibre,chairStand,tug}',
    'Chutes à répétition au domicile, vit seule, très motivée', 160, 58, 'Dr Lefort (démo)',
    '12 rue des Lilas', '44000', 'Nantes',
    'HTA traitée, ostéopénie', NULL,
    true, '{"consentementDate":"2026-03-12","consentementObtenu":true,"droitAcces":true,"droitRectification":true,"droitEffacement":true,"methodeConsentement":"numerique"}'::jsonb,
    'DEMPT234', NULL, false),

  (v_p2, v_demo_id, 'Dubois', 'Robert', '1955-07-04', 'robert.dubois.demo@example.com', '0600000002',
    'AVC ischémique sylvien droit (mars 2025), hémiparésie gauche résiduelle', 'Post-AVC', 'avc_hemiplegie', '{tug,marche10m,equilibre}',
    'Suivi post-AVC, bonne récupération motrice, vit avec son épouse', 175, 78, 'Dr Lefort (démo)',
    '8 avenue des Frênes', '44400', 'Rezé',
    'AVC ischémique 03/2025, HTA', NULL,
    true, '{"consentementDate":"2026-04-01","consentementObtenu":true,"droitAcces":true,"droitRectification":true,"droitEffacement":true,"methodeConsentement":"numerique"}'::jsonb,
    'DEMPT235', NULL, false),

  -- Archivé : contrat déjà 'termine' (section 5) — dossier conservé, fin de
  -- suivi réussie, illustre l'archivage sans être mélangé aux 9 actifs.
  (v_p3, v_demo_id, 'Moreau', 'Henri', '1958-11-20', 'henri.moreau.demo@example.com', '0600000003',
    'Prothèse totale de hanche droite, suites opératoires', 'Post-chirurgical', 'prothese_hanche', '{tug,chairStand,equilibre}',
    'Rééducation post-PTH, contrat terminé avec succès', 178, 82, 'Dr Bianchi (démo)',
    '5 rue du Stade', '44700', 'Orvault',
    NULL, 'PTH droite (05/2026)',
    false, '{"consentementDate":"2026-05-01","consentementObtenu":true,"droitAcces":true,"droitRectification":true,"droitEffacement":true,"methodeConsentement":"numerique"}'::jsonb,
    'DEMPT236', NULL, true),

  (v_p4, v_demo_id, 'Petit', 'Jacqueline', '1944-05-02', 'jacqueline.petit.demo@example.com', '0600000004',
    'Arthrose bilatérale des genoux', 'Arthrose', NULL, '{chairStand,tug}',
    'Patiente récente, douleurs genoux à la marche prolongée', 162, 70, 'Dr Bianchi (démo)',
    '21 chemin des Vignes', '44120', 'Vertou',
    'Arthrose genoux bilatérale', NULL,
    true, '{"consentementDate":"2026-08-25","consentementObtenu":true,"droitAcces":true,"droitRectification":true,"droitEffacement":true,"methodeConsentement":"numerique"}'::jsonb,
    'DEMPT237', NULL, false),

  (v_p5, v_demo_id, 'Lambert', 'Marie-Thérèse', '1941-09-15', 'marie-therese.lambert.demo@example.com', '0600000005',
    'Ostéoporose sévère, prévention des chutes', 'Equilibre', NULL, '{equilibre,chairStand}',
    'Résidente EHPAD Les Tilleuls (démo), fragilité osseuse', 155, 52, 'Dr coordonnateur EHPAD (démo)',
    '25 avenue des Tilleuls', '44000', 'Nantes',
    'Ostéoporose sévère', NULL,
    false, '{"consentementDate":"2026-02-10","consentementObtenu":true,"droitAcces":true,"droitRectification":true,"droitEffacement":true,"methodeConsentement":"declare_import"}'::jsonb,
    'DEMPT238', v_structure_id, false),

  (v_p6, v_demo_id, 'Roux', 'André', '1952-02-08', 'andre.roux.demo@example.com', '0600000006',
    'Diabète de type 2, déconditionnement physique', 'Diabete', 'diabete', '{tm6,chairStand}',
    'Sédentarité marquée, objectif reconditionnement progressif', 172, 95, 'Dr Lefort (démo)',
    '14 rue de la Paix', '44470', 'Carquefou',
    'Diabète type 2, surpoids', NULL,
    true, '{"consentementDate":"2026-07-15","consentementObtenu":true,"droitAcces":true,"droitRectification":true,"droitEffacement":true,"methodeConsentement":"numerique"}'::jsonb,
    'DEMPT239', NULL, false),

  (v_p7, v_demo_id, 'Fontaine', 'Colette', '1946-12-30', 'colette.fontaine.demo@example.com', '0600000007',
    'Maladie de Parkinson (stade 2)', 'Parkinson', 'parkinson', '{equilibre,tug}',
    'Freezing occasionnel à la marche, bonne adhésion au suivi', 158, 60, 'Dr Bianchi (démo)',
    '3 place du Marché', '44230', 'Saint-Sébastien-sur-Loire',
    'Maladie de Parkinson diagnostiquée en 2023', NULL,
    true, '{"consentementDate":"2026-08-15","consentementObtenu":true,"droitAcces":true,"droitRectification":true,"droitEffacement":true,"methodeConsentement":"numerique"}'::jsonb,
    'DEMPT242', NULL, false),

  (v_p8, v_demo_id, 'Garcia', 'Bernard', '1957-06-18', 'bernard.garcia.demo@example.com', '0600000008',
    'BPCO stade II, désaturation à l''effort', 'Respiratoire', NULL, '{tm6}',
    'Suivi respiratoire, ancien fumeur sevré', 170, 74, 'Dr pneumologue (démo)',
    '9 impasse des Cerisiers', '44220', 'Couëron',
    'BPCO stade II, ancien tabagisme', NULL,
    false, '{"consentementDate":"2026-08-02","consentementObtenu":true,"droitAcces":true,"droitRectification":true,"droitEffacement":true,"methodeConsentement":"numerique"}'::jsonb,
    'DEMPT243', NULL, false),

  (v_p9, v_demo_id, 'Bernard', 'Yvonne', '1938-01-25', 'yvonne.bernard.demo@example.com', '0600000009',
    'Suites de fracture du col du fémur droit', 'Post-chirurgical', NULL, '{tug,chairStand}',
    'Contrat en pause (hospitalisation ponctuelle), reprise prévue', 150, 48, 'Dr Lefort (démo)',
    '17 rue Victor Hugo', '44000', 'Nantes',
    NULL, 'Ostéosynthèse col fémoral droit (2026)',
    false, '{"consentementDate":"2026-05-20","consentementObtenu":true,"droitAcces":true,"droitRectification":true,"droitEffacement":true,"methodeConsentement":"oral_note"}'::jsonb,
    'DEMPT245', NULL, false),

  (v_p10, v_demo_id, 'Lefebvre', 'Paul', '1961-04-10', 'paul.lefebvre.demo@example.com', '0600000010',
    'Obésité (IMC ~34), prévention cardio-métabolique', 'Obesite', 'obesite', '{tm6,chairStand}',
    'Contrat à venir, bilan initial déjà réalisé', 176, 105, 'Dr Lefort (démo)',
    '2 rue des Érables', '44800', 'Saint-Herblain',
    'Obésité, prédiabète', NULL,
    true, '{"consentementDate":"2026-09-10","consentementObtenu":true,"droitAcces":true,"droitRectification":true,"droitEffacement":true,"methodeConsentement":"numerique"}'::jsonb,
    'DEMPT246', NULL, false);

  -- ==========================================================================
  -- 5. Contrats (10) — statuts variés : 7 actifs, 1 suspendu, 1 à venir, 1 terminé
  -- ==========================================================================
  INSERT INTO contrats (
    id, participant_id, praticien_id, date_debut, date_fin, jours_fixe,
    heure_debut, duree_minutes, durees_seances, nb_seances_semaine, periodicite,
    statut, notes, date_creation, nombre_seances_total, nombre_seances_realisees,
    duree_indeterminee, date_reprise_prevue, exclure_tournee
  ) VALUES
  (v_c1, v_p1, v_demo_id, CURRENT_DATE - INTERVAL '6 months', CURRENT_DATE + INTERVAL '6 months', '{lun,jeu}',
    '09:00', 45, '{45}', 2, 'semaine',
    'actif', 'Suivi hebdomadaire équilibre', CURRENT_DATE - INTERVAL '6 months', 48, 20,
    false, NULL, false),

  (v_c2, v_p2, v_demo_id, CURRENT_DATE - INTERVAL '5 months', CURRENT_DATE + INTERVAL '7 months', '{mar,ven}',
    '10:00', 45, '{45}', 2, 'semaine',
    'actif', 'Rééducation post-AVC', CURRENT_DATE - INTERVAL '5 months', 48, 18,
    false, NULL, false),

  (v_c3, v_p3, v_demo_id, CURRENT_DATE - INTERVAL '4 months', CURRENT_DATE - INTERVAL '2 weeks', '{mer}',
    '14:00', 45, '{45}', 1, 'semaine',
    'termine', 'Objectifs de rééducation atteints', CURRENT_DATE - INTERVAL '4 months', 16, 16,
    false, NULL, false),

  (v_c4, v_p4, v_demo_id, CURRENT_DATE - INTERVAL '3 weeks', CURRENT_DATE + INTERVAL '11 months', '{lun}',
    '11:00', 45, '{45}', 1, 'semaine',
    'actif', NULL, CURRENT_DATE - INTERVAL '3 weeks', 40, 1,
    false, NULL, false),

  (v_c5, v_p5, v_demo_id, CURRENT_DATE - INTERVAL '7 months', CURRENT_DATE + INTERVAL '5 months', '{mar,jeu}',
    '10:30', 30, '{30}', 2, 'semaine',
    'actif', 'Suivi EHPAD, séances courtes', CURRENT_DATE - INTERVAL '7 months', 48, 24,
    false, NULL, false),

  (v_c6, v_p6, v_demo_id, CURRENT_DATE - INTERVAL '2 months', CURRENT_DATE + INTERVAL '10 months', '{lun,mer}',
    '08:30', 45, '{45}', 2, 'semaine',
    'actif', NULL, CURRENT_DATE - INTERVAL '2 months', 48, 8,
    false, NULL, false),

  (v_c7, v_p7, v_demo_id, CURRENT_DATE - INTERVAL '1 month', CURRENT_DATE + INTERVAL '11 months', '{ven}',
    '15:00', 45, '{45}', 1, 'semaine',
    'actif', NULL, CURRENT_DATE - INTERVAL '1 month', 40, 4,
    false, NULL, false),

  (v_c8, v_p8, v_demo_id, CURRENT_DATE - INTERVAL '6 weeks', CURRENT_DATE + INTERVAL '10 months', '{mar}',
    '09:30', 45, '{45}', 1, 'semaine',
    'actif', 'Surveillance désaturation à l''effort', CURRENT_DATE - INTERVAL '6 weeks', 40, 5,
    false, NULL, false),

  (v_c9, v_p9, v_demo_id, CURRENT_DATE - INTERVAL '4 months', CURRENT_DATE + INTERVAL '8 months', '{mer}',
    '10:00', 30, '{30}', 1, 'semaine',
    'suspendu', 'Suspendu suite hospitalisation ponctuelle', CURRENT_DATE - INTERVAL '4 months', 40, 10,
    false, CURRENT_DATE + INTERVAL '3 weeks', false),

  (v_c10, v_p10, v_demo_id, CURRENT_DATE + INTERVAL '2 weeks', CURRENT_DATE + INTERVAL '1 year 2 weeks', '{jeu}',
    '17:00', 45, '{45}', 1, 'semaine',
    'a_venir', 'Démarrage prévu après le bilan initial', CURRENT_DATE - INTERVAL '1 week', 40, 0,
    false, NULL, false);

  -- ==========================================================================
  -- 6. Tarifs des contrats (bug 07) — Simone a un historique de changement
  --    de tarif pour illustrer tarifs_contrats/trouverTarifApplicable.
  -- ==========================================================================
  INSERT INTO tarifs_contrats (contrat_id, tarif_seance, frais_deplacement, date_debut_validite, date_fin_validite) VALUES
  (v_c1, 40, 0, CURRENT_DATE - INTERVAL '6 months', (CURRENT_DATE - INTERVAL '3 months') - INTERVAL '1 day'),
  (v_c1, 45, 3, CURRENT_DATE - INTERVAL '3 months', NULL),
  (v_c2, 42, 0, CURRENT_DATE - INTERVAL '5 months', NULL),
  (v_c3, 38, 0, CURRENT_DATE - INTERVAL '4 months', NULL),
  (v_c4, 40, 0, CURRENT_DATE - INTERVAL '3 weeks', NULL),
  (v_c5, 35, 0, CURRENT_DATE - INTERVAL '7 months', NULL),
  (v_c6, 45, 0, CURRENT_DATE - INTERVAL '2 months', NULL),
  (v_c7, 45, 0, CURRENT_DATE - INTERVAL '1 month', NULL),
  (v_c8, 42, 0, CURRENT_DATE - INTERVAL '6 weeks', NULL),
  (v_c9, 38, 0, CURRENT_DATE - INTERVAL '4 months', NULL),
  (v_c10, 40, 0, CURRENT_DATE + INTERVAL '2 weeks', NULL);

  -- ==========================================================================
  -- 7. Programmes V2 (1 par participant, 1 séance chacun, thématisés par pathologie)
  -- ==========================================================================
  INSERT INTO programmes (id, participant_id, praticien_id, date_debut, titre, objectif, message_motivation, actif) VALUES
  (v_prog1, v_p1, v_demo_id, CURRENT_DATE - INTERVAL '6 months', 'Programme équilibre & prévention chutes', 'Réduire le risque de chute au domicile', 'Chaque séance compte, vous progressez déjà !', true),
  (v_prog2, v_p2, v_demo_id, CURRENT_DATE - INTERVAL '5 months', 'Programme rééducation post-AVC', 'Récupérer l''autonomie de marche et la motricité du côté gauche', 'Votre progression est régulière, continuez ainsi.', true),
  (v_prog3, v_p3, v_demo_id, CURRENT_DATE - INTERVAL '4 months', 'Programme suites prothèse de hanche', 'Retrouver une marche autonome sans aide technique', 'Objectifs atteints, bravo pour votre engagement !', false),
  (v_prog4, v_p4, v_demo_id, CURRENT_DATE - INTERVAL '3 weeks', 'Programme arthrose genoux', 'Diminuer la douleur et maintenir la mobilité articulaire', 'On avance doucement, à votre rythme.', true),
  (v_prog5, v_p5, v_demo_id, CURRENT_DATE - INTERVAL '7 months', 'Programme prévention chutes EHPAD', 'Sécuriser les transferts et limiter le risque de chute', 'Toujours un plaisir de vous voir en forme !', true),
  (v_prog6, v_p6, v_demo_id, CURRENT_DATE - INTERVAL '2 months', 'Programme diabète & reconditionnement', 'Reconditionnement physique progressif', 'Un pas de plus chaque semaine.', true),
  (v_prog7, v_p7, v_demo_id, CURRENT_DATE - INTERVAL '1 month', 'Programme Parkinson - mobilité', 'Travailler l''amplitude du mouvement et l''équilibre dynamique', 'Votre régularité fait la différence.', true),
  (v_prog8, v_p8, v_demo_id, CURRENT_DATE - INTERVAL '6 weeks', 'Programme respiratoire BPCO', 'Améliorer la tolérance à l''effort sous contrôle respiratoire', 'Respirez, avancez, à votre allure.', true),
  (v_prog9, v_p9, v_demo_id, CURRENT_DATE - INTERVAL '4 months', 'Programme reprise post-fracture', 'Sécuriser la reprise de la marche', 'Patience et prudence, la récupération est en cours.', true),
  (v_prog10, v_p10, v_demo_id, CURRENT_DATE - INTERVAL '1 week', 'Programme prévention cardio-métabolique', 'Reprise d''activité physique progressive et durable', 'Le programme démarre bientôt, tout est prêt.', true);

  INSERT INTO programme_seances (id, programme_id, nom, description, ordre) VALUES
  (v_progs1, v_prog1, 'Séance à domicile', 'Travail d''équilibre et de renforcement léger', 1),
  (v_progs2, v_prog2, 'Séance à domicile', 'Rééducation motrice ciblée côté gauche', 1),
  (v_progs3, v_prog3, 'Séance à domicile', 'Renforcement et marche', 1),
  (v_progs4, v_prog4, 'Séance à domicile', 'Mobilité articulaire douce', 1),
  (v_progs5, v_prog5, 'Séance en EHPAD', 'Transferts sécurisés et équilibre assis', 1),
  (v_progs6, v_prog6, 'Séance à domicile', 'Reconditionnement cardio léger', 1),
  (v_progs7, v_prog7, 'Séance à domicile', 'Mobilité et coordination', 1),
  (v_progs8, v_prog8, 'Séance à domicile', 'Marche contrôlée et renforcement léger', 1),
  (v_progs9, v_prog9, 'Séance à domicile', 'Transferts et équilibre assis-debout', 1),
  (v_progs10, v_prog10, 'Séance à domicile', 'Reprise d''activité progressive', 1);

  INSERT INTO programme_planning (programme_id, seance_id, jour) VALUES
  (v_prog1, v_progs1, 'lundi'), (v_prog1, v_progs1, 'jeudi'),
  (v_prog2, v_progs2, 'mardi'), (v_prog2, v_progs2, 'vendredi'),
  (v_prog3, v_progs3, 'mercredi'),
  (v_prog4, v_progs4, 'lundi'), (v_prog4, v_progs4, 'jeudi'),
  (v_prog5, v_progs5, 'mardi'), (v_prog5, v_progs5, 'jeudi'),
  (v_prog6, v_progs6, 'lundi'), (v_prog6, v_progs6, 'mercredi'),
  (v_prog7, v_progs7, 'mardi'), (v_prog7, v_progs7, 'vendredi'),
  (v_prog8, v_progs8, 'mardi'), (v_prog8, v_progs8, 'samedi'),
  (v_prog9, v_progs9, 'mercredi'),
  (v_prog10, v_progs10, 'jeudi'), (v_prog10, v_progs10, 'dimanche');

  INSERT INTO programme_exercices (seance_id, nom, categorie, description, conseil_securite, series, repetitions, duree_secondes, ordre) VALUES
  -- Simone (équilibre)
  (v_progs1, 'Équilibre unipodal', 'equilibre', 'Tenir en appui sur une jambe, près d''un support', 'Rester à proximité d''un mur ou d''une chaise', 3, NULL, 20, 1),
  (v_progs1, 'Chair stand assis-debout', 'renforcement', 'Se lever et s''asseoir depuis une chaise sans les mains', 'Chaise stable, dossier contre un mur', 3, 10, NULL, 2),
  (v_progs1, 'Marche talon-pointe', 'equilibre', 'Marcher en ligne droite talon contre pointe', 'Longer un mur pour pouvoir s''appuyer', 2, NULL, 30, 3),
  (v_progs1, 'Renforcement des mollets', 'renforcement', 'Montées sur pointes de pieds', 'Appui sur une chaise si besoin', 3, 12, NULL, 4),
  -- Robert (post-AVC)
  (v_progs2, 'Marche avec appui', 'mobilite', 'Marche accompagnée sur terrain plat', 'Chaussures fermées, surface non glissante', 1, NULL, 300, 1),
  (v_progs2, 'Renforcement membre supérieur gauche', 'renforcement', 'Flexion-extension du coude avec léger poids', 'Amplitude sans douleur', 3, 10, NULL, 2),
  (v_progs2, 'Équilibre assis-debout', 'equilibre', 'Transferts assis-debout contrôlés', 'Chaise avec accoudoirs à proximité', 3, 8, NULL, 3),
  (v_progs2, 'Motricité fine main gauche', 'coordination', 'Manipulation de petits objets', 'Aucun risque particulier', 2, NULL, 180, 4),
  -- Henri (prothèse hanche)
  (v_progs3, 'Marche avec cannes', 'mobilite', 'Marche extérieure avec aide technique', 'Respecter les consignes du chirurgien', 1, NULL, 600, 1),
  (v_progs3, 'Renforcement quadriceps', 'renforcement', 'Contractions isométriques du quadriceps', 'Pas de douleur aiguë', 3, 12, NULL, 2),
  (v_progs3, 'Étirements hanche', 'souplesse', 'Étirements doux en amplitude autorisée', 'Respecter les limites post-opératoires', 2, NULL, 30, 3),
  (v_progs3, 'Chair stand assisté', 'renforcement', 'Lever de chaise avec appui des mains', 'Chaise stable', 3, 8, NULL, 4),
  -- Jacqueline (arthrose)
  (v_progs4, 'Vélo assis', 'cardio', 'Pédalage sur vélo d''appartement, faible résistance', 'Réglage de selle adapté', 1, NULL, 600, 1),
  (v_progs4, 'Renforcement doux quadriceps', 'renforcement', 'Extension de jambe assise', 'Amplitude sans douleur', 3, 10, NULL, 2),
  (v_progs4, 'Étirements genoux', 'souplesse', 'Étirements doux des ischio-jambiers', 'Mouvement lent, sans à-coup', 2, NULL, 30, 3),
  (v_progs4, 'Marche en terrain plat', 'mobilite', 'Marche continue à allure confortable', 'Chaussures adaptées', 1, NULL, 300, 4),
  -- Marie-Thérèse (EHPAD)
  (v_progs5, 'Équilibre assis', 'equilibre', 'Transferts de poids en position assise', 'Fauteuil à accoudoirs', 3, 8, NULL, 1),
  (v_progs5, 'Renforcement léger membres inférieurs', 'renforcement', 'Extension de jambe assise, faible charge', 'Mouvement lent et contrôlé', 2, 8, NULL, 2),
  (v_progs5, 'Transferts assis-debout sécurisés', 'equilibre', 'Lever de fauteuil avec accompagnement', 'Toujours accompagnée', 3, 6, NULL, 3),
  (v_progs5, 'Marche accompagnée', 'mobilite', 'Marche courte avec accompagnement', 'Aide humaine systématique', 1, NULL, 120, 4),
  -- André (diabète)
  (v_progs6, 'Marche rapide', 'cardio', 'Marche à allure soutenue', 'Hydratation, surveillance glycémie si besoin', 1, NULL, 600, 1),
  (v_progs6, 'Renforcement global léger', 'renforcement', 'Circuit de renforcement corps entier', 'Charge légère, échauffement préalable', 2, 12, NULL, 2),
  (v_progs6, 'Vélo d''appartement', 'cardio', 'Pédalage résistance modérée', 'Surveillance de l''essoufflement', 1, NULL, 480, 3),
  (v_progs6, 'Étirements généraux', 'souplesse', 'Étirements de fin de séance', 'Mouvements lents', 1, NULL, 300, 4),
  -- Colette (Parkinson)
  (v_progs7, 'Marche à grands pas', 'mobilite', 'Marche en insistant sur l''amplitude du pas', 'Terrain dégagé, sans obstacle', 2, NULL, 180, 1),
  (v_progs7, 'Exercices d''amplitude', 'souplesse', 'Grands mouvements des membres', 'Rythme adapté à la fatigabilité', 2, 10, NULL, 2),
  (v_progs7, 'Équilibre dynamique', 'equilibre', 'Changements de direction contrôlés', 'Espace dégagé, chaussures adaptées', 3, 8, NULL, 3),
  (v_progs7, 'Coordination bilatérale', 'coordination', 'Mouvements croisés bras-jambes', 'Adapter le rythme si freezing', 2, 10, NULL, 4),
  -- Bernard (BPCO)
  (v_progs8, 'Marche avec contrôle respiratoire', 'cardio', 'Marche à allure adaptée au souffle', 'Arrêt immédiat si essoufflement marqué', 1, NULL, 480, 1),
  (v_progs8, 'Renforcement membres supérieurs léger', 'renforcement', 'Exercices avec élastique léger', 'Respiration synchronisée', 2, 10, NULL, 2),
  (v_progs8, 'Exercices de souffle', 'respiratoire', 'Respiration diaphragmatique guidée', 'Position confortable, sans forcer', 3, NULL, 60, 3),
  (v_progs8, 'Étirements thoraciques', 'souplesse', 'Ouverture de cage thoracique', 'Mouvement lent', 2, NULL, 30, 4),
  -- Yvonne (post-fracture)
  (v_progs9, 'Transferts sécurisés', 'equilibre', 'Lit-fauteuil avec aide technique', 'Aide humaine systématique', 3, 5, NULL, 1),
  (v_progs9, 'Renforcement doux', 'renforcement', 'Contractions musculaires légères', 'Aucune mise en charge non autorisée', 2, 8, NULL, 2),
  (v_progs9, 'Équilibre assis', 'equilibre', 'Transferts de poids assise', 'Fauteuil sécurisé', 3, 6, NULL, 3),
  (v_progs9, 'Marche avec déambulateur', 'mobilite', 'Marche courte avec aide technique', 'Surveillance rapprochée', 1, NULL, 90, 4),
  -- Paul (obésité)
  (v_progs10, 'Marche active', 'cardio', 'Marche à allure progressive', 'Chaussures adaptées, hydratation', 1, NULL, 600, 1),
  (v_progs10, 'Renforcement global', 'renforcement', 'Circuit corps entier faible charge', 'Échauffement systématique', 2, 12, NULL, 2),
  (v_progs10, 'Vélo d''appartement', 'cardio', 'Pédalage résistance modérée', 'Surveillance fréquence cardiaque', 1, NULL, 480, 3),
  (v_progs10, 'Étirements généraux', 'souplesse', 'Étirements de fin de séance', 'Mouvements lents', 1, NULL, 300, 4);

  -- ==========================================================================
  -- 8. Bilans — Simone, Robert, Henri : historique multi-mois avec progression.
  --    Les 7 autres : un seul bilan initial.
  --
  --    tm6_mode/tm6_repetitions, apley_data, tinetti_data, moca_score ajoutés
  --    à des bilans EXISTANTS (aucun bilan de plus : le compteur de la
  --    section 12 reste à 15) :
  --      - Colette (stepper) et Marie-Thérèse (marche sur place) complètent
  --        le "marche" déjà présent (André/Bernard/Paul) — les 3 modalités
  --        TM6 sont désormais toutes représentées.
  --      - Apley sur les 3 bilans de Robert : asymétrie D/G qui se résorbe
  --        (score 3.0 → 3.5 → 4.0), cohérent avec l'hémiparésie gauche qui
  --        récupère déjà sur les autres mesures.
  --      - Tinetti sur les 3 bilans de Simone : 10/28 → 20/28 → 27/28,
  --        cohérent avec son équilibre qui progresse déjà (risque de chute
  --        élevé → faible, même récit que ses autres mesures).
  --      - MoCA sur le bilan de Marie-Thérèse (dépistage cognitif EHPAD).
  -- ==========================================================================
  INSERT INTO bilans (
    participant_id, praticien_id, date, type, trimestre,
    equilibre_droite, equilibre_gauche, chair_stand_30, tug_3m, hand_grip_droite, hand_grip_gauche,
    souplesse_methode, souplesse_valeur,
    tm6_distance_metres, tm6_mode, tm6_repetitions, tm6_fc_avant, tm6_fc_apres, tm6_spo2_avant, tm6_spo2_apres, tm6_spo2_2min, tm6_borg_rpe,
    apley_data, tinetti_data, moca_score,
    sedentarite_score, sedentarite_profil, fatigue_score, fatigue_profil,
    notes_professionnelles
  ) VALUES
  -- Simone : progression équilibre + Tinetti (POMA) sur les 3 bilans
  (v_p1, v_demo_id, CURRENT_DATE - INTERVAL '6 months', 'initial', 0, 8, 7, 6, 14, NULL, NULL, NULL, NULL,
    NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
    NULL,
    '{"equilibre":{"assis":1,"leverChaise":1,"tentativesLever":1,"deboutImmediat":1,"deboutStable":1,"pousseeSternale":0,"yeuxFermes":0,"pivotContinuite":0,"pivotStabilite":0,"sasseoir":1},"marche":{"initiation":1,"pasDroit":1,"pasGauche":1,"symetrie":0,"continuite":0,"trajectoire":1,"tronc":0,"baseMarche":0},"notes":"Score global bas, risque de chute élevé, prudence sur les transferts."}'::jsonb,
    NULL,
    65, 'Sédentaire', NULL, NULL, 'Bilan initial : équilibre précaire, risque de chute élevé.'),
  (v_p1, v_demo_id, CURRENT_DATE - INTERVAL '3 months', 'trimestriel', 1, 14, 13, 9, 11, NULL, NULL, NULL, NULL,
    NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
    NULL,
    '{"equilibre":{"assis":1,"leverChaise":2,"tentativesLever":1,"deboutImmediat":2,"deboutStable":1,"pousseeSternale":1,"yeuxFermes":1,"pivotContinuite":1,"pivotStabilite":0,"sasseoir":1},"marche":{"initiation":1,"pasDroit":1,"pasGauche":2,"symetrie":1,"continuite":1,"trajectoire":1,"tronc":1,"baseMarche":1},"notes":"Progression nette de l''équilibre postural et de la marche."}'::jsonb,
    NULL,
    NULL, NULL, NULL, NULL, 'Nette amélioration de l''équilibre unipodal des deux côtés.'),
  (v_p1, v_demo_id, CURRENT_DATE - INTERVAL '2 weeks', 'trimestriel', 2, 20, 19, 12, 8, NULL, NULL, NULL, NULL,
    NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
    NULL,
    '{"equilibre":{"assis":1,"leverChaise":2,"tentativesLever":2,"deboutImmediat":2,"deboutStable":2,"pousseeSternale":2,"yeuxFermes":1,"pivotContinuite":1,"pivotStabilite":1,"sasseoir":2},"marche":{"initiation":1,"pasDroit":2,"pasGauche":2,"symetrie":1,"continuite":1,"trajectoire":2,"tronc":1,"baseMarche":1},"notes":"Score proche de la normale, risque de chute désormais faible."}'::jsonb,
    NULL,
    NULL, NULL, NULL, NULL, 'Progression confirmée, poursuite du programme à l''identique.'),
  -- Robert : progression post-AVC + Apley (amplitude épaule) sur les 3 bilans
  (v_p2, v_demo_id, CURRENT_DATE - INTERVAL '5 months', 'initial', 0, 5, 4, 4, 22, 28, 14, NULL, NULL,
    NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
    '{"haut_d":"shoulder","haut_g":"top","bas_d":"scapula","bas_g":"low_back","score":3,"notes":"Amplitude d''épaule gauche nettement limitée, mouvement bas difficile."}'::jsonb,
    NULL,
    NULL,
    NULL, NULL, NULL, NULL, 'Bilan initial post-AVC : hémiparésie gauche marquée, marche instable.'),
  (v_p2, v_demo_id, CURRENT_DATE - INTERVAL '2 months', 'trimestriel', 1, 9, 9, 7, 16, 29, 19, NULL, NULL,
    NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
    '{"haut_d":"shoulder","haut_g":"neck","bas_d":"scapula","bas_g":"mid_back","score":3.5,"notes":"Progrès net côté gauche, asymétrie encore présente sur le mouvement bas."}'::jsonb,
    NULL,
    NULL,
    NULL, NULL, NULL, NULL, 'Récupération motrice progressive côté gauche.'),
  (v_p2, v_demo_id, CURRENT_DATE - INTERVAL '3 weeks', 'trimestriel', 2, 13, 13, 9, 11, 30, 23, NULL, NULL,
    NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
    '{"haut_d":"shoulder","haut_g":"shoulder","bas_d":"scapula","bas_g":"scapula","score":4,"notes":"Amplitude symétrique des deux côtés, plus d''asymétrie significative."}'::jsonb,
    NULL,
    NULL,
    NULL, NULL, NULL, NULL, 'Bonne évolution, autonomie de marche nettement accrue.'),
  -- Henri : progression post-PTH (archivé depuis la section 4, contrat terminé)
  (v_p3, v_demo_id, CURRENT_DATE - INTERVAL '4 months', 'initial', 0, NULL, NULL, 4, 20, NULL, NULL, 'assis', -8,
    NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
    NULL, NULL, NULL,
    NULL, NULL, NULL, NULL, 'Bilan initial post-opératoire, douleurs à la mobilisation.'),
  (v_p3, v_demo_id, CURRENT_DATE - INTERVAL '3 weeks', 'trimestriel', 1, NULL, NULL, 10, 12, NULL, NULL, 'assis', -2,
    NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
    NULL, NULL, NULL,
    NULL, NULL, NULL, NULL, 'Récupération fonctionnelle satisfaisante, fin de prise en charge.'),
  -- Jacqueline
  (v_p4, v_demo_id, CURRENT_DATE - INTERVAL '3 weeks', 'initial', 0, NULL, NULL, 5, 16, NULL, NULL, 'debout', -12,
    NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
    NULL, NULL, NULL,
    NULL, NULL, NULL, NULL, 'Douleurs genoux à la marche prolongée, bilan initial.'),
  -- Marie-Thérèse : TM6 marche sur place (adapté EHPAD) + MoCA
  (v_p5, v_demo_id, CURRENT_DATE - INTERVAL '7 months', 'initial', 0, 4, 4, 3, NULL, NULL, NULL, NULL, NULL,
    NULL, 'marche_sur_place', 210, 80, 98, NULL, NULL, NULL, 5,
    NULL, NULL, 23,
    NULL, NULL, NULL, NULL, 'Bilan initial EHPAD, fragilité osseuse, prudence sur les exercices d''impact.'),
  -- André
  (v_p6, v_demo_id, CURRENT_DATE - INTERVAL '2 months', 'initial', 0, NULL, NULL, 8, NULL, NULL, NULL, NULL, NULL,
    320, NULL, NULL, 78, 118, NULL, NULL, NULL, 5,
    NULL, NULL, NULL,
    72, 'Très sédentaire', NULL, NULL, 'Déconditionnement marqué, objectif reprise progressive d''activité.'),
  -- Colette : TM6 stepper
  (v_p7, v_demo_id, CURRENT_DATE - INTERVAL '1 month', 'initial', 0, 6, 6, NULL, 15, NULL, NULL, NULL, NULL,
    NULL, 'stepper', 580, 74, 102, NULL, NULL, NULL, 4,
    NULL, NULL, NULL,
    NULL, NULL, NULL, NULL, 'Freezing occasionnel observé, adaptation du programme en conséquence.'),
  -- Bernard
  (v_p8, v_demo_id, CURRENT_DATE - INTERVAL '1 month', 'initial', 0, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
    280, NULL, NULL, 82, 125, 95, 89, 93, 6,
    NULL, NULL, NULL,
    NULL, NULL, NULL, NULL, 'Désaturation à l''effort surveillée, bilan initial respiratoire.'),
  -- Yvonne
  (v_p9, v_demo_id, CURRENT_DATE - INTERVAL '4 months', 'initial', 0, NULL, NULL, 2, 26, NULL, NULL, NULL, NULL,
    NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
    NULL, NULL, NULL,
    NULL, NULL, NULL, NULL, 'Bilan initial post-fracture, prudence, aide technique recommandée.'),
  -- Paul
  (v_p10, v_demo_id, CURRENT_DATE - INTERVAL '1 week', 'initial', 0, NULL, NULL, 7, NULL, NULL, NULL, NULL, NULL,
    380, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
    NULL, NULL, NULL,
    58, NULL, 45, 'Fatigue modérée', 'Bilan initial avant démarrage du suivi, objectif prévention cardio-métabolique.');

  -- ==========================================================================
  -- 9. Séances — ancrées sur v_lundi (jour de semaine nommé + décalage en
  --    SEMAINES), jamais en ± N jours depuis CURRENT_DATE.
  --
  --    Chaque contrat actif retrouve EXACTEMENT ses jours_fixe (section 5) :
  --    Simone lun+jeu, Robert mar+ven, Jacqueline lun, Marie-Thérèse mar+jeu,
  --    André lun+mer, Colette ven, Bernard mar. En semaine "S-1" et plus tôt
  --    (v_lundi - 7*N + jour), la date est TOUJOURS strictement avant
  --    CURRENT_DATE quel que soit le jour d'exécution (v_lundi <=
  --    CURRENT_DATE par construction, donc v_lundi - 7 + 4 <= CURRENT_DATE - 3)
  --    → 'realisee' en dur, sans condition. En semaine "S+1" et plus tard
  --    (v_lundi + 7*N + jour), la date est TOUJOURS strictement après
  --    CURRENT_DATE → 'planifiee' en dur. SEULE la semaine EN COURS
  --    (v_lundi + jour, N=0) est ambiguë selon le jour d'exécution : ces
  --    lignes utilisent un CASE sur (date < CURRENT_DATE) pour rester
  --    correctes dans les deux cas — c'est CETTE semaine que Pierre a vue
  --    trouée, donc c'est elle qui doit être juste à coup sûr.
  --
  --    Résultat : lundi (Simone+Jacqueline+André), mardi (Robert+Marie-
  --    Thérèse+Bernard), mercredi (André), jeudi (Simone+Marie-Thérèse),
  --    vendredi (Robert+Colette) ont TOUS une séance cette semaine — aucun
  --    jour ouvré sans activité, à n'importe quelle date d'exécution.
  --    Rien le week-end : aucun contrat n'a sam/dim dans ses jours_fixe,
  --    en inventer un serait incohérent avec les habitudes déjà posées.
  --    Henri (terminé) et Yvonne (suspendue) restent sans séance future ;
  --    Paul sans aucune séance (contrat pas encore démarré) — inchangé.
  -- ==========================================================================
  INSERT INTO seances (id, participant_id, praticien_id, contrat_id, date, heure_debut, heure_fin, duree_minutes, type, statut, notes) VALUES
  -- Simone (lun, jeu)
  (gen_random_uuid(), v_p1, v_demo_id, v_c1, v_lundi - 21,     '09:00', '09:45', 45, 'seance', 'realisee', 'Reprise après une petite pause, bonne forme.'),
  (gen_random_uuid(), v_p1, v_demo_id, v_c1, v_lundi - 11,     '09:00', '09:45', 45, 'seance', 'realisee', 'Bonne séance, travail d''équilibre unipodal.'),
  (v_p1_seance_recente, v_p1, v_demo_id, v_c1, v_lundi - 7,    '09:00', '09:45', 45, 'seance', 'realisee', 'Poursuite du travail d''équilibre, patiente motivée.'),
  (gen_random_uuid(), v_p1, v_demo_id, v_c1, v_lundi + 0,      '09:00', '09:45', 45, 'seance',
    CASE WHEN v_lundi + 0 < CURRENT_DATE THEN 'realisee' ELSE 'planifiee' END,
    CASE WHEN v_lundi + 0 < CURRENT_DATE THEN 'Séance du lundi, bon travail d''équilibre.' ELSE NULL END),
  (gen_random_uuid(), v_p1, v_demo_id, v_c1, v_lundi + 3,      '09:00', '09:45', 45, 'seance',
    CASE WHEN v_lundi + 3 < CURRENT_DATE THEN 'realisee' ELSE 'planifiee' END,
    CASE WHEN v_lundi + 3 < CURRENT_DATE THEN 'Séance du jeudi, patiente motivée.' ELSE NULL END),
  (gen_random_uuid(), v_p1, v_demo_id, v_c1, v_lundi + 7,      '09:00', '09:45', 45, 'seance', 'planifiee', NULL),
  -- Robert (mar, ven)
  (gen_random_uuid(), v_p2, v_demo_id, v_c2, v_lundi - 13,     '10:00', '10:45', 45, 'seance', 'realisee', 'Travail de marche avec appui.'),
  (v_p2_seance_recente, v_p2, v_demo_id, v_c2, v_lundi - 3,    '10:00', '10:45', 45, 'seance', 'realisee', 'Amélioration de la coordination du côté gauche.'),
  (gen_random_uuid(), v_p2, v_demo_id, v_c2, v_lundi + 1,      '10:00', '10:45', 45, 'seance',
    CASE WHEN v_lundi + 1 < CURRENT_DATE THEN 'realisee' ELSE 'planifiee' END,
    CASE WHEN v_lundi + 1 < CURRENT_DATE THEN 'Séance du mardi, marche avec appui.' ELSE NULL END),
  (gen_random_uuid(), v_p2, v_demo_id, v_c2, v_lundi + 4,      '10:00', '10:45', 45, 'seance',
    CASE WHEN v_lundi + 4 < CURRENT_DATE THEN 'realisee' ELSE 'planifiee' END,
    CASE WHEN v_lundi + 4 < CURRENT_DATE THEN 'Séance du vendredi, bonne tolérance.' ELSE NULL END),
  (gen_random_uuid(), v_p2, v_demo_id, v_c2, v_lundi + 8,      '10:00', '10:45', 45, 'seance', 'planifiee', NULL),
  -- Henri (mer — contrat terminé, pas de séance future ni cette semaine)
  (gen_random_uuid(), v_p3, v_demo_id, v_c3, v_lundi - 26,     '14:00', '14:45', 45, 'seance', 'realisee', 'Renforcement et marche, bonne tolérance.'),
  (v_p3_seance_recente, v_p3, v_demo_id, v_c3, v_lundi - 19,   '14:00', '14:45', 45, 'seance', 'realisee', 'Dernière séance du programme, objectifs atteints.'),
  -- Jacqueline (lun)
  (gen_random_uuid(), v_p4, v_demo_id, v_c4, v_lundi - 7,      '11:00', '11:45', 45, 'seance', 'realisee', 'Première séance, bonne tolérance au vélo assis.'),
  (gen_random_uuid(), v_p4, v_demo_id, v_c4, v_lundi + 0,      '11:00', '11:45', 45, 'seance',
    CASE WHEN v_lundi + 0 < CURRENT_DATE THEN 'realisee' ELSE 'planifiee' END,
    CASE WHEN v_lundi + 0 < CURRENT_DATE THEN 'Séance du lundi, tolérance correcte.' ELSE NULL END),
  (gen_random_uuid(), v_p4, v_demo_id, v_c4, v_lundi + 7,      '11:00', '11:45', 45, 'seance', 'planifiee', NULL),
  -- Marie-Thérèse (mar, jeu)
  (gen_random_uuid(), v_p5, v_demo_id, v_c5, v_lundi - 13,     '10:30', '11:00', 30, 'seance', 'realisee', 'Transferts sécurisés, bonne participation.'),
  (gen_random_uuid(), v_p5, v_demo_id, v_c5, v_lundi - 4,      '10:30', '11:00', 30, 'seance', 'realisee', 'Séance en salle commune, bonne humeur.'),
  (gen_random_uuid(), v_p5, v_demo_id, v_c5, v_lundi + 1,      '10:30', '11:00', 30, 'seance',
    CASE WHEN v_lundi + 1 < CURRENT_DATE THEN 'realisee' ELSE 'planifiee' END,
    CASE WHEN v_lundi + 1 < CURRENT_DATE THEN 'Séance du mardi, bonne participation.' ELSE NULL END),
  (gen_random_uuid(), v_p5, v_demo_id, v_c5, v_lundi + 3,      '10:30', '11:00', 30, 'seance',
    CASE WHEN v_lundi + 3 < CURRENT_DATE THEN 'realisee' ELSE 'planifiee' END,
    CASE WHEN v_lundi + 3 < CURRENT_DATE THEN 'Séance du jeudi, bonne humeur.' ELSE NULL END),
  (gen_random_uuid(), v_p5, v_demo_id, v_c5, v_lundi + 8,      '10:30', '11:00', 30, 'seance', 'planifiee', NULL),
  -- André (lun, mer)
  (gen_random_uuid(), v_p6, v_demo_id, v_c6, v_lundi - 14,     '08:30', '09:15', 45, 'seance', 'realisee', 'Marche rapide bien tolérée.'),
  (v_p6_seance_recente, v_p6, v_demo_id, v_c6, v_lundi - 5,    '08:30', '09:15', 45, 'seance', 'realisee', 'Bonne endurance sur le vélo d''appartement.'),
  (gen_random_uuid(), v_p6, v_demo_id, v_c6, v_lundi + 0,      '08:30', '09:15', 45, 'seance',
    CASE WHEN v_lundi + 0 < CURRENT_DATE THEN 'realisee' ELSE 'planifiee' END,
    CASE WHEN v_lundi + 0 < CURRENT_DATE THEN 'Séance du lundi, marche rapide.' ELSE NULL END),
  (gen_random_uuid(), v_p6, v_demo_id, v_c6, v_lundi + 2,      '08:30', '09:15', 45, 'seance',
    CASE WHEN v_lundi + 2 < CURRENT_DATE THEN 'realisee' ELSE 'planifiee' END,
    CASE WHEN v_lundi + 2 < CURRENT_DATE THEN 'Séance du mercredi, bon reconditionnement.' ELSE NULL END),
  (gen_random_uuid(), v_p6, v_demo_id, v_c6, v_lundi + 7,      '08:30', '09:15', 45, 'seance', 'planifiee', NULL),
  -- Colette (ven)
  (gen_random_uuid(), v_p7, v_demo_id, v_c7, v_lundi - 17,     '15:00', '15:45', 45, 'seance', 'realisee', 'Séance calme, amplitude correcte.'),
  (gen_random_uuid(), v_p7, v_demo_id, v_c7, v_lundi - 10,     '15:00', '15:45', 45, 'seance', 'realisee', 'Travail d''amplitude, léger freezing en fin de séance.'),
  (gen_random_uuid(), v_p7, v_demo_id, v_c7, v_lundi - 3,      '15:00', '15:45', 45, 'seance', 'realisee', 'Bonne séance, coordination en progrès.'),
  (gen_random_uuid(), v_p7, v_demo_id, v_c7, v_lundi + 4,      '15:00', '15:45', 45, 'seance',
    CASE WHEN v_lundi + 4 < CURRENT_DATE THEN 'realisee' ELSE 'planifiee' END,
    CASE WHEN v_lundi + 4 < CURRENT_DATE THEN 'Séance du vendredi, coordination en progrès.' ELSE NULL END),
  (gen_random_uuid(), v_p7, v_demo_id, v_c7, v_lundi + 11,     '15:00', '15:45', 45, 'seance', 'planifiee', NULL),
  -- Bernard (mar)
  (gen_random_uuid(), v_p8, v_demo_id, v_c8, v_lundi - 13,     '09:30', '10:15', 45, 'seance', 'realisee', 'Marche avec contrôle respiratoire, bonne tolérance.'),
  (v_p8_seance_recente, v_p8, v_demo_id, v_c8, v_lundi - 6,    '09:30', '10:15', 45, 'seance', 'realisee', 'Légère désaturation en fin d''effort, surveillée.'),
  (gen_random_uuid(), v_p8, v_demo_id, v_c8, v_lundi + 1,      '09:30', '10:15', 45, 'seance',
    CASE WHEN v_lundi + 1 < CURRENT_DATE THEN 'realisee' ELSE 'planifiee' END,
    CASE WHEN v_lundi + 1 < CURRENT_DATE THEN 'Séance du mardi, désaturation surveillée.' ELSE NULL END),
  (gen_random_uuid(), v_p8, v_demo_id, v_c8, v_lundi + 8,      '09:30', '10:15', 45, 'seance', 'planifiee', NULL),
  -- Yvonne (mer — suspendue, pas de séance future ni cette semaine)
  (gen_random_uuid(), v_p9, v_demo_id, v_c9, v_lundi - 40,     '10:00', '10:30', 30, 'seance', 'realisee', 'Transferts sécurisés avant hospitalisation.'),
  (gen_random_uuid(), v_p9, v_demo_id, v_c9, v_lundi - 33,     '10:00', '10:30', 30, 'seance', 'realisee', 'Dernière séance avant la pause.');
  -- Paul : contrat à venir, aucune séance encore

  -- ==========================================================================
  -- 10. Retours post-séance (Borg + bien-être, auto-déclarés) — 5 séances
  --
  --     seance_id volontairement NULL : retours_seance.seance_id référence
  --     seances_patient(id) (20260618_retours_seance.sql:25), PAS seances(id)
  --     — v_p1_seance_recente etc. sont des id de la table seances (rendez-
  --     vous planifiés par le praticien), une table différente de
  --     seances_patient (séances autonomes suivies côté bénéficiaire).
  --     Vérifié avant de créer de fausses lignes seances_patient pour
  --     combler ce lien : aucun des deux consommateurs de retours_seance
  --     dans le code (ParticipantProfile.tsx:1073, Dashboard.tsx:263) ne lit
  --     jamais seance_id — seuls participant_id/date/borg_rpe/bien_etre sont
  --     utilisés. Le lien n'étant affiché nulle part, NULL est le choix le
  --     plus simple ET le plus honnête (colonne prévue pour "pas toujours
  --     lié à une séance précise", exactement ce cas).
  -- ==========================================================================
  INSERT INTO retours_seance (participant_id, seance_id, praticien_id, date, borg_rpe, bien_etre) VALUES
  (v_p1, NULL, v_demo_id, CURRENT_DATE - INTERVAL '7 days', 4, 2),
  (v_p2, NULL, v_demo_id, CURRENT_DATE - INTERVAL '3 days', 6, 2),
  (v_p3, NULL, v_demo_id, CURRENT_DATE - INTERVAL '17 days', 4, 1),
  (v_p6, NULL, v_demo_id, CURRENT_DATE - INTERVAL '2 days', 6, 2),
  (v_p8, NULL, v_demo_id, CURRENT_DATE - INTERVAL '4 days', 7, 3);

  -- ==========================================================================
  -- 11. Cours collectifs — 7 occurrences pour un agenda fourni :
  --     4 RÉALISÉES (présence constatée, ressenti, 2 avec note du praticien
  --     sur une absence), 3 PLANIFIÉES (dont 1 avec présence ANNONCÉE par le
  --     bénéficiaire — distincte de la présence constatée, cf.
  --     20260921_participations_cours_collectifs_presence_annoncee.sql — et 2
  --     sans réponse encore, réaliste pour des cours plus lointains). Deux
  --     thèmes en plus de la gym d'équilibre habituelle, pour montrer que le
  --     praticien peut varier les cours collectifs proposés.
  --
  --     Ancrées sur v_lundi (mercredi pour la gym récurrente, vendredi pour
  --     les deux autres thèmes), toutes en dehors de la semaine en cours
  --     (S-1 et avant, ou S+1 et après) : jamais ambiguës, pas besoin de
  --     CASE ici — contrairement aux séances individuelles de la section 9,
  --     ces 7 cours n'ont pas besoin de couvrir spécifiquement CETTE
  --     semaine (les séances individuelles couvrent déjà les 5 jours
  --     ouvrés) ; les garder hors ambiguïté évite de faire porter une
  --     présence annoncée (v_cours_id2) par un cours dont le statut
  --     changerait de sens selon le jour d'exécution.
  -- ==========================================================================
  INSERT INTO cours_collectifs (id, praticien_id, structure_id, titre, date, heure_debut, duree_minutes, mode_facturation, statut) VALUES
  (v_cours_id3, v_demo_id, v_structure_id, 'Gym d''équilibre en groupe', v_lundi - 19, '10:00', 45, 'individuel', 'realise'),
  (v_cours_id4, v_demo_id, v_structure_id, 'Gym d''équilibre en groupe', v_lundi - 12, '10:00', 45, 'individuel', 'realise'),
  (v_cours_id,  v_demo_id, v_structure_id, 'Gym d''équilibre en groupe', v_lundi - 5,  '10:00', 45, 'individuel', 'realise'),
  (v_cours_id5, v_demo_id, v_structure_id, 'Atelier mémoire collectif', v_lundi - 3,   '14:30', 45, 'individuel', 'realise'),
  (v_cours_id2, v_demo_id, v_structure_id, 'Gym d''équilibre en groupe', v_lundi + 9,  '10:00', 45, 'individuel', 'planifie'),
  (v_cours_id7, v_demo_id, v_structure_id, 'Renforcement musculaire collectif', v_lundi + 11, '11:00', 45, 'individuel', 'planifie'),
  (v_cours_id6, v_demo_id, v_structure_id, 'Gym d''équilibre en groupe', v_lundi + 16, '10:00', 45, 'individuel', 'planifie');

  -- Occurrence la plus ancienne : tout le monde présent.
  INSERT INTO participations_cours_collectifs (cours_id, participant_id, statut_presence, ressenti_borg, ressenti_bienetre, notes) VALUES
  (v_cours_id3, v_p5, 'present', 4, 2, NULL),
  (v_cours_id3, v_p6, 'present', 5, 2, NULL),
  (v_cours_id3, v_p7, 'present', 3, 1, NULL),
  (v_cours_id3, v_p4, 'present', 5, 2, NULL);

  -- Deuxième occurrence : Colette absente (grippe), note du praticien.
  INSERT INTO participations_cours_collectifs (cours_id, participant_id, statut_presence, ressenti_borg, ressenti_bienetre, notes) VALUES
  (v_cours_id4, v_p5, 'present', 4, 2, NULL),
  (v_cours_id4, v_p6, 'present', 6, 3, NULL),
  (v_cours_id4, v_p7, 'absent', NULL, NULL, 'Grippe, absente — reporté à la semaine suivante.'),
  (v_cours_id4, v_p4, 'present', 4, 1, NULL);

  -- Occurrence déjà présente avant cet ajout : Jacqueline absente, note
  -- inchangée.
  INSERT INTO participations_cours_collectifs (cours_id, participant_id, statut_presence, ressenti_borg, ressenti_bienetre, notes) VALUES
  (v_cours_id, v_p5, 'present', 4, 2, NULL),
  (v_cours_id, v_p6, 'present', 6, 2, NULL),
  (v_cours_id, v_p7, 'present', 4, 1, NULL),
  (v_cours_id, v_p4, 'absent', NULL, NULL, 'Absente : douleur au genou signalée la veille, a préféré reporter.');

  -- Atelier mémoire collectif : autre thème, autre combinaison de
  -- bénéficiaires (Simone, qui ne va jamais à la gym d'équilibre, y
  -- participe ici).
  INSERT INTO participations_cours_collectifs (cours_id, participant_id, statut_presence, ressenti_borg, ressenti_bienetre) VALUES
  (v_cours_id5, v_p5, 'present', 3, 2),
  (v_cours_id5, v_p1, 'present', 3, 2),
  (v_cours_id5, v_p7, 'present', 4, 2);

  -- Cours à venir (+2j) : présence ANNONCÉE — 'vient', 'ne_vient_pas', et un
  -- indécis (NULL) pour montrer les trois états. statut_presence reste
  -- 'present' par défaut (valeur de la colonne, non pertinente tant que le
  -- cours n'a pas eu lieu — seule l'annonce compte ici).
  INSERT INTO participations_cours_collectifs (cours_id, participant_id, presence_annoncee, presence_annoncee_le) VALUES
  (v_cours_id2, v_p5, 'vient', now() - INTERVAL '1 day'),
  (v_cours_id2, v_p6, 'vient', now() - INTERVAL '6 hours'),
  (v_cours_id2, v_p7, 'ne_vient_pas', now() - INTERVAL '2 days'),
  (v_cours_id2, v_p4, NULL, NULL);

  -- Renforcement musculaire collectif (+5j) : nouvelle combinaison de
  -- bénéficiaires, aucune réponse encore — réaliste pour un cours qui vient
  -- d'être proposé.
  INSERT INTO participations_cours_collectifs (cours_id, participant_id) VALUES
  (v_cours_id7, v_p6),
  (v_cours_id7, v_p2),
  (v_cours_id7, v_p8);

  -- Gym d'équilibre (+9j) : encore trop loin, personne n'a répondu.
  INSERT INTO participations_cours_collectifs (cours_id, participant_id) VALUES
  (v_cours_id6, v_p5),
  (v_cours_id6, v_p6),
  (v_cours_id6, v_p7),
  (v_cours_id6, v_p4);

  -- ==========================================================================
  -- 12. Vérification finale — échoue bruyamment si un compte ne correspond pas
  -- ==========================================================================
  SELECT count(*) INTO n FROM praticiens WHERE id = v_demo_id;
  IF n <> 1 THEN RAISE EXCEPTION 'Echec verification : % ligne(s) praticiens, 1 attendue', n; END IF;

  SELECT count(*) INTO n FROM structures WHERE praticien_id = v_demo_id;
  IF n <> 1 THEN RAISE EXCEPTION 'Echec verification : % structure(s), 1 attendue', n; END IF;

  SELECT count(*) INTO n FROM participants WHERE praticien_id = v_demo_id;
  IF n <> 10 THEN RAISE EXCEPTION 'Echec verification : % participant(s), 10 attendus', n; END IF;

  SELECT count(*) INTO n FROM participants WHERE praticien_id = v_demo_id AND archive = true;
  IF n <> 1 THEN RAISE EXCEPTION 'Echec verification : % beneficiaire(s) archive(s), 1 attendu (Henri)', n; END IF;

  SELECT count(*) INTO n FROM contrats WHERE praticien_id = v_demo_id;
  IF n <> 10 THEN RAISE EXCEPTION 'Echec verification : % contrat(s), 10 attendus', n; END IF;

  SELECT count(*) INTO n FROM tarifs_contrats WHERE contrat_id IN (SELECT id FROM contrats WHERE praticien_id = v_demo_id);
  IF n <> 11 THEN RAISE EXCEPTION 'Echec verification : % version(s) de tarif, 11 attendues (Simone en a 2)', n; END IF;

  SELECT count(*) INTO n FROM programmes WHERE praticien_id = v_demo_id;
  IF n <> 10 THEN RAISE EXCEPTION 'Echec verification : % programme(s), 10 attendus', n; END IF;

  SELECT count(*) INTO n FROM programme_seances WHERE programme_id IN (SELECT id FROM programmes WHERE praticien_id = v_demo_id);
  IF n <> 10 THEN RAISE EXCEPTION 'Echec verification : % programme_seances, 10 attendues', n; END IF;

  SELECT count(*) INTO n FROM programme_planning WHERE programme_id IN (SELECT id FROM programmes WHERE praticien_id = v_demo_id);
  IF n <> 18 THEN RAISE EXCEPTION 'Echec verification : % ligne(s) programme_planning, 18 attendues', n; END IF;

  SELECT count(*) INTO n FROM programme_exercices WHERE seance_id IN (
    SELECT ps.id FROM programme_seances ps JOIN programmes pr ON pr.id = ps.programme_id WHERE pr.praticien_id = v_demo_id
  );
  IF n <> 40 THEN RAISE EXCEPTION 'Echec verification : % programme_exercices, 40 attendus', n; END IF;

  SELECT count(*) INTO n FROM bilans WHERE praticien_id = v_demo_id;
  IF n <> 15 THEN RAISE EXCEPTION 'Echec verification : % bilan(s), 15 attendus', n; END IF;

  -- Les 3 modalités TM6 (Marche déjà couvert par André/Bernard/Paul).
  SELECT count(*) INTO n FROM bilans WHERE praticien_id = v_demo_id AND tm6_mode = 'stepper';
  IF n <> 1 THEN RAISE EXCEPTION 'Echec verification : % bilan(s) TM6 stepper, 1 attendu (Colette)', n; END IF;

  SELECT count(*) INTO n FROM bilans WHERE praticien_id = v_demo_id AND tm6_mode = 'marche_sur_place';
  IF n <> 1 THEN RAISE EXCEPTION 'Echec verification : % bilan(s) TM6 marche sur place, 1 attendu (Marie-Therese)', n; END IF;

  SELECT count(*) INTO n FROM bilans WHERE praticien_id = v_demo_id AND apley_data IS NOT NULL;
  IF n <> 3 THEN RAISE EXCEPTION 'Echec verification : % bilan(s) avec Apley, 3 attendus (Robert, historique complet)', n; END IF;

  SELECT count(*) INTO n FROM bilans WHERE praticien_id = v_demo_id AND tinetti_data IS NOT NULL;
  IF n <> 3 THEN RAISE EXCEPTION 'Echec verification : % bilan(s) avec Tinetti, 3 attendus (Simone, historique complet)', n; END IF;

  SELECT count(*) INTO n FROM bilans WHERE praticien_id = v_demo_id AND moca_score IS NOT NULL;
  IF n <> 1 THEN RAISE EXCEPTION 'Echec verification : % bilan(s) avec MoCA, 1 attendu (Marie-Therese)', n; END IF;

  SELECT count(*) INTO n FROM seances WHERE praticien_id = v_demo_id;
  IF n <> 37 THEN RAISE EXCEPTION 'Echec verification : % seance(s), 37 attendues', n; END IF;

  -- Chaque jour ouvré de la semaine EN COURS a au moins une séance — c'est
  -- précisément le trou signalé. Vérifié explicitement, jour par jour,
  -- plutôt que de faire confiance au calcul manuel ci-dessus.
  FOR v_jour_offset IN 0..4 LOOP
    PERFORM 1 FROM seances WHERE praticien_id = v_demo_id AND date = v_lundi + v_jour_offset LIMIT 1;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Echec verification : aucune seance le % (jour % de la semaine en cours, v_lundi=%)',
        to_char(v_lundi + v_jour_offset, 'DD/MM/YYYY'), v_jour_offset, v_lundi;
    END IF;
  END LOOP;

  SELECT count(*) INTO n FROM retours_seance WHERE praticien_id = v_demo_id;
  IF n <> 5 THEN RAISE EXCEPTION 'Echec verification : % retour(s) de seance, 5 attendus', n; END IF;

  SELECT count(*) INTO n FROM cours_collectifs WHERE praticien_id = v_demo_id;
  IF n <> 7 THEN RAISE EXCEPTION 'Echec verification : % cours collectif(s), 7 attendus (4 realises, 3 planifies)', n; END IF;

  SELECT count(*) INTO n FROM participations_cours_collectifs WHERE cours_id IN (SELECT id FROM cours_collectifs WHERE praticien_id = v_demo_id);
  IF n <> 26 THEN RAISE EXCEPTION 'Echec verification : % participation(s) aux cours collectifs, 26 attendues (4+4+4+3+4+3+4)', n; END IF;

  SELECT count(*) INTO n FROM participations_cours_collectifs
    WHERE cours_id IN (v_cours_id, v_cours_id3, v_cours_id4, v_cours_id5) AND notes IS NOT NULL;
  IF n <> 2 THEN RAISE EXCEPTION 'Echec verification : % note(s) praticien sur les cours realises, 2 attendues (Jacqueline, Colette)', n; END IF;

  SELECT count(*) INTO n FROM participations_cours_collectifs
    WHERE cours_id = v_cours_id2 AND presence_annoncee IS NOT NULL;
  IF n <> 3 THEN RAISE EXCEPTION 'Echec verification : % presence(s) annoncee(s) sur le cours planifie, 3 attendues (1 indecis)', n; END IF;

  -- Les 2 cours les plus lointains (+5j, +9j) n'ont volontairement aucune
  -- réponse — vérifie que ce n'est pas un oubli mais bien l'état attendu.
  SELECT count(*) INTO n FROM participations_cours_collectifs
    WHERE cours_id IN (v_cours_id6, v_cours_id7) AND presence_annoncee IS NOT NULL;
  IF n <> 0 THEN RAISE EXCEPTION 'Echec verification : % presence(s) annoncee(s) inattendue(s) sur les cours les plus lointains, 0 attendues', n; END IF;

  -- Re-vérification du garde-fou organisation, après coup : aucune des
  -- opérations ci-dessus n'a pu en créer un, mais on le confirme quand même.
  IF EXISTS (SELECT 1 FROM organisation_membres WHERE user_id = v_demo_id) THEN
    RAISE EXCEPTION 'Echec verification : le compte demo appartient a une organisation apres le seed — ne devrait jamais arriver.';
  END IF;

  RAISE NOTICE 'Seed demo_compte_vitrine OK : praticien %, 10 participants (1 archive), 10 contrats, 11 tarifs, 10 programmes, 15 bilans (TM6 marche/stepper/sur-place + Apley + Tinetti + MoCA), 37 seances (couverture lun-ven confirmee), 5 retours, 7 cours collectifs (26 participations, 2 notes praticien, 3 presences annoncees).', v_demo_id;
END
$seed$;

COMMIT;
