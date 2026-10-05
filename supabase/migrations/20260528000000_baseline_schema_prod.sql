-- ============================================================================
-- MIGRATION DE BASE (baseline) — schéma de PRODUCTION au 2026-10-05
-- ============================================================================
-- Pourquoi : les tables historiques (praticiens, participants, contrats,
-- seances, bilans…) ont été créées hors migrations et les 100 migrations
-- précédentes (archivées dans supabase/migrations_archive/) ne se rejouent pas
-- sur une base vierge. Ce fichier est la reconstitution EXACTE de la production,
-- obtenue par `supabase db dump --linked` (schéma public, sans données), plus
-- ce que le dump public ne couvre pas (trigger sur auth.users).
--
-- Règles propres à ce fichier :
--  * Il n'est JAMAIS rejoué en production : il y est marqué « appliqué »
--    (supabase migration repair, voir docs/SCHEMA.md). Il ne sert qu'à recréer
--    une base vierge (local, staging neuf).
--  * Il reproduit la production telle quelle, y compris ses grants par défaut.
--    La règle du 2026-08-29 (REVOKE puis GRANT ciblé) vaut pour les NOUVELLES
--    tables, pas pour cet instantané.
--  * Il n'est pas idempotent (base vierge uniquement).
--  * Le job pg_cron « rappels-patients-horaire » n'y figure pas : sa commande
--    porte l'URL Vercel et le secret du cron. Voir docs/SCHEMA.md.
-- ============================================================================




SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA "pg_catalog";






COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "public";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."acces_participant"("p_participant_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM participants p
    WHERE p.id = p_participant_id
      AND (
        p.praticien_id = auth.uid()
        OR (
          p.organisation_id IS NOT NULL
          AND public.est_membre_organisation(p.organisation_id)
        )
      )
  );
$$;


ALTER FUNCTION "public"."acces_participant"("p_participant_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."acces_participant_pour"("p_participant_id" "uuid", "p_user_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
    SELECT EXISTS (
      SELECT 1
      FROM participants p
      WHERE p.id = p_participant_id
        AND (
          p.praticien_id = p_user_id
          OR (
            p.organisation_id IS NOT NULL
            AND EXISTS (
              SELECT 1
              FROM organisation_membres m
              JOIN organisations o ON o.id = m.organisation_id
              WHERE m.organisation_id = p.organisation_id
                AND m.user_id = p_user_id
                AND m.actif
                AND o.statut = 'active'
            )
          )
        )
    );
  $$;


ALTER FUNCTION "public"."acces_participant_pour"("p_participant_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."app_role_courant"() RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT app_role FROM public.user_roles WHERE user_id = auth.uid();
$$;


ALTER FUNCTION "public"."app_role_courant"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."app_role_courant"() IS 'Rôle applicatif de l''appelant, lu sans déclencher les policies de user_roles (SECURITY DEFINER). À utiliser dans les policies des autres tables plutôt qu''une sous-requête sur user_roles, qui provoquerait une récursion RLS.';



CREATE OR REPLACE FUNCTION "public"."attribuer_role_par_defaut"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- Valeur en dur : ce chemin ne doit jamais pouvoir produire un admin.
  -- ON CONFLICT : idempotent, et sans effet si la ligne existe dÃ©jÃ .
  INSERT INTO public.user_roles (user_id, app_role)
  VALUES (NEW.id, 'praticien')
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."attribuer_role_par_defaut"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."attribuer_role_par_defaut"() IS 'Donne le rÃ´le Â« praticien Â» Ã  tout compte auth nouvellement crÃ©Ã©. Valeur en dur : ce chemin ne peut pas produire un admin. Un admin se cree uniquement par service_role.';



CREATE OR REPLACE FUNCTION "public"."audit_logs_immuable"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.participant_id IS NOT NULL
     AND NEW.participant_id IS NULL
     AND NEW.id         IS NOT DISTINCT FROM OLD.id
     AND NEW.event_type IS NOT DISTINCT FROM OLD.event_type
     AND NEW.ip         IS NOT DISTINCT FROM OLD.ip
     AND NEW.success    IS NOT DISTINCT FROM OLD.success
     AND NEW.created_at IS NOT DISTINCT FROM OLD.created_at
     AND NEW.metadata   IS NOT DISTINCT FROM OLD.metadata
  THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'audit_logs est append-only : UPDATE/DELETE interdits (voir docs/PLAN-BETA.md pour la procédure de purge RGPD délibérée)';
END;
$$;


ALTER FUNCTION "public"."audit_logs_immuable"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."dupliquer_programme_modele"("p_modele_id" "uuid", "p_participant_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
  DECLARE
    v_modele            programmes_modeles%ROWTYPE;
    v_new_programme_id  UUID;
    v_seance            programme_modele_seances%ROWTYPE;
    v_new_seance_id     UUID;
    v_exercice          programme_modele_exercices%ROWTYPE;
    v_planning          programme_modele_planning%ROWTYPE;
    v_mapped_seance_id  UUID;
    v_seance_id_map     JSONB := '{}'::jsonb;
  BEGIN
    -- (a) Le modèle doit exister ET appartenir au praticien appelant.
    SELECT * INTO v_modele
    FROM programmes_modeles
    WHERE id = p_modele_id AND praticien_id = auth.uid();

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Modèle introuvable ou accès refusé';
    END IF;

    -- (b) Le bénéficiaire cible doit être accessible à l'appelant — réutilise
    -- acces_participant() (palier 1 mode organisation), pas de check ad hoc :
    -- couvre praticien propriétaire ET membre actif de l'organisation du participant.
    IF NOT public.acces_participant(p_participant_id) THEN
      RAISE EXCEPTION 'Bénéficiaire introuvable ou accès refusé';
    END IF;

    -- 1. Créer le programme réel (praticien_id auto-rempli par le trigger existant)
    INSERT INTO programmes (
      participant_id, nom, titre, objectif, objectif_seances_autonomes,
      message_motivation, type, actif, date_creation, date_debut, exercices, suivi_semaines
    ) VALUES (
      p_participant_id, v_modele.nom, v_modele.nom, v_modele.objectif, v_modele.objectif_seances_autonomes,
      v_modele.message_motivation, v_modele.type, true, CURRENT_DATE, CURRENT_DATE, '[]'::jsonb, '[]'::jsonb
    )
    RETURNING id INTO v_new_programme_id;

    -- 2. Copier chaque séance, puis (dans la même itération) ses exercices —
    --    v_new_seance_id vient tout juste d'être produit par RETURNING, aucune
    --    ambiguïté possible avec l'ancien id de la séance modèle.
    FOR v_seance IN
      SELECT * FROM programme_modele_seances WHERE modele_id = p_modele_id ORDER BY ordre
    LOOP
      INSERT INTO programme_seances (programme_id, nom, description, ordre)
      VALUES (v_new_programme_id, v_seance.nom, v_seance.description, v_seance.ordre)
      RETURNING id INTO v_new_seance_id;

      -- Mémorisé pour le planning, traité plus loin dans une boucle séparée.
      v_seance_id_map := v_seance_id_map || jsonb_build_object(v_seance.id::text, v_new_seance_id::text);

      FOR v_exercice IN
        SELECT * FROM programme_modele_exercices WHERE seance_id = v_seance.id ORDER BY ordre
      LOOP
        INSERT INTO programme_exercices (
          seance_id, nom, categorie, description, conseil_securite,
          series, repetitions, duree_secondes, ordre
        ) VALUES (
          v_new_seance_id, v_exercice.nom, v_exercice.categorie, v_exercice.description,
          v_exercice.conseil_securite, v_exercice.series, v_exercice.repetitions,
          v_exercice.duree_secondes, v_exercice.ordre
        );
      END LOOP;
    END LOOP;

    -- 3. Copier le planning en recâblant seance_id via la correspondance construite ci-dessus.
    FOR v_planning IN
      SELECT * FROM programme_modele_planning WHERE modele_id = p_modele_id
    LOOP
      v_mapped_seance_id := (v_seance_id_map ->> v_planning.seance_id::text)::uuid;

      IF v_mapped_seance_id IS NULL THEN
        RAISE EXCEPTION 'Incohérence de données : séance modèle % introuvable dans la correspondance', v_planning.seance_id;
      END IF;

      INSERT INTO programme_planning (programme_id, seance_id, jour)
      VALUES (v_new_programme_id, v_mapped_seance_id, v_planning.jour);
    END LOOP;

    RETURN v_new_programme_id;
  END;
  $$;


ALTER FUNCTION "public"."dupliquer_programme_modele"("p_modele_id" "uuid", "p_participant_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."est_admin_organisation"("p_organisation_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
    SELECT EXISTS (
      SELECT 1
      FROM organisation_membres m
      JOIN organisations o ON o.id = m.organisation_id
      WHERE m.organisation_id = p_organisation_id
        AND m.user_id = auth.uid()
        AND m.role = 'admin'
        AND m.actif
        AND o.statut = 'active'
    );
  $$;


ALTER FUNCTION "public"."est_admin_organisation"("p_organisation_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."est_cours_du_praticien"("p_cours_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.cours_collectifs c
    WHERE c.id = p_cours_id
      AND c.praticien_id = auth.uid()
  );
$$;


ALTER FUNCTION "public"."est_cours_du_praticien"("p_cours_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."est_membre_organisation"("p_organisation_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
    SELECT EXISTS (
      SELECT 1
      FROM organisation_membres m
      JOIN organisations o ON o.id = m.organisation_id
      WHERE m.organisation_id = p_organisation_id
        AND m.user_id = auth.uid()
        AND m.actif
        AND o.statut = 'active'
    );
  $$;


ALTER FUNCTION "public"."est_membre_organisation"("p_organisation_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."exiger_consentement_rgpd_creation"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
  BEGIN
    -- Seul le booléen JSON true vaut consentement.
    IF NEW.rgpd IS NOT NULL AND jsonb_typeof(NEW.rgpd -> 'consentementObtenu') = 'boolean'
       AND (NEW.rgpd ->> 'consentementObtenu')::boolean THEN
      RETURN NEW;
    END IF;

    -- Upsert d'une fiche existante : modification, pas création.
    IF EXISTS (SELECT 1 FROM public.participants p WHERE p.id = NEW.id) THEN
      RETURN NEW;
    END IF;

    RAISE EXCEPTION 'Consentement RGPD requis pour créer un bénéficiaire (rgpd.consentementObtenu doit valoir true)'
      USING ERRCODE = 'check_violation';
  END;
  $$;


ALTER FUNCTION "public"."exiger_consentement_rgpd_creation"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."exiger_consentement_rgpd_creation"() IS 'Refuse la création d''un bénéficiaire sans rgpd.consentementObtenu = true. INSERT seulement : une fiche existante sans consentement reste modifiable. Voir 20260913_rgpd_consentement_creation.sql.';



CREATE OR REPLACE FUNCTION "public"."set_praticien_id_from_auth"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  BEGIN
    IF NEW.praticien_id IS NULL THEN
      NEW.praticien_id = auth.uid();
    END IF;
    RETURN NEW;
  END;
  $$;


ALTER FUNCTION "public"."set_praticien_id_from_auth"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
  BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
  END;
  $$;


ALTER FUNCTION "public"."update_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
  BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
  END;
  $$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."assistant_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "patient_id" "uuid",
    "praticien_id" "uuid",
    "question" "text",
    "reponse" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "action_type" "text"
);


ALTER TABLE "public"."assistant_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."audit_logs" (
    "id" bigint NOT NULL,
    "event_type" "text" NOT NULL,
    "participant_id" "uuid",
    "ip" "text" NOT NULL,
    "success" boolean NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "metadata" "jsonb"
);


ALTER TABLE "public"."audit_logs" OWNER TO "postgres";


ALTER TABLE "public"."audit_logs" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."audit_logs_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."bilans" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "participant_id" "uuid" NOT NULL,
    "praticien_id" "uuid",
    "date" "date" NOT NULL,
    "type" "text" NOT NULL,
    "trimestre" integer DEFAULT 0,
    "equilibre_droite" numeric,
    "equilibre_gauche" numeric,
    "chair_stand_30" integer,
    "hand_grip_droite" numeric,
    "hand_grip_gauche" numeric,
    "tug_3m" numeric,
    "souplesse_methode" "text",
    "souplesse_valeur" numeric,
    "tm6_distance_metres" numeric,
    "tm6_fc_avant" integer,
    "tm6_fc_apres" integer,
    "tm6_fc_2min" integer,
    "tm6_spo2_avant" numeric,
    "tm6_spo2_apres" numeric,
    "tm6_spo2_2min" numeric,
    "tm6_borg_rpe" numeric,
    "memoire_score_immediat" numeric,
    "memoire_score_differe" numeric,
    "memoire_dubois" "jsonb",
    "notes_professionnelles" "text" DEFAULT ''::"text",
    "objectifs_suivants" "text" DEFAULT ''::"text",
    "points_vigilance" "text" DEFAULT ''::"text",
    "message_client" "text" DEFAULT ''::"text",
    "profil_enrichi" "jsonb",
    "bilan_initial_data" "jsonb",
    "notes_bilan" "jsonb",
    "interpretation_ia" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "sedentarite_score" integer,
    "sedentarite_profil" "text",
    "sedentarite_reponses" "jsonb",
    "fatigue_score" integer,
    "fatigue_profil" "text",
    "fatigue_reponses" "jsonb",
    "tinetti_data" "jsonb",
    "tm6_duree_mode" "text",
    "tm6_duree_cible_secondes" integer,
    "tm6_duree_reelle_secondes" integer,
    "tm6_nb_pauses" integer,
    "tm6_duree_pauses_secondes" integer,
    "tm6_notes_pauses" "text",
    "tm6_pauses_detail" "jsonb",
    "tm6_mode" "text",
    "tm6_repetitions" integer,
    "tm6_mesures_par_minute" "jsonb",
    "tm6_fc_1min" integer,
    "tm6_spo2_1min" integer,
    "tm6_nb_pas" integer,
    "tm6_nb_tours" integer,
    "tm6_variante_id" "uuid",
    "douleur_eva" integer,
    "berg_data" "jsonb",
    "moca_score" integer,
    "marche10m_habituel" numeric,
    "marche10m_max" numeric,
    "adl_data" "jsonb",
    "iadl_data" "jsonb",
    "visible_beneficiaire" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "apley_data" "jsonb",
    CONSTRAINT "bilans_souplesse_methode_check" CHECK (("souplesse_methode" = ANY (ARRAY['debout'::"text", 'assis'::"text"]))),
    CONSTRAINT "bilans_type_check" CHECK (("type" = ANY (ARRAY['initial'::"text", 'trimestriel'::"text"])))
);


ALTER TABLE "public"."bilans" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."bilans_brouillons" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "participant_id" "uuid" NOT NULL,
    "praticien_id" "uuid" NOT NULL,
    "etape_actuelle" integer DEFAULT 0 NOT NULL,
    "donnees" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "completion_pct" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."bilans_brouillons" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."claude_rate_limit" (
    "id" bigint NOT NULL,
    "praticien_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE ONLY "public"."claude_rate_limit" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."claude_rate_limit" OWNER TO "postgres";


ALTER TABLE "public"."claude_rate_limit" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."claude_rate_limit_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."comptes_rendus_seances" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "participant_id" "uuid" NOT NULL,
    "praticien_id" "uuid",
    "date_seance" "date" NOT NULL,
    "duree_minutes" integer,
    "transcription_brute" "text",
    "exercices_realises" "jsonb" DEFAULT '[]'::"jsonb",
    "observations" "text" DEFAULT ''::"text",
    "douleurs_signalees" "text",
    "humeur_patient" "text",
    "progression" "text",
    "points_attention" "text",
    "prochaine_seance_notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "comptes_rendus_seances_humeur_patient_check" CHECK (("humeur_patient" = ANY (ARRAY['très bien'::"text", 'bien'::"text", 'moyen'::"text", 'fatigué'::"text"]))),
    CONSTRAINT "comptes_rendus_seances_progression_check" CHECK (("progression" = ANY (ARRAY['en progrès'::"text", 'stable'::"text", 'régression'::"text"])))
);


ALTER TABLE "public"."comptes_rendus_seances" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."contrats" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "participant_id" "uuid" NOT NULL,
    "praticien_id" "uuid",
    "date_debut" "date" NOT NULL,
    "date_fin" "date" NOT NULL,
    "jours_fixe" "text"[],
    "heure_debut" "text",
    "duree_minutes" integer,
    "statut" "text" DEFAULT 'actif'::"text",
    "notes" "text",
    "date_creation" "date" DEFAULT CURRENT_DATE,
    "nombre_seances_total" integer DEFAULT 0,
    "nombre_seances_realisees" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "duree_indeterminee" boolean DEFAULT false,
    "tarif_seance" numeric(10,2),
    "nb_seances_semaine" integer DEFAULT 2 NOT NULL,
    "durees_seances" integer[] DEFAULT '{45}'::integer[] NOT NULL,
    "exclure_tournee" boolean DEFAULT false NOT NULL,
    "periodicite" "text" DEFAULT 'semaine'::"text" NOT NULL,
    "date_reprise_prevue" "date",
    CONSTRAINT "contrats_periodicite_check" CHECK (("periodicite" = ANY (ARRAY['semaine'::"text", 'deux_semaines'::"text", 'trois_semaines'::"text"]))),
    CONSTRAINT "contrats_statut_check" CHECK (("statut" = ANY (ARRAY['actif'::"text", 'termine'::"text", 'suspendu'::"text", 'a_venir'::"text"])))
);


ALTER TABLE "public"."contrats" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cours_collectifs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "praticien_id" "uuid" NOT NULL,
    "structure_id" "uuid",
    "titre" "text" NOT NULL,
    "date" "date" NOT NULL,
    "heure_debut" "text" NOT NULL,
    "duree_minutes" integer NOT NULL,
    "programme_commun_id" "uuid",
    "mode_facturation" "text" NOT NULL,
    "statut" "text" DEFAULT 'planifie'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "cours_collectifs_mode_facturation_check" CHECK (("mode_facturation" = ANY (ARRAY['structure'::"text", 'individuel'::"text"]))),
    CONSTRAINT "cours_collectifs_statut_check" CHECK (("statut" = ANY (ARRAY['planifie'::"text", 'realise'::"text", 'annule'::"text"]))),
    CONSTRAINT "cours_collectifs_structure_requise_si_facturation_structure" CHECK ((("mode_facturation" <> 'structure'::"text") OR ("structure_id" IS NOT NULL)))
);


ALTER TABLE "public"."cours_collectifs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."documents_partages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "participant_id" "uuid",
    "structure_id" "uuid",
    "type_document" "text",
    "contenu" "text",
    "date_document" "date" DEFAULT CURRENT_DATE,
    "partage_le" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."documents_partages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."documents_patient" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "participant_id" "uuid" NOT NULL,
    "praticien_id" "uuid",
    "titre" "text" NOT NULL,
    "contenu" "text" NOT NULL,
    "type" "text" DEFAULT 'compte_rendu_famille'::"text",
    "date_creation" timestamp with time zone DEFAULT "now"(),
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."documents_patient" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."dossier_exercice_membres" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "praticien_id" "uuid" NOT NULL,
    "dossier_id" "uuid" NOT NULL,
    "exercice_ref" "text" NOT NULL,
    "type_exercice" "text" NOT NULL,
    "ordre" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "dossier_exercice_membres_type_exercice_check" CHECK (("type_exercice" = ANY (ARRAY['base'::"text", 'personnalise'::"text"])))
);


