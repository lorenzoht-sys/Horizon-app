-- ============================================================================
-- 20260713_visibilite_beneficiaire.sql
-- ============================================================================
--
-- Contrôle du partage des résultats de bilan avec le bénéficiaire, suite à un
-- incident où des résultats qualifiés en termes cliniques bruts ont été vécus
-- comme dévalorisants par un bénéficiaire.
--
-- 1. Corrige un mécanisme préexistant cassé : "Ce que {prénom} peut voir"
--    (ModalEspacePatient.tsx) était stocké en localStorage, donc jamais
--    appliqué réellement côté bénéficiaire (localStorage est local à
--    l'appareil/navigateur qui l'a écrit — celui de Pierre, pas celui du
--    bénéficiaire — et api/patient/me.ts ne le consultait jamais). Migré vers
--    une colonne Supabase, seule source de vérité, appliquée côté serveur.
--    Défauts à `true` sur toutes les sections : préserve le comportement réel
--    actuel (tout est vu aujourd'hui, faute d'application du filtre), rien de
--    valable à migrer depuis localStorage (constaté : aucune section autre
--    que carteSante n'était même lue pour conditionner un affichage).
--
-- 2. Nouveau contrôle fin, par résultat de bilan (équilibre, force, force de
--    préhension, mobilité, endurance) : CACHÉ PAR DÉFAUT ('{}'::jsonb) — le
--    praticien partage consciemment plutôt que de devoir penser à cacher.
--
-- IDEMPOTENTE : ADD COLUMN IF NOT EXISTS ne fait rien si la colonne existe déjà.
-- NE PAS EXÉCUTER SUR PROD sans validation préalable.
-- ============================================================================

ALTER TABLE participants
  ADD COLUMN IF NOT EXISTS visibilite_beneficiaire JSONB NOT NULL DEFAULT
    '{"progression":true,"bilans":true,"rdv":true,"programme":true,"messagePierre":true,"carteSante":true}'::jsonb,
  ADD COLUMN IF NOT EXISTS message_beneficiaire TEXT;

ALTER TABLE bilans
  ADD COLUMN IF NOT EXISTS visible_beneficiaire JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Aucune policy RLS nouvelle et aucun GRANT nécessaires : ce sont de nouvelles
-- colonnes sur des tables existantes (participants, bilans) qui fonctionnent en
-- CRUD complet pour `authenticated` depuis le début du projet — le GRANT
-- nécessaire existe donc déjà (non documenté dans ce dépôt : ces deux tables
-- sont antérieures au dossier de migrations, créées directement dans Studio,
-- voir supabase/migrations/README.md "Limite connue"). Idem pour RLS : au
-- moins une policy de lecture/écriture scopée praticien existe déjà sur
-- chacune des deux tables (nom exact non versionné) — 20260620_audit_securite_rls.sql
-- confirme leur présence ("les policies *_select/insert/update/delete déjà
-- présentes... couvrent déjà l'accès légitime") au moment où deux policies
-- dangereuses ("Acces public patient" / "Acces public bilans patient",
-- FOR SELECT TO public USING (true)) ont été supprimées sur ces mêmes tables.
-- Le rôle anon n'a par ailleurs aucun accès direct à ces tables depuis
-- 20260613_rls_anon_lockdown.sql — l'espace bénéficiaire passe exclusivement
-- par /api/patient/* (service_role), qui applique le filtrage explicitement
-- dans le code (voir api/patient/me.ts).
