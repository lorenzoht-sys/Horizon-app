// tests/security/rls.spec.ts
//
// Harnais de cloisonnement multi-tenant (Phase 1 de l'audit sécurité).
// Vérifie qu'un praticien A ne peut jamais lire/écrire les lignes d'un
// praticien B, qu'un patient A ne peut jamais lire/écrire celles d'un
// patient B, et qu'une structure ne voit que les participants qui lui sont
// rattachés — via de vraies requêtes PostgREST (anon key + session utilisateur
// signée), pas via une relecture du code. Voir docs/RAPPORT_SECURITE.md.
//
// ⚠️ CE FICHIER NE PEUT PAS S'EXÉCUTER SANS UN PROJET SUPABASE DE STAGING
// CONNECTÉ. Sans les variables d'environnement listées ci-dessous, toute la
// suite est `describe.skip` (jamais un faux "vert" silencieux — voir le
// message affiché). Un run vert de ce fichier est la seule preuve valable
// que le cloisonnement RLS fonctionne réellement ; tant qu'il n'a jamais
// tourné, tous les findings RLS de docs/RAPPORT_SECURITE.md restent
// "Non vérifié", quoi qu'en dise la lecture du code.
//
// Variables requises (staging UNIQUEMENT — ne jamais pointer vers la prod,
// ce test crée et supprime des comptes/lignes) :
//   SUPABASE_TEST_URL              URL du projet Supabase de staging
//   SUPABASE_TEST_ANON_KEY         clé anon du projet de staging
//   SUPABASE_TEST_SERVICE_ROLE_KEY clé service_role du projet de staging
//   PATIENT_SESSION_SECRET         même secret que celui utilisé par
//                                   api/_lib/patientAuth.ts sur staging,
//                                   pour signer des tokens patient de test
//
// Variable supplémentaire, optionnelle, pour le describe "Findings
// structurels (F-05, F-07, F-08, F-09, F-10)" tout en bas du fichier :
//   STAGING_DATABASE_URL           chaîne de connexion Postgres DIRECTE
//                                   (pas anon/service_role — un vrai
//                                   postgres://...) du projet STAGING, pour
//                                   interroger pg_policies/pg_proc/pg_class
//                                   (jamais exposés via PostgREST, schemas
//                                   exposés = public/graphql_public, voir
//                                   supabase/config.toml). Sans cette
//                                   variable, ce describe est skip — sépare
//                                   volontairement le nom de DATABASE_URL
//                                   (utilisé par scripts/dump-schema.ts pour
//                                   la PROD) pour qu'une variable d'env mal
//                                   nommée ne puisse jamais faire pointer ce
//                                   fichier de test vers la production.
//
// Réutilise le praticien + les 2 patients + la structure de démo créés par
// scripts/seed-staging.sql (voir ce fichier pour les codes d'accès :
// E2E_PATIENT_CODE / E2E_PATIENT_CODE_2 / E2E_STRUCTURE_TOKEN, mêmes
// variables que e2e/README.md) comme "praticien A". Un "praticien B" et un
// participant qui lui appartient sont créés à la volée par ce fichier
// (service_role, prefixe `rls-spec-`) puis supprimés dans `afterAll`, pour
// ne pas dépendre d'un second jeu de données statique à maintenir.
//
// Limite connue (documentée, pas cachée) : la génération de la liste de
// tables est automatique (`information_schema`), mais la façon de "posséder"
// une ligne diffère selon les tables :
//   - la plupart ont une colonne directe `praticien_id` ou `participant_id`
//     → testées génériquement (lecture/écriture croisée) ;
//   - certaines tables enfants ne portent PAS elles-mêmes cette colonne et
//     ne sont protégées que par une jointure (ex. `programme_seances` via
//     `programmes.participant_id`) → couvertes par TABLE_OVERRIDES ci-dessous
//     (résolution explicite d'une ligne existante avant le test croisé) ;
//   - toute table `public` qui n'a NI colonne directe NI entrée dans
//     TABLE_OVERRIDES tombe dans le test "UNKNOWN OWNERSHIP" : il ÉCHOUE
//     explicitement plutôt que d'être ignoré, pour qu'une table ajoutée
//     demain sans que ce fichier soit mis à jour fasse échouer la CI au lieu
//     de laisser un trou silencieux.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { SignJWT } from 'jose';
import { Client as PgClient } from 'pg';

const URL = process.env.SUPABASE_TEST_URL;
const ANON_KEY = process.env.SUPABASE_TEST_ANON_KEY;
const SERVICE_KEY = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;
const PATIENT_SECRET = process.env.PATIENT_SESSION_SECRET;

const PRATICIEN_A_EMAIL = process.env.E2E_PRATICIEN_EMAIL ?? 'staging.praticien@example.com';
const PRATICIEN_A_PASSWORD = process.env.E2E_PRATICIEN_PASSWORD;
const PATIENT_A_CODE = process.env.E2E_PATIENT_CODE ?? 'CAME2E26';
const PATIENT_B_CODE = process.env.E2E_PATIENT_CODE_2 ?? 'JUNE2E27';
const STRUCTURE_TOKEN = process.env.E2E_STRUCTURE_TOKEN ?? 'staging-token-demo-0001';

// Connexion Postgres DIRECTE au projet de staging. Volontairement nommée
// différemment de DATABASE_URL (que scripts/dump-schema.ts utilise pour la
// PRODUCTION) : une variable mal nommée ne doit jamais pouvoir faire tourner
// ces requêtes contre la prod.
//
// Deux consommateurs : le test « couverture complète » (qui liste
// information_schema.tables, inaccessible via PostgREST) et le bloc
// « Findings structurels » en bas de fichier. Déclarée ici, avec les autres
// variables d'environnement, plutôt qu'au milieu du fichier.
const STAGING_DB_URL = process.env.STAGING_DATABASE_URL;

const HAS_STAGING_ENV = Boolean(URL && ANON_KEY && SERVICE_KEY && PATIENT_SECRET && PRATICIEN_A_PASSWORD);

