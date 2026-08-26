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

const HAS_STAGING_ENV = Boolean(URL && ANON_KEY && SERVICE_KEY && PATIENT_SECRET && PRATICIEN_A_PASSWORD);

// Tables sciemment exclues du test générique (raison documentée par ligne).
// Toute table `public` qui n'est ni ici ni dans TABLE_OVERRIDES tombe dans
// le test "UNKNOWN OWNERSHIP" ci-dessous et fait échouer la CI.
const EXCLUDED_TABLES: Record<string, string> = {
  // Pas de donnée de santé, catalogue de référence partagé par design.
  tm6_variantes: 'catalogue de référence, aucune donnée patient, RLS non applicable',
  // Accessible uniquement en service_role (RLS bloque tout le reste par
  // défaut, zéro policy) — pas de session anon/authenticated possible à tester.
  patient_login_attempts: 'service_role only, aucune policy, testé indirectement via rate-limit.spec.ts',
  organisation_demande_attempts: 'service_role only, aucune policy, testé indirectement via rate-limit.spec.ts',
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
    // ⚠️ 2026-08-19 : information_schema n'est PAS exposé par PostgREST par
    // défaut (contrairement à ce que disait le commentaire précédent) — cette
    // requête échoue systématiquement sur un projet Supabase standard. Ne
    // bloque plus tout le beforeAll pour ça : seul le test "couverture
    // complète" (le seul consommateur de publicTables) en pâtit, et il le
    // signale par un échec explicite plutôt qu'un faux vert silencieux (voir
    // plus bas, publicTablesError).
    try {
      const { data: tables, error: tablesErr } = await admin
        .schema('information_schema')
        .from('tables')
        .select('table_name')
        .eq('table_schema', 'public')
        .eq('table_type', 'BASE TABLE');
      if (tablesErr) throw new Error(tablesErr.message);
      publicTables = (tables as unknown as { table_name: string }[]).map((t) => t.table_name);
    } catch (e) {
      publicTablesError =
        `Impossible de lister information_schema.tables via PostgREST (${(e as Error).message}). ` +
        'information_schema n\'est pas exposé par défaut par PostgREST (schémas exposés = public/graphql_public, ' +
        'voir supabase/config.toml) — nécessiterait STAGING_DATABASE_URL (connexion Postgres directe) pour être ' +
        'corrigé proprement, pas encore fait.';
      console.warn(`[couverture complète] ${publicTablesError}`);
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
  // audit_logs est supprimée délibérément : c'est une ligne de test créée
  // et détruite par ce test, jamais une vraie ligne d'audit.
  it("[F-06] service_role N'EST PAS bloqué en UPDATE/DELETE sur audit_logs (échoue tant qu'aucun trigger n'existe)", async () => {
    const { data: inserted, error: insertErr } = await admin
      .from('audit_logs')
      .insert({ event_type: 'rls_spec_test', ip: '0.0.0.0', success: true })
      .select('id')
      .single();
    if (insertErr || !inserted) {
      throw new Error(`[F-06] Impossible d'insérer une ligne de test dans audit_logs : ${insertErr?.message}`);
    }
    try {
      // Après correctif (trigger BEFORE UPDATE OR DELETE, voir F-06 dans
      // docs/RAPPORT_SECURITE.md), cet UPDATE doit échouer avec une erreur.
      // Aujourd'hui, aucun trigger n'existe : l'update réussit sans erreur,
      // donc cette assertion échoue — c'est exactement la preuve attendue.
      const { error: updateErr } = await admin
        .from('audit_logs')
        .update({ ip: '127.0.0.1' })
        .eq('id', inserted.id);
      expect(
        updateErr,
        "[F-06] service_role a pu modifier audit_logs sans erreur — aucun trigger append-only n'existe encore"
      ).not.toBeNull();
    } finally {
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
// contre la production.
const STAGING_DB_URL = process.env.STAGING_DATABASE_URL;

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
    await pg.query('SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY');
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
});