ALTER TABLE "public"."dossier_exercice_membres" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."dossiers_exercices" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "praticien_id" "uuid" NOT NULL,
    "nom" "text" NOT NULL,
    "ordre" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."dossiers_exercices" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."evenements_agenda" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "praticien_id" "uuid",
    "type" "text" NOT NULL,
    "titre" "text" NOT NULL,
    "date" "date" NOT NULL,
    "heure_debut" "text" NOT NULL,
    "heure_fin" "text" NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "nom" "text",
    "prenom" "text",
    "adresse" "text",
    "telephone" "text",
    "couleur" "text" DEFAULT '#6B7280'::"text" NOT NULL,
    CONSTRAINT "evenements_agenda_couleur_hex" CHECK (("couleur" ~ '^#[0-9A-Fa-f]{6}$'::"text")),
    CONSTRAINT "evenements_agenda_type_check" CHECK (("type" = ANY (ARRAY['indisponibilite'::"text", 'reunion_professionnelle'::"text", 'premier_contact_prospect'::"text", 'bilan'::"text", 'reunion'::"text", 'prospect'::"text", 'lieu_particulier'::"text", 'autre'::"text"])))
);


ALTER TABLE "public"."evenements_agenda" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."exercices_libres_activations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "participant_id" "uuid" NOT NULL,
    "praticien_id" "uuid",
    "exercice_id" "text" NOT NULL,
    "nom" "text" NOT NULL,
    "description" "text",
    "consigne_securite" "text",
    "categorie" "text",
    "actif" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."exercices_libres_activations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."exercices_libres_validations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "participant_id" "uuid" NOT NULL,
    "exercice_id" "text" NOT NULL,
    "date" "date" NOT NULL,
    "fait" boolean DEFAULT true NOT NULL,
    "note" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."exercices_libres_validations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."exercices_personnalises" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "praticien_id" "uuid" NOT NULL,
    "dossier_id" "uuid",
    "ordre" integer DEFAULT 0 NOT NULL,
    "nom" "text" NOT NULL,
    "categorie" "text" NOT NULL,
    "description" "text" NOT NULL,
    "consigne_securite" "text",
    "photo_url" "text",
    "video_youtube_id" "text",
    "niveaux" "jsonb" NOT NULL,
    "materiel_necessaire" "text",
    "duree_estimee_minutes" integer NOT NULL,
    "profils_compatibles" "jsonb",
    "adaptations" "jsonb",
    "position_requise" "text",
    "niveau_mobilite" "text",
    "reference" "text",
    "niveau_config" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."exercices_personnalises" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."exercices_realises" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "seance_patient_id" "uuid",
    "exercice_id" "uuid",
    "realise" boolean DEFAULT false,
    "commentaire" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."exercices_realises" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."factures_suivi" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "praticien_id" "uuid" NOT NULL,
    "participant_id" "uuid",
    "structure_id" "uuid",
    "periode_mois" integer,
    "periode_annee" integer,
    "nb_seances" integer DEFAULT 0,
    "montant_total" numeric(10,2),
    "statut" "text" DEFAULT 'a_envoyer'::"text",
    "date_echeance" "date",
    "date_envoi" "date",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "factures_suivi_periode_mois_check" CHECK ((("periode_mois" >= 1) AND ("periode_mois" <= 12))),
    CONSTRAINT "factures_suivi_statut_check" CHECK (("statut" = ANY (ARRAY['a_envoyer'::"text", 'en_retard'::"text", 'envoyee'::"text"])))
);


ALTER TABLE "public"."factures_suivi" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."indisponibilites" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "praticien_id" "uuid",
    "jour" "text" NOT NULL,
    "heure_debut" "text" NOT NULL,
    "heure_fin" "text" NOT NULL,
    "recurrente" boolean DEFAULT true,
    "label" "text"
);


ALTER TABLE "public"."indisponibilites" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notes_seances" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "seance_id" "uuid",
    "participant_id" "uuid" NOT NULL,
    "praticien_id" "uuid",
    "date" "date" NOT NULL,
    "heure_debut" "text",
    "ressenti" "text",
    "note" "text" DEFAULT ''::"text",
    "alertes" "jsonb",
    "douleur_eva" numeric,
    "fc_fin" integer,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."notes_seances" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."organisation_demande_attempts" (
    "id" bigint NOT NULL,
    "ip" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."organisation_demande_attempts" OWNER TO "postgres";


ALTER TABLE "public"."organisation_demande_attempts" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."organisation_demande_attempts_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."organisation_invitations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organisation_id" "uuid" NOT NULL,
    "code" "text" NOT NULL,
    "email_invite" "text",
    "role" "text" NOT NULL,
    "cree_par" "uuid",
    "utilisee_le" timestamp with time zone,
    "utilisee_par" "uuid",
    "expire_le" timestamp with time zone DEFAULT ("now"() + '30 days'::interval) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "organisation_invitations_role_check" CHECK (("role" = ANY (ARRAY['intervenant'::"text", 'admin'::"text"])))
);


ALTER TABLE "public"."organisation_invitations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."organisation_membres" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organisation_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "text" NOT NULL,
    "actif" boolean DEFAULT true NOT NULL,
    "date_debut" "date" DEFAULT CURRENT_DATE NOT NULL,
    "date_fin" "date",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "organisation_membres_role_check" CHECK (("role" = ANY (ARRAY['intervenant'::"text", 'admin'::"text"])))
);


ALTER TABLE "public"."organisation_membres" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."organisations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nom" "text" NOT NULL,
    "siret" "text",
    "email_contact" "text",
    "actif" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "statut" "text" DEFAULT 'en_attente'::"text" NOT NULL,
    "demandeur_nom" "text",
    CONSTRAINT "organisations_statut_check" CHECK (("statut" = ANY (ARRAY['en_attente'::"text", 'active'::"text", 'refusee'::"text"])))
);


ALTER TABLE "public"."organisations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."participants" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "praticien_id" "uuid",
    "nom" "text" NOT NULL,
    "prenom" "text" NOT NULL,
    "date_naissance" "date",
    "date_creation" "date" DEFAULT CURRENT_DATE,
    "email" "text",
    "telephone" "text",
    "pathologie" "text",
    "profil" "text",
    "tags" "text"[],
    "tests_actifs" "text"[],
    "contexte_clinic" "text",
    "profil_handicap" "text",
    "taille" numeric(5,1),
    "poids" numeric(5,1),
    "ville_naissance" "text",
    "code_postal_naissance" "text",
    "cp_naissance" "text",
    "medecin_traitant" "text",
    "adresse_rue" "text",
    "adresse_code_postal" "text",
    "adresse_ville" "text",
    "coordonnees_lat" numeric(10,7),
    "coordonnees_lng" numeric(10,7),
    "mode_deplacement" "text",
    "mode_deplacement_detail" "text",
    "antecedents_medicaux" "text",
    "antecedents_chirurgicaux" "text",
    "allergies" "text",
    "activites_souhaitees" "text"[],
    "objectifs_patient" "jsonb",
    "iban" "text",
    "bic" "text",
    "droit_image" boolean DEFAULT false,
    "rgpd" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "structure_id" "uuid",
    "antecedents_structures" "jsonb" DEFAULT '[]'::"jsonb",
    "traitements" "jsonb" DEFAULT '[]'::"jsonb",
    "anamnese" "jsonb",
    "nom_naissance" "text",
    "code_acces" "text",
    "visibilite_beneficiaire" "jsonb" DEFAULT '{"rdv": true, "bilans": true, "programme": true, "carteSante": true, "progression": true, "messagePierre": true, "messagePraticien": true}'::"jsonb" NOT NULL,
    "message_beneficiaire" "text",
    "organisation_id" "uuid",
    "code_portail" "text",
    "personne_contact" "text",
    "archive" boolean DEFAULT false NOT NULL,
    "date_archivage" "date",
    CONSTRAINT "participants_orga_ou_portail" CHECK ((("organisation_id" IS NULL) OR ("structure_id" IS NULL)))
);


ALTER TABLE "public"."participants" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."participations_cours_collectifs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "cours_id" "uuid" NOT NULL,
    "participant_id" "uuid" NOT NULL,
    "statut_presence" "text" DEFAULT 'present'::"text" NOT NULL,
    "programme_individuel_id" "uuid",
    "ressenti_borg" smallint,
    "ressenti_bienetre" smallint,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "notes" "text",
    "presence_annoncee" "text",
    "presence_annoncee_le" timestamp with time zone,
    CONSTRAINT "participations_cours_collectifs_ressenti_bienetre_check" CHECK ((("ressenti_bienetre" >= 1) AND ("ressenti_bienetre" <= 5))),
    CONSTRAINT "participations_cours_collectifs_ressenti_borg_check" CHECK ((("ressenti_borg" >= 1) AND ("ressenti_borg" <= 10))),
    CONSTRAINT "participations_cours_collectifs_statut_presence_check" CHECK (("statut_presence" = ANY (ARRAY['present'::"text", 'absent'::"text", 'excuse'::"text"]))),
    CONSTRAINT "participations_cours_presence_annoncee_coherente" CHECK ((("presence_annoncee" IS NULL) = ("presence_annoncee_le" IS NULL))),
    CONSTRAINT "participations_cours_presence_annoncee_valeurs" CHECK (("presence_annoncee" = ANY (ARRAY['vient'::"text", 'ne_vient_pas'::"text"])))
);


