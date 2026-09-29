import { test, expect, type APIRequestContext } from '@playwright/test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { skipUnlessPraticien, loginPraticien, env } from './helpers.js';
import { clientAdminTest } from './nettoyageTest.js';

// Chantier « signalement d'absence patient », lots C (bouton bénéficiaire) +
// G (badge côté praticien) : lot 1 (32-signalement-absence-seance.spec.ts)
// prouvait déjà l'action HTTP elle-même (écriture/lecture de
// absence_signalee_par_patient_le, isolation, rate limit). Ce fichier prouve
// la partie qui manquait : que le signalement devient VISIBLE côté
// praticien, sans jamais changer statut ni calcul.
//
// Scope volontairement limité à l'agenda desktop (/agenda-v2) — surface où
// un baseline e2e existait déjà (18-agenda-desktop.spec.ts), donc un risque
// de régression déjà instrumenté. Les badges mobiles (Tournée, Agenda vue
// Jour, pastille vue Mois — AppMobile.tsx) partagent EXACTEMENT le même
// champ Seance.absenceSignaleeLe, déjà couvert par le test unitaire du
// mapper (src/lib/mappers.test.ts) et par titreEvenementSeance
// (src/lib/agendaCommun.test.ts) : les repiloter un par un ici aurait ajouté
// du temps de CI et de la fragilité (routage/viewport mobile jamais exercé
// par aucun test e2e existant à ce jour) sans réduire un risque déjà couvert
// par ailleurs. Limite assumée, documentée dans le rapport du chantier — pas
// une omission silencieuse.
//
// Connexion patient UNIQUE pour tout le describe (beforeAll, comme le lot 1)
// : même discipline de quota que 32-signalement-absence-seance.spec.ts (5
// connexions / 15 min / IP, partagé par tout le run CI). `retries: 0` pour
// la même raison qu'au lot 1 : une reprise sur describe.serial rejouerait
// beforeAll (connexion patient supplémentaire) sur un quota déjà tendu.
//
// Fixture dédiée (jamais Camille/Julien), nettoyage par identifiant précis :
// la séance par son id juste après usage, le participant par son id en
// afterAll (ON DELETE CASCADE emporte ses séances si le nettoyage précédent
// avait échoué en cours de route).

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

// Même helper que 32-signalement-absence-seance.spec.ts (fichiers e2e
// autonomes par convention de ce dépôt, pas de lib de fixtures partagée).
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
    await admin.from('participants').delete().eq('id', participant.id);
    throw err;
  }
}

test.describe.serial('Signalement d\'absence — badge côté praticien (agenda desktop)', () => {
  test.describe.configure({ retries: 0 });

  let admin: SupabaseClient | null = null;
  let praticienId = '';
  let participant: FixtureParticipant | null = null;
  const marqueur = Date.now().toString(36);
  const nomComplet = `Test E2E${marqueur}`;

  test.beforeAll(async ({ request }) => {
    if (!env.praticienEmail || !env.praticienPassword || !process.env.E2E_BASE_URL) return;
    admin = clientAdminTest();
    if (!admin) return;
    praticienId = await resoudrePraticienId(admin);
    participant = await creerParticipantEtConnecter(admin, request, praticienId, `badge${marqueur}`);
  });

  test.afterAll(async () => {
    if (!admin || !participant) return;
    await admin.from('participants').delete().eq('id', participant.participantId);
  });

  test.beforeEach(() => {
    skipUnlessPraticien();
    test.skip(!admin, 'SUPABASE_TEST_SERVICE_ROLE_KEY non défini (voir e2e/README.md) — impossible de créer la fixture');
  });

  test('signalement → badge 🚫 visible dans l\'agenda desktop → rétractation → badge disparu', async ({ page, request }) => {
    test.setTimeout(60000);
    const demain = new Date();
    demain.setDate(demain.getDate() + 1);
    const dateDemain = demain.toISOString().slice(0, 10);

    const { data: seanceRow, error } = await admin!
      .from('seances')
      .insert({
        praticien_id: praticienId,
        participant_id: participant!.participantId,
        date: dateDemain,
        heure_debut: '09:00',
        heure_fin: '09:45',
        duree_minutes: 45,
        type: 'seance',
        statut: 'planifiee',
      })
      .select('id')
      .single();
    if (error || !seanceRow) throw new Error(`Création séance (fixture e2e) échouée : ${error?.message}`);
    const seanceId: string = seanceRow.id;

    try {
      // ── Signalement, côté patient (HTTP direct — déjà couvert écran par
      // écran par le lot C, voir EspacePatient.test... non, EspacePatient n'a
      // pas de test de rendu : ce dépôt n'a pas d'infrastructure de test par
      // rendu React (aucune dépendance @testing-library/react), seulement des
      // tests unitaires sur de la logique pure. Le bouton lui-même est validé
      // par la vérification manuelle 390px du rapport du chantier.) ─────────
      const resSignaler = await request.post('/api/patient/activite', {
        headers: { Authorization: `Bearer ${participant!.token}` },
        data: { type: 'seance-absence', signale: true },
      });
      expect(resSignaler.status()).toBe(200);
      expect(await resSignaler.json()).toMatchObject({ ok: true, seanceId, absenceSignalee: true });

      // ── Badge visible côté praticien, agenda desktop ────────────────────
      await loginPraticien(page);
      await page.goto('/agenda-v2');
      await page.waitForLoadState('networkidle');

      // react-big-calendar ne rend que la semaine affichée — même recherche
      // que 18-agenda-desktop.spec.ts, fenêtre courte ici (demain tombe dans
      // la semaine courante ou la suivante au pire).
      const evenement = page.locator('.rbc-event').filter({ hasText: nomComplet });
      await page.getByRole('button', { name: "Aujourd'hui", exact: true }).click();
      let trouve = false;
      for (let i = 0; i <= 2; i++) {
        trouve = await evenement.waitFor({ state: 'visible', timeout: 1000 }).then(() => true).catch(() => false);
        if (trouve) break;
        await page.getByRole('button', { name: 'Suivant', exact: true }).click();
      }
      await expect(evenement).toBeVisible({ timeout: 8000 });
      await expect(evenement).toContainText('🚫');

      // ── Rétractation, côté patient ───────────────────────────────────────
      const resAnnuler = await request.post('/api/patient/activite', {
        headers: { Authorization: `Bearer ${participant!.token}` },
        data: { type: 'seance-absence', signale: false },
      });
      expect(resAnnuler.status()).toBe(200);
      expect(await resAnnuler.json()).toMatchObject({ ok: true, seanceId, absenceSignalee: false });

      // ── Badge disparu côté praticien (rechargement pour refléter la lecture
      // seule mise à jour en base — aucun canal temps réel sur cet écran) ──
      await page.reload();
      await page.waitForLoadState('networkidle');
      const evenementApresRetractation = page.locator('.rbc-event').filter({ hasText: nomComplet });
      let retrouve = false;
      await page.getByRole('button', { name: "Aujourd'hui", exact: true }).click();
      for (let i = 0; i <= 2; i++) {
        retrouve = await evenementApresRetractation.waitFor({ state: 'visible', timeout: 1000 }).then(() => true).catch(() => false);
        if (retrouve) break;
        await page.getByRole('button', { name: 'Suivant', exact: true }).click();
      }
      await expect(evenementApresRetractation).toBeVisible({ timeout: 8000 });
      await expect(evenementApresRetractation).not.toContainText('🚫');
    } finally {
      await admin!.from('seances').delete().eq('id', seanceId);
    }
  });
});
