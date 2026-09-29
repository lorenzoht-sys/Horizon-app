import { test, expect } from '@playwright/test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { skipUnlessPraticien, loginPraticien, env } from './helpers.js';
import { clientAdminTest } from './nettoyageTest.js';

// Chantier « signalement d'absence patient », lots C (bouton bénéficiaire) +
// G (badge côté praticien) : lot 1 (32-signalement-absence-seance.spec.ts)
// prouve déjà l'action HTTP elle-même (écriture/lecture de
// absence_signalee_par_patient_le, isolation, rate limit, AVEC une vraie
// connexion patient). Ce fichier prouve la partie qui manquait — que la
// colonne devient VISIBLE côté praticien — et n'a donc besoin ni de rejouer
// l'API patient ni d'une connexion patient : il écrit directement la colonne
// via le client admin (service_role), exactement l'état qu'une vraie
// connexion patient aurait produit. Sans statut ni calcul touchés.
//
// ── Pourquoi pas de connexion patient ici (leçon du premier essai) ─────────
// Une première version de ce fichier appelait /api/patient/session (une
// connexion patient de plus). En CI, elle s'est heurtée à « Trop de
// tentatives » : le quota de connexion patient (5/15min, IP du runner) est
// PARTAGÉ par tout le run — déjà tendu par 09-rate-limit-connexion-patient
// (qui l'épuise délibérément) et par 32-signalement-absence-seance (2
// connexions). Ajouter une 3e connexion dans ce fichier a fait déborder le
// quota (2 workers Playwright, tests en parallèle). Le seuil ne doit pas
// bouger (décidé) — la connexion patient est donc supprimée ici, ce qui a
// l'avantage de séparer proprement les responsabilités : 32 prouve l'écriture
// (API, isolation, rate limit), 33 prouve la lecture (affichage praticien).
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
// par ailleurs. Limite assumée, documentée ici — pas une omission silencieuse.
//
// Fixture dédiée (jamais Camille/Julien), nettoyage par identifiant précis :
// la séance par son id juste après usage, le participant par son id en
// afterAll (ON DELETE CASCADE emporte ses séances si le nettoyage précédent
// avait échoué en cours de route).

async function resoudrePraticienId(admin: SupabaseClient): Promise<string> {
  const { data: usersPage, error } = await admin.auth.admin.listUsers();
  const praticien = error ? undefined : usersPage.users.find(u => u.email === env.praticienEmail);
  if (!praticien) throw new Error(`Praticien e2e introuvable (${env.praticienEmail}) : ${error?.message ?? 'aucune correspondance'}`);
  return praticien.id;
}

async function creerParticipant(
  admin: SupabaseClient,
  praticienId: string,
  marqueur: string,
): Promise<string> {
  const codeAcces = `E2E${marqueur}`.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
  const { data: participant, error } = await admin
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
  if (error || !participant) throw new Error(`Création participant (fixture e2e) échouée : ${error?.message}`);
  return participant.id;
}

test.describe.serial('Signalement d\'absence — badge côté praticien (agenda desktop)', () => {
  test.describe.configure({ retries: 0 });

  let admin: SupabaseClient | null = null;
  let praticienId = '';
  let participantId = '';
  const marqueur = Date.now().toString(36);
  const nomComplet = `Test E2E${marqueur}`;

  test.beforeAll(async () => {
    if (!env.praticienEmail || !env.praticienPassword || !process.env.E2E_BASE_URL) return;
    admin = clientAdminTest();
    if (!admin) return;
    praticienId = await resoudrePraticienId(admin);
    participantId = await creerParticipant(admin, praticienId, `badge${marqueur}`);
  });

  test.afterAll(async () => {
    if (!admin || !participantId) return;
    await admin.from('participants').delete().eq('id', participantId);
  });

  test.beforeEach(() => {
    skipUnlessPraticien();
    test.skip(!admin, 'SUPABASE_TEST_SERVICE_ROLE_KEY non défini (voir e2e/README.md) — impossible de créer la fixture');
  });

  test('signalement → badge 🚫 visible dans l\'agenda desktop → rétractation → badge disparu', async ({ page }) => {
    test.setTimeout(60000);
    const demain = new Date();
    demain.setDate(demain.getDate() + 1);
    const dateDemain = demain.toISOString().slice(0, 10);

    const { data: seanceRow, error } = await admin!
      .from('seances')
      .insert({
        praticien_id: praticienId,
        participant_id: participantId,
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
      await expect(evenement).not.toContainText('🚫');

      // ── Signalement, écrit directement (voir l'en-tête : équivalent à ce
      // qu'une vraie connexion patient aurait produit, sans en consommer le
      // quota partagé) ─────────────────────────────────────────────────────
      const { error: erreurSignalement } = await admin!
        .from('seances')
        .update({ absence_signalee_par_patient_le: new Date().toISOString() })
        .eq('id', seanceId);
      if (erreurSignalement) throw new Error(`Écriture du signalement échouée : ${erreurSignalement.message}`);

      await page.reload();
      await page.waitForLoadState('networkidle');
      const evenementSignale = page.locator('.rbc-event').filter({ hasText: nomComplet });
      await page.getByRole('button', { name: "Aujourd'hui", exact: true }).click();
      let signaleTrouve = false;
      for (let i = 0; i <= 2; i++) {
        signaleTrouve = await evenementSignale.waitFor({ state: 'visible', timeout: 1000 }).then(() => true).catch(() => false);
        if (signaleTrouve) break;
        await page.getByRole('button', { name: 'Suivant', exact: true }).click();
      }
      await expect(evenementSignale).toBeVisible({ timeout: 8000 });
      await expect(evenementSignale).toContainText('🚫');

      // ── Rétractation, même mécanisme ─────────────────────────────────────
      const { error: erreurRetractation } = await admin!
        .from('seances')
        .update({ absence_signalee_par_patient_le: null })
        .eq('id', seanceId);
      if (erreurRetractation) throw new Error(`Écriture de la rétractation échouée : ${erreurRetractation.message}`);

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