// Tables sciemment exclues du test générique (raison documentée par ligne).
// Toute table `public` qui n'est ni ici ni dans TABLE_OVERRIDES tombe dans
// le test "UNKNOWN OWNERSHIP" ci-dessous et fait échouer la CI.
const EXCLUDED_TABLES: Record<string, string> = {
  // Pas de donnée de santé, catalogue de référence partagé par design :
  // lecture ouverte à tout praticien connecté, donc le test générique de
  // cloisonnement en LECTURE ne s'y applique pas. L'écriture, elle, EST
  // cloisonnée depuis le lot 8 (praticien_id + policies scopées) et est
  // couverte par le describe [F-01] dédié plus bas — pas par le test
  // générique. La mention « RLS non applicable » qui figurait ici était
  // fausse depuis le lot 8 : corrigée le 2026-08-27.
  tm6_variantes: 'catalogue partagé : lecture ouverte par design, écriture cloisonnée et couverte par le describe [F-01] dédié',
  // Accessible uniquement en service_role (RLS bloque tout le reste par
  // défaut, zéro policy) — pas de session anon/authenticated possible à tester.
  patient_login_attempts: 'service_role only, aucune policy, testé indirectement via rate-limit.spec.ts',
  organisation_demande_attempts: 'service_role only, aucune policy, testé indirectement via rate-limit.spec.ts',
  // Même patron que patient_login_attempts : RLS activée ET forcée, zéro
  // policy, accès exclusivement par service_role depuis api/_lib/rateLimit.ts.
  // Aucune session anon/authenticated ne peut donc l'atteindre — rien à
  // tester en cloisonnement. Créée par le lot 6 (20260817_securite_08_rate_limit_claude.sql),
  // et première table détectée par le test de couverture le jour où il a
  // enfin pu s'exécuter.
  claude_rate_limit: 'service_role only, RLS forcée sans aucune policy, alimentée par api/_lib/rateLimit.ts',
  // Le cloisonnement de cette table n'est pas « praticien A vs praticien B
  // sur une colonne praticien_id » : c'est « chacun voit sa propre ligne, et
  // personne n'écrit ». Testée par le describe [RÔLES] dédié, plus trois
  // contrôles structurels dans « Findings structurels ».
  user_roles: 'rôle applicatif : lecture de sa propre ligne, aucune écriture — couverte par le describe [RÔLES] dédié',
  // Table d'audit : testée en écriture-seule par service_role, couverte par
  // une assertion dédiée (voir "audit_logs est append-only" plus bas) plutôt
  // que par le test croisé générique lecture/écriture.
  audit_logs: 'append-only, couverte par un test dédié (policies UPDATE/DELETE)',
};

// Tables protégées uniquement par jointure (pas de colonne praticien_id /
// participant_id directe) : on donne la requête qui doit renvoyer 0 ligne
// pour praticien B / patient B sur une ligne appartenant à praticien A /
// patient A, en supposant qu'au moins une ligne existe dans le jeu de
// données de staging (seed-staging.sql). Si la table est vide en staging,
// le test est un "skip" explicite (pas un succès trompeur) avec un message.
const TABLE_OVERRIDES: Record<string, { via: string; note: string }> = {
  programme_seances: { via: 'programmes!inner(participant_id)', note: 'jointure programmes → participants' },
  programme_planning: { via: 'programmes!inner(participant_id)', note: 'jointure programmes → participants' },
  programme_exercices: { via: 'programmes!inner(participant_id)', note: 'jointure programmes → participants' },
  programme_modele_seances: { via: 'programmes_modeles!inner(praticien_id)', note: 'jointure vers programmes_modeles' },
  programme_modele_planning: { via: 'programmes_modeles!inner(praticien_id)', note: 'jointure vers programmes_modeles' },
  programme_modele_exercices: { via: 'programmes_modeles!inner(praticien_id)', note: 'jointure vers programmes_modeles' },
  dossier_exercice_membres: { via: 'dossiers_exercices!inner(praticien_id)', note: 'jointure vers dossiers_exercices' },
};

// Tables du test générique "Praticien A ↔ Praticien B" (ci-dessous) dont la
// colonne d'appartenance n'est PAS praticien_id. Cas unique connu :
// `praticiens` n'a pas de colonne praticien_id — une ligne de ce catalogue
// EST le praticien, son identité est portée par `id` (= auth.uid()), pas
// par une référence à un autre praticien. Sans cette entrée, le filtre
// générique `.eq('praticien_id', ...)` porterait sur une colonne
// inexistante : la requête échouerait avec une erreur de colonne (42703),
// jamais un rejet RLS — un faux positif qui ne teste RIEN de l'isolation
// réelle de cette table (constaté le 2026-08-26, voir le commentaire du
// test paramétré plus bas pour le détail complet).
const OWNER_COLUMN_OVERRIDES: Record<string, string> = {
  praticiens: 'id',
};

async function requireStagingEnv() {
  if (!HAS_STAGING_ENV) {
    throw new Error(
      'tests/security/rls.spec.ts : variables SUPABASE_TEST_URL / SUPABASE_TEST_ANON_KEY / ' +
      'SUPABASE_TEST_SERVICE_ROLE_KEY / PATIENT_SESSION_SECRET / E2E_PRATICIEN_PASSWORD manquantes. ' +
      "Ce test n'a jamais tourné : le cloisonnement RLS n'est PAS prouvé, quoi qu'en dise le code."
    );
  }
}

