import { test, expect, type APIRequestContext } from '@playwright/test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { skipUnlessE2E, env } from './helpers.js';
import { clientAdminTest } from './nettoyageTest.js';

// Chantier « signalement d'absence patient », lot 1 (A + B + D) : vérifie
// l'action 'seance-absence' de /api/patient/activite au niveau HTTP — pas
// d'écran encore (lot C, hors périmètre), donc pas de test piloté par l'UI.
// Chaque test crée ses PROPRES participants et séances (fixture e2e
// dédiée, jamais Camille/Julien), et nettoie par identifiant précis dans un
// `finally` — même discipline que 08-portail-structure.spec.ts.

interface FixtureParticipant {
  participantId: string;
  seanceId: string;
  token: string;
}

async function resoudrePraticienId(admin: SupabaseClient): Promise<string> {
  const { data: usersPage, error } = await admin.auth.admin.listUsers();
  const praticien = error ? undefined : usersPage.users.find(u => u.email === env.praticienEmail);
  if (!praticien) throw new Error(`Praticien e2e introuvable (${env.praticienEmail}) : ${error?.message ?? 'aucune correspondance'}`);
  return praticien.id;
}

// Crée un participant e2e dédié avec UNE séance planifiée, puis se connecte
// pour obtenir un vrai jeton (même chemin que le login réel :
// /api/patient/session, pas de jeton fabriqué à la main dans le test).
async function creerParticipantAvecSeance(
  admin: SupabaseClient,
  request: APIRequestContext,
  praticienId: string,
  marqueur: string,
  seance: { date: string; heureDebut: string },
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
    const { data: seanceRow, error: seanceErr } = await admin
      .from('seances')
      .insert({
        praticien_id: praticienId,
        participant_id: participant.id,
        date: seance.date,
        heure_debut: seance.heureDebut,
        heure_fin: seance.heureDebut,
        duree_minutes: 45,
        type: 'seance',
        statut: 'planifiee',
      })
      .select('id')
      .single();
    if (seanceErr || !seanceRow) throw new Error(`Création séance (fixture e2e) échouée : ${seanceErr?.message}`);

    // X-Forwarded-For distinct par fixture (lu tel quel par getClientIp) :
    // 09-rate-limit-connexion-patient.spec.ts épuise DÉLIBÉRÉMENT le quota
    // IP de connexion (5/15 min), partagé par tous les tests d'un même run
    // CI (même IP de sortie du runner) — sans ce header, nos propres
    // connexions de fixture se font bloquer par cet autre test, ou entre
    // elles. N'affecte que ce test : le rate limit PAR PARTICIPANT (celui
    // que ce chantier ajoute, api/_lib/activiteRateLimit.ts) ne dépend pas
    // de l'IP et n'est pas contournable de cette façon.
    const ipFictive = `203.0.113.${Math.floor(Math.random() * 254) + 1}`;
    const resLogin = await request.post('/api/patient/session', {
      headers: { 'X-Forwarded-For': ipFictive },
      data: { code: codeAcces },
    });
    const bodyLogin = await resLogin.json().catch(() => ({}));
    if (!resLogin.ok() || !bodyLogin.token) throw new Error(`Connexion patient (fixture e2e) échouée : ${JSON.stringify(bodyLogin)}`);

    return { participantId: participant.id, seanceId: seanceRow.id, token: bodyLogin.token };
  } catch (err) {
    // Auto-nettoyante en cas d'échec partiel (même leçon que
    // 08-portail-structure.spec.ts : un essai précédent avait laissé des
    // fixtures orphelines quand la création échouait APRÈS coup).
    await admin.from('participants').delete().eq('id', participant.id);
    throw err;
  }
}

async function nettoyerParticipant(admin: SupabaseClient, participantId: string): Promise<void> {
  // ON DELETE CASCADE emporte la/les séance(s) (supabase/schema.sql).
  await admin.from('participants').delete().eq('id', participantId);
}

