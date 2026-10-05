-- ============================================================================
-- 20260613_rls_anon_lockdown.sql
-- ============================================================================
--
-- Version migration de sql/rls_final.sql (branche securisation, sections
-- 1, 2, 3, 5, 6 — la section 4 concernant les tables "programme V2" est
-- devenue 20260613_programme_v2_rls.sql).
--
-- Contexte / décision d'architecture (voir RAPPORT_SECURISATION.md) :
-- le rôle "anon" Supabase ne doit plus avoir AUCUN accès direct aux tables.
-- Tous les accès "espace patient" (/patient) et "portail structure"
-- (/structure/[token]) passent par des fonctions serverless Vercel
-- (/api/patient/*, /api/structure/*) qui utilisent la clé service_role
-- (bypass RLS) après avoir validé le code patient / le token structure côté
-- serveur. La clé service_role n'est jamais exposée au client.
--
-- Les policies "praticien_gere_*" (praticien_id = auth.uid(), ou via
-- participant_id) restent INCHANGÉES : Pierre (rôle authenticated) garde
-- tous ses accès actuels. Seul le rôle anon est verrouillé par ce script.
--
-- ⚠️ CORRECTIF (préparation staging) : l'ancienne SECTION 1 (policies sur
-- `documents_patient`) ainsi que les références à `documents_partages` et à
-- la fonction `get_praticien_structure()` ont été retirées de ce fichier :
-- ces objets N'EXISTENT PAS dans cette base (les migrations 20260603 et
-- 20260607 qui les créent n'ont jamais été réellement appliquées en
-- production), ce qui avait été contourné manuellement à l'application de ce
-- script sans corriger le fichier. Sections renumérotées 1 à 4. Voir
-- GUIDE_STAGING.md.


-- ============================================================================
-- SECTION 1 — structures : retrait de la lecture publique par défaut
-- ============================================================================
-- "lecture_publique_token" rendait lisible TOUTE ligne où actif = true, sans
-- vérifier le token. Le portail structure (anon) passe désormais par
-- /api/structure/* (service_role).

DROP POLICY IF EXISTS "lecture_publique_token" ON public.structures;


-- ============================================================================
-- SECTION 2 — retrait des policies de lecture anon basées sur le token
--             structure
-- ============================================================================
-- Ces policies permettaient au rôle anon de lire les données d'un patient de
-- structure en présentant le bon header x-structure-token. Ce chemin est
-- remplacé par /api/structure/* (service_role).

DROP POLICY IF EXISTS "structure_anon_read_participants" ON public.participants;
DROP POLICY IF EXISTS "structure_anon_read_bilans" ON public.bilans;
DROP POLICY IF EXISTS "structure_anon_read_seances" ON public.seances;
DROP POLICY IF EXISTS "structure_anon_read_programmes" ON public.programmes;
DROP POLICY IF EXISTS "structure_anon_read_factures" ON public.factures_suivi;

-- structure_token_valide() est conservée (inoffensive, SECURITY DEFINER)
-- mais n'a plus besoin d'être exécutable par anon.
REVOKE EXECUTE ON FUNCTION public.structure_token_valide(uuid) FROM anon;


-- ============================================================================
-- SECTION 3 — REVOKE global : le rôle anon perd tout accès aux tables
-- ============================================================================
-- Filet de sécurité supplémentaire (défense en profondeur) : même si une
-- policy RLS anon avait été oubliée ci-dessus, anon n'a plus aucun privilège
-- GRANT sur les tables. authenticated (Pierre) n'est pas concerné.
-- service_role bypass RLS et n'est pas affecté par REVOKE.

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;

-- Empêche que de futures tables/migrations héritent automatiquement de
-- droits anon.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;


-- ============================================================================
-- SECTION 4 — VÉRIFICATION (à exécuter manuellement après cette migration)
-- ============================================================================
-- Ces deux requêtes doivent ne renvoyer AUCUNE ligne si le verrouillage est
-- complet. Elles sont laissées en commentaire (ne font pas partie de la
-- migration elle-même) : copie-les dans le SQL Editor pour vérifier.

-- SELECT table_name, privilege_type
-- FROM information_schema.role_table_grants
-- WHERE grantee = 'anon';

-- SELECT schemaname, tablename, policyname, roles
-- FROM pg_policies
-- WHERE 'anon' = ANY(roles) OR roles = '{public}';
