import { test, expect } from '@playwright/test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { skipUnlessPraticien, loginPraticien, env } from '../helpers.js';
import { clientAdminTest } from '../nettoyageTest.js';

// Correctif « contenu et destination de la notification push praticien » :
// le clic sur l'alerte « absence signalée » ouvre /agenda?date=AAAA-MM-JJ
// (urlNotificationAbsencePraticien, api/_lib/absenceSignalee.ts). Ce fichier
// prouve que ce lien ouvre l'agenda mobile SUR CE JOUR — pas l'envoi push
// lui-même (aucun abonnement praticien insérable par le client admin, voir
// 32-signalement-absence-seance.spec.ts), ni le contenu du message (test
// unitaire, api/_lib/absenceSignalee.test.ts).
//
// Aucune connexion patient (quota partagé 5/15 min/IP, voir CLAUDE.md et
// 33-signalement-absence-badge-praticien.spec.ts) : la séance est écrite
// directement via le client admin, déjà signalée — l'état exact qu'aurait
// produit le signalement réel. Fixture dédiée (jamais Camille/Julien),
// nettoyage par identifiant précis.

async function resoudrePraticienId(admin: SupabaseClient): Promise<string> {
  const { data: usersPage, error } = await admin.auth.admin.listUsers();
  const praticien = error ? undefined : usersPage.users.find(u => u.email === env.praticienEmail);
  if (!praticien) throw new Error(`Praticien e2e introuvable (${env.praticienEmail}) : ${error?.message ?? 'aucune correspondance'}`);
  return praticien.id;
}

function dateLocale(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

test.describe.serial('Agenda mobile — lien daté de la notification « absence signalée »', () => {
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
    participantId = participant.id;
  });

  test.afterAll(async () => {
    if (!admin || !participantId) return;
    await admin.from('participants').delete().eq('id', participantId);
  });

  test.beforeEach(() => {
    skipUnlessPraticien();
    test.skip(!admin, 'SUPABASE_TEST_SERVICE_ROLE_KEY non défini (voir e2e/README.md) — impossible de créer la fixture');
  });

  test('/agenda?date=… ouvre la vue Jour sur la date de la séance ; date illisible → aujourd\'hui', async ({ page }) => {
    test.setTimeout(45000);
    // +23 jours : hors de la semaine courante et du mois courant la plupart
    // du temps — une ouverture « aujourd'hui » par erreur ne peut pas passer
    // pour un succès.
    const cible = new Date();
    cible.setDate(cible.getDate() + 23);
    const dateCible = dateLocale(cible);

    const { data: seanceRow, error } = await admin!
      .from('seances')
      .insert({
        praticien_id: praticienId,
        participant_id: participantId,
        date: dateCible,
        heure_debut: '10:15',
        heure_fin: '11:00',
        duree_minutes: 45,
        type: 'seance',
        statut: 'planifiee',
        absence_signalee_par_patient_le: new Date().toISOString(),
      })
      .select('id')
      .single();
    if (error || !seanceRow) throw new Error(`Création séance (fixture e2e) échouée : ${error?.message}`);
    const seanceId: string = seanceRow.id;

    try {
      await loginPraticien(page);
      await page.goto(`/agenda?date=${dateCible}`);
      await expect(page.getByText('Agenda', { exact: true })).toBeVisible();

      // Même libellé que formatDateLong (AppMobile.tsx), calculé dans le
      // navigateur pour partager sa locale et son fuseau.
      const libelle = (iso: string) => page.evaluate((d) => {
        const [a, m, j] = d.split('-').map(Number);
        return new Date(a, m - 1, j).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
      }, iso);
      const entete = page.getByText(await libelle(dateCible), { exact: true });
      await expect(entete).toBeVisible();

      const carte = page.getByRole('button', { name: new RegExp(nomComplet) }).filter({ hasText: '10:15' });
      await expect(carte).toBeVisible({ timeout: 10000 });

      // La navigation interne reste libre : l'écran n'est pas « bloqué » sur
      // la date du lien.
      await page.getByRole('button', { name: 'Jour suivant' }).click();
      await expect(entete).toHaveCount(0);
      await expect(carte).toHaveCount(0);

      // Date inexistante : ignorée, l'agenda s'ouvre sur aujourd'hui.
      await page.goto('/agenda?date=2026-02-31');
      await expect(page.getByText(await libelle(dateLocale(new Date())), { exact: true })).toBeVisible();
    } finally {
      await admin!.from('seances').delete().eq('id', seanceId);
    }
  });
});