test.describe('Signalement d\'absence — /api/patient/activite (type "seance-absence")', () => {
  test.beforeEach(() => skipUnlessE2E());

  test('signale puis se rétracte, sans jamais toucher la séance d\'un autre participant', async ({ request }) => {
    test.setTimeout(45000);
    const admin = clientAdminTest();
    test.skip(!admin, 'SUPABASE_TEST_SERVICE_ROLE_KEY non défini (voir e2e/README.md) — impossible de créer la fixture');

    const marqueur = Date.now().toString(36);
    const demain = new Date();
    demain.setDate(demain.getDate() + 1);
    const dateDemain = demain.toISOString().slice(0, 10);

    let fixtureA: FixtureParticipant | null = null;
    let fixtureB: FixtureParticipant | null = null;
    try {
      const praticienId = await resoudrePraticienId(admin!);
      // B existe pour prouver l'isolation : l'action de A ne doit jamais
      // atteindre sa ligne, alors même qu'aucun id n'est envoyé au serveur
      // (la preuve porte justement sur CE point : deux jetons différents,
      // deux séances différentes affectées, jamais l'inverse).
      fixtureA = await creerParticipantAvecSeance(admin!, request, praticienId, `sigA${marqueur}`, { date: dateDemain, heureDebut: '10:00' });
      fixtureB = await creerParticipantAvecSeance(admin!, request, praticienId, `sigB${marqueur}`, { date: dateDemain, heureDebut: '11:00' });

      // ── Signalement ──────────────────────────────────────────────────────
      const resSignaler = await request.post('/api/patient/activite', {
        headers: { Authorization: `Bearer ${fixtureA.token}` },
        data: { type: 'seance-absence', signale: true },
      });
      expect(resSignaler.status()).toBe(200);
      const corpsSignaler = await resSignaler.json();
      expect(corpsSignaler).toMatchObject({ ok: true, seanceId: fixtureA.seanceId, absenceSignalee: true });

      const { data: seanceAApres } = await admin!.from('seances').select('absence_signalee_par_patient_le').eq('id', fixtureA.seanceId).single();
      expect(seanceAApres?.absence_signalee_par_patient_le).not.toBeNull();

      // ── Isolation : la séance de B est INTACTE ──────────────────────────
      const { data: seanceBIntacte } = await admin!.from('seances').select('absence_signalee_par_patient_le').eq('id', fixtureB.seanceId).single();
      expect(seanceBIntacte?.absence_signalee_par_patient_le).toBeNull();

      // ── Rejouer le même état : inchangé, pas d'écriture ─────────────────
      const resRejoue = await request.post('/api/patient/activite', {
        headers: { Authorization: `Bearer ${fixtureA.token}` },
        data: { type: 'seance-absence', signale: true },
      });
      expect((await resRejoue.json())).toMatchObject({ ok: true, inchange: true });

      // ── Rétractation ─────────────────────────────────────────────────────
      const resAnnuler = await request.post('/api/patient/activite', {
        headers: { Authorization: `Bearer ${fixtureA.token}` },
        data: { type: 'seance-absence', signale: false },
      });
      expect(resAnnuler.status()).toBe(200);
      expect(await resAnnuler.json()).toMatchObject({ ok: true, seanceId: fixtureA.seanceId, absenceSignalee: false });

      const { data: seanceAApresAnnulation } = await admin!.from('seances').select('absence_signalee_par_patient_le').eq('id', fixtureA.seanceId).single();
      expect(seanceAApresAnnulation?.absence_signalee_par_patient_le).toBeNull();
    } finally {
      if (fixtureA) await nettoyerParticipant(admin!, fixtureA.participantId);
      if (fixtureB) await nettoyerParticipant(admin!, fixtureB.participantId);
    }
  });

  test('refuse une séance déjà commencée (aucune tolérance)', async ({ request }) => {
    test.setTimeout(30000);
    const admin = clientAdminTest();
    test.skip(!admin, 'SUPABASE_TEST_SERVICE_ROLE_KEY non défini (voir e2e/README.md) — impossible de créer la fixture');

    const marqueur = Date.now().toString(36);
    // Heure civile Europe/Paris, 10 minutes dans le passé : la séance a
    // commencé, quel que soit le fuseau du serveur qui évalue la requête.
    const heureCivileParisMoins10 = new Date(Date.now() - 10 * 60_000)
      .toLocaleTimeString('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', hour12: false });
    const aujourdHuiParis = new Date().toLocaleDateString('fr-CA', { timeZone: 'Europe/Paris' });

    let fixture: FixtureParticipant | null = null;
    try {
      const praticienId = await resoudrePraticienId(admin!);
      fixture = await creerParticipantAvecSeance(admin!, request, praticienId, `deja${marqueur}`, { date: aujourdHuiParis, heureDebut: heureCivileParisMoins10 });

      const res = await request.post('/api/patient/activite', {
        headers: { Authorization: `Bearer ${fixture.token}` },
        data: { type: 'seance-absence', signale: true },
      });
      expect(res.status()).toBe(409);
      const corps = await res.json();
      expect(corps.code).toBe('deja_commencee');

      const { data: seanceIntacte } = await admin!.from('seances').select('absence_signalee_par_patient_le').eq('id', fixture.seanceId).single();
      expect(seanceIntacte?.absence_signalee_par_patient_le).toBeNull();
    } finally {
      if (fixture) await nettoyerParticipant(admin!, fixture.participantId);
    }
  });

  test('rate limit : 429 au-delà du seuil, par participant', async ({ request }) => {
    test.setTimeout(45000);
    const admin = clientAdminTest();
    test.skip(!admin, 'SUPABASE_TEST_SERVICE_ROLE_KEY non défini (voir e2e/README.md) — impossible de créer la fixture');

    const marqueur = Date.now().toString(36);
    const demain = new Date();
    demain.setDate(demain.getDate() + 1);
    const dateDemain = demain.toISOString().slice(0, 10);

    let fixture: FixtureParticipant | null = null;
    try {
      const praticienId = await resoudrePraticienId(admin!);
      fixture = await creerParticipantAvecSeance(admin!, request, praticienId, `rate${marqueur}`, { date: dateDemain, heureDebut: '09:00' });

      // Le seuil par défaut (api/_lib/activiteRateLimit.ts) est 10 / 10 min :
      // 12 requêtes suffisent à le dépasser, quelle que soit leur issue
      // individuelle (le budget compte les REQUÊTES, pas les échecs).
      const statuts: number[] = [];
      for (let i = 0; i < 12; i++) {
        const res = await request.post('/api/patient/activite', {
          headers: { Authorization: `Bearer ${fixture.token}` },
          data: { type: 'seance-absence', signale: i % 2 === 0 },
        });
        statuts.push(res.status());
      }
      expect(statuts.filter(s => s === 429).length, `statuts observés : ${statuts.join(',')}`).toBeGreaterThan(0);
    } finally {
      if (fixture) await nettoyerParticipant(admin!, fixture.participantId);
    }
  });
});