ALTER TABLE "public"."participations_cours_collectifs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."patient_activite_rate_limit" (
    "id" bigint NOT NULL,
    "participant_id" "uuid" NOT NULL,
    "type" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."patient_activite_rate_limit" OWNER TO "postgres";


ALTER TABLE "public"."patient_activite_rate_limit" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."patient_activite_rate_limit_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."patient_login_attempts" (
    "id" bigint NOT NULL,
    "ip" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."patient_login_attempts" OWNER TO "postgres";


ALTER TABLE "public"."patient_login_attempts" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."patient_login_attempts_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."praticien_push_subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "praticien_id" "uuid" NOT NULL,
    "endpoint" "text" NOT NULL,
    "p256dh" "text" NOT NULL,
    "auth_key" "text" NOT NULL,
    "user_agent" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."praticien_push_subscriptions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."praticiens" (
    "id" "uuid" NOT NULL,
    "nom" "text",
    "prenom" "text",
    "email" "text",
    "telephone" "text",
    "adresse" "text",
    "siret" "text",
    "logo_url" "text",
    "couleur_theme" "text" DEFAULT '#3B6D11'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "titre" "text",
    "adresse_rue" "text",
    "adresse_code_postal" "text",
    "adresse_ville" "text",
    "numero_sap" "text",
    "numero_tva" "text",
    "ville_signature" "text",
    "societe" "text",
    "logo_praticien" "text",
    "tarif_horaire" "text" DEFAULT '45'::"text",
    "frais_km_defaut" "text" DEFAULT '0.50'::"text",
    "token_planning_ics" "text"
);


ALTER TABLE "public"."praticiens" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."programme_exercices" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "seance_id" "uuid" NOT NULL,
    "nom" "text" NOT NULL,
    "categorie" "text",
    "description" "text",
    "conseil_securite" "text",
    "series" integer,
    "repetitions" integer,
    "duree_secondes" integer,
    "ordre" integer DEFAULT 1,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."programme_exercices" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."programme_modele_exercices" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "seance_id" "uuid" NOT NULL,
    "nom" "text" NOT NULL,
    "categorie" "text",
    "description" "text",
    "conseil_securite" "text",
    "series" integer,
    "repetitions" integer,
    "duree_secondes" integer,
    "ordre" integer DEFAULT 1,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."programme_modele_exercices" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."programme_modele_planning" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "modele_id" "uuid" NOT NULL,
    "seance_id" "uuid" NOT NULL,
    "jour" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "programme_modele_planning_jour_check" CHECK (("jour" = ANY (ARRAY['lundi'::"text", 'mardi'::"text", 'mercredi'::"text", 'jeudi'::"text", 'vendredi'::"text", 'samedi'::"text", 'dimanche'::"text"])))
);


ALTER TABLE "public"."programme_modele_planning" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."programme_modele_seances" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "modele_id" "uuid" NOT NULL,
    "nom" "text" NOT NULL,
    "description" "text",
    "ordre" integer DEFAULT 1,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."programme_modele_seances" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."programme_planning" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "programme_id" "uuid" NOT NULL,
    "seance_id" "uuid" NOT NULL,
    "jour" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "programme_planning_jour_check" CHECK (("jour" = ANY (ARRAY['lundi'::"text", 'mardi'::"text", 'mercredi'::"text", 'jeudi'::"text", 'vendredi'::"text", 'samedi'::"text", 'dimanche'::"text"])))
);


ALTER TABLE "public"."programme_planning" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."programme_seances" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "programme_id" "uuid" NOT NULL,
    "nom" "text" NOT NULL,
    "description" "text",
    "ordre" integer DEFAULT 1,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."programme_seances" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."programmes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "participant_id" "uuid" NOT NULL,
    "praticien_id" "uuid",
    "date_creation" "date" DEFAULT CURRENT_DATE,
    "date_debut" "date" NOT NULL,
    "date_fin" "date",
    "titre" "text" NOT NULL,
    "objectif" "text" DEFAULT ''::"text",
    "message_motivation" "text" DEFAULT ''::"text",
    "exercices" "jsonb" DEFAULT '[]'::"jsonb",
    "actif" boolean DEFAULT true,
    "suivi_semaines" "jsonb" DEFAULT '[]'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "nom" "text",
    "type" "text",
    "objectif_seances_autonomes" integer,
    CONSTRAINT "programmes_objectif_seances_autonomes_check" CHECK ((("objectif_seances_autonomes" IS NULL) OR ("objectif_seances_autonomes" > 0)))
);


ALTER TABLE "public"."programmes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."programmes_modeles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "praticien_id" "uuid" NOT NULL,
    "nom" "text" NOT NULL,
    "type" "text",
    "objectif" "text" DEFAULT ''::"text",
    "objectif_seances_autonomes" integer,
    "message_motivation" "text" DEFAULT ''::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "programmes_modeles_objectif_seances_autonomes_check" CHECK ((("objectif_seances_autonomes" IS NULL) OR ("objectif_seances_autonomes" > 0))),
    CONSTRAINT "programmes_modeles_type_check" CHECK (("type" = ANY (ARRAY['seance'::"text", 'domicile'::"text", 'quotidien'::"text", 'recuperation'::"text"])))
);


ALTER TABLE "public"."programmes_modeles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."push_subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "participant_id" "uuid" NOT NULL,
    "endpoint" "text" NOT NULL,
    "p256dh" "text" NOT NULL,
    "auth_key" "text" NOT NULL,
    "user_agent" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."push_subscriptions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rappel_preferences" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "praticien_id" "uuid",
    "participant_id" "uuid",
    "rappel_seance_actif" boolean DEFAULT true NOT NULL,
    "rappel_seance_delai_heures" integer DEFAULT 2 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "rappel_jour_seance_actif" boolean DEFAULT true NOT NULL,
    "rappel_jour_seance_heure" time without time zone DEFAULT '19:00:00'::time without time zone NOT NULL,
    CONSTRAINT "rappel_preferences_rappel_seance_delai_heures_check" CHECK ((("rappel_seance_delai_heures" >= 1) AND ("rappel_seance_delai_heures" <= 48)))
);


ALTER TABLE "public"."rappel_preferences" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rappels_envoyes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "participant_id" "uuid" NOT NULL,
    "type" "text" NOT NULL,
    "reference_id" "uuid",
    "envoye_le" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "rappels_envoyes_type_check" CHECK (("type" = ANY (ARRAY['rappel_seance'::"text", 'relance_exercices'::"text", 'rappel_jour_seance'::"text"])))
);


ALTER TABLE "public"."rappels_envoyes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."retours_seance" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "participant_id" "uuid" NOT NULL,
    "seance_id" "uuid",
    "praticien_id" "uuid",
    "date" "date" NOT NULL,
    "borg_rpe" smallint NOT NULL,
    "bien_etre" smallint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "retours_seance_bien_etre_check" CHECK ((("bien_etre" >= 1) AND ("bien_etre" <= 5))),
    CONSTRAINT "retours_seance_borg_rpe_check" CHECK ((("borg_rpe" >= 1) AND ("borg_rpe" <= 10)))
);


ALTER TABLE "public"."retours_seance" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."seances" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "participant_id" "uuid" NOT NULL,
    "praticien_id" "uuid",
    "contrat_id" "uuid",
    "date" "date" NOT NULL,
    "heure_debut" "text" NOT NULL,
    "heure_fin" "text" NOT NULL,
    "duree_minutes" integer,
    "type" "text" NOT NULL,
    "statut" "text" NOT NULL,
    "notes" "text",
    "adresse" "text" DEFAULT ''::"text",
    "coordonnees" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "motif_annulation" "text",
    "motif_annulation_detail" "text",
    "absence_signalee_par_patient_le" timestamp with time zone,
    CONSTRAINT "seances_motif_annulation_check" CHECK (("motif_annulation" = ANY (ARRAY['maladie'::"text", 'vacances'::"text", 'rdv_medical'::"text", 'indisponibilite_personnelle'::"text", 'transport'::"text", 'meteo'::"text", 'hospitalisation'::"text", 'autre'::"text"]))),
    CONSTRAINT "seances_statut_check" CHECK (("statut" = ANY (ARRAY['planifiee'::"text", 'realisee'::"text", 'annulee'::"text", 'reportee'::"text"]))),
    CONSTRAINT "seances_type_check" CHECK (("type" = ANY (ARRAY['seance'::"text", 'bilan'::"text", 'bilan_initial'::"text"])))
);


ALTER TABLE "public"."seances" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."seances_patient" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "participant_id" "uuid",
    "programme_id" "uuid",
    "seance_id" "uuid",
    "date_seance" "date" DEFAULT CURRENT_DATE,
    "statut" "text" DEFAULT 'en_cours'::"text",
    "commentaire_patient" "text",
    "duree_minutes" integer,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "seances_patient_statut_check" CHECK (("statut" = ANY (ARRAY['en_cours'::"text", 'terminee'::"text", 'partielle'::"text"])))
);


ALTER TABLE "public"."seances_patient" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."structure_access_logs" (
    "id" bigint NOT NULL,
    "structure_id" "uuid" NOT NULL,
    "ip" "text" NOT NULL,
    "accessed_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."structure_access_logs" OWNER TO "postgres";


ALTER TABLE "public"."structure_access_logs" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."structure_access_logs_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."structures" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "praticien_id" "uuid" NOT NULL,
    "nom" "text" NOT NULL,
    "type" "text",
    "adresse" "text",
    "contact_nom" "text",
    "contact_email" "text" NOT NULL,
    "contact_telephone" "text",
    "token_acces" "text",
    "tarif_seance" numeric(10,2) DEFAULT 45,
    "frequence_facturation" "text" DEFAULT 'mensuelle'::"text",
    "actif" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "expires_at" timestamp with time zone,
    CONSTRAINT "structures_frequence_facturation_check" CHECK (("frequence_facturation" = ANY (ARRAY['mensuelle'::"text", 'bimensuelle'::"text", 'a_la_seance'::"text"]))),
    CONSTRAINT "structures_type_check" CHECK (("type" = ANY (ARRAY['ehpad'::"text", 'centre'::"text", 'association'::"text", 'entreprise'::"text", 'autre'::"text"])))
);


ALTER TABLE "public"."structures" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tarifs_contrats" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "contrat_id" "uuid" NOT NULL,
    "tarif_seance" numeric(10,2) NOT NULL,
    "frais_deplacement" numeric(10,2) DEFAULT 0 NOT NULL,
    "date_debut_validite" "date" NOT NULL,
    "date_fin_validite" "date",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "tarifs_contrats_periode_valide" CHECK ((("date_fin_validite" IS NULL) OR ("date_fin_validite" >= "date_debut_validite")))
);


ALTER TABLE "public"."tarifs_contrats" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."templates_structure" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "praticien_id" "uuid" NOT NULL,
    "structure_id" "uuid",
    "nom" "text" NOT NULL,
    "contenu_texte" "text" NOT NULL,
    "format_origine" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."templates_structure" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tests_etalons_activations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "participant_id" "uuid" NOT NULL,
    "test_id" "text" NOT NULL,
    "praticien_id" "uuid",
    "actif" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."tests_etalons_activations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tests_etalons_resultats" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "participant_id" "uuid" NOT NULL,
    "test_id" "text" NOT NULL,
    "valeur" integer NOT NULL,
    "date_test" "date" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "tests_etalons_resultats_valeur_check" CHECK (("valeur" >= 0))
);


ALTER TABLE "public"."tests_etalons_resultats" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tm6_variantes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nom" "text" NOT NULL,
    "distance_ref" numeric,
    "type_mesure" "text" DEFAULT 'distance'::"text" NOT NULL,
    "intervalles" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "praticien_id" "uuid"
);


ALTER TABLE "public"."tm6_variantes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_roles" (
    "user_id" "uuid" NOT NULL,
    "app_role" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "user_roles_app_role_check" CHECK (("app_role" = ANY (ARRAY['admin'::"text", 'praticien'::"text"])))
);


ALTER TABLE "public"."user_roles" OWNER TO "postgres";


COMMENT ON TABLE "public"."user_roles" IS 'Rôle applicatif par compte (admin | praticien). Aucune policy d''écriture : modifiable uniquement par service_role. Ne pas remplacer par une colonne sur praticiens — un praticien peut mettre à jour sa propre ligne et se promouvrait.';



CREATE TABLE IF NOT EXISTS "public"."zones_geographiques" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "praticien_id" "uuid",
    "nom" "text" NOT NULL,
    "couleur" "text" DEFAULT '#1A5F9E'::"text",
    "participant_ids" "uuid"[] DEFAULT '{}'::"uuid"[],
    "centroide_lat" numeric(10,7),
    "centroide_lng" numeric(10,7),
    "jours_assignes" "text"[] DEFAULT '{}'::"text"[],
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."zones_geographiques" OWNER TO "postgres";


ALTER TABLE ONLY "public"."assistant_logs"
    ADD CONSTRAINT "assistant_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."bilans_brouillons"
    ADD CONSTRAINT "bilans_brouillons_participant_id_praticien_id_key" UNIQUE ("participant_id", "praticien_id");



