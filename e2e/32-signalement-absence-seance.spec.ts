import { test, expect, type APIRequestContext } from '@playwright/test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { skipUnlessE2E, env } from './helpers.js';
import { clientAdminTest } from './nettoyageTest.js';

// Chantier « signalement d'absence patient », lot 1 (A + B + D) : vérifie
// l'action 'seance-absence' de /api/patient/activite au niveau HTTP — pas
// d'écran encore (lot C, hors périmètre), donc pas de test piloté par l'UI.
//
// Connexion patient mutualisée sur TOUT le fichier (test.describe.serial +
// beforeAll), pas une par test : 09-rate-limit-connexion-patient.spec.ts
// épuise DÉLIBÉRÉMENT le quota de connexion (5 tentatives / 15 min / IP,
// api/_lib/patientAuth.ts) pour prouver le 429, quota partagé par TOUS les
// tests d'un même run CI (même IP de sortie du runner — un en-tête
// X-Forwarded-For fourni par le client n'y change rien, Vercel ne le fait
// pas remonter tel quel côté fonction, vérifié). Une connexion par test
// (4 tentatives) a suffi à se faire bloquer. Deux participants, deux
// connexions pour TOUT le fichier : chaque test insère/nettoie seulement
// SES séances, jamais un nouveau participant.
//
// Fixtures e2e dédiées (jamais Camille/Julien), nettoyage par identifiant
// précis — même discipline que 08-portail-structure.spec.ts.

interface FixtureParticipant {
  participantId: string;
  token: string;
}

async function resoudrePraticienId(admin: SupabaseClient): Promise<string> {
  const { data: usersPage, error } = await admin.auth.admin.listUsers();
  const praticien = error ? undefined : usersPage.users.find(u => u.email === env.praticienEmail);
  if (!praticien) throw new Error(`Praticien e2e introuvable (${env.praticienEmail}) : ${error?.message ?? 'aucune correspondance'}`);
  return praticien.id;
}

// Crée un participant e2e dédié (sans séance) et se connecte pour obtenir un
// vrai jeton (même chemin que le login réel : /api/patient/session, pas de
// jeton fabriqué à la main dans le test).
async function creerParticipantEtConnecter(
  admin: SupabaseClient,
  request: APIRequestContext,
  praticienId: string,
  marqueur: string,
): Promise<FixtureParticipant> {
  const codeAcces = `E2E${marqueur}`.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);

  const { data: participant, error: participantErr } = await admin
    .from('participants')
    .insert({
      praticien_id: praticienId,
      prenom: 'Test',
      nom: `E2E${marqueur}`,
      code_acces: codeAcces,
      // Trigger BEFORE INSERT trg_participants_consentement_rgpd_creation
      // (supabase/migrations/20260913_rgpd_consentement_creation.sql).
      rgpd: { consentementObtenu: true, consentementDate: new Date().toISOString().slice(0, 10), methodeConsentement: 'numerique' },
    })
    .select('id')
    .single();
  if (participantErr || !participant) throw new Error(`Création participant (fixture e2e) échouée : ${participantErr?.message}`);

  try {
    const resLogin = await request.post('/api/patient/session', { data: { code: codeAcces } });
    const bodyLogin = await resLogin.json().catch(() => ({}));
    if (!resLogin.ok() || !bodyLogin.token) throw new Error(`Connexion patient (fixture e2e) échouée : ${JSON.stringify(bodyLogin)}`);
    return { participantId: participant.id, token: bodyLogin.token };
  } catch (err) {
    // Auto-nettoyante en cas d'échec partiel (même leçon que
    // 08-portail-structure.spec.ts : un essai précédent avait laissé des
    // fixtures orphelines quand la création échouait APRÈS coup).
    await admin.from('participants').delete().eq('id', participant.id);
    throw err;
  }
}

async function creerSeance(
  admin: SupabaseClient,
  praticienId: string,
  participantId: string,
  seance: { date: string; heureDebut: string },
): Promise<string> {
  const { data: seanceRow, error } = await admin
    .from('seances')
    .insert({
      praticien_id: praticienId,
      participant_id: participantId,
      date: seance.date,
      heure_debut: seance.heureDebut,
      heure_fin: seance.heureDebut,
      duree_minutes: 45,
      type: 'seance',
      statut: 'planifiee',
    })
    .select('id')
    .single();
  if (error || !seanceRow) throw new Error(`Création séance (fixture e2e) échouée : ${error?.message}`);
  return seanceRow.id;
}