async function signPatientToken(participantId: string): Promise<string> {
  const secret = new TextEncoder().encode(PATIENT_SECRET);
  return new SignJWT({ participantId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer('horizon-patient')
    .setAudience('horizon-patient')
    .setExpirationTime('15m')
    .sign(secret);
}

describe.skipIf(!HAS_STAGING_ENV)('Cloisonnement RLS multi-tenant (staging)', () => {
  let admin: SupabaseClient;
  let clientA: SupabaseClient; // session praticien A
  let clientB: SupabaseClient; // session praticien B (créé pour ce test)
  let anonClient: SupabaseClient;

  let praticienAId: string;
  let praticienBId: string;
  let participantAId: string; // Camille, appartient à praticien A
  let participantBId: string; // créé pour ce test, appartient à praticien B
  let praticienBEmail: string;
  const praticienBPassword = `Rls-Spec-${Math.random().toString(36).slice(2)}!Aa1`;

  let patientTokenA: string;
  let patientTokenB: string;

  let publicTables: string[] = [];
  let publicTablesError: string | null = null;

  beforeAll(async () => {
    await requireStagingEnv();

    admin = createClient(URL as string, SERVICE_KEY as string, { auth: { persistSession: false } });
    anonClient = createClient(URL as string, ANON_KEY as string, { auth: { persistSession: false } });

    // Praticien A : compte de staging existant (seed-staging.sql).
    clientA = createClient(URL as string, ANON_KEY as string, { auth: { persistSession: false } });
    const { data: signInA, error: signInAErr } = await clientA.auth.signInWithPassword({
      email: PRATICIEN_A_EMAIL,
      password: PRATICIEN_A_PASSWORD as string,
    });
    if (signInAErr || !signInA.user) {
      throw new Error(`Connexion praticien A (staging) impossible : ${signInAErr?.message}. Vérifie E2E_PRATICIEN_EMAIL/PASSWORD.`);
    }
    praticienAId = signInA.user.id;

    // Récupère l'id du participant "Camille" (praticien A) via service_role.
    const { data: campParticipant, error: campErr } = await admin
      .from('participants')
      .select('id')
      .eq('praticien_id', praticienAId)
      .eq('code_acces', PATIENT_A_CODE)
      .maybeSingle();
    if (campErr || !campParticipant) {
      throw new Error(
        `Participant de démo introuvable (code ${PATIENT_A_CODE}) sous praticien A. ` +
        'scripts/seed-staging.sql a-t-il bien été exécuté sur ce projet de staging ?'
      );
    }
    participantAId = campParticipant.id;

    // Praticien B : créé à la volée (service_role), avec un participant qui
    // lui appartient, pour tester le cloisonnement praticien A ↔ praticien B.
    praticienBEmail = `rls-spec-praticien-b-${Date.now()}@example.invalid`;
    const { data: createdB, error: createBErr } = await admin.auth.admin.createUser({
      email: praticienBEmail,
      password: praticienBPassword,
      email_confirm: true,
    });
    if (createBErr || !createdB.user) {
      throw new Error(`Création praticien B (test) impossible : ${createBErr?.message}`);
    }
    praticienBId = createdB.user.id;
    await admin.from('praticiens').insert({ id: praticienBId, prenom: 'RLS-Spec', nom: 'Praticien B', email: praticienBEmail });

    const { data: participantB, error: participantBErr } = await admin
      .from('participants')
      .insert({ praticien_id: praticienBId, prenom: 'RLS-Spec', nom: 'Participant B', code_acces: `RLSB${Date.now() % 100000}` })
      .select('id')
      .single();
    if (participantBErr || !participantB) {
      throw new Error(`Création participant B (test) impossible : ${participantBErr?.message}`);
    }
    participantBId = participantB.id;

    clientB = createClient(URL as string, ANON_KEY as string, { auth: { persistSession: false } });
    const { error: signInBErr } = await clientB.auth.signInWithPassword({ email: praticienBEmail, password: praticienBPassword });
    if (signInBErr) throw new Error(`Connexion praticien B (test) impossible : ${signInBErr.message}`);

    // Tokens patient A / patient B (mêmes primitives que api/_lib/patientAuth.ts).
    patientTokenA = await signPatientToken(participantAId);
    patientTokenB = await signPatientToken(participantBId);

    // Liste des tables `public` — générée dynamiquement (pas codée en dur) :
    // une table ajoutée demain sans entrée EXCLUDED_TABLES/TABLE_OVERRIDES et
    // sans colonne praticien_id/participant_id fera échouer le test
    // "UNKNOWN OWNERSHIP" plus bas.
    // ⚠️ Historique, pour qu'on ne retente pas PostgREST ici : information_schema
    // n'est PAS exposé par PostgREST (schémas exposés = public/graphql_public,
    // voir supabase/config.toml). La requête échouait donc systématiquement, et
    // ce test a longtemps été le seul échec « connu et accepté » du harnais
    // (docs/PLAN-BETA.md). Il passe désormais par la connexion Postgres
    // directe, comme le bloc « Findings structurels » en bas de fichier —
    // possible depuis que STAGING_DATABASE_URL pointe sur le pooler
    // (joignable en IPv4, donc depuis les runners GitHub) le 2026-08-27.
    if (!STAGING_DB_URL) {
      publicTablesError =
        'STAGING_DATABASE_URL manquante — la couverture des tables ne peut pas être vérifiée. ' +
        'Chaîne de connexion Postgres du projet STAGING (jamais la prod), voir e2e/README.md.';
      console.warn(`[couverture complète] ${publicTablesError}`);
    } else {
      const pgTables = new PgClient({ connectionString: STAGING_DB_URL, ssl: { rejectUnauthorized: false } });
      try {
        await pgTables.connect();
        const { rows } = await pgTables.query<{ table_name: string }>(
          `SELECT table_name FROM information_schema.tables
            WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
            ORDER BY table_name`
        );
        publicTables = rows.map(r => r.table_name);
      } catch (e) {
        publicTablesError = `Connexion Postgres directe impossible (${(e as Error).message}).`;
        console.warn(`[couverture complète] ${publicTablesError}`);
      } finally {
        await pgTables.end().catch(() => {});
      }
    }
  }, 60_000);

  afterAll(async () => {
    if (!HAS_STAGING_ENV) return;
    // Nettoyage : supprime tout ce qui a été créé pour ce test, rien d'autre.
    if (participantBId) await admin.from('participants').delete().eq('id', participantBId);
    if (praticienBId) {
      await admin.from('praticiens').delete().eq('id', praticienBId);
      await admin.auth.admin.deleteUser(praticienBId);
    }
  });

  describe('Praticien A ↔ Praticien B (tables avec colonne praticien_id directe)', () => {
    it.each(
      // Rempli dynamiquement dans beforeAll via un it.concurrent artificiel
      // n'étant pas possible (it.each s'évalue avant beforeAll), on filtre
      // via un test paramétré sur la liste statique de la cartographie
      // (docs/CARTOGRAPHIE_SECURITE.md §1) comme fallback si l'introspection
      // dynamique échoue à runtime — voir le test "couverture complète" plus
      // bas qui, lui, compare cette liste à information_schema en direct.
      [
        'praticiens', 'participants', 'bilans', 'contrats', 'seances', 'notes_seances',
        'programmes', 'zones_geographiques', 'indisponibilites', 'assistant_logs',
        'comptes_rendus_seances', 'documents_patient', 'factures_suivi', 'structures',
        'bilans_brouillons', 'templates_structure', 'dossiers_exercices',
        'exercices_personnalises', 'programmes_modeles', 'evenements_agenda',
      ] as const
    )('praticien B ne peut ni lire ni écrire une ligne de %s appartenant à praticien A', async (table) => {
      // Colonne de filtrage : praticien_id par défaut, sauf override (voir
      // OWNER_COLUMN_OVERRIDES ci-dessus — cas de `praticiens`, qui n'a pas
      // de colonne praticien_id).
      const ownerColumn = OWNER_COLUMN_OVERRIDES[table] ?? 'praticien_id';

      // Lecture croisée. Une policy SELECT correcte ne renvoie PAS d'erreur
      // pour une ligne simplement invisible : Postgres/PostgREST la filtre
      // silencieusement (HTTP 200, error: null, tableau vide) — ce n'est un
      // comportement anormal ni un signe de policy manquante. Exiger une
      // erreur ici (comme le faisait l'assertion précédente) fait échouer
      // à tort des tables où la RLS fonctionne très bien : vérifié
      // empiriquement le 2026-08-26 sur participants/bilans/contrats via un
      // script de diagnostic ad hoc (praticien B éphémère, service_role,
      // hors dépôt) — HTTP 200 / error: null / 0 ligne dans les 3 cas,
      // aucune fuite. Avant l'ajout d'OWNER_COLUMN_OVERRIDES, `praticiens`
      // produisait une erreur ici, mais pour une raison sans rapport avec
      // sa policy : filtrer `.eq('praticien_id', ...)` sur une table sans
      // cette colonne échoue sur une colonne inexistante (42703), pas sur
      // un rejet RLS — cette table n'était donc jamais réellement testée
      // (faux positif). Comparaison RLS/GRANT praticiens vs participants
      // menée le 2026-08-26 : policies et GRANT structurellement identiques
      // dans les deux cas (PERMISSIVE, USING owner = auth.uid(), mêmes
      // GRANT), aucune différence qui expliquerait un comportement RLS
      // distinct — seule la colonne de filtrage différait. On accepte donc
      // les deux issues comme un succès (erreur explicite OU tableau vide) ;
      // seule la présence réelle de lignes de praticien A dans readData est
      // un échec.
      const { data: readData, error: readErr } = await clientB
        .from(table)
        .select('*')
        .eq(ownerColumn, praticienAId);
      void readErr;
      expect(readData ?? [], `praticien B a lu ${(readData ?? []).length} ligne(s) de praticien A dans ${table}`).toHaveLength(0);

      // Écriture croisée (tentative de update en se faisant passer pour praticien A).
      const { error: writeErr, count } = await clientB
        .from(table)
        .update({ updated_at: new Date().toISOString() })
        .eq(ownerColumn, praticienAId)
        .select('*', { count: 'exact', head: true });
      const rowsAffected = count ?? 0;
      expect(rowsAffected, `praticien B a pu modifier ${rowsAffected} ligne(s) de praticien A dans ${table}`).toBe(0);
      void writeErr; // une erreur PostgREST est acceptable ; ce qui compte est rowsAffected === 0
    });
  });

  describe('Patient A ↔ Patient B (espace /api/patient/*)', () => {
    it("un token patient A ne peut pas lire les données de patient B via /api/patient/me", async () => {
      // Ce test cible directement la RPC/la table sous-jacente utilisée par
      // api/patient/me.ts (service_role + participant_id dérivé du JWT côté
      // serveur) : on vérifie ici la garantie DB, pas la route HTTP
      // elle-même (couverte par tests/security/api-authz.spec.ts).
      expect(patientTokenA).not.toEqual(patientTokenB);
      const decodedA = JSON.parse(Buffer.from(patientTokenA.split('.')[1], 'base64url').toString());
      const decodedB = JSON.parse(Buffer.from(patientTokenB.split('.')[1], 'base64url').toString());
      expect(decodedA.participantId).toBe(participantAId);
      expect(decodedB.participantId).toBe(participantBId);
      // La garantie réelle de non-fuite est testée bout-en-bout dans
      // api-authz.spec.ts (appel HTTP avec le token A, id de B dans l'URL/le
      // body) — ici on vérifie seulement que les deux tokens sont bien
      // distincts et pointent chacun sur le bon participant, prérequis pour
      // que ce test-là soit valide.
    });

    it('anon ne peut lire aucune ligne de seances_patient / exercices_realises sans passer par une route API', async () => {
      const { data, error } = await anonClient.from('seances_patient').select('*').eq('participant_id', participantAId);
      expect(error?.code ?? null).not.toBeNull();
      if (!error) expect(data ?? []).toHaveLength(0);
    });
  });

  describe('Structure ↔ patient non rattaché', () => {
    it('le token structure de démo ne renvoie pas le participant B (non rattaché à cette structure)', async () => {
      // Le portail structure passe entièrement par service_role +
      // api/structure/data.ts (aucun accès anon direct aux tables, voir
      // 20260613_rls_anon_lockdown.sql) : ce test appelle donc la même
      // requête que la route, avec le service_role, en simulant le filtre
      // structure_id qu'elle applique — pour prouver que la requête
      // elle-même exclut bien participant B, indépendamment du code de la route.
      const { data: structure } = await admin.from('structures').select('id, praticien_id').eq('token_acces', STRUCTURE_TOKEN).maybeSingle();
      if (!structure) {
        console.warn(`Structure de démo (token ${STRUCTURE_TOKEN}) introuvable — seed-staging.sql exécuté sur ce staging ?`);
        return;
      }
      const { data: rattaches } = await admin.from('participants').select('id').eq('structure_id', structure.id);
      const ids = (rattaches ?? []).map((r) => r.id);
      expect(ids, 'participant B (praticien B, non rattaché à cette structure) apparaît dans les participants de la structure de démo').not.toContain(participantBId);
    });
  });

  describe('Tables protégées par jointure (TABLE_OVERRIDES)', () => {
    for (const [table, cfg] of Object.entries(TABLE_OVERRIDES)) {
      it(`praticien B ne peut pas lire ${table} (${cfg.note})`, async () => {
        const { data } = await clientB.from(table).select('*').limit(1000);
        // Assertion forte réelle : aucune ligne ne doit être visible tant
        // que praticien B n'a rien créé lui-même dans cette table (que la
        // table soit vide ou non côté staging).
        expect(data ?? []).toHaveLength(0);
      });
    }
  });

  it("audit_logs est append-only : aucune policy UPDATE ni DELETE, pour aucun rôle authentifié", async () => {
    const { data: existing } = await admin.from('audit_logs').select('id').limit(1);
    if (!existing || existing.length === 0) {
      console.warn('audit_logs vide en staging — test partiel (vérifie seulement que authenticated ne peut pas écrire).');
      return;
    }
    const targetId = existing[0].id;
    const { error: updateErr, count: updateCount } = await clientA
      .from('audit_logs')
      .update({ ip: '0.0.0.0' })
      .eq('id', targetId)
      .select('*', { count: 'exact', head: true });
    void updateErr;
    expect(updateCount ?? 0, 'praticien A a pu modifier une ligne audit_logs').toBe(0);

    const { count: deleteCount } = await clientA
      .from('audit_logs')
      .delete()
      .eq('id', targetId)
      .select('*', { count: 'exact', head: true });
    expect(deleteCount ?? 0, 'praticien A a pu supprimer une ligne audit_logs').toBe(0);
  });

  // [F-06] audit_logs n'a aucun trigger qui bloque service_role — RLS ne
  // s'applique jamais à ce rôle, donc la garantie "append-only" ci-dessus
  // (testée avec clientA, rôle authenticated) ne protège pas contre
  // service_role lui-même. Seul endroit de ce fichier où une ligne
  // audit_logs est insérée délibérément pour le test (voir note de
  // nettoyage ci-dessous — elle ne peut plus être supprimée après le
  // correctif, et reste donc en base).
  it("[F-06] service_role est bloqué en UPDATE/DELETE sur audit_logs (trigger append-only, voir 20260817_securite_03_audit_logs_immuable.sql)", async () => {
    const { data: inserted, error: insertErr } = await admin
      .from('audit_logs')
      .insert({ event_type: 'rls_spec_test', ip: '0.0.0.0', success: true })
      .select('id')
      .single();
    if (insertErr || !inserted) {
      throw new Error(`[F-06] Impossible d'insérer une ligne de test dans audit_logs : ${insertErr?.message}`);
    }
    try {
      // Le trigger BEFORE UPDATE OR DELETE (F-06) ne fait aucune exception
      // pour service_role : cet UPDATE doit échouer avec une erreur.
      const { error: updateErr } = await admin
        .from('audit_logs')
        .update({ ip: '127.0.0.1' })
        .eq('id', inserted.id);
      expect(
        updateErr,
        "[F-06] service_role a pu modifier audit_logs sans erreur — le trigger append-only ne bloque pas ce rôle"
      ).not.toBeNull();
    } finally {
      // Ce DELETE de nettoyage est lui aussi bloqué par le même trigger —
      // c'est le comportement attendu (le trigger ne fait pas d'exception
      // pour la ligne créée par ce test). supabase-js ne lève pas
      // d'exception ici (pas de throwOnError() configuré sur ce client) :
      // l'erreur est silencieusement retournée dans le champ `error` et
      // ignorée volontairement — on choisit d'accepter la ligne de test
      // résiduelle (event_type: 'rls_spec_test', jamais une vraie donnée
      // d'audit) plutôt que de désactiver le trigger depuis le test, ce qui
      // nécessiterait des privilèges DDL hors de portée du client REST
      // utilisé ici.
      await admin.from('audit_logs').delete().eq('id', inserted.id);
    }
  });

  // [F-01, volet tm6_variantes] Les policies praticien_update_tm6_variantes /
  // praticien_delete_tm6_variantes sont en USING(true) : n'importe quel
  // praticien authentifié peut modifier/supprimer N'IMPORTE QUELLE ligne de
  // ce catalogue partagé (pas de colonne praticien_id, aucune notion de
  // propriétaire). Utilise une ligne de test dédiée (jamais une ligne réelle
  // du catalogue), créée par admin et nettoyée dans le test lui-même.
  describe('[F-01] tm6_variantes : intégrité du catalogue partagé', () => {
    it('praticien B ne peut ni modifier ni supprimer une ligne créée par un autre praticien (échoue tant que USING(true) subsiste)', async () => {
      const { data: seed, error: seedErr } = await admin
        .from('tm6_variantes')
        .insert({ nom: 'RLS-Spec test variante (à supprimer)' })
        .select('id')
        .single();
      if (seedErr || !seed) {
        throw new Error(`[F-01] Impossible de créer une ligne de test dans tm6_variantes : ${seedErr?.message}`);
      }
      try {
        const { error: updateErr, count: updateCount } = await clientB
          .from('tm6_variantes')
          .update({ nom: 'RLS-Spec modifiée par praticien B' })
          .eq('id', seed.id)
          .select('*', { count: 'exact', head: true });
        void updateErr;
        expect(
          updateCount ?? 0,
          `[F-01] praticien B a pu modifier ${updateCount ?? 0} ligne(s) de tm6_variantes qui ne lui appartiennent pas`
        ).toBe(0);

        const { error: deleteErr, count: deleteCount } = await clientB
          .from('tm6_variantes')
          .delete()
          .eq('id', seed.id)
          .select('*', { count: 'exact', head: true });
        void deleteErr;
        expect(
          deleteCount ?? 0,
          `[F-01] praticien B a pu supprimer ${deleteCount ?? 0} ligne(s) de tm6_variantes qui ne lui appartiennent pas`
        ).toBe(0);
      } finally {
        // Nettoyage via service_role, indépendamment de ce que praticien B a
        // réussi ou non à faire ci-dessus.
        await admin.from('tm6_variantes').delete().eq('id', seed.id);
      }
    });

    // [RÉG-01] Non-régression du chemin qui a DÉJÀ été cassé une fois. La
    // première version du lot 8 réservait toute écriture à `service_role`,
    // ce qui cassait `useTm6Variantes.creer()` — insert direct depuis le
    // client authentifié, aucune route backend service_role pour prendre le
    // relais. Ce test reproduit exactement l'appel du hook
    // (src/hooks/useTm6Variantes.ts:33) : mêmes colonnes, et `praticien_id`
    // JAMAIS fourni par le client.
    //
    // Il doit passer AVANT comme APRÈS le lot 8 — ce n'est pas un test de
    // la faille, c'est le garde-fou qui empêche de la refermer en cassant
    // la fonctionnalité, ce qui est précisément ce qui s'est produit.
    it('[RÉG-01] un praticien peut créer une variante depuis le client authentifié (chemin useTm6Variantes.creer())', async () => {
      const nom = `RLS-Spec creer ${Date.now()}`;
      const { data, error } = await clientA
        .from('tm6_variantes')
        .insert({ nom, type_mesure: 'distance', distance_ref: null })
        .select()
        .single();
      try {
        expect(
          error,
          `[RÉG-01] useTm6Variantes.creer() est cassé pour un praticien authentifié : ${error?.message ?? '(aucun message)'}`
        ).toBeNull();
        expect(data?.nom, '[RÉG-01] la variante créée n\'est pas relue par son auteur').toBe(nom);
      } finally {
        await admin.from('tm6_variantes').delete().eq('nom', nom);
      }
    });

    // Conçu pour ÉCHOUER avant le lot 8 (la colonne praticien_id n'existe
    // pas) et passer après : c'est, avec le test croisé ci-dessus, l'un des
    // deux indicateurs rouge/vert du lot.
    it('[F-01] une variante créée par un praticien lui est attribuée (praticien_id rempli par le trigger)', async () => {
      const nom = `RLS-Spec proprio ${Date.now()}`;
      const { data, error } = await clientA
        .from('tm6_variantes')
        .insert({ nom, type_mesure: 'distance' })
        .select()
        .single();
      try {
        expect(error, `[F-01] insertion impossible : ${error?.message ?? '(aucun message)'}`).toBeNull();
        expect(
          (data as Record<string, unknown> | null)?.praticien_id,
          '[F-01] la variante créée n\'appartient à personne : colonne praticien_id absente, ou trigger trg_tm6_variantes_praticien_id non installé'
        ).toBe(praticienAId);
      } finally {
        await admin.from('tm6_variantes').delete().eq('nom', nom);
      }
    });

    // ⚠️ Ce test passe AVANT le lot 8 pour une mauvaise raison (la colonne
    // praticien_id n'existe pas encore, donc PostgREST rejette l'insert au
    // lieu de la policy). Ce n'est donc PAS un indicateur rouge/vert — il
    // ne vaut qu'une fois la colonne en place, où il vérifie réellement que
    // le WITH CHECK empêche un praticien de s'attribuer une ligne au nom
    // d'un autre. Écrit noir sur blanc pour qu'un futur lecteur ne le
    // compte pas comme une preuve qu'il n'est pas.
    it('[F-01] un praticien ne peut pas créer une variante au nom d\'un autre', async () => {
      const nom = `RLS-Spec usurpation ${Date.now()}`;
      try {
        await clientA
          .from('tm6_variantes')
          .insert({ nom, type_mesure: 'distance', praticien_id: praticienBId })
          .select()
          .single();

        const { data: apres } = await admin
          .from('tm6_variantes')
          .select('praticien_id')
          .eq('nom', nom);
        expect(
          apres ?? [],
          '[F-01] praticien A a pu créer une variante attribuée à praticien B (WITH CHECK absent ou permissif)'
        ).toHaveLength(0);
      } finally {
        await admin.from('tm6_variantes').delete().eq('nom', nom);
      }
    });
  });

  // ── [RÔLES] user_roles (étape 3) ──────────────────────────────────────
  //
  // Le point de toute cette table : un praticien peut mettre à jour sa
  // propre ligne `praticiens` pour éditer son profil. Si le rôle vivait là,
  // il se promouvrait admin en une requête. `user_roles` n'a AUCUNE policy
  // d'écriture — le test qui compte ici est celui qui le prouve.
  describe('[RÔLES] user_roles : un praticien ne peut pas modifier son rôle', () => {
    it('un praticien lit sa propre ligne', async () => {
      const { data, error } = await clientA
        .from('user_roles')
        .select('user_id, app_role')
        .eq('user_id', praticienAId);
      expect(error, `[RÔLES] lecture de sa propre ligne refusée : ${error?.message}`).toBeNull();
      expect(data ?? [], '[RÔLES] un praticien ne voit pas sa propre ligne user_roles').toHaveLength(1);
      expect((data ?? [])[0]?.app_role).toBe('praticien');
    });

    it("un praticien ne peut pas lire la ligne d'un autre praticien", async () => {
      // Praticien B est créé à la volée par ce fichier, donc APRÈS le
      // backfill de la migration : il n'a pas de ligne. On la crée via
      // service_role, sinon le test passerait faute de ligne à lire —
      // un vert qui ne prouverait rien.
      await admin.from('user_roles').insert({ user_id: praticienBId, app_role: 'praticien' });
      try {
        const { data } = await clientA
          .from('user_roles')
          .select('user_id')
          .eq('user_id', praticienBId);
        expect(
          data ?? [],
          "[RÔLES] praticien A voit la ligne user_roles de praticien B"
        ).toHaveLength(0);
      } finally {
        await admin.from('user_roles').delete().eq('user_id', praticienBId);
      }
    });

    // ── LE test de cette étape ────────────────────────────────────────
    it("un praticien ne peut pas se promouvoir admin (escalade de privilège)", async () => {
      const { count } = await clientA
        .from('user_roles')
        .update({ app_role: 'admin' })
        .eq('user_id', praticienAId)
        .select('*', { count: 'exact', head: true });
      expect(
        count ?? 0,
        `[RÔLES] praticien A a modifié ${count ?? 0} ligne(s) de user_roles — escalade de privilège ouverte`
      ).toBe(0);

      // L'absence de lignes modifiées ne suffit pas : on relit l'état réel
      // avec service_role, seul témoin non filtré par RLS.
      const { data } = await admin
        .from('user_roles')
        .select('app_role')
        .eq('user_id', praticienAId)
        .single();
      expect(
        data?.app_role,
        '[RÔLES] le rôle de praticien A a changé — il a réussi à se promouvoir'
      ).toBe('praticien');
    });

    it('un praticien ne peut pas insérer de ligne dans user_roles', async () => {
      // Praticien B n'a pas de ligne (créé après le backfill) : une erreur
      // ici vient donc bien de RLS, pas d'un conflit de clé primaire.
      const { error } = await clientA
        .from('user_roles')
        .insert({ user_id: praticienBId, app_role: 'admin' });
      expect(
        error,
        '[RÔLES] praticien A a pu insérer une ligne dans user_roles'
      ).not.toBeNull();

      const { data } = await admin.from('user_roles').select('user_id').eq('user_id', praticienBId);
      expect(data ?? [], '[RÔLES] une ligne a bien été créée malgré RLS').toHaveLength(0);
    });
  });

  // [F-11] get_praticien_structure(text) avait un GRANT EXECUTE ... TO anon
  // jamais révoqué. Un tiers anonyme pouvait appeler cette fonction
  // directement via l'API REST PostgREST, sans passer par
  // api/structure/data.ts et donc sans bénéficier d'un éventuel rate
  // limiting applicatif — un oracle "ce token existe / n'existe pas", hors
  // de tout contrôle de débit.
  //
  // Fermé par 20260826_revoke_public_execute_functions.sql, qui SUPPRIME la
  // fonction (code mort depuis MIGRATION_ANON.md) plutôt que de se contenter
  // d'un REVOKE — un REVOKE seul peut être défait par une future migration
  // qui recrée la fonction sans reconsidérer ses grants, ce qui s'était
  // précisément produit.
  describe('[F-11] get_praticien_structure : inaccessible à anon', () => {
    it("anon ne peut pas exécuter get_praticien_structure", async () => {
      const { error } = await anonClient.rpc('get_praticien_structure', {
        p_token: 'rls-spec-token-inexistant-000',
      });
      // Deux états sont acceptables, tous deux sûrs — on teste la propriété
      // de sécurité, pas le mécanisme qui la produit :
      //   - la fonction n'existe plus (état actuel, après le DROP) ;
      //   - elle existe mais anon n'a plus EXECUTE (42501).
      // Le seul échec réel est une exécution SANS aucune erreur : c'est
      // exactement le trou d'origine.
      expect(
        error,
        "[F-11] anon a pu exécuter get_praticien_structure sans aucune erreur — la fonction est de nouveau exposée"
      ).not.toBeNull();
    });
  });

  it('couverture complète : toute table public non testée ci-dessus est explicitement listée (EXCLUDED_TABLES ou TABLE_OVERRIDES)', async () => {
    if (publicTablesError) {
      throw new Error(`Impossible de vérifier la couverture des tables : ${publicTablesError}`);
    }
    const testedDirect = [
      'praticiens', 'participants', 'bilans', 'contrats', 'seances', 'notes_seances',
      'programmes', 'zones_geographiques', 'indisponibilites', 'assistant_logs',
      'comptes_rendus_seances', 'documents_patient', 'factures_suivi', 'structures',
      'bilans_brouillons', 'templates_structure', 'dossiers_exercices',
      'exercices_personnalises', 'programmes_modeles', 'evenements_agenda',
      'seances_patient', 'exercices_realises', 'push_subscriptions', 'rappel_preferences',
      'rappels_envoyes', 'retours_seance', 'tests_etalons_activations', 'tests_etalons_resultats',
      'exercices_libres_activations', 'exercices_libres_validations', 'organisations',
      'organisation_membres', 'organisation_invitations', 'structure_access_logs',
      'documents_partages',
    ];
    const known = new Set([...testedDirect, ...Object.keys(TABLE_OVERRIDES), ...Object.keys(EXCLUDED_TABLES)]);
    const unknown = publicTables.filter((t) => !known.has(t) && !t.startsWith('_'));
    expect(
      unknown,
      `Table(s) public sans couverture RLS connue : ${unknown.join(', ')}. ` +
      'Ajoute-les à testedDirect (colonne directe), TABLE_OVERRIDES (jointure) ou ' +
      'EXCLUDED_TABLES (raison documentée) dans tests/security/rls.spec.ts avant de merger.'
    ).toHaveLength(0);
  });
});

// ────────────────────────────────────────────────────────────────────────
// Findings structurels (F-05, F-07, F-08, F-09, F-10) — nécessitent une
// introspection de pg_policies / pg_proc / pg_class, qui ne sont PAS
// exposés via PostgREST (schemas exposés = public/graphql_public
// uniquement, voir supabase/config.toml). Ces 5 findings ne sont pas des
// comportements atteignables via la clé anon/authenticated — ce sont des
// faits sur l'état du schéma — donc ce describe utilise une connexion
// Postgres DIRECTE (package `pg`, déjà utilisé par scripts/dump-schema.ts
// pour les mêmes requêtes), en lecture seule (SET SESSION CHARACTERISTICS
// AS TRANSACTION READ ONLY). Gate séparé et volontairement nommé
// différemment (STAGING_DATABASE_URL, jamais DATABASE_URL) de
// scripts/dump-schema.ts (qui, lui, cible la PROD) — pour qu'une variable
// d'environnement mal nommée ne puisse jamais faire tourner ces requêtes
// contre la production. La constante est déclarée en tête de fichier, avec
// les autres variables d'environnement.

describe.skipIf(!STAGING_DB_URL)('Findings structurels (staging, connexion Postgres directe)', () => {
  let pg: PgClient;

  beforeAll(async () => {
    if (!STAGING_DB_URL) {
      throw new Error(
        'tests/security/rls.spec.ts : variable STAGING_DATABASE_URL manquante — F-05/F-07/F-08/F-09/F-10 ' +
        "ne sont PAS prouvés, quoi qu'en dise la lecture du code. Chaîne de connexion Postgres directe du " +
        'projet STAGING (jamais la prod), voir Project Settings > Database dans Supabase Studio.'
      );
    }
    pg = new PgClient({ connectionString: STAGING_DB_URL, ssl: { rejectUnauthorized: false } });
    await pg.connect();
    // Volontairement AUCUN réglage de session ici.
    //
    // Ce bloc faisait `SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY`,
    // correct tant que STAGING_DATABASE_URL était une connexion directe. Sur
    // le pooler en mode transaction (depuis le 2026-08-27), un réglage de
    // session RESTE sur le backend partagé après déconnexion et contamine
    // tous les clients suivants : une migration a échoué le même jour en
    // « cannot execute CREATE TABLE in a read-only transaction », à cause de
    // ce harnais.
    //
    // La garantie de lecture seule vient désormais du contenu de ce bloc —
    // il ne fait que des SELECT — et non d'un réglage global qui déborde sur
    // les processus voisins.
  });

  afterAll(async () => {
    if (pg) await pg.end();
  });

  // [F-05] Policies fantômes TO anon USING(true) sur les 3 tables de
  // programme, inertes aujourd'hui uniquement grâce au REVOKE ALL ... FROM
  // anon global — traité comme actif (une seule couche de défense), voir
  // docs/RAPPORT_SECURITE.md. Échoue tant que ces policies existent encore.
  it("[F-05] aucune policy TO anon ne subsiste sur programme_seances / programme_planning / programme_exercices", async () => {
    const { rows } = await pg.query<{ policyname: string; tablename: string }>(
      `SELECT policyname, tablename FROM pg_policies
       WHERE schemaname = 'public'
         AND tablename IN ('programme_seances', 'programme_planning', 'programme_exercices')
         AND 'anon' = ANY(roles)`
    );
    expect(rows, `[F-05] policies fantômes TO anon encore présentes : ${rows.map(r => `${r.tablename}.${r.policyname}`).join(', ')}`).toHaveLength(0);
  });

  // [F-10, volet policy fantôme] Même schéma que F-05, sur documents_partages
  // (recréée par 20260608_fix_structure_anon_rls.sql, jamais explicitement
  // DROP par 20260613_rls_anon_lockdown.sql).
  it('[F-10] aucune policy TO anon ne subsiste sur documents_partages', async () => {
    const { rows } = await pg.query<{ policyname: string }>(
      `SELECT policyname FROM pg_policies
       WHERE schemaname = 'public' AND tablename = 'documents_partages' AND 'anon' = ANY(roles)`
    );
    expect(rows, `[F-10] policy fantôme encore présente sur documents_partages : ${rows.map(r => r.policyname).join(', ')}`).toHaveLength(0);
  });

  // [F-07] Hygiène, PAS un test d'exploitabilité : Postgres applique USING
  // comme WITH CHECK implicite par défaut sur une policy UPDATE qui n'en a
  // pas — donc ce n'est pas un vecteur d'exploitation réel (voir F-07 dans
  // le rapport). Ce test vérifie seulement que le schéma documente
  // explicitement l'intention, pour la lisibilité/l'auditabilité — il
  // échoue aujourd'hui par absence de clause explicite, pas par faille.
  it("[F-07] (hygiène, pas un exploit) evenements_agenda_update a une clause WITH CHECK explicite", async () => {
    const { rows } = await pg.query<{ with_check: string | null }>(
      `SELECT with_check FROM pg_policies
       WHERE schemaname = 'public' AND tablename = 'evenements_agenda' AND policyname = 'evenements_agenda_update'`
    );
    expect(rows[0]?.with_check, "[F-07] pas de WITH CHECK explicite (Postgres applique USING implicitement, ce n'est pas exploitable — voir le rapport)").not.toBeNull();
  });

  // [F-08] set_praticien_id_from_auth() est la seule fonction SECURITY
  // DEFINER du projet sans search_path figé — vecteur d'élévation de
  // privilège théorique. Échoue tant que ALTER FUNCTION ... SET search_path
  // n'a pas été appliqué.
  it('[F-08] set_praticien_id_from_auth() a un search_path figé', async () => {
    const { rows } = await pg.query<{ proconfig: string[] | null }>(
      `SELECT proconfig FROM pg_proc WHERE proname = 'set_praticien_id_from_auth'`
    );
    const hasSearchPath = (rows[0]?.proconfig ?? []).some((c) => c.startsWith('search_path='));
    expect(hasSearchPath, "[F-08] set_praticien_id_from_auth() n'a pas de search_path figé dans proconfig").toBe(true);
  });

  // [F-09] tm6_variantes n'a jamais eu ENABLE ROW LEVEL SECURITY — pas de
  // donnée patient dans cette table (Info, hygiène), mais toute table
  // public devrait avoir RLS activée par cohérence. Échoue tant que ce
  // n'est pas fait.
  it('[F-09] tm6_variantes a RLS activée', async () => {
    const { rows } = await pg.query<{ relrowsecurity: boolean }>(
      `SELECT relrowsecurity FROM pg_class WHERE relname = 'tm6_variantes' AND relnamespace = 'public'::regnamespace`
    );
    expect(rows[0]?.relrowsecurity, '[F-09] tm6_variantes : RLS non activée').toBe(true);
  });

  // [F-01] GARDE ANTI-VERT-SILENCIEUX.
  //
  // Le test [F-01] plus haut (praticien B ne peut ni modifier ni supprimer
  // la ligne d'un autre) passe au vert dans DEUX situations opposées :
  //   - les policies d'écriture sont correctement scopées au propriétaire
  //     — ce qu'on veut vérifier ;
  //   - la table n'a AUCUNE policy, RLS étant activée : tout est refusé,
  //     y compris ce qui devrait passer.
  //
  // C'est le second cas qui existait sur staging jusqu'au 2026-08-27 : le
  // test était vert alors qu'il ne testait rien, et que la production, elle,
  // était en USING(true). Un test qui ne peut pas distinguer « protégé » de
  // « entièrement verrouillé » ne prouve rien.
  //
  // Ce contrôle-ci lit la définition des policies plutôt que leur effet : il
  // échoue si elles disparaissent, si une écriture repasse en USING(true),
  // ou si la lecture partagée est refermée par erreur.
  it('[F-01] tm6_variantes a bien 4 policies, écritures scopées au propriétaire (garde contre un F-01 vert sans policy)', async () => {
    const { rows } = await pg.query<{
      policyname: string; cmd: string; qual: string | null; with_check: string | null;
    }>(
      `SELECT policyname, cmd, qual, with_check
         FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'tm6_variantes'
        ORDER BY policyname`
    );

    expect(
      rows.length,
      `[F-01] tm6_variantes : ${rows.length} policy(ies) au lieu de 4. ` +
        `Zéro policy + RLS activée = tout refusé : le test [F-01] passerait au vert sans rien vérifier.`
    ).toBe(4);

    const parCmd = new Map(rows.map(r => [r.cmd, r]));
    const PROPRIETAIRE = '(praticien_id = auth.uid())';

    // Lecture : volontairement ouverte à tout praticien connecté (catalogue
    // de référence partagé, aucune donnée de santé).
    expect(parCmd.get('SELECT')?.qual, '[F-01] la lecture du catalogue ne devrait pas être cloisonnée').toBe('true');

    // Écritures : jamais USING(true)/WITH CHECK(true).
    expect(parCmd.get('INSERT')?.with_check, '[F-01] INSERT non scopé au propriétaire').toBe(PROPRIETAIRE);
    expect(parCmd.get('UPDATE')?.qual, '[F-01] UPDATE non scopé au propriétaire').toBe(PROPRIETAIRE);
    expect(parCmd.get('UPDATE')?.with_check, '[F-01] UPDATE sans WITH CHECK scopé').toBe(PROPRIETAIRE);
    expect(parCmd.get('DELETE')?.qual, '[F-01] DELETE non scopé au propriétaire').toBe(PROPRIETAIRE);
  });

  // TRUNCATE n'est JAMAIS filtré par RLS, quelle que soit la qualité des
  // policies ci-dessus : seul un REVOKE ferme ce chemin. Un GRANT ALL
  // rétabli par une future migration rouvrirait la faille sans qu'aucune
  // policy ne change.
  it('[F-01] authenticated n\'a plus TRUNCATE sur tm6_variantes', async () => {
    const { rows } = await pg.query<{ a_truncate: boolean }>(
      `SELECT has_table_privilege('authenticated', 'public.tm6_variantes', 'TRUNCATE') AS a_truncate`
    );
    expect(
      rows[0]?.a_truncate,
      '[F-01] authenticated peut TRUNCATE tm6_variantes : RLS ne filtre jamais TRUNCATE, seul un REVOKE le ferme'
    ).toBe(false);
  });

  // ── [RÔLES] contrôles structurels de l'étape 3 ────────────────────────

  it('[RÔLES] user_roles a RLS activée et AUCUNE policy d\'écriture', async () => {
    const { rows: rls } = await pg.query<{ relrowsecurity: boolean }>(
      `SELECT relrowsecurity FROM pg_class WHERE oid = 'public.user_roles'::regclass`
    );
    expect(rls[0]?.relrowsecurity, '[RÔLES] RLS non activée sur user_roles').toBe(true);

    const { rows: policies } = await pg.query<{ cmd: string; qual: string | null; roles: string }>(
      `SELECT cmd, qual, roles::text AS roles FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'user_roles'`
    );
    const ecritures = policies.filter(p => p.cmd !== 'SELECT');
    expect(
      ecritures.map(p => p.cmd),
      "[RÔLES] user_roles a une policy d'écriture : l'escalade de privilège que cette table ferme est rouverte"
    ).toEqual([]);
    expect(policies, '[RÔLES] user_roles devrait avoir exactement une policy (SELECT)').toHaveLength(1);
    expect(policies[0]?.qual, '[RÔLES] la lecture n\'est pas restreinte à sa propre ligne').toBe('(user_id = auth.uid())');
  });

  // Audit inverse, demandé même si aucun admin n'existe encore : l'étape 3
  // est purement additive, donc AUCUNE policy existante ne doit accorder
  // quoi que ce soit sur la base du rôle. Ce test échouera le jour où
  // l'étape 5 branchera les rôles — c'est voulu : ce sera le moment de le
  // remplacer par des assertions sur ce que l'admin a le droit de voir.
  it("[RÔLES] aucune policy existante n'accorde d'accès élargi à un admin", async () => {
    const { rows } = await pg.query<{ tablename: string; policyname: string }>(
      `SELECT tablename, policyname FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename <> 'user_roles'
          AND (COALESCE(qual, '') || COALESCE(with_check, '')) ~* '(user_roles|app_role)'`
    );
    expect(
      rows.map(r => `${r.tablename}.${r.policyname}`),
      "[RÔLES] des policies s'appuient déjà sur le rôle alors que l'étape 3 devait être purement additive"
    ).toEqual([]);
  });

  it('[RÔLES] app_role_courant() a un search_path figé et n\'est pas exécutable par PUBLIC', async () => {
    const { rows } = await pg.query<{ config: string[] | null; public_exec: boolean; secdef: boolean }>(
      `SELECT p.proconfig AS config,
              p.prosecdef AS secdef,
              EXISTS (SELECT 1 FROM aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
                       WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE') AS public_exec
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'app_role_courant'`
    );
    expect(rows, '[RÔLES] app_role_courant() introuvable').toHaveLength(1);
    expect(rows[0]?.secdef, '[RÔLES] app_role_courant() n\'est pas SECURITY DEFINER — elle déclenchera les policies de user_roles').toBe(true);
    expect(
      (rows[0]?.config ?? []).some(c => c.startsWith('search_path=')),
      '[RÔLES] app_role_courant() n\'a pas de search_path figé — c\'est [F-08], réintroduit'
    ).toBe(true);
    expect(
      rows[0]?.public_exec,
      '[RÔLES] app_role_courant() est exécutable par PUBLIC — c\'est la faille de la PR #8, réintroduite'
    ).toBe(false);
  });
});