ALTER TABLE ONLY "public"."bilans_brouillons"
    ADD CONSTRAINT "bilans_brouillons_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."bilans"
    ADD CONSTRAINT "bilans_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."claude_rate_limit"
    ADD CONSTRAINT "claude_rate_limit_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."comptes_rendus_seances"
    ADD CONSTRAINT "comptes_rendus_seances_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."contrats"
    ADD CONSTRAINT "contrats_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cours_collectifs"
    ADD CONSTRAINT "cours_collectifs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."documents_partages"
    ADD CONSTRAINT "documents_partages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."documents_patient"
    ADD CONSTRAINT "documents_patient_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."dossier_exercice_membres"
    ADD CONSTRAINT "dossier_exercice_membres_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."dossier_exercice_membres"
    ADD CONSTRAINT "dossier_exercice_membres_praticien_id_dossier_id_type_exerc_key" UNIQUE ("praticien_id", "dossier_id", "type_exercice", "exercice_ref");



ALTER TABLE ONLY "public"."dossiers_exercices"
    ADD CONSTRAINT "dossiers_exercices_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."evenements_agenda"
    ADD CONSTRAINT "evenements_agenda_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."exercices_libres_activations"
    ADD CONSTRAINT "exercices_libres_activations_participant_id_exercice_id_key" UNIQUE ("participant_id", "exercice_id");



ALTER TABLE ONLY "public"."exercices_libres_activations"
    ADD CONSTRAINT "exercices_libres_activations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."exercices_libres_validations"
    ADD CONSTRAINT "exercices_libres_validations_participant_id_exercice_id_dat_key" UNIQUE ("participant_id", "exercice_id", "date");



ALTER TABLE ONLY "public"."exercices_libres_validations"
    ADD CONSTRAINT "exercices_libres_validations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."exercices_personnalises"
    ADD CONSTRAINT "exercices_personnalises_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."exercices_realises"
    ADD CONSTRAINT "exercices_realises_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."factures_suivi"
    ADD CONSTRAINT "factures_suivi_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."indisponibilites"
    ADD CONSTRAINT "indisponibilites_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notes_seances"
    ADD CONSTRAINT "notes_seances_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organisation_demande_attempts"
    ADD CONSTRAINT "organisation_demande_attempts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organisation_invitations"
    ADD CONSTRAINT "organisation_invitations_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."organisation_invitations"
    ADD CONSTRAINT "organisation_invitations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organisation_membres"
    ADD CONSTRAINT "organisation_membres_organisation_id_user_id_key" UNIQUE ("organisation_id", "user_id");



ALTER TABLE ONLY "public"."organisation_membres"
    ADD CONSTRAINT "organisation_membres_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organisations"
    ADD CONSTRAINT "organisations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."participants"
    ADD CONSTRAINT "participants_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."participations_cours_collectifs"
    ADD CONSTRAINT "participations_cours_collectifs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."participations_cours_collectifs"
    ADD CONSTRAINT "participations_cours_collectifs_unique_participant" UNIQUE ("cours_id", "participant_id");



ALTER TABLE ONLY "public"."patient_activite_rate_limit"
    ADD CONSTRAINT "patient_activite_rate_limit_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."patient_login_attempts"
    ADD CONSTRAINT "patient_login_attempts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."praticien_push_subscriptions"
    ADD CONSTRAINT "praticien_push_subscriptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."praticien_push_subscriptions"
    ADD CONSTRAINT "praticien_push_subscriptions_praticien_id_endpoint_key" UNIQUE ("praticien_id", "endpoint");



ALTER TABLE ONLY "public"."praticiens"
    ADD CONSTRAINT "praticiens_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."praticiens"
    ADD CONSTRAINT "praticiens_token_planning_ics_key" UNIQUE ("token_planning_ics");



ALTER TABLE ONLY "public"."programme_exercices"
    ADD CONSTRAINT "programme_exercices_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."programme_modele_exercices"
    ADD CONSTRAINT "programme_modele_exercices_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."programme_modele_planning"
    ADD CONSTRAINT "programme_modele_planning_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."programme_modele_seances"
    ADD CONSTRAINT "programme_modele_seances_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."programme_planning"
    ADD CONSTRAINT "programme_planning_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."programme_seances"
    ADD CONSTRAINT "programme_seances_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."programmes_modeles"
    ADD CONSTRAINT "programmes_modeles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."programmes"
    ADD CONSTRAINT "programmes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_participant_id_endpoint_key" UNIQUE ("participant_id", "endpoint");



ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rappel_preferences"
    ADD CONSTRAINT "rappel_preferences_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rappels_envoyes"
    ADD CONSTRAINT "rappels_envoyes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."retours_seance"
    ADD CONSTRAINT "retours_seance_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."seances_patient"
    ADD CONSTRAINT "seances_patient_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."seances"
    ADD CONSTRAINT "seances_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."structure_access_logs"
    ADD CONSTRAINT "structure_access_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."structures"
    ADD CONSTRAINT "structures_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."structures"
    ADD CONSTRAINT "structures_token_acces_key" UNIQUE ("token_acces");



ALTER TABLE ONLY "public"."tarifs_contrats"
    ADD CONSTRAINT "tarifs_contrats_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."templates_structure"
    ADD CONSTRAINT "templates_structure_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tests_etalons_activations"
    ADD CONSTRAINT "tests_etalons_activations_participant_id_test_id_key" UNIQUE ("participant_id", "test_id");



ALTER TABLE ONLY "public"."tests_etalons_activations"
    ADD CONSTRAINT "tests_etalons_activations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tests_etalons_resultats"
    ADD CONSTRAINT "tests_etalons_resultats_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tm6_variantes"
    ADD CONSTRAINT "tm6_variantes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."zones_geographiques"
    ADD CONSTRAINT "zones_geographiques_pkey" PRIMARY KEY ("id");



CREATE INDEX "cours_collectifs_date_idx" ON "public"."cours_collectifs" USING "btree" ("date");



CREATE INDEX "cours_collectifs_praticien_id_idx" ON "public"."cours_collectifs" USING "btree" ("praticien_id");



CREATE INDEX "cours_collectifs_structure_id_idx" ON "public"."cours_collectifs" USING "btree" ("structure_id");



CREATE INDEX "idx_audit_logs_event_date" ON "public"."audit_logs" USING "btree" ("event_type", "created_at");



CREATE INDEX "idx_audit_logs_participant_date" ON "public"."audit_logs" USING "btree" ("participant_id", "created_at");



CREATE INDEX "idx_claude_rate_limit_praticien_created" ON "public"."claude_rate_limit" USING "btree" ("praticien_id", "created_at");



CREATE INDEX "idx_documents_patient_created" ON "public"."documents_patient" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_documents_patient_participant" ON "public"."documents_patient" USING "btree" ("participant_id");



CREATE INDEX "idx_dossier_exercice_membres_dossier" ON "public"."dossier_exercice_membres" USING "btree" ("dossier_id");



CREATE INDEX "idx_dossier_exercice_membres_praticien" ON "public"."dossier_exercice_membres" USING "btree" ("praticien_id");



CREATE INDEX "idx_dossier_exercice_membres_ref" ON "public"."dossier_exercice_membres" USING "btree" ("type_exercice", "exercice_ref");



CREATE INDEX "idx_dossiers_exercices_praticien" ON "public"."dossiers_exercices" USING "btree" ("praticien_id");



CREATE INDEX "idx_evenements_agenda_praticien_date" ON "public"."evenements_agenda" USING "btree" ("praticien_id", "date");



CREATE INDEX "idx_exercices_personnalises_dossier" ON "public"."exercices_personnalises" USING "btree" ("dossier_id");



CREATE INDEX "idx_exercices_personnalises_praticien" ON "public"."exercices_personnalises" USING "btree" ("praticien_id");



CREATE INDEX "idx_organisation_demande_attempts_ip_created" ON "public"."organisation_demande_attempts" USING "btree" ("ip", "created_at");



CREATE INDEX "idx_organisation_invitations_organisation" ON "public"."organisation_invitations" USING "btree" ("organisation_id");



CREATE INDEX "idx_organisation_membres_user_organisation_actif" ON "public"."organisation_membres" USING "btree" ("user_id", "organisation_id") WHERE "actif";



CREATE UNIQUE INDEX "idx_participants_code_acces" ON "public"."participants" USING "btree" ("code_acces");



CREATE INDEX "idx_participants_organisation" ON "public"."participants" USING "btree" ("organisation_id");



CREATE INDEX "idx_patient_activite_rate_limit_participant_type_created" ON "public"."patient_activite_rate_limit" USING "btree" ("participant_id", "type", "created_at");



CREATE INDEX "idx_patient_login_attempts_ip_created" ON "public"."patient_login_attempts" USING "btree" ("ip", "created_at");



CREATE INDEX "idx_praticiens_token_planning_ics" ON "public"."praticiens" USING "btree" ("token_planning_ics");



CREATE UNIQUE INDEX "idx_rappel_preferences_global" ON "public"."rappel_preferences" USING "btree" ("praticien_id") WHERE ("participant_id" IS NULL);



CREATE UNIQUE INDEX "idx_rappel_preferences_participant" ON "public"."rappel_preferences" USING "btree" ("participant_id") WHERE ("participant_id" IS NOT NULL);



CREATE INDEX "idx_rappels_envoyes_participant_type" ON "public"."rappels_envoyes" USING "btree" ("participant_id", "type", "envoye_le" DESC);



CREATE UNIQUE INDEX "idx_rappels_envoyes_seance_unique" ON "public"."rappels_envoyes" USING "btree" ("participant_id", "type", "reference_id") WHERE ("type" = 'rappel_seance'::"text");



CREATE INDEX "idx_retours_seance_participant" ON "public"."retours_seance" USING "btree" ("participant_id", "date" DESC);



CREATE INDEX "idx_structure_access_logs_structure_date" ON "public"."structure_access_logs" USING "btree" ("structure_id", "accessed_at");



CREATE INDEX "idx_structures_praticien" ON "public"."structures" USING "btree" ("praticien_id");



CREATE INDEX "idx_structures_token" ON "public"."structures" USING "btree" ("token_acces");



CREATE INDEX "idx_templates_structure_structure" ON "public"."templates_structure" USING "btree" ("structure_id");



CREATE INDEX "idx_tests_etalons_resultats_participant" ON "public"."tests_etalons_resultats" USING "btree" ("participant_id", "test_id", "date_test" DESC);



CREATE INDEX "participations_cours_collectifs_cours_id_idx" ON "public"."participations_cours_collectifs" USING "btree" ("cours_id");



CREATE INDEX "participations_cours_collectifs_participant_id_idx" ON "public"."participations_cours_collectifs" USING "btree" ("participant_id");



CREATE UNIQUE INDEX "seances_no_double_contrat_idx" ON "public"."seances" USING "btree" ("participant_id", "date", "contrat_id") WHERE ("statut" <> 'annulee'::"text");



CREATE UNIQUE INDEX "seances_patient_no_double_validation_idx" ON "public"."seances_patient" USING "btree" ("participant_id", "seance_id", "date_seance");



CREATE INDEX "tarifs_contrats_contrat_id_idx" ON "public"."tarifs_contrats" USING "btree" ("contrat_id");



CREATE UNIQUE INDEX "tarifs_contrats_une_version_active" ON "public"."tarifs_contrats" USING "btree" ("contrat_id") WHERE ("date_fin_validite" IS NULL);



CREATE OR REPLACE TRIGGER "assistant_logs_set_praticien" BEFORE INSERT ON "public"."assistant_logs" FOR EACH ROW EXECUTE FUNCTION "public"."set_praticien_id_from_auth"();



CREATE OR REPLACE TRIGGER "bilans_set_praticien" BEFORE INSERT ON "public"."bilans" FOR EACH ROW EXECUTE FUNCTION "public"."set_praticien_id_from_auth"();



CREATE OR REPLACE TRIGGER "bilans_updated_at" BEFORE UPDATE ON "public"."bilans" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "contrats_set_praticien" BEFORE INSERT ON "public"."contrats" FOR EACH ROW EXECUTE FUNCTION "public"."set_praticien_id_from_auth"();



CREATE OR REPLACE TRIGGER "contrats_updated_at" BEFORE UPDATE ON "public"."contrats" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "crs_set_praticien" BEFORE INSERT ON "public"."comptes_rendus_seances" FOR EACH ROW EXECUTE FUNCTION "public"."set_praticien_id_from_auth"();



CREATE OR REPLACE TRIGGER "crs_updated_at" BEFORE UPDATE ON "public"."comptes_rendus_seances" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "documents_patient_set_praticien" BEFORE INSERT ON "public"."documents_patient" FOR EACH ROW EXECUTE FUNCTION "public"."set_praticien_id_from_auth"();



CREATE OR REPLACE TRIGGER "evenements_agenda_set_praticien" BEFORE INSERT ON "public"."evenements_agenda" FOR EACH ROW EXECUTE FUNCTION "public"."set_praticien_id_from_auth"();



CREATE OR REPLACE TRIGGER "evenements_agenda_updated_at" BEFORE UPDATE ON "public"."evenements_agenda" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "indispos_set_praticien" BEFORE INSERT ON "public"."indisponibilites" FOR EACH ROW EXECUTE FUNCTION "public"."set_praticien_id_from_auth"();



CREATE OR REPLACE TRIGGER "notes_seances_set_praticien" BEFORE INSERT ON "public"."notes_seances" FOR EACH ROW EXECUTE FUNCTION "public"."set_praticien_id_from_auth"();



CREATE OR REPLACE TRIGGER "notes_seances_updated_at" BEFORE UPDATE ON "public"."notes_seances" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "participants_set_praticien" BEFORE INSERT ON "public"."participants" FOR EACH ROW EXECUTE FUNCTION "public"."set_praticien_id_from_auth"();



CREATE OR REPLACE TRIGGER "participants_updated_at" BEFORE UPDATE ON "public"."participants" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "praticiens_updated_at" BEFORE UPDATE ON "public"."praticiens" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "programmes_modeles_set_praticien" BEFORE INSERT ON "public"."programmes_modeles" FOR EACH ROW EXECUTE FUNCTION "public"."set_praticien_id_from_auth"();



CREATE OR REPLACE TRIGGER "programmes_modeles_updated_at" BEFORE UPDATE ON "public"."programmes_modeles" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "programmes_set_praticien" BEFORE INSERT ON "public"."programmes" FOR EACH ROW EXECUTE FUNCTION "public"."set_praticien_id_from_auth"();