test.describe.serial('Signalement d\'absence — /api/patient/activite (type "seance-absence")', () => {
  let admin: SupabaseClient | null = null;
  let praticienId = '';
  let participantA: FixtureParticipant | null = null;
  let participantB: FixtureParticipant | null = null;
  const marqueur = Date.now().toString(36);

  test.beforeAll(async ({ request }) => {
    if (!env.praticienEmail || !env.praticienPassword || !process.env.E2E_BASE_URL) return;
    admin = clientAdminTest();
    if (!admin) return;
    praticienId = await resoudrePraticienId(admin);
    // B n'existe que pour prouver l'isolation dans le premier test : l'action
    // de A ne doit jamais atteindre sa ligne, alors même qu'aucun id n'est
    // envoyé au serveur — la preuve porte justement sur ce point.
    participantA = await creerParticipantEtConnecter(admin, request, praticienId, `sigA${marqueur}`);
    participantB = await creerParticipantEtConnecter(admin, request, praticienId, `sigB${marqueur}`);
  });

  test.afterAll(async () => {
    if (!admin) return;
    // ON DELETE CASCADE emporte les séances de chaque test (supabase/schema.sql).
    if (participantA) await admin.from('participants').delete().eq('id', participantA.participantId);
    if (participantB) await admin.from('participants').delete().eq('id', participantB.participantId);
  });

  test.beforeEach(() => {
    skipUnlessE2E();
    test.skip(!admin, 'SUPABASE_TEST_SERVICE_ROLE_KEY non défini (voir e2e/README.md) — impossible de créer la fixture');
  });

  test('signale puis se rétracte, sans jamais toucher la séance d\'un autre participant', async ({ request }) => {
    test.setTimeout(30000);
    const demain = new Date();
    demain.setDate(demain.getDate() + 1);
    const dateDemain = demain.toISOString().slice(0, 10);

    const seanceIdA = await creerSeance(admin!, praticienId, participantA!.participantId, { date: dateDemain, heureDebut: '10:00' });
    const seanceIdB = await creerSeance(admin!, praticienId, participantB!.participantId, { date: dateDemain, heureDebut: '11:00' });
    try {
      // ── Signalement ──────────────────────────────────────────────────────
      const resSignaler = await request.post('/api/patient/activite', {
        headers: { Authorization: `Bearer ${participantA!.token}` },
        data: { type: 'seance-absence', signale: true },
      });
      expect(resSignaler.status()).toBe(200);
      expect(await resSignaler.json()).toMatchObject({ ok: true, seanceId: seanceIdA, absenceSignalee: true });

      const { data: seanceAApres } = await admin!.from('seances').select('absence_signalee_par_patient_le').eq('id', seanceIdA).single();
      expect(seanceAApres?.absence_signalee_par_patient_le).not.toBeNull();

      // ── Isolation : la séance de B est INTACTE ──────────────────────────
      const { data: seanceBIntacte } = await admin!.from('seances').select('absence_signalee_par_patient_le').eq('id', seanceIdB).single();
      expect(seanceBIntacte?.absence_signalee_par_patient_le).toBeNull();

      // ── Rejouer le même état : inchangé, pas d'écriture ─────────────────
      const resRejoue = await request.post('/api/patient/activite', {
        headers: { Authorization: `Bearer ${participantA!.token}` },
        data: { type: 'seance-absence', signale: true },
      });
      expect(await resRejoue.json()).toMatchObject({ ok: true, inchange: true });

      // ── Rétractation ─────────────────────────────────────────────────────
      const resAnnuler = await request.post('/api/patient/activite', {
        headers: { Authorization: `Bearer ${participantA!.token}` },
        data: { type: 'seance-absence', signale: false },
      });
      expect(resAnnuler.status()).toBe(200);
      expect(await resAnnuler.json()).toMatchObject({ ok: true, seanceId: seanceIdA, absenceSignalee: false });

      const { data: seanceAApresAnnulation } = await admin!.from('seances').select('absence_signalee_par_patient_le').eq('id', seanceIdA).single();
      expect(seanceAApresAnnulation?.absence_signalee_par_patient_le).toBeNull();
    } finally {
      await admin!.from('seances').delete().eq('id', seanceIdA);
      await admin!.from('seances').delete().eq('id', seanceIdB);
    }
  });

  test('refuse une séance déjà commencée (aucune tolérance)', async ({ request }) => {
    test.setTimeout(30000);
    // Heure civile Europe/Paris, 10 minutes dans le passé : la séance a
    // commencé, quel que soit le fuseau du serveur qui évalue la requête.
    const heureCivileParisMoins10 = new Date(Date.now() - 10 * 60_000)
      .toLocaleTimeString('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', hour12: false });
    const aujourdHuiParis = new Date().toLocaleDateString('fr-CA', { timeZone: 'Europe/Paris' });

    const seanceId = await creerSeance(admin!, praticienId, participantA!.participantId, { date: aujourdHuiParis, heureDebut: heureCivileParisMoins10 });
    try {
      const res = await request.post('/api/patient/activite', {
        headers: { Authorization: `Bearer ${participantA!.token}` },
        data: { type: 'seance-absence', signale: true },
      });
      expect(res.status()).toBe(409);
      expect((await res.json()).code).toBe('deja_commencee');

      const { data: seanceIntacte } = await admin!.from('seances').select('absence_signalee_par_patient_le').eq('id', seanceId).single();
      expect(seanceIntacte?.absence_signalee_par_patient_le).toBeNull();
    } finally {
      await admin!.from('seances').delete().eq('id', seanceId);
    }
  });

  test('rate limit : 429 au-delà du seuil, par participant', async ({ request }) => {
    test.setTimeout(30000);
    const demain = new Date();
    demain.setDate(demain.getDate() + 1);
    const dateDemain = demain.toISOString().slice(0, 10);

    const seanceId = await creerSeance(admin!, praticienId, participantA!.participantId, { date: dateDemain, heureDebut: '09:00' });
    try {
      // Le seuil par défaut (api/_lib/activiteRateLimit.ts) est 10 / 10 min :
      // 12 requêtes suffisent à le dépasser, quelle que soit leur issue
      // individuelle (le budget compte les REQUÊTES, pas les échecs).
      const statuts: number[] = [];
      for (let i = 0; i < 12; i++) {
        const res = await request.post('/api/patient/activite', {
          headers: { Authorization: `Bearer ${participantA!.token}` },
          data: { type: 'seance-absence', signale: i % 2 === 0 },
        });
        statuts.push(res.status());
      }
      expect(statuts.filter(s => s === 429).length, `statuts observés : ${statuts.join(',')}`).toBeGreaterThan(0);
    } finally {
      await admin!.from('seances').delete().eq('id', seanceId);
    }
  });
});