CREATE OR REPLACE TRIGGER "programmes_updated_at" BEFORE UPDATE ON "public"."programmes" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "rappel_preferences_set_praticien" BEFORE INSERT ON "public"."rappel_preferences" FOR EACH ROW EXECUTE FUNCTION "public"."set_praticien_id_from_auth"();



CREATE OR REPLACE TRIGGER "rappel_preferences_updated_at" BEFORE UPDATE ON "public"."rappel_preferences" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "seances_set_praticien" BEFORE INSERT ON "public"."seances" FOR EACH ROW EXECUTE FUNCTION "public"."set_praticien_id_from_auth"();



CREATE OR REPLACE TRIGGER "seances_updated_at" BEFORE UPDATE ON "public"."seances" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "trg_audit_logs_immuable" BEFORE DELETE OR UPDATE ON "public"."audit_logs" FOR EACH ROW EXECUTE FUNCTION "public"."audit_logs_immuable"();



CREATE OR REPLACE TRIGGER "trg_participants_consentement_rgpd_creation" BEFORE INSERT ON "public"."participants" FOR EACH ROW EXECUTE FUNCTION "public"."exiger_consentement_rgpd_creation"();



CREATE OR REPLACE TRIGGER "trg_tm6_variantes_praticien_id" BEFORE INSERT ON "public"."tm6_variantes" FOR EACH ROW EXECUTE FUNCTION "public"."set_praticien_id_from_auth"();



CREATE OR REPLACE TRIGGER "zones_set_praticien" BEFORE INSERT ON "public"."zones_geographiques" FOR EACH ROW EXECUTE FUNCTION "public"."set_praticien_id_from_auth"();



CREATE OR REPLACE TRIGGER "zones_updated_at" BEFORE UPDATE ON "public"."zones_geographiques" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



ALTER TABLE ONLY "public"."assistant_logs"
    ADD CONSTRAINT "assistant_logs_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."participants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."assistant_logs"
    ADD CONSTRAINT "assistant_logs_praticien_id_fkey" FOREIGN KEY ("praticien_id") REFERENCES "public"."praticiens"("id");



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."bilans_brouillons"
    ADD CONSTRAINT "bilans_brouillons_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."bilans"
    ADD CONSTRAINT "bilans_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."bilans"
    ADD CONSTRAINT "bilans_praticien_id_fkey" FOREIGN KEY ("praticien_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."bilans"
    ADD CONSTRAINT "bilans_tm6_variante_id_fkey" FOREIGN KEY ("tm6_variante_id") REFERENCES "public"."tm6_variantes"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."comptes_rendus_seances"
    ADD CONSTRAINT "comptes_rendus_seances_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."comptes_rendus_seances"
    ADD CONSTRAINT "comptes_rendus_seances_praticien_id_fkey" FOREIGN KEY ("praticien_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."contrats"
    ADD CONSTRAINT "contrats_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."contrats"
    ADD CONSTRAINT "contrats_praticien_id_fkey" FOREIGN KEY ("praticien_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."cours_collectifs"
    ADD CONSTRAINT "cours_collectifs_praticien_id_fkey" FOREIGN KEY ("praticien_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cours_collectifs"
    ADD CONSTRAINT "cours_collectifs_programme_commun_id_fkey" FOREIGN KEY ("programme_commun_id") REFERENCES "public"."programmes_modeles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."cours_collectifs"
    ADD CONSTRAINT "cours_collectifs_structure_id_fkey" FOREIGN KEY ("structure_id") REFERENCES "public"."structures"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."documents_partages"
    ADD CONSTRAINT "documents_partages_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."documents_partages"
    ADD CONSTRAINT "documents_partages_structure_id_fkey" FOREIGN KEY ("structure_id") REFERENCES "public"."structures"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."documents_patient"
    ADD CONSTRAINT "documents_patient_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."dossier_exercice_membres"
    ADD CONSTRAINT "dossier_exercice_membres_dossier_id_fkey" FOREIGN KEY ("dossier_id") REFERENCES "public"."dossiers_exercices"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."dossier_exercice_membres"
    ADD CONSTRAINT "dossier_exercice_membres_praticien_id_fkey" FOREIGN KEY ("praticien_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."evenements_agenda"
    ADD CONSTRAINT "evenements_agenda_praticien_id_fkey" FOREIGN KEY ("praticien_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."exercices_libres_activations"
    ADD CONSTRAINT "exercices_libres_activations_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."exercices_libres_activations"
    ADD CONSTRAINT "exercices_libres_activations_praticien_id_fkey" FOREIGN KEY ("praticien_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."exercices_libres_validations"
    ADD CONSTRAINT "exercices_libres_validations_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."exercices_personnalises"
    ADD CONSTRAINT "exercices_personnalises_dossier_id_fkey" FOREIGN KEY ("dossier_id") REFERENCES "public"."dossiers_exercices"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."exercices_realises"
    ADD CONSTRAINT "exercices_realises_exercice_id_fkey" FOREIGN KEY ("exercice_id") REFERENCES "public"."programme_exercices"("id");



ALTER TABLE ONLY "public"."exercices_realises"
    ADD CONSTRAINT "exercices_realises_seance_patient_id_fkey" FOREIGN KEY ("seance_patient_id") REFERENCES "public"."seances_patient"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."factures_suivi"
    ADD CONSTRAINT "factures_suivi_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."factures_suivi"
    ADD CONSTRAINT "factures_suivi_structure_id_fkey" FOREIGN KEY ("structure_id") REFERENCES "public"."structures"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."indisponibilites"
    ADD CONSTRAINT "indisponibilites_praticien_id_fkey" FOREIGN KEY ("praticien_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notes_seances"
    ADD CONSTRAINT "notes_seances_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notes_seances"
    ADD CONSTRAINT "notes_seances_praticien_id_fkey" FOREIGN KEY ("praticien_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."notes_seances"
    ADD CONSTRAINT "notes_seances_seance_id_fkey" FOREIGN KEY ("seance_id") REFERENCES "public"."seances"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."organisation_invitations"
    ADD CONSTRAINT "organisation_invitations_cree_par_fkey" FOREIGN KEY ("cree_par") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."organisation_invitations"
    ADD CONSTRAINT "organisation_invitations_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."organisation_invitations"
    ADD CONSTRAINT "organisation_invitations_utilisee_par_fkey" FOREIGN KEY ("utilisee_par") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."organisation_membres"
    ADD CONSTRAINT "organisation_membres_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."organisation_membres"
    ADD CONSTRAINT "organisation_membres_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."participants"
    ADD CONSTRAINT "participants_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."participants"
    ADD CONSTRAINT "participants_praticien_id_fkey" FOREIGN KEY ("praticien_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."participants"
    ADD CONSTRAINT "participants_structure_id_fkey" FOREIGN KEY ("structure_id") REFERENCES "public"."structures"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."participations_cours_collectifs"
    ADD CONSTRAINT "participations_cours_collectifs_cours_id_fkey" FOREIGN KEY ("cours_id") REFERENCES "public"."cours_collectifs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."participations_cours_collectifs"
    ADD CONSTRAINT "participations_cours_collectifs_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."participations_cours_collectifs"
    ADD CONSTRAINT "participations_cours_collectifs_programme_individuel_id_fkey" FOREIGN KEY ("programme_individuel_id") REFERENCES "public"."programmes_modeles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."patient_activite_rate_limit"
    ADD CONSTRAINT "patient_activite_rate_limit_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."praticien_push_subscriptions"
    ADD CONSTRAINT "praticien_push_subscriptions_praticien_id_fkey" FOREIGN KEY ("praticien_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."praticiens"
    ADD CONSTRAINT "praticiens_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."programme_exercices"
    ADD CONSTRAINT "programme_exercices_seance_id_fkey" FOREIGN KEY ("seance_id") REFERENCES "public"."programme_seances"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."programme_modele_exercices"
    ADD CONSTRAINT "programme_modele_exercices_seance_id_fkey" FOREIGN KEY ("seance_id") REFERENCES "public"."programme_modele_seances"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."programme_modele_planning"
    ADD CONSTRAINT "programme_modele_planning_modele_id_fkey" FOREIGN KEY ("modele_id") REFERENCES "public"."programmes_modeles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."programme_modele_planning"
    ADD CONSTRAINT "programme_modele_planning_seance_id_fkey" FOREIGN KEY ("seance_id") REFERENCES "public"."programme_modele_seances"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."programme_modele_seances"
    ADD CONSTRAINT "programme_modele_seances_modele_id_fkey" FOREIGN KEY ("modele_id") REFERENCES "public"."programmes_modeles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."programme_planning"
    ADD CONSTRAINT "programme_planning_programme_id_fkey" FOREIGN KEY ("programme_id") REFERENCES "public"."programmes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."programme_planning"
    ADD CONSTRAINT "programme_planning_seance_id_fkey" FOREIGN KEY ("seance_id") REFERENCES "public"."programme_seances"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."programme_seances"
    ADD CONSTRAINT "programme_seances_programme_id_fkey" FOREIGN KEY ("programme_id") REFERENCES "public"."programmes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."programmes_modeles"
    ADD CONSTRAINT "programmes_modeles_praticien_id_fkey" FOREIGN KEY ("praticien_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."programmes"
    ADD CONSTRAINT "programmes_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."programmes"
    ADD CONSTRAINT "programmes_praticien_id_fkey" FOREIGN KEY ("praticien_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rappel_preferences"
    ADD CONSTRAINT "rappel_preferences_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rappel_preferences"
    ADD CONSTRAINT "rappel_preferences_praticien_id_fkey" FOREIGN KEY ("praticien_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rappels_envoyes"
    ADD CONSTRAINT "rappels_envoyes_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."retours_seance"
    ADD CONSTRAINT "retours_seance_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."retours_seance"
    ADD CONSTRAINT "retours_seance_praticien_id_fkey" FOREIGN KEY ("praticien_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."retours_seance"
    ADD CONSTRAINT "retours_seance_seance_id_fkey" FOREIGN KEY ("seance_id") REFERENCES "public"."seances_patient"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."seances"
    ADD CONSTRAINT "seances_contrat_id_fkey" FOREIGN KEY ("contrat_id") REFERENCES "public"."contrats"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."seances"
    ADD CONSTRAINT "seances_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."seances_patient"
    ADD CONSTRAINT "seances_patient_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."seances_patient"
    ADD CONSTRAINT "seances_patient_programme_id_fkey" FOREIGN KEY ("programme_id") REFERENCES "public"."programmes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."seances_patient"
    ADD CONSTRAINT "seances_patient_seance_id_fkey" FOREIGN KEY ("seance_id") REFERENCES "public"."programme_seances"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."seances"
    ADD CONSTRAINT "seances_praticien_id_fkey" FOREIGN KEY ("praticien_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."structure_access_logs"
    ADD CONSTRAINT "structure_access_logs_structure_id_fkey" FOREIGN KEY ("structure_id") REFERENCES "public"."structures"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tarifs_contrats"
    ADD CONSTRAINT "tarifs_contrats_contrat_id_fkey" FOREIGN KEY ("contrat_id") REFERENCES "public"."contrats"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."templates_structure"
    ADD CONSTRAINT "templates_structure_structure_id_fkey" FOREIGN KEY ("structure_id") REFERENCES "public"."structures"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tests_etalons_activations"
    ADD CONSTRAINT "tests_etalons_activations_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tests_etalons_activations"
    ADD CONSTRAINT "tests_etalons_activations_praticien_id_fkey" FOREIGN KEY ("praticien_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."tests_etalons_resultats"
    ADD CONSTRAINT "tests_etalons_resultats_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tm6_variantes"
    ADD CONSTRAINT "tm6_variantes_praticien_id_fkey" FOREIGN KEY ("praticien_id") REFERENCES "public"."praticiens"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."zones_geographiques"
    ADD CONSTRAINT "zones_geographiques_praticien_id_fkey" FOREIGN KEY ("praticien_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



CREATE POLICY "admins_ajout_organisation_membres" ON "public"."organisation_membres" FOR INSERT TO "authenticated" WITH CHECK ("public"."est_admin_organisation"("organisation_id"));



CREATE POLICY "admins_creation_organisation_invitations" ON "public"."organisation_invitations" FOR INSERT TO "authenticated" WITH CHECK ("public"."est_admin_organisation"("organisation_id"));



CREATE POLICY "admins_lecture_organisation_invitations" ON "public"."organisation_invitations" FOR SELECT TO "authenticated" USING ("public"."est_admin_organisation"("organisation_id"));



CREATE POLICY "admins_lecture_organisation_membres" ON "public"."organisation_membres" FOR SELECT TO "authenticated" USING ("public"."est_admin_organisation"("organisation_id"));



CREATE POLICY "admins_maj_organisation_membres" ON "public"."organisation_membres" FOR UPDATE TO "authenticated" USING ("public"."est_admin_organisation"("organisation_id")) WITH CHECK ("public"."est_admin_organisation"("organisation_id"));



CREATE POLICY "admins_maj_organisations" ON "public"."organisations" FOR UPDATE TO "authenticated" USING ("public"."est_admin_organisation"("id")) WITH CHECK ("public"."est_admin_organisation"("id"));



ALTER TABLE "public"."assistant_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."audit_logs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "audit_logs_praticien_lecture" ON "public"."audit_logs" FOR SELECT TO "authenticated" USING ((("participant_id" IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."participants" "p"
  WHERE (("p"."id" = "audit_logs"."participant_id") AND ("p"."praticien_id" = "auth"."uid"()))))));



ALTER TABLE "public"."bilans" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."bilans_brouillons" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "bilans_delete" ON "public"."bilans" FOR DELETE USING (("praticien_id" = "auth"."uid"()));



CREATE POLICY "bilans_insert" ON "public"."bilans" FOR INSERT WITH CHECK (("praticien_id" = "auth"."uid"()));



CREATE POLICY "bilans_select" ON "public"."bilans" FOR SELECT USING (("praticien_id" = "auth"."uid"()));



CREATE POLICY "bilans_update" ON "public"."bilans" FOR UPDATE USING (("praticien_id" = "auth"."uid"()));



ALTER TABLE "public"."claude_rate_limit" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."comptes_rendus_seances" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."contrats" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "contrats_delete" ON "public"."contrats" FOR DELETE USING (("praticien_id" = "auth"."uid"()));



CREATE POLICY "contrats_insert" ON "public"."contrats" FOR INSERT WITH CHECK (("praticien_id" = "auth"."uid"()));



CREATE POLICY "contrats_select" ON "public"."contrats" FOR SELECT USING (("praticien_id" = "auth"."uid"()));



CREATE POLICY "contrats_update" ON "public"."contrats" FOR UPDATE USING (("praticien_id" = "auth"."uid"()));



ALTER TABLE "public"."cours_collectifs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "crs_delete" ON "public"."comptes_rendus_seances" FOR DELETE USING (("praticien_id" = "auth"."uid"()));



CREATE POLICY "crs_insert" ON "public"."comptes_rendus_seances" FOR INSERT WITH CHECK (("praticien_id" = "auth"."uid"()));



CREATE POLICY "crs_select" ON "public"."comptes_rendus_seances" FOR SELECT USING (("praticien_id" = "auth"."uid"()));



CREATE POLICY "crs_update" ON "public"."comptes_rendus_seances" FOR UPDATE USING (("praticien_id" = "auth"."uid"()));



ALTER TABLE "public"."documents_partages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."documents_patient" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."dossier_exercice_membres" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."dossiers_exercices" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."evenements_agenda" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "evenements_agenda_delete" ON "public"."evenements_agenda" FOR DELETE USING (("praticien_id" = "auth"."uid"()));



CREATE POLICY "evenements_agenda_insert" ON "public"."evenements_agenda" FOR INSERT WITH CHECK (("praticien_id" = "auth"."uid"()));



CREATE POLICY "evenements_agenda_select" ON "public"."evenements_agenda" FOR SELECT USING (("praticien_id" = "auth"."uid"()));



CREATE POLICY "evenements_agenda_update" ON "public"."evenements_agenda" FOR UPDATE USING (("praticien_id" = "auth"."uid"())) WITH CHECK (("praticien_id" = "auth"."uid"()));



ALTER TABLE "public"."exercices_libres_activations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "exercices_libres_activations_praticien_all" ON "public"."exercices_libres_activations" USING (("praticien_id" = "auth"."uid"())) WITH CHECK (("praticien_id" = "auth"."uid"()));



ALTER TABLE "public"."exercices_libres_validations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "exercices_libres_validations_praticien_select" ON "public"."exercices_libres_validations" FOR SELECT USING (("participant_id" IN ( SELECT "participants"."id"
   FROM "public"."participants"
  WHERE ("participants"."praticien_id" = "auth"."uid"()))));



ALTER TABLE "public"."exercices_personnalises" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."exercices_realises" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."factures_suivi" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."indisponibilites" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "indispos_delete" ON "public"."indisponibilites" FOR DELETE USING (("praticien_id" = "auth"."uid"()));



CREATE POLICY "indispos_insert" ON "public"."indisponibilites" FOR INSERT WITH CHECK (("praticien_id" = "auth"."uid"()));



CREATE POLICY "indispos_select" ON "public"."indisponibilites" FOR SELECT USING (("praticien_id" = "auth"."uid"()));



CREATE POLICY "indispos_update" ON "public"."indisponibilites" FOR UPDATE USING (("praticien_id" = "auth"."uid"()));



CREATE POLICY "membres_lecture_organisations" ON "public"."organisations" FOR SELECT TO "authenticated" USING ("public"."est_membre_organisation"("id"));



ALTER TABLE "public"."notes_seances" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "notes_seances_delete" ON "public"."notes_seances" FOR DELETE USING (("praticien_id" = "auth"."uid"()));



CREATE POLICY "notes_seances_insert" ON "public"."notes_seances" FOR INSERT WITH CHECK (("praticien_id" = "auth"."uid"()));



CREATE POLICY "notes_seances_select" ON "public"."notes_seances" FOR SELECT USING (("praticien_id" = "auth"."uid"()));



CREATE POLICY "notes_seances_update" ON "public"."notes_seances" FOR UPDATE USING (("praticien_id" = "auth"."uid"()));



CREATE POLICY "orga_acces_bilans" ON "public"."bilans" TO "authenticated" USING ("public"."acces_participant"("participant_id")) WITH CHECK ("public"."acces_participant"("participant_id"));



CREATE POLICY "orga_acces_comptes_rendus_seances" ON "public"."comptes_rendus_seances" TO "authenticated" USING ("public"."acces_participant"("participant_id")) WITH CHECK ("public"."acces_participant"("participant_id"));



CREATE POLICY "orga_acces_contrats" ON "public"."contrats" TO "authenticated" USING ("public"."acces_participant"("participant_id")) WITH CHECK ("public"."acces_participant"("participant_id"));



CREATE POLICY "orga_acces_cours_collectifs" ON "public"."cours_collectifs" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."participations_cours_collectifs" "pcc"
  WHERE (("pcc"."cours_id" = "cours_collectifs"."id") AND "public"."acces_participant"("pcc"."participant_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."participations_cours_collectifs" "pcc"
  WHERE (("pcc"."cours_id" = "cours_collectifs"."id") AND "public"."acces_participant"("pcc"."participant_id")))));



CREATE POLICY "orga_acces_documents_patient" ON "public"."documents_patient" TO "authenticated" USING ("public"."acces_participant"("participant_id")) WITH CHECK ("public"."acces_participant"("participant_id"));



CREATE POLICY "orga_acces_exercices_libres_activations" ON "public"."exercices_libres_activations" TO "authenticated" USING ("public"."acces_participant"("participant_id")) WITH CHECK ("public"."acces_participant"("participant_id"));



CREATE POLICY "orga_acces_exercices_realises" ON "public"."exercices_realises" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."seances_patient" "sp"
  WHERE (("sp"."id" = "exercices_realises"."seance_patient_id") AND "public"."acces_participant"("sp"."participant_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."seances_patient" "sp"
  WHERE (("sp"."id" = "exercices_realises"."seance_patient_id") AND "public"."acces_participant"("sp"."participant_id")))));



CREATE POLICY "orga_acces_notes_seances" ON "public"."notes_seances" TO "authenticated" USING ("public"."acces_participant"("participant_id")) WITH CHECK ("public"."acces_participant"("participant_id"));



CREATE POLICY "orga_acces_participants" ON "public"."participants" TO "authenticated" USING ("public"."acces_participant"("id")) WITH CHECK (("public"."acces_participant"("id") AND (("organisation_id" IS NULL) OR "public"."est_membre_organisation"("organisation_id"))));



CREATE POLICY "orga_acces_participations_cours_collectifs" ON "public"."participations_cours_collectifs" TO "authenticated" USING ("public"."acces_participant"("participant_id")) WITH CHECK ("public"."acces_participant"("participant_id"));



CREATE POLICY "orga_acces_programme_exercices" ON "public"."programme_exercices" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."programme_seances" "ps"
     JOIN "public"."programmes" "pr" ON (("pr"."id" = "ps"."programme_id")))
  WHERE (("ps"."id" = "programme_exercices"."seance_id") AND "public"."acces_participant"("pr"."participant_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."programme_seances" "ps"
     JOIN "public"."programmes" "pr" ON (("pr"."id" = "ps"."programme_id")))
  WHERE (("ps"."id" = "programme_exercices"."seance_id") AND "public"."acces_participant"("pr"."participant_id")))));



CREATE POLICY "orga_acces_programme_planning" ON "public"."programme_planning" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."programmes" "pr"
  WHERE (("pr"."id" = "programme_planning"."programme_id") AND "public"."acces_participant"("pr"."participant_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."programmes" "pr"
  WHERE (("pr"."id" = "programme_planning"."programme_id") AND "public"."acces_participant"("pr"."participant_id")))));



CREATE POLICY "orga_acces_programme_seances" ON "public"."programme_seances" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."programmes" "pr"
  WHERE (("pr"."id" = "programme_seances"."programme_id") AND "public"."acces_participant"("pr"."participant_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."programmes" "pr"
  WHERE (("pr"."id" = "programme_seances"."programme_id") AND "public"."acces_participant"("pr"."participant_id")))));



CREATE POLICY "orga_acces_programmes" ON "public"."programmes" TO "authenticated" USING ("public"."acces_participant"("participant_id")) WITH CHECK ("public"."acces_participant"("participant_id"));



CREATE POLICY "orga_acces_seances" ON "public"."seances" TO "authenticated" USING ("public"."acces_participant"("participant_id")) WITH CHECK ("public"."acces_participant"("participant_id"));



CREATE POLICY "orga_acces_seances_patient" ON "public"."seances_patient" TO "authenticated" USING ("public"."acces_participant"("participant_id")) WITH CHECK ("public"."acces_participant"("participant_id"));



CREATE POLICY "orga_acces_tarifs_contrats" ON "public"."tarifs_contrats" TO "authenticated" USING (("contrat_id" IN ( SELECT "c"."id"
   FROM "public"."contrats" "c"
  WHERE "public"."acces_participant"("c"."participant_id")))) WITH CHECK (("contrat_id" IN ( SELECT "c"."id"
   FROM "public"."contrats" "c"
  WHERE "public"."acces_participant"("c"."participant_id"))));



CREATE POLICY "orga_acces_tests_etalons_activations" ON "public"."tests_etalons_activations" TO "authenticated" USING ("public"."acces_participant"("participant_id")) WITH CHECK ("public"."acces_participant"("participant_id"));



CREATE POLICY "orga_lecture_audit_logs" ON "public"."audit_logs" FOR SELECT TO "authenticated" USING ((("participant_id" IS NOT NULL) AND "public"."acces_participant"("participant_id")));



CREATE POLICY "orga_lecture_exercices_libres_validations" ON "public"."exercices_libres_validations" FOR SELECT TO "authenticated" USING ("public"."acces_participant"("participant_id"));



CREATE POLICY "orga_lecture_push_subscriptions" ON "public"."push_subscriptions" FOR SELECT TO "authenticated" USING ("public"."acces_participant"("participant_id"));



CREATE POLICY "orga_lecture_rappels_envoyes" ON "public"."rappels_envoyes" FOR SELECT TO "authenticated" USING ("public"."acces_participant"("participant_id"));



CREATE POLICY "orga_lecture_retours_seance" ON "public"."retours_seance" FOR SELECT TO "authenticated" USING ("public"."acces_participant"("participant_id"));



CREATE POLICY "orga_lecture_tests_etalons_resultats" ON "public"."tests_etalons_resultats" FOR SELECT TO "authenticated" USING ("public"."acces_participant"("participant_id"));



ALTER TABLE "public"."organisation_demande_attempts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."organisation_invitations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."organisation_membres" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."organisations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "own" ON "public"."bilans_brouillons" USING (("auth"."uid"() = "praticien_id")) WITH CHECK (("auth"."uid"() = "praticien_id"));



ALTER TABLE "public"."participants" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "participants_delete" ON "public"."participants" FOR DELETE USING (("praticien_id" = "auth"."uid"()));



CREATE POLICY "participants_insert" ON "public"."participants" FOR INSERT WITH CHECK (("praticien_id" = "auth"."uid"()));



CREATE POLICY "participants_select" ON "public"."participants" FOR SELECT USING (("praticien_id" = "auth"."uid"()));



CREATE POLICY "participants_update" ON "public"."participants" FOR UPDATE USING (("praticien_id" = "auth"."uid"()));



ALTER TABLE "public"."participations_cours_collectifs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."patient_activite_rate_limit" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "patient_gere_ses_exercices" ON "public"."exercices_realises" USING (("seance_patient_id" IN ( SELECT "sp"."id"
   FROM ("public"."seances_patient" "sp"
     JOIN "public"."participants" "p" ON (("p"."id" = "sp"."participant_id")))
  WHERE ("p"."praticien_id" = "auth"."uid"())))) WITH CHECK (("seance_patient_id" IN ( SELECT "sp"."id"
   FROM ("public"."seances_patient" "sp"
     JOIN "public"."participants" "p" ON (("p"."id" = "sp"."participant_id")))
  WHERE ("p"."praticien_id" = "auth"."uid"()))));



CREATE POLICY "patient_gere_ses_seances" ON "public"."seances_patient" USING (("participant_id" IN ( SELECT "participants"."id"
   FROM "public"."participants"
  WHERE ("participants"."praticien_id" = "auth"."uid"())))) WITH CHECK (("participant_id" IN ( SELECT "participants"."id"
   FROM "public"."participants"
  WHERE ("participants"."praticien_id" = "auth"."uid"()))));



ALTER TABLE "public"."patient_login_attempts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "praticien voit ses logs" ON "public"."assistant_logs" USING (("praticien_id" = "auth"."uid"()));



CREATE POLICY "praticien_crud_exercices" ON "public"."programme_exercices" USING ((EXISTS ( SELECT 1
   FROM ("public"."programme_seances" "s"
     JOIN "public"."programmes" "p" ON (("p"."id" = "s"."programme_id")))
  WHERE (("s"."id" = "programme_exercices"."seance_id") AND ("p"."praticien_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."programme_seances" "s"
     JOIN "public"."programmes" "p" ON (("p"."id" = "s"."programme_id")))
  WHERE (("s"."id" = "programme_exercices"."seance_id") AND ("p"."praticien_id" = "auth"."uid"())))));



CREATE POLICY "praticien_crud_planning" ON "public"."programme_planning" USING ((EXISTS ( SELECT 1
   FROM "public"."programmes" "p"
  WHERE (("p"."id" = "programme_planning"."programme_id") AND ("p"."praticien_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."programmes" "p"
  WHERE (("p"."id" = "programme_planning"."programme_id") AND ("p"."praticien_id" = "auth"."uid"())))));



CREATE POLICY "praticien_crud_seances" ON "public"."programme_seances" USING ((EXISTS ( SELECT 1
   FROM "public"."programmes" "p"
  WHERE (("p"."id" = "programme_seances"."programme_id") AND ("p"."praticien_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."programmes" "p"
  WHERE (("p"."id" = "programme_seances"."programme_id") AND ("p"."praticien_id" = "auth"."uid"())))));



CREATE POLICY "praticien_delete_tm6_variantes" ON "public"."tm6_variantes" FOR DELETE TO "authenticated" USING (("praticien_id" = "auth"."uid"()));



CREATE POLICY "praticien_gere_cours_collectifs" ON "public"."cours_collectifs" USING (("praticien_id" = "auth"."uid"())) WITH CHECK (("praticien_id" = "auth"."uid"()));



CREATE POLICY "praticien_gere_documents_patient" ON "public"."documents_patient" USING (("participant_id" IN ( SELECT "participants"."id"
   FROM "public"."participants"
  WHERE ("participants"."praticien_id" = "auth"."uid"())))) WITH CHECK (("participant_id" IN ( SELECT "participants"."id"
   FROM "public"."participants"
  WHERE ("participants"."praticien_id" = "auth"."uid"()))));



CREATE POLICY "praticien_gere_dossier_exercice_membres" ON "public"."dossier_exercice_membres" USING (("praticien_id" = "auth"."uid"())) WITH CHECK (("praticien_id" = "auth"."uid"()));



CREATE POLICY "praticien_gere_dossiers_exercices" ON "public"."dossiers_exercices" USING (("praticien_id" = "auth"."uid"())) WITH CHECK (("praticien_id" = "auth"."uid"()));



CREATE POLICY "praticien_gere_exercices_personnalises" ON "public"."exercices_personnalises" USING (("praticien_id" = "auth"."uid"())) WITH CHECK (("praticien_id" = "auth"."uid"()));



CREATE POLICY "praticien_gere_exercices_realises" ON "public"."exercices_realises" USING (("seance_patient_id" IN ( SELECT "sp"."id"
   FROM ("public"."seances_patient" "sp"
     JOIN "public"."participants" "p" ON (("p"."id" = "sp"."participant_id")))
  WHERE ("p"."praticien_id" = "auth"."uid"())))) WITH CHECK (("seance_patient_id" IN ( SELECT "sp"."id"
   FROM ("public"."seances_patient" "sp"
     JOIN "public"."participants" "p" ON (("p"."id" = "sp"."participant_id")))
  WHERE ("p"."praticien_id" = "auth"."uid"()))));



CREATE POLICY "praticien_gere_factures" ON "public"."factures_suivi" USING (("praticien_id" = "auth"."uid"())) WITH CHECK (("praticien_id" = "auth"."uid"()));



CREATE POLICY "praticien_gere_modele_exercices" ON "public"."programme_modele_exercices" USING ((EXISTS ( SELECT 1
   FROM ("public"."programme_modele_seances" "s"
     JOIN "public"."programmes_modeles" "m" ON (("m"."id" = "s"."modele_id")))
  WHERE (("s"."id" = "programme_modele_exercices"."seance_id") AND ("m"."praticien_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."programme_modele_seances" "s"
     JOIN "public"."programmes_modeles" "m" ON (("m"."id" = "s"."modele_id")))
  WHERE (("s"."id" = "programme_modele_exercices"."seance_id") AND ("m"."praticien_id" = "auth"."uid"())))));



CREATE POLICY "praticien_gere_modele_planning" ON "public"."programme_modele_planning" USING ((EXISTS ( SELECT 1
   FROM "public"."programmes_modeles" "m"
  WHERE (("m"."id" = "programme_modele_planning"."modele_id") AND ("m"."praticien_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."programmes_modeles" "m"
  WHERE (("m"."id" = "programme_modele_planning"."modele_id") AND ("m"."praticien_id" = "auth"."uid"())))));



CREATE POLICY "praticien_gere_modele_seances" ON "public"."programme_modele_seances" USING ((EXISTS ( SELECT 1
   FROM "public"."programmes_modeles" "m"
  WHERE (("m"."id" = "programme_modele_seances"."modele_id") AND ("m"."praticien_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."programmes_modeles" "m"
  WHERE (("m"."id" = "programme_modele_seances"."modele_id") AND ("m"."praticien_id" = "auth"."uid"())))));



CREATE POLICY "praticien_gere_partages" ON "public"."documents_partages" USING (("participant_id" IN ( SELECT "participants"."id"
   FROM "public"."participants"
  WHERE ("participants"."praticien_id" = "auth"."uid"())))) WITH CHECK (("participant_id" IN ( SELECT "participants"."id"
   FROM "public"."participants"
  WHERE ("participants"."praticien_id" = "auth"."uid"()))));



CREATE POLICY "praticien_gere_participations_cours_collectifs" ON "public"."participations_cours_collectifs" USING ("public"."est_cours_du_praticien"("cours_id")) WITH CHECK ("public"."est_cours_du_praticien"("cours_id"));



CREATE POLICY "praticien_gere_programme_exercices" ON "public"."programme_exercices" USING (("seance_id" IN ( SELECT "ps"."id"
   FROM (("public"."programme_seances" "ps"
     JOIN "public"."programmes" "pr" ON (("pr"."id" = "ps"."programme_id")))
     JOIN "public"."participants" "pa" ON (("pa"."id" = "pr"."participant_id")))
  WHERE ("pa"."praticien_id" = "auth"."uid"())))) WITH CHECK (("seance_id" IN ( SELECT "ps"."id"
   FROM (("public"."programme_seances" "ps"
     JOIN "public"."programmes" "pr" ON (("pr"."id" = "ps"."programme_id")))
     JOIN "public"."participants" "pa" ON (("pa"."id" = "pr"."participant_id")))
  WHERE ("pa"."praticien_id" = "auth"."uid"()))));



CREATE POLICY "praticien_gere_programme_planning" ON "public"."programme_planning" USING (("programme_id" IN ( SELECT "pr"."id"
   FROM ("public"."programmes" "pr"
     JOIN "public"."participants" "pa" ON (("pa"."id" = "pr"."participant_id")))
  WHERE ("pa"."praticien_id" = "auth"."uid"())))) WITH CHECK (("programme_id" IN ( SELECT "pr"."id"
   FROM ("public"."programmes" "pr"
     JOIN "public"."participants" "pa" ON (("pa"."id" = "pr"."participant_id")))
  WHERE ("pa"."praticien_id" = "auth"."uid"()))));



CREATE POLICY "praticien_gere_programme_seances" ON "public"."programme_seances" USING (("programme_id" IN ( SELECT "pr"."id"
   FROM ("public"."programmes" "pr"
     JOIN "public"."participants" "pa" ON (("pa"."id" = "pr"."participant_id")))
  WHERE ("pa"."praticien_id" = "auth"."uid"())))) WITH CHECK (("programme_id" IN ( SELECT "pr"."id"
   FROM ("public"."programmes" "pr"
     JOIN "public"."participants" "pa" ON (("pa"."id" = "pr"."participant_id")))
  WHERE ("pa"."praticien_id" = "auth"."uid"()))));



CREATE POLICY "praticien_gere_programmes_modeles" ON "public"."programmes_modeles" USING (("praticien_id" = "auth"."uid"())) WITH CHECK (("praticien_id" = "auth"."uid"()));



CREATE POLICY "praticien_gere_rappel_preferences" ON "public"."rappel_preferences" USING (("praticien_id" = "auth"."uid"())) WITH CHECK (("praticien_id" = "auth"."uid"()));



CREATE POLICY "praticien_gere_seances_patient" ON "public"."seances_patient" USING (("participant_id" IN ( SELECT "participants"."id"
   FROM "public"."participants"
  WHERE ("participants"."praticien_id" = "auth"."uid"())))) WITH CHECK (("participant_id" IN ( SELECT "participants"."id"
   FROM "public"."participants"
  WHERE ("participants"."praticien_id" = "auth"."uid"()))));



CREATE POLICY "praticien_gere_structures" ON "public"."structures" USING (("praticien_id" = "auth"."uid"())) WITH CHECK (("praticien_id" = "auth"."uid"()));



CREATE POLICY "praticien_gere_tarifs_contrats" ON "public"."tarifs_contrats" USING (("contrat_id" IN ( SELECT "c"."id"
   FROM ("public"."contrats" "c"
     JOIN "public"."participants" "p" ON (("p"."id" = "c"."participant_id")))
  WHERE ("p"."praticien_id" = "auth"."uid"())))) WITH CHECK (("contrat_id" IN ( SELECT "c"."id"
   FROM ("public"."contrats" "c"
     JOIN "public"."participants" "p" ON (("p"."id" = "c"."participant_id")))
  WHERE ("p"."praticien_id" = "auth"."uid"()))));



CREATE POLICY "praticien_gere_templates_structure" ON "public"."templates_structure" USING (("praticien_id" = "auth"."uid"())) WITH CHECK (("praticien_id" = "auth"."uid"()));



CREATE POLICY "praticien_insert_tm6_variantes" ON "public"."tm6_variantes" FOR INSERT TO "authenticated" WITH CHECK (("praticien_id" = "auth"."uid"()));



CREATE POLICY "praticien_lit_push_subscriptions" ON "public"."push_subscriptions" FOR SELECT USING (("participant_id" IN ( SELECT "participants"."id"
   FROM "public"."participants"
  WHERE ("participants"."praticien_id" = "auth"."uid"()))));



CREATE POLICY "praticien_lit_rappels_envoyes" ON "public"."rappels_envoyes" FOR SELECT USING (("participant_id" IN ( SELECT "participants"."id"
   FROM "public"."participants"
  WHERE ("participants"."praticien_id" = "auth"."uid"()))));



ALTER TABLE "public"."praticien_push_subscriptions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "praticien_push_subscriptions_delete" ON "public"."praticien_push_subscriptions" FOR DELETE USING (("praticien_id" = "auth"."uid"()));



CREATE POLICY "praticien_push_subscriptions_insert" ON "public"."praticien_push_subscriptions" FOR INSERT WITH CHECK (("praticien_id" = "auth"."uid"()));



CREATE POLICY "praticien_push_subscriptions_select" ON "public"."praticien_push_subscriptions" FOR SELECT USING (("praticien_id" = "auth"."uid"()));



CREATE POLICY "praticien_push_subscriptions_update" ON "public"."praticien_push_subscriptions" FOR UPDATE USING (("praticien_id" = "auth"."uid"())) WITH CHECK (("praticien_id" = "auth"."uid"()));



CREATE POLICY "praticien_select_tm6_variantes" ON "public"."tm6_variantes" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "praticien_update_tm6_variantes" ON "public"."tm6_variantes" FOR UPDATE TO "authenticated" USING (("praticien_id" = "auth"."uid"())) WITH CHECK (("praticien_id" = "auth"."uid"()));



CREATE POLICY "praticien_voit_exercices_realises" ON "public"."exercices_realises" USING (("seance_patient_id" IN ( SELECT "sp"."id"
   FROM ("public"."seances_patient" "sp"
     JOIN "public"."participants" "p" ON (("sp"."participant_id" = "p"."id")))
  WHERE ("p"."praticien_id" = "auth"."uid"()))));



CREATE POLICY "praticien_voit_seances_patient" ON "public"."seances_patient" USING (("participant_id" IN ( SELECT "participants"."id"
   FROM "public"."participants"
  WHERE ("participants"."praticien_id" = "auth"."uid"()))));



ALTER TABLE "public"."praticiens" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "praticiens_delete" ON "public"."praticiens" FOR DELETE USING (("id" = "auth"."uid"()));



CREATE POLICY "praticiens_insert" ON "public"."praticiens" FOR INSERT WITH CHECK (("id" = "auth"."uid"()));



CREATE POLICY "praticiens_select" ON "public"."praticiens" FOR SELECT USING (("id" = "auth"."uid"()));



CREATE POLICY "praticiens_update" ON "public"."praticiens" FOR UPDATE USING (("id" = "auth"."uid"()));



ALTER TABLE "public"."programme_exercices" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."programme_modele_exercices" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."programme_modele_planning" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."programme_modele_seances" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."programme_planning" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."programme_seances" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."programmes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "programmes_delete" ON "public"."programmes" FOR DELETE USING (("praticien_id" = "auth"."uid"()));



CREATE POLICY "programmes_insert" ON "public"."programmes" FOR INSERT WITH CHECK (("praticien_id" = "auth"."uid"()));



ALTER TABLE "public"."programmes_modeles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "programmes_select" ON "public"."programmes" FOR SELECT USING (("praticien_id" = "auth"."uid"()));



CREATE POLICY "programmes_update" ON "public"."programmes" FOR UPDATE USING (("praticien_id" = "auth"."uid"()));



CREATE POLICY "propre_ligne_organisation_membres" ON "public"."organisation_membres" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."push_subscriptions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."rappel_preferences" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."rappels_envoyes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."retours_seance" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "retours_seance_praticien_select" ON "public"."retours_seance" FOR SELECT USING (("praticien_id" = "auth"."uid"()));



ALTER TABLE "public"."seances" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "seances_delete" ON "public"."seances" FOR DELETE USING (("praticien_id" = "auth"."uid"()));



CREATE POLICY "seances_insert" ON "public"."seances" FOR INSERT WITH CHECK (("praticien_id" = "auth"."uid"()));



ALTER TABLE "public"."seances_patient" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "seances_select" ON "public"."seances" FOR SELECT USING (("praticien_id" = "auth"."uid"()));



CREATE POLICY "seances_update" ON "public"."seances" FOR UPDATE USING (("praticien_id" = "auth"."uid"()));



ALTER TABLE "public"."structure_access_logs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "structure_access_logs_praticien_lecture" ON "public"."structure_access_logs" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."structures" "s"
  WHERE (("s"."id" = "structure_access_logs"."structure_id") AND ("s"."praticien_id" = "auth"."uid"())))));



ALTER TABLE "public"."structures" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tarifs_contrats" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."templates_structure" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tests_etalons_activations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tests_etalons_activations_praticien_all" ON "public"."tests_etalons_activations" USING (("praticien_id" = "auth"."uid"())) WITH CHECK (("praticien_id" = "auth"."uid"()));



ALTER TABLE "public"."tests_etalons_resultats" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tests_etalons_resultats_praticien_select" ON "public"."tests_etalons_resultats" FOR SELECT USING (("participant_id" IN ( SELECT "participants"."id"
   FROM "public"."participants"
  WHERE ("participants"."praticien_id" = "auth"."uid"()))));



ALTER TABLE "public"."tm6_variantes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_roles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_roles_lecture_propre_ligne" ON "public"."user_roles" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "zones_delete" ON "public"."zones_geographiques" FOR DELETE USING (("praticien_id" = "auth"."uid"()));



ALTER TABLE "public"."zones_geographiques" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "zones_insert" ON "public"."zones_geographiques" FOR INSERT WITH CHECK (("praticien_id" = "auth"."uid"()));



CREATE POLICY "zones_select" ON "public"."zones_geographiques" FOR SELECT USING (("praticien_id" = "auth"."uid"()));



CREATE POLICY "zones_update" ON "public"."zones_geographiques" FOR UPDATE USING (("praticien_id" = "auth"."uid"()));





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";





GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";














































































































































































REVOKE ALL ON FUNCTION "public"."acces_participant"("p_participant_id" "uuid") FROM PUBLIC;
-- Alignement des droits sur la production : à la création, Supabase local accorde
-- des droits par défaut à anon (et plus larges à authenticated/service_role) que la
-- production n'a pas. On repart de zéro, puis les GRANT ci-dessous (relevés en
-- production) reconstituent exactement les droits réels.
REVOKE ALL ON ALL TABLES    IN SCHEMA "public" FROM "anon", "authenticated", "service_role";
REVOKE ALL ON ALL SEQUENCES IN SCHEMA "public" FROM "anon", "authenticated", "service_role";
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA "public" FROM "anon", "authenticated", "service_role";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL ON TABLES FROM "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL ON SEQUENCES FROM "anon";
GRANT ALL ON FUNCTION "public"."acces_participant"("p_participant_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."acces_participant"("p_participant_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."acces_participant_pour"("p_participant_id" "uuid", "p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."acces_participant_pour"("p_participant_id" "uuid", "p_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."app_role_courant"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."app_role_courant"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."app_role_courant"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."attribuer_role_par_defaut"() FROM PUBLIC;



GRANT ALL ON FUNCTION "public"."audit_logs_immuable"() TO "anon";
GRANT ALL ON FUNCTION "public"."audit_logs_immuable"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."audit_logs_immuable"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."dupliquer_programme_modele"("p_modele_id" "uuid", "p_participant_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."dupliquer_programme_modele"("p_modele_id" "uuid", "p_participant_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."dupliquer_programme_modele"("p_modele_id" "uuid", "p_participant_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."est_admin_organisation"("p_organisation_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."est_admin_organisation"("p_organisation_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."est_admin_organisation"("p_organisation_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."est_cours_du_praticien"("p_cours_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."est_cours_du_praticien"("p_cours_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."est_cours_du_praticien"("p_cours_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."est_membre_organisation"("p_organisation_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."est_membre_organisation"("p_organisation_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."est_membre_organisation"("p_organisation_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."exiger_consentement_rgpd_creation"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."set_praticien_id_from_auth"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_praticien_id_from_auth"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_praticien_id_from_auth"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."update_updated_at"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."update_updated_at_column"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";
























GRANT ALL ON TABLE "public"."assistant_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."assistant_logs" TO "service_role";



GRANT ALL ON TABLE "public"."audit_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."audit_logs" TO "service_role";



GRANT ALL ON SEQUENCE "public"."audit_logs_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."audit_logs_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."bilans" TO "authenticated";
GRANT ALL ON TABLE "public"."bilans" TO "service_role";



GRANT ALL ON TABLE "public"."bilans_brouillons" TO "authenticated";
GRANT ALL ON TABLE "public"."bilans_brouillons" TO "service_role";



GRANT ALL ON TABLE "public"."claude_rate_limit" TO "authenticated";
GRANT ALL ON TABLE "public"."claude_rate_limit" TO "service_role";



GRANT ALL ON SEQUENCE "public"."claude_rate_limit_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."claude_rate_limit_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."comptes_rendus_seances" TO "authenticated";
GRANT ALL ON TABLE "public"."comptes_rendus_seances" TO "service_role";



GRANT ALL ON TABLE "public"."contrats" TO "authenticated";
GRANT ALL ON TABLE "public"."contrats" TO "service_role";



GRANT SELECT,INSERT,UPDATE ON TABLE "public"."cours_collectifs" TO "authenticated";
GRANT ALL ON TABLE "public"."cours_collectifs" TO "service_role";



GRANT ALL ON TABLE "public"."documents_partages" TO "authenticated";
GRANT ALL ON TABLE "public"."documents_partages" TO "service_role";



GRANT ALL ON TABLE "public"."documents_patient" TO "authenticated";
GRANT ALL ON TABLE "public"."documents_patient" TO "service_role";



GRANT ALL ON TABLE "public"."dossier_exercice_membres" TO "authenticated";
GRANT ALL ON TABLE "public"."dossier_exercice_membres" TO "service_role";



GRANT ALL ON TABLE "public"."dossiers_exercices" TO "authenticated";
GRANT ALL ON TABLE "public"."dossiers_exercices" TO "service_role";



GRANT ALL ON TABLE "public"."evenements_agenda" TO "authenticated";
GRANT ALL ON TABLE "public"."evenements_agenda" TO "service_role";



GRANT ALL ON TABLE "public"."exercices_libres_activations" TO "authenticated";
GRANT ALL ON TABLE "public"."exercices_libres_activations" TO "service_role";



GRANT ALL ON TABLE "public"."exercices_libres_validations" TO "authenticated";
GRANT ALL ON TABLE "public"."exercices_libres_validations" TO "service_role";



GRANT ALL ON TABLE "public"."exercices_personnalises" TO "authenticated";
GRANT ALL ON TABLE "public"."exercices_personnalises" TO "service_role";



GRANT ALL ON TABLE "public"."exercices_realises" TO "authenticated";
GRANT ALL ON TABLE "public"."exercices_realises" TO "service_role";



GRANT ALL ON TABLE "public"."factures_suivi" TO "authenticated";
GRANT ALL ON TABLE "public"."factures_suivi" TO "service_role";



GRANT ALL ON TABLE "public"."indisponibilites" TO "authenticated";
GRANT ALL ON TABLE "public"."indisponibilites" TO "service_role";



GRANT ALL ON TABLE "public"."notes_seances" TO "authenticated";
GRANT ALL ON TABLE "public"."notes_seances" TO "service_role";



GRANT ALL ON TABLE "public"."organisation_demande_attempts" TO "authenticated";
GRANT ALL ON TABLE "public"."organisation_demande_attempts" TO "service_role";



GRANT ALL ON SEQUENCE "public"."organisation_demande_attempts_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."organisation_demande_attempts_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."organisation_invitations" TO "authenticated";
GRANT ALL ON TABLE "public"."organisation_invitations" TO "service_role";



GRANT ALL ON TABLE "public"."organisation_membres" TO "authenticated";
GRANT ALL ON TABLE "public"."organisation_membres" TO "service_role";



GRANT ALL ON TABLE "public"."organisations" TO "authenticated";
GRANT ALL ON TABLE "public"."organisations" TO "service_role";



GRANT ALL ON TABLE "public"."participants" TO "authenticated";
GRANT ALL ON TABLE "public"."participants" TO "service_role";



GRANT SELECT,INSERT,UPDATE ON TABLE "public"."participations_cours_collectifs" TO "authenticated";
GRANT ALL ON TABLE "public"."participations_cours_collectifs" TO "service_role";



GRANT ALL ON TABLE "public"."patient_activite_rate_limit" TO "service_role";



GRANT ALL ON SEQUENCE "public"."patient_activite_rate_limit_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."patient_activite_rate_limit_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."patient_login_attempts" TO "authenticated";
GRANT ALL ON TABLE "public"."patient_login_attempts" TO "service_role";



GRANT ALL ON SEQUENCE "public"."patient_login_attempts_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."patient_login_attempts_id_seq" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."praticien_push_subscriptions" TO "authenticated";
GRANT SELECT,DELETE ON TABLE "public"."praticien_push_subscriptions" TO "service_role";



GRANT ALL ON TABLE "public"."praticiens" TO "authenticated";
GRANT ALL ON TABLE "public"."praticiens" TO "service_role";



GRANT ALL ON TABLE "public"."programme_exercices" TO "authenticated";
GRANT ALL ON TABLE "public"."programme_exercices" TO "service_role";



GRANT ALL ON TABLE "public"."programme_modele_exercices" TO "authenticated";
GRANT ALL ON TABLE "public"."programme_modele_exercices" TO "service_role";



GRANT ALL ON TABLE "public"."programme_modele_planning" TO "authenticated";
GRANT ALL ON TABLE "public"."programme_modele_planning" TO "service_role";



GRANT ALL ON TABLE "public"."programme_modele_seances" TO "authenticated";
GRANT ALL ON TABLE "public"."programme_modele_seances" TO "service_role";



GRANT ALL ON TABLE "public"."programme_planning" TO "authenticated";
GRANT ALL ON TABLE "public"."programme_planning" TO "service_role";



GRANT ALL ON TABLE "public"."programme_seances" TO "authenticated";
GRANT ALL ON TABLE "public"."programme_seances" TO "service_role";



GRANT ALL ON TABLE "public"."programmes" TO "authenticated";
GRANT ALL ON TABLE "public"."programmes" TO "service_role";



GRANT ALL ON TABLE "public"."programmes_modeles" TO "authenticated";
GRANT ALL ON TABLE "public"."programmes_modeles" TO "service_role";



GRANT ALL ON TABLE "public"."push_subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."push_subscriptions" TO "service_role";



GRANT ALL ON TABLE "public"."rappel_preferences" TO "authenticated";
GRANT ALL ON TABLE "public"."rappel_preferences" TO "service_role";



GRANT ALL ON TABLE "public"."rappels_envoyes" TO "authenticated";
GRANT ALL ON TABLE "public"."rappels_envoyes" TO "service_role";



GRANT ALL ON TABLE "public"."retours_seance" TO "authenticated";
GRANT ALL ON TABLE "public"."retours_seance" TO "service_role";



GRANT ALL ON TABLE "public"."seances" TO "authenticated";
GRANT ALL ON TABLE "public"."seances" TO "service_role";



GRANT ALL ON TABLE "public"."seances_patient" TO "authenticated";
GRANT ALL ON TABLE "public"."seances_patient" TO "service_role";



GRANT ALL ON TABLE "public"."structure_access_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."structure_access_logs" TO "service_role";



GRANT ALL ON SEQUENCE "public"."structure_access_logs_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."structure_access_logs_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."structures" TO "authenticated";
GRANT ALL ON TABLE "public"."structures" TO "service_role";



GRANT SELECT,INSERT,UPDATE ON TABLE "public"."tarifs_contrats" TO "authenticated";
GRANT ALL ON TABLE "public"."tarifs_contrats" TO "service_role";



GRANT ALL ON TABLE "public"."templates_structure" TO "authenticated";
GRANT ALL ON TABLE "public"."templates_structure" TO "service_role";



GRANT ALL ON TABLE "public"."tests_etalons_activations" TO "authenticated";
GRANT ALL ON TABLE "public"."tests_etalons_activations" TO "service_role";



GRANT ALL ON TABLE "public"."tests_etalons_resultats" TO "authenticated";
GRANT ALL ON TABLE "public"."tests_etalons_resultats" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,MAINTAIN,UPDATE ON TABLE "public"."tm6_variantes" TO "authenticated";
GRANT ALL ON TABLE "public"."tm6_variantes" TO "service_role";



GRANT SELECT ON TABLE "public"."user_roles" TO "authenticated";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."user_roles" TO "service_role";



GRANT ALL ON TABLE "public"."zones_geographiques" TO "authenticated";
GRANT ALL ON TABLE "public"."zones_geographiques" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";


-- ----------------------------------------------------------------------------
-- Hors schéma public : trigger d'attribution du rôle par défaut (auth.users)
-- Définition relevée en production avec pg_get_triggerdef.
-- ----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_auth_users_role_par_defaut ON auth.users;
CREATE TRIGGER trg_auth_users_role_par_defaut
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.attribuer_role_par_defaut();

-- ----------------------------------------------------------------------------
-- Contrôle final : l'état obtenu doit égaler celui relevé en production
-- le 2026-10-05.
-- ----------------------------------------------------------------------------
DO $controle$
DECLARE
  v_tables int; v_policies int; v_indexes int; v_fonctions int;
  v_triggers int; v_sequences int; v_enums int; v_rls_off int; v_trg_auth int;
BEGIN
  SELECT count(*) INTO v_tables    FROM pg_tables  WHERE schemaname = 'public';
  SELECT count(*) INTO v_policies  FROM pg_policies WHERE schemaname = 'public';
  SELECT count(*) INTO v_indexes   FROM pg_indexes WHERE schemaname = 'public';
  SELECT count(*) INTO v_fonctions FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prokind = 'f';
  SELECT count(*) INTO v_triggers  FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE NOT t.tgisinternal AND n.nspname = 'public';
  SELECT count(*) INTO v_sequences FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'S';
  SELECT count(*) INTO v_enums     FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typtype = 'e';
  SELECT count(*) INTO v_rls_off   FROM pg_tables WHERE schemaname = 'public' AND NOT rowsecurity;
  SELECT count(*) INTO v_trg_auth  FROM pg_trigger
    WHERE tgrelid = 'auth.users'::regclass AND tgname = 'trg_auth_users_role_par_defaut';

  IF v_tables <> 53 OR v_policies <> 124 OR v_indexes <> 104 OR v_fonctions <> 13
     OR v_triggers <> 29 OR v_sequences <> 6 OR v_enums <> 0 OR v_rls_off <> 0
     OR v_trg_auth <> 1 THEN
    RAISE EXCEPTION
      'Baseline : état inattendu (tables=%/53, policies=%/124, index=%/104, fonctions=%/13, triggers=%/29, séquences=%/6, enums=%/0, tables sans RLS=%/0, trigger auth=%/1)',
      v_tables, v_policies, v_indexes, v_fonctions, v_triggers, v_sequences, v_enums, v_rls_off, v_trg_auth;
  END IF;
END
$controle$;
